//! Comandos del chat: enviar con streaming, cancelar, borrar y probar la conexión.
//! El historial solo vive en memoria: al cerrar Tico desaparece.

use std::collections::HashMap;
use std::sync::atomic::Ordering;
use std::sync::Arc;

use serde::Serialize;
use tauri::ipc::Channel;
use tauri::State;

use crate::ai::anthropic::Anthropic;
use crate::ai::gemini::Gemini;
use crate::ai::ollama::Ollama;
use crate::ai::openai::OpenAi;
use crate::ai::{system_prompt, ChatMessage, ChatRequest, ImageData, Provider, TokenSink};
use crate::error::{AppError, AppResult};
use crate::island::lock;
use crate::secrets;
use crate::settings::{ProviderKind, Settings};
use crate::state::AppState;

/// Respuestas cortas: tienen que caber en la isla.
const MAX_TOKENS: u32 = 1024;

/// Lo que recibe el frontend mientras llega la respuesta.
#[derive(Clone, Serialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum ChatEvent {
    Token { text: String },
    Done,
}

async fn run_provider(
    http: &reqwest::Client,
    settings: &Settings,
    provider: ProviderKind,
    request: &ChatRequest,
    on_token: TokenSink<'_>,
) -> AppResult<()> {
    match provider {
        ProviderKind::Anthropic => {
            let api_key = secrets::require(provider)?;
            Anthropic { api_key }.stream_chat(http, request, on_token).await
        }
        ProviderKind::Openai => {
            let api_key = secrets::require(provider)?;
            OpenAi { api_key }.stream_chat(http, request, on_token).await
        }
        ProviderKind::Gemini => {
            let api_key = secrets::require(provider)?;
            Gemini { api_key }.stream_chat(http, request, on_token).await
        }
        ProviderKind::Ollama => {
            let base_url = settings.ollama_url.clone();
            Ollama { base_url }.stream_chat(http, request, on_token).await
        }
    }
}

/// Envía un mensaje (con la captura pendiente si `attach_capture`) y va mandando tokens.
#[tauri::command]
pub async fn chat_send(
    state: State<'_, AppState>,
    text: String,
    attach_capture: bool,
    on_event: Channel<ChatEvent>,
) -> AppResult<()> {
    let settings = lock(&state.settings).clone();
    let image: Option<Arc<ImageData>> = if attach_capture {
        lock(&state.pending_capture).take().map(Arc::new)
    } else {
        None
    };
    let generation = state.chat_generation.fetch_add(1, Ordering::SeqCst) + 1;
    let (messages, my_index) = {
        let mut history = lock(&state.chat);
        history.push(ChatMessage::user(text, image));
        (history.clone(), history.len() - 1)
    };
    let request = ChatRequest {
        model: settings.models.get(settings.provider).to_string(),
        system: system_prompt(&settings.language),
        messages,
        max_tokens: MAX_TOKENS,
    };

    let mut answer = String::new();
    let result = {
        let current = &state.chat_generation;
        let answer = &mut answer;
        let on_event = &on_event;
        let mut sink = move |token: &str| -> bool {
            // Si el usuario canceló o borró el chat, dejamos de escuchar.
            if current.load(Ordering::SeqCst) != generation {
                return false;
            }
            answer.push_str(token);
            on_event.send(ChatEvent::Token { text: token.to_string() }).is_ok()
        };
        run_provider(&state.http, &settings, settings.provider, &request, &mut sink).await
    };

    {
        let mut history = lock(&state.chat);
        let mine_is_last = history.len() == my_index + 1;
        if answer.is_empty() {
            // Sin respuesta: quitamos la pregunta para no dejar dos turnos de usuario seguidos.
            if mine_is_last {
                history.pop();
            }
        } else if history.len() > my_index {
            // Aunque se haya cancelado, lo recibido se queda (justo detrás de la pregunta).
            history.insert(my_index + 1, ChatMessage::assistant(answer));
        }
    }
    result?;
    let _ = on_event.send(ChatEvent::Done);
    Ok(())
}

/// Corta la respuesta que está llegando (lo recibido hasta ahora se queda).
#[tauri::command]
pub fn chat_cancel(state: State<'_, AppState>) {
    state.chat_generation.fetch_add(1, Ordering::SeqCst);
}

/// Borra el historial (y cualquier captura pendiente) de la memoria.
#[tauri::command]
pub fn chat_clear(state: State<'_, AppState>) {
    state.chat_generation.fetch_add(1, Ordering::SeqCst);
    lock(&state.chat).clear();
    lock(&state.pending_capture).take();
}

/// "Probar conexión": lista los modelos disponibles con la clave guardada.
#[tauri::command]
pub async fn ai_test_connection(
    state: State<'_, AppState>,
    provider: ProviderKind,
) -> AppResult<Vec<String>> {
    let http = &state.http;
    let ollama_url = lock(&state.settings).ollama_url.clone();
    let mut models = match provider {
        ProviderKind::Anthropic => {
            Anthropic { api_key: secrets::require(provider)? }.list_models(http).await?
        }
        ProviderKind::Openai => OpenAi { api_key: secrets::require(provider)? }.list_models(http).await?,
        ProviderKind::Gemini => Gemini { api_key: secrets::require(provider)? }.list_models(http).await?,
        ProviderKind::Ollama => Ollama { base_url: ollama_url }.list_models(http).await?,
    };
    models.dedup();
    Ok(models)
}

#[tauri::command]
pub fn secret_set(provider: ProviderKind, key: String) -> AppResult<()> {
    if key.trim().is_empty() {
        return Err(AppError::MissingKey(provider.id()));
    }
    secrets::set(provider, &key)
}

#[tauri::command]
pub fn secret_delete(provider: ProviderKind) -> AppResult<()> {
    secrets::delete(provider)
}

/// Qué proveedores tienen clave guardada (nunca devuelve las claves).
#[tauri::command]
pub fn secret_status() -> HashMap<&'static str, bool> {
    ProviderKind::WITH_KEY
        .iter()
        .map(|p| (p.id(), secrets::get(*p).ok().flatten().is_some()))
        .collect()
}

//! Comandos del chat: enviar con streaming, cancelar, borrar y probar la conexión.
//! Cada Tico tiene su propia conversación. El historial solo vive en memoria: al cerrar
//! Tico desaparece.

use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Arc;
use std::time::Duration;

use serde::{Deserialize, Serialize};
use tauri::ipc::Channel;
use tauri::{AppHandle, Emitter, Manager, State};

use crate::ai::models::{resolve_model, resolve_ollama_model};
use crate::ai::router::{self, AnyProvider};
use crate::ai::{alternating, system_prompt, ChatMessage, ChatRequest, ImageData, Provider};
use crate::error::{AppError, AppResult};
use crate::files;
use crate::island::lock;
use crate::secrets;
use crate::settings::{ProviderKind, Settings};
use crate::state::AppState;

/// Esperas entre reintentos cuando el servicio está saturado o hay un corte.
const RETRY_DELAYS: [Duration; 2] = [Duration::from_millis(1200), Duration::from_millis(3500)];

/// Lo que recibe el frontend mientras llega la respuesta.
#[derive(Clone, Serialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum ChatEvent {
    Token { text: String },
    /// Aviso que no es un error: "he cambiado de modelo", "este modelo no ve imágenes",
    /// "reintentando"…
    Notice { kind: String, detail: String },
    Done,
}

/// Un mensaje que envía el usuario.
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SendOptions {
    /// Id del Tico que contesta.
    pub tico: String,
    pub text: String,
    /// Mandar la captura de pantalla pendiente.
    pub attach_capture: bool,
    /// Archivos adjuntos (rutas).
    #[serde(default)]
    pub files: Vec<String>,
    /// Idioma de la interfaz ya resuelto ("es", "ca", "en").
    pub lang: String,
    /// Fecha y hora locales del usuario, ya escritas.
    #[serde(default)]
    pub now: String,
}

fn notice(channel: &Channel<ChatEvent>, kind: &str, detail: impl Into<String>) {
    let _ = channel.send(ChatEvent::Notice { kind: kind.into(), detail: detail.into() });
}

/// Guarda en Ajustes el modelo que ha funcionado, para no repetir el error la próxima vez.
fn remember_model(app: &AppHandle, tico_id: &str, provider: ProviderKind, model: &str) {
    let state = app.state::<AppState>();
    let updated = {
        let mut settings = lock(&state.settings);
        let own = settings
            .ticos
            .iter_mut()
            .find(|t| t.id == tico_id && t.provider == Some(provider) && !t.model.is_empty());
        match own {
            Some(tico) => tico.model = model.to_string(),
            None => *settings.models.get_mut(provider) = model.to_string(),
        }
        settings.clone()
    };
    if let Err(err) = updated.save(&state.settings_path) {
        eprintln!("No se pudo guardar el modelo nuevo: {err}");
    }
    let _ = app.emit("settings://changed", &updated);
}

/// Envía la petición y, si algo falla antes de empezar a responder, intenta arreglarlo:
/// reintenta si el servicio está saturado, busca otro modelo si el elegido ya no existe
/// y quita las imágenes si el modelo no las admite.
#[allow(clippy::too_many_arguments)]
async fn run_with_recovery(
    app: &AppHandle,
    http: &reqwest::Client,
    provider: &AnyProvider,
    kind: ProviderKind,
    tico_id: &str,
    mut request: ChatRequest,
    emitted: &AtomicUsize,
    cancelled: &(dyn Fn() -> bool + Sync),
    channel: &Channel<ChatEvent>,
    sink: &mut (dyn FnMut(&str) -> bool + Send),
) -> AppResult<()> {
    // Ollama necesita el nombre exacto del modelo instalado; y algunos no ven imágenes.
    if let AnyProvider::Ollama(ollama) = provider {
        let installed = ollama.list_models(http).await?;
        let model = resolve_ollama_model(&request.model, &installed).ok_or_else(|| {
            AppError::Model(if installed.is_empty() {
                "no hay ningún modelo instalado en Ollama (ollama pull gemma3)".into()
            } else {
                format!("«{}» no está instalado; tienes: {}", request.model, installed.join(", "))
            })
        })?;
        request.model = model;
        if request.has_images() && !ollama.supports_vision(http, &request.model).await {
            request = request.without_images();
            notice(channel, "noVision", request.model.clone());
        }
    }

    let mut attempt = 0;
    let mut model_fixed = false;
    let mut vision_dropped = false;
    loop {
        let result = provider.stream_chat(http, &request, sink).await;
        let err = match result {
            Ok(()) => return Ok(()),
            Err(err) => err,
        };
        // Con media respuesta ya en pantalla no se puede repetir; si se canceló, da igual.
        if emitted.load(Ordering::SeqCst) > 0 || cancelled() {
            return if cancelled() { Ok(()) } else { Err(err) };
        }
        match err {
            AppError::NoVision(_) if request.has_images() && !vision_dropped => {
                vision_dropped = true;
                request = request.without_images();
                notice(channel, "noVision", request.model.clone());
            }
            AppError::Model(_) if !model_fixed && kind != ProviderKind::Demo => {
                model_fixed = true;
                let available = provider.list_models(http).await.unwrap_or_default();
                match resolve_model(&request.model, &available) {
                    Some(model) if model != request.model => {
                        notice(channel, "modelChanged", model.clone());
                        remember_model(app, tico_id, kind, &model);
                        request.model = model;
                    }
                    _ => return Err(err),
                }
            }
            err if err.is_transient() && attempt < RETRY_DELAYS.len() => {
                notice(channel, "retrying", (attempt + 1).to_string());
                tokio::time::sleep(RETRY_DELAYS[attempt]).await;
                attempt += 1;
                if cancelled() {
                    return Ok(());
                }
            }
            err => return Err(err),
        }
    }
}

/// Envía un mensaje (con la captura y los archivos que haya) y va mandando tokens.
#[tauri::command]
pub async fn chat_send(
    app: AppHandle,
    state: State<'_, AppState>,
    options: SendOptions,
    on_event: Channel<ChatEvent>,
) -> AppResult<()> {
    // El número de envío se coge lo primero: si el usuario pulsa Parar mientras leemos los
    // adjuntos (OCR, PDF…), este envío ya sabe que está cancelado.
    let generation = state.chat_generation.fetch_add(1, Ordering::SeqCst) + 1;
    let current = &state.chat_generation;
    let cancelled = move || current.load(Ordering::SeqCst) != generation;
    let settings: Settings = lock(&state.settings).clone();
    let tico = settings.tico(&options.tico);
    let (kind, model) = settings.provider_for(&tico);
    let provider = router::build(&settings, kind, &options.lang)?;

    // Captura de pantalla (y el texto leído de ella).
    let mut images: Vec<Arc<ImageData>> = Vec::new();
    let mut context = String::new();
    if options.attach_capture {
        if let Some(capture) = lock(&state.pending_capture).take() {
            images.push(Arc::new(capture.image));
            if let Some(text) = capture.text {
                context.push_str(&format!("[Text read from the screen with OCR]\n{text}\n"));
            }
        }
    }
    // Archivos adjuntos: se leen fuera del hilo principal.
    if !options.files.is_empty() {
        let paths: Vec<PathBuf> = options.files.iter().map(PathBuf::from).collect();
        let ocr = settings.ocr;
        let attachments = tauri::async_runtime::spawn_blocking(move || {
            paths.iter().map(|p| files::read_for_chat(p, ocr)).collect::<Vec<_>>()
        })
        .await
        .map_err(|e| AppError::File(e.to_string()))?;
        for attachment in attachments {
            if !context.is_empty() {
                context.push('\n');
            }
            context.push_str(&attachment.context);
            if let Some(image) = attachment.image {
                images.push(Arc::new(image));
            }
        }
    }

    if cancelled() {
        return Ok(());
    }
    let question = ChatMessage::user(options.text.clone(), context, images);
    let my_id = question.id;
    let messages = {
        let mut chats = lock(&state.chat);
        let history = chats.entry(tico.id.clone()).or_default();
        history.push(question);
        alternating(history)
    };
    let request = ChatRequest {
        model,
        system: system_prompt(&options.lang, &tico, settings.answer_length, &options.now),
        messages,
        max_tokens: settings.answer_length.max_tokens(),
    };

    let emitted = AtomicUsize::new(0);
    let mut answer = String::new();
    let result = {
        let answer = &mut answer;
        let channel = &on_event;
        let emitted_ref = &emitted;
        let mut sink = move |token: &str| -> bool {
            // Si el usuario canceló o borró el chat, dejamos de escuchar.
            if current.load(Ordering::SeqCst) != generation {
                return false;
            }
            emitted_ref.fetch_add(1, Ordering::SeqCst);
            answer.push_str(token);
            channel.send(ChatEvent::Token { text: token.to_string() }).is_ok()
        };
        let run = run_with_recovery(
            &app, &state.http, &provider, kind, &tico.id, request, &emitted, &cancelled, &on_event, &mut sink,
        );
        // Parar corta la petición en el momento (sin esperar a la siguiente palabra), así
        // no se sigue gastando.
        let watch = async {
            while !cancelled() {
                tokio::time::sleep(std::time::Duration::from_millis(150)).await;
            }
        };
        tokio::select! {
            result = run => result,
            () = watch => Ok(()),
        }
    };

    {
        let mut chats = lock(&state.chat);
        let history = chats.entry(tico.id.clone()).or_default();
        // Buscamos la pregunta por su número: otro envío puede haber movido las posiciones.
        if let Some(pos) = history.iter().position(|m| m.id == my_id) {
            if answer.is_empty() {
                // Sin respuesta: fuera la pregunta, para no dejar dos turnos de usuario seguidos.
                history.remove(pos);
            } else {
                // Aunque se haya cancelado, lo recibido se queda (justo detrás de la pregunta).
                history.insert(pos + 1, ChatMessage::assistant(answer));
            }
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

/// Borra la conversación de un Tico (o todas) y cualquier captura pendiente.
#[tauri::command]
pub fn chat_clear(state: State<'_, AppState>, tico: Option<String>) {
    state.chat_generation.fetch_add(1, Ordering::SeqCst);
    match tico {
        Some(id) => {
            lock(&state.chat).remove(&id);
        }
        None => lock(&state.chat).clear(),
    }
    lock(&state.pending_capture).take();
}

/// "Probar conexión": lista los modelos disponibles con la clave guardada.
#[tauri::command]
pub async fn ai_test_connection(state: State<'_, AppState>, provider: ProviderKind) -> AppResult<Vec<String>> {
    let settings = lock(&state.settings).clone();
    let built = router::build(&settings, provider, "es")?;
    let models = built.list_models(&state.http).await?;
    // Solo los que sirven para chatear (sin voz, imágenes ni embeddings), si queda alguno.
    let chat: Vec<String> = models.iter().filter(|m| crate::ai::models::is_chat_model(m)).cloned().collect();
    Ok(if chat.is_empty() { models } else { chat })
}

/// Limpia lo que la gente suele pegar sin querer alrededor de una clave.
pub fn clean_key(key: &str) -> String {
    let key = key.trim().trim_matches(|c| c == '"' || c == '\'');
    let key = key.strip_prefix("Bearer ").unwrap_or(key);
    key.chars().filter(|c| !c.is_whitespace()).collect()
}

#[tauri::command]
pub fn secret_set(provider: ProviderKind, key: String) -> AppResult<()> {
    let key = clean_key(&key);
    if key.is_empty() || !provider.accepts_key() {
        return Err(AppError::MissingKey(provider.label()));
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
    ProviderKind::ALL
        .iter()
        .filter(|p| p.accepts_key())
        .map(|p| (p.id(), secrets::get(*p).ok().flatten().is_some()))
        .collect()
}

#[cfg(test)]
mod tests {
    use super::clean_key;

    #[test]
    fn keys_are_cleaned() {
        assert_eq!(clean_key("  sk-ant-123 \n"), "sk-ant-123");
        assert_eq!(clean_key("Bearer gsk_abc"), "gsk_abc");
        assert_eq!(clean_key("\"AIzaXYZ\""), "AIzaXYZ");
        assert_eq!(clean_key("sk-proj-12\n34"), "sk-proj-1234");
    }
}

//! Proveedores de IA. Todos implementan el trait `Provider` con streaming de tokens.

pub mod anthropic;
pub mod gemini;
pub mod ollama;
pub mod openai;
pub mod stream;

use std::future::Future;
use std::sync::Arc;

use serde_json::Value;

use crate::error::{AppError, AppResult};

/// Imagen ya preparada para enviar (JPEG en base64). Solo vive en memoria.
#[derive(Debug)]
pub struct ImageData {
    pub base64: String,
    pub media_type: &'static str,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Role {
    User,
    Assistant,
}

#[derive(Clone, Debug)]
pub struct ChatMessage {
    pub role: Role,
    pub text: String,
    pub image: Option<Arc<ImageData>>,
}

impl ChatMessage {
    pub fn user(text: String, image: Option<Arc<ImageData>>) -> Self {
        Self { role: Role::User, text, image }
    }

    pub fn assistant(text: String) -> Self {
        Self { role: Role::Assistant, text, image: None }
    }
}

pub struct ChatRequest {
    pub model: String,
    pub system: String,
    pub messages: Vec<ChatMessage>,
    pub max_tokens: u32,
}

impl ChatRequest {
    /// Solo reenviamos la captura más reciente: las anteriores costarían tokens sin aportar.
    pub fn image_for(&self, index: usize) -> Option<&ImageData> {
        let last = self.messages.iter().rposition(|m| m.image.is_some())?;
        (index == last).then(|| self.messages[index].image.as_deref()).flatten()
    }

    /// Texto del mensaje; un mensaje con solo imagen lleva una pregunta por defecto.
    pub fn text_for(&self, index: usize) -> &str {
        let text = self.messages[index].text.trim();
        if text.is_empty() {
            "¿Qué ves en mi pantalla?"
        } else {
            text
        }
    }
}

/// Recibe cada trozo de texto. Si devuelve `false`, el streaming se para (cancelado).
pub type TokenSink<'a> = &'a mut (dyn FnMut(&str) -> bool + Send);

pub trait Provider {
    fn stream_chat(
        &self,
        http: &reqwest::Client,
        request: &ChatRequest,
        on_token: TokenSink<'_>,
    ) -> impl Future<Output = AppResult<()>> + Send;

    fn list_models(&self, http: &reqwest::Client)
        -> impl Future<Output = AppResult<Vec<String>>> + Send;
}

/// Lo que sale de interpretar una línea del streaming.
#[derive(Debug, PartialEq)]
pub enum Delta {
    Text(String),
    Stop,
    Skip,
}

/// Interpreta JSON de un proveedor; si no es JSON válido, es un error del proveedor.
pub fn parse_json(provider: &'static str, data: &str) -> AppResult<Value> {
    serde_json::from_str(data)
        .map_err(|e| AppError::Provider(format!("{provider}: respuesta inesperada ({e})")))
}

/// Saca el mensaje de error de un cuerpo JSON típico (`error.message` o `error`).
pub fn error_message(body: &str) -> String {
    let parsed: Option<Value> = serde_json::from_str(body).ok();
    let message = parsed.as_ref().and_then(|v| {
        v.pointer("/error/message")
            .or_else(|| v.get("error"))
            .or_else(|| v.get("message"))
            .and_then(Value::as_str)
            .map(str::to_string)
    });
    message.unwrap_or_else(|| body.chars().take(300).collect())
}

/// Convierte un código HTTP de error en un `AppError` comprensible.
pub fn error_for_status(provider: &'static str, status: u16, body: &str) -> AppError {
    let message = error_message(body);
    let lower = message.to_lowercase();
    match status {
        401 | 403 => AppError::InvalidKey(provider),
        400 if lower.contains("api key") || lower.contains("api_key") => AppError::InvalidKey(provider),
        429 => AppError::RateLimited(provider),
        404 => AppError::Model(message),
        _ => AppError::Provider(format!("{provider} ({status}): {message}")),
    }
}

/// Devuelve la respuesta si es 2xx; si no, lee el cuerpo y lo convierte en error.
pub async fn check(provider: &'static str, response: reqwest::Response) -> AppResult<reqwest::Response> {
    let status = response.status();
    if status.is_success() {
        return Ok(response);
    }
    let body = response.text().await.unwrap_or_default();
    Err(error_for_status(provider, status.as_u16(), &body))
}

/// Prompt de sistema de Tico.
pub fn system_prompt(language: &str) -> String {
    format!(
        "You are Tico, a small, friendly robot assistant that lives in a desktop \"dynamic island\" \
at the top of the user's screen. Always answer in the user's language; the app interface is set to \
\"{language}\". Keep answers short, with short sentences that fit in a small panel. When you explain \
how to do something, use numbered steps. When you get a screenshot, describe only what you can \
actually see; if something is unclear, cut off or unreadable, say so instead of guessing."
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    fn img() -> Option<Arc<ImageData>> {
        Some(Arc::new(ImageData { base64: "AAA".into(), media_type: "image/jpeg" }))
    }

    #[test]
    fn only_last_image_is_sent() {
        let req = ChatRequest {
            model: "m".into(),
            system: String::new(),
            messages: vec![
                ChatMessage::user("a".into(), img()),
                ChatMessage::assistant("b".into()),
                ChatMessage::user("c".into(), img()),
                ChatMessage::assistant("d".into()),
                ChatMessage::user("e".into(), None),
            ],
            max_tokens: 10,
        };
        assert!(req.image_for(0).is_none());
        assert!(req.image_for(2).is_some());
        assert!(req.image_for(4).is_none());
    }

    #[test]
    fn status_mapping() {
        assert!(matches!(error_for_status("openai", 401, ""), AppError::InvalidKey(_)));
        assert!(matches!(error_for_status("anthropic", 429, ""), AppError::RateLimited(_)));
        assert!(matches!(
            error_for_status("gemini", 400, r#"{"error":{"message":"API key not valid."}}"#),
            AppError::InvalidKey(_)
        ));
        assert!(matches!(error_for_status("ollama", 404, r#"{"error":"model 'x' not found"}"#), AppError::Model(m) if m.contains("not found")));
    }
}

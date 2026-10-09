//! Proveedores de IA. Todos implementan el trait `Provider` con streaming de tokens.

pub mod anthropic;
pub mod demo;
pub mod gemini;
pub mod models;
pub mod ollama;
pub mod openai;
pub mod router;
pub mod stream;

use std::future::Future;
use std::sync::Arc;

use serde_json::Value;

use crate::error::{AppError, AppResult};
use crate::settings::{AnswerLength, TicoProfile};

/// Imagen ya preparada para enviar (JPEG o PNG en base64). Solo vive en memoria.
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

/// Número único de cada mensaje (para encontrarlo en el historial aunque se mueva).
static NEXT_MESSAGE_ID: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(1);

#[derive(Clone, Debug)]
pub struct ChatMessage {
    pub id: u64,
    pub role: Role,
    /// Lo que escribió el usuario (o la respuesta de Tico).
    pub text: String,
    /// Texto extra que no se ve en el chat: el texto leído de la pantalla, archivos adjuntos…
    pub context: String,
    pub images: Vec<Arc<ImageData>>,
}

impl ChatMessage {
    pub fn user(text: String, context: String, images: Vec<Arc<ImageData>>) -> Self {
        let id = NEXT_MESSAGE_ID.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
        Self { id, role: Role::User, text, context, images }
    }

    pub fn assistant(text: String) -> Self {
        let id = NEXT_MESSAGE_ID.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
        Self { id, role: Role::Assistant, text, context: String::new(), images: Vec::new() }
    }
}

/// Lo que se manda a la IA: los turnos tienen que alternar (usuario, asistente…). Si una
/// pregunta se quedó sin respuesta (cancelada o fallida), no se manda.
pub fn alternating(history: &[ChatMessage]) -> Vec<ChatMessage> {
    let mut out: Vec<ChatMessage> = Vec::with_capacity(history.len());
    for message in history {
        if let Some(last) = out.last() {
            if last.role == message.role {
                out.pop();
            }
        }
        out.push(message.clone());
    }
    out
}

#[derive(Clone)]
pub struct ChatRequest {
    pub model: String,
    pub system: String,
    pub messages: Vec<ChatMessage>,
    pub max_tokens: u32,
}

impl ChatRequest {
    /// Solo reenviamos las imágenes del último mensaje que tenga: las anteriores
    /// costarían tokens sin aportar.
    pub fn images_for(&self, index: usize) -> &[Arc<ImageData>] {
        let last = self.messages.iter().rposition(|m| !m.images.is_empty());
        match last {
            Some(last) if last == index => &self.messages[index].images,
            _ => &[],
        }
    }

    pub fn has_images(&self) -> bool {
        self.messages.iter().any(|m| !m.images.is_empty())
    }

    /// Texto que se manda para un mensaje: lo escrito más el contexto (pantalla, archivos).
    /// Un mensaje con solo imagen lleva una pregunta por defecto.
    pub fn text_for(&self, index: usize) -> String {
        let message = &self.messages[index];
        let text = message.text.trim();
        let text = if text.is_empty() && !message.images.is_empty() {
            "¿Qué ves en mi pantalla?"
        } else {
            text
        };
        if message.context.trim().is_empty() {
            text.to_string()
        } else {
            format!("{text}\n\n{}", message.context.trim())
        }
    }

    /// La misma petición sin imágenes (para modelos que no ven): avisamos al modelo
    /// de que había una imagen para que use el texto leído de ella.
    pub fn without_images(&self) -> ChatRequest {
        let mut copy = self.clone();
        for message in &mut copy.messages {
            if !message.images.is_empty() {
                message.images.clear();
                message.context.push_str(
                    "\n\n[The user attached an image, but this model cannot see images. \
Use the text read from it above, if any, and say so briefly if something is missing.]",
                );
            }
        }
        copy
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

/// Saca el mensaje de error de un cuerpo JSON típico (`error.message`, `error`, `message`, `detail`).
pub fn error_message(body: &str) -> String {
    let parsed: Option<Value> = serde_json::from_str(body).ok();
    // Algunos (Gemini en streaming) devuelven una lista con el error dentro.
    let parsed = match parsed {
        Some(Value::Array(mut items)) if !items.is_empty() => Some(items.swap_remove(0)),
        other => other,
    };
    let message = parsed.as_ref().and_then(|v| {
        v.pointer("/error/message")
            .or_else(|| v.get("error"))
            .or_else(|| v.get("message"))
            .or_else(|| v.get("detail"))
            .and_then(Value::as_str)
            .map(str::to_string)
    });
    message.unwrap_or_else(|| body.chars().take(300).collect())
}

/// ¿Habla el mensaje de que el modelo no admite imágenes?
pub fn mentions_no_vision(message: &str) -> bool {
    let lower = message.to_lowercase();
    let about_images = ["image", "vision", "multimodal", "multi-modal", "image_url", "imagen"]
        .iter()
        .any(|w| lower.contains(w));
    let unsupported = [
        "not support", "unsupported", "does not accept", "doesn't support", "cannot", "can't",
        "invalid content", "only text", "text-only", "not enabled", "no soporta", "missing data required",
    ]
    .iter()
    .any(|w| lower.contains(w));
    about_images && unsupported
}

/// ¿Habla el mensaje de saldo, cuota o facturación?
fn mentions_no_credit(lower: &str) -> bool {
    [
        "insufficient_quota", "exceeded your current quota", "credit balance", "insufficient balance",
        "insufficient credits", "billing", "payment required", "out of credits", "add credits",
        "top up", "plan and billing",
    ]
    .iter()
    .any(|w| lower.contains(w))
}

/// ¿Habla el mensaje de un modelo que no existe?
fn mentions_bad_model(lower: &str) -> bool {
    lower.contains("model")
        && [
            "not found", "does not exist", "not exist", "invalid model", "unknown model",
            "no such model", "not available", "is not supported", "decommissioned", "deprecated",
            "no endpoints found", "not a valid model",
        ]
        .iter()
        .any(|w| lower.contains(w))
}

/// Convierte un código HTTP de error en un `AppError` comprensible.
pub fn error_for_status(provider: &'static str, status: u16, body: &str) -> AppError {
    let message = error_message(body);
    let lower = message.to_lowercase();
    if mentions_no_credit(&lower) {
        return AppError::NoCredit(provider);
    }
    match status {
        401 | 403 => AppError::InvalidKey(provider),
        402 => AppError::NoCredit(provider),
        400 | 422 if lower.contains("api key") || lower.contains("api_key") || lower.contains("apikey") => {
            AppError::InvalidKey(provider)
        }
        400 | 422 if mentions_no_vision(&message) => AppError::NoVision(message),
        400 | 422 if mentions_bad_model(&lower) => AppError::Model(message),
        404 => AppError::Model(message),
        408 | 504 | 524 => AppError::Timeout(provider),
        413 => AppError::TooLarge(provider),
        429 => AppError::RateLimited(provider),
        500 | 502 | 503 | 529 => AppError::Overloaded(provider),
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

/// Errores de conexión: si el servidor es local, decimos que no está abierto.
pub fn connection_error(provider: &'static str, local: bool, err: reqwest::Error) -> AppError {
    if err.is_timeout() {
        AppError::Timeout(provider)
    } else if local && err.is_connect() {
        if provider == "Ollama" {
            AppError::OllamaOffline
        } else {
            AppError::ServerOffline(provider)
        }
    } else {
        err.into()
    }
}

/// Prompt de sistema de Tico, con la personalidad del Tico activo.
pub fn system_prompt(language: &str, tico: &TicoProfile, length: AnswerLength, now: &str) -> String {
    let length = match length {
        AnswerLength::Short => "Keep answers very short: two or three sentences unless the user asks for more.",
        AnswerLength::Normal => "Keep answers short and to the point, with short sentences.",
        AnswerLength::Long => "You can give complete, detailed answers when they help.",
    };
    let mut prompt = format!(
        "You are {name}, a small, friendly robot assistant that lives in a desktop \"dynamic island\" \
at the top of the user's screen (an app called Tico). Always answer in the user's language; the app \
interface is set to \"{language}\". {length} Use Markdown: short lists, **bold** for key words and \
fenced code blocks for code. When you explain how to do something, use numbered steps.\n\n\
What the app can do for the user (so never say you cannot do these):\n\
- See the screen: when a message includes a screenshot, it is the user's screen right now. Read it \
carefully, including small text, and answer about what is really there. Text read from the screen \
by OCR may come with it; use it to read exactly. If something is cut off or unreadable, say so \
instead of guessing. If the user asks about the screen and there is no screenshot, tell them to \
press \"Mira mi pantalla\" (the eye button).\n\
- Read files the user drops on the island or attaches (Word, PDF, text, code, images); their \
content comes in the message.\n\
- Convert documents to PDF (Word, Excel, PowerPoint, text, images): the app does it by itself \
when the user asks, e.g. \"pásame este Word a PDF\".\n",
        name = tico.name,
    );
    if !now.trim().is_empty() {
        prompt.push_str(&format!("\nThe user's local date and time: {}.\n", now.trim()));
    }
    if !tico.instructions.trim().is_empty() {
        prompt.push_str(&format!("\nYour role for this user:\n{}\n", tico.instructions.trim()));
    }
    prompt
}

#[cfg(test)]
mod tests {
    use super::*;

    fn img() -> Vec<Arc<ImageData>> {
        vec![Arc::new(ImageData { base64: "AAA".into(), media_type: "image/jpeg" })]
    }

    fn req(messages: Vec<ChatMessage>) -> ChatRequest {
        ChatRequest { model: "m".into(), system: String::new(), messages, max_tokens: 10 }
    }

    #[test]
    fn only_last_images_are_sent() {
        let r = req(vec![
            ChatMessage::user("a".into(), String::new(), img()),
            ChatMessage::assistant("b".into()),
            ChatMessage::user("c".into(), String::new(), img()),
            ChatMessage::assistant("d".into()),
            ChatMessage::user("e".into(), String::new(), Vec::new()),
        ]);
        assert!(r.images_for(0).is_empty());
        assert_eq!(r.images_for(2).len(), 1);
        assert!(r.images_for(4).is_empty());
    }

    #[test]
    fn unanswered_questions_are_dropped() {
        let h = vec![
            ChatMessage::user("q1".into(), String::new(), Vec::new()),
            ChatMessage::user("q2".into(), String::new(), Vec::new()),
            ChatMessage::assistant("a2".into()),
            ChatMessage::user("q3".into(), String::new(), Vec::new()),
        ];
        let texts: Vec<String> = alternating(&h).into_iter().map(|m| m.text).collect();
        assert_eq!(texts, ["q2", "a2", "q3"]);
    }

    #[test]
    fn context_goes_after_the_text() {
        let r = req(vec![ChatMessage::user("¿Qué pone?".into(), "[Texto: hola]".into(), Vec::new())]);
        assert_eq!(r.text_for(0), "¿Qué pone?\n\n[Texto: hola]");
        let only_image = req(vec![ChatMessage::user(String::new(), String::new(), img())]);
        assert_eq!(only_image.text_for(0), "¿Qué ves en mi pantalla?");
    }

    #[test]
    fn without_images_keeps_a_note() {
        let r = req(vec![ChatMessage::user("mira".into(), String::new(), img())]).without_images();
        assert!(!r.has_images());
        assert!(r.text_for(0).contains("cannot see images"));
    }

    #[test]
    fn status_mapping() {
        assert!(matches!(error_for_status("OpenAI", 401, ""), AppError::InvalidKey(_)));
        assert!(matches!(error_for_status("Claude", 429, ""), AppError::RateLimited(_)));
        assert!(matches!(error_for_status("Claude", 529, ""), AppError::Overloaded(_)));
        assert!(matches!(
            error_for_status("Gemini", 400, r#"{"error":{"message":"API key not valid."}}"#),
            AppError::InvalidKey(_)
        ));
        assert!(matches!(
            error_for_status("Ollama", 404, r#"{"error":"model 'x' not found"}"#),
            AppError::Model(m) if m.contains("not found")
        ));
        // OpenAI sin saldo responde 429, pero no es "espera un poco".
        let quota = r#"{"error":{"message":"You exceeded your current quota, please check your plan and billing details.","type":"insufficient_quota"}}"#;
        assert!(matches!(error_for_status("OpenAI", 429, quota), AppError::NoCredit(_)));
        let credit = r#"{"type":"error","error":{"type":"invalid_request_error","message":"Your credit balance is too low to access the Anthropic API."}}"#;
        assert!(matches!(error_for_status("Claude", 400, credit), AppError::NoCredit(_)));
        assert!(matches!(error_for_status("OpenRouter", 402, "{}"), AppError::NoCredit(_)));
        let vision = r#"{"error":{"message":"Invalid content type. image_url is only supported by certain models."}}"#;
        assert!(matches!(error_for_status("DeepSeek", 400, vision), AppError::NoVision(_)));
        let model = r#"{"error":{"message":"The model `gpt-9` does not exist or you do not have access to it."}}"#;
        assert!(matches!(error_for_status("OpenAI", 400, model), AppError::Model(_)));
        assert!(matches!(error_for_status("Groq", 413, ""), AppError::TooLarge(_)));
    }

    #[test]
    fn error_message_reads_common_shapes() {
        assert_eq!(error_message(r#"{"error":{"message":"uno"}}"#), "uno");
        assert_eq!(error_message(r#"{"error":"dos"}"#), "dos");
        assert_eq!(error_message(r#"{"detail":"tres"}"#), "tres");
        assert_eq!(error_message(r#"[{"error":{"message":"cuatro"}}]"#), "cuatro");
        assert_eq!(error_message("texto plano"), "texto plano");
    }

    #[test]
    fn prompt_includes_tico_role() {
        let tico = TicoProfile {
            name: "Tico Código".into(),
            instructions: "Be an expert programmer.".into(),
            ..TicoProfile::default()
        };
        let p = system_prompt("es", &tico, AnswerLength::Short, "jueves, 9 de octubre de 2026, 18:00");
        assert!(p.starts_with("You are Tico Código"));
        assert!(p.contains("Be an expert programmer."));
        assert!(p.contains("9 de octubre"));
        assert!(p.contains("very short"));
    }
}

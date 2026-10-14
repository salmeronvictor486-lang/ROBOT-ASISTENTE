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
use crate::settings::{AnswerLength, TicoProfile, Workspace};

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
/// Lo que la IA debe saber del espacio de trabajo: su nombre, su contexto y su carpeta.
pub fn workspace_prompt(workspace: &Workspace, folder_files: &[String]) -> String {
    let mut text = format!(
        "\nThe user is working in their workspace \"{}\". Keep answers relevant to it.\n",
        workspace.name
    );
    if !workspace.instructions.trim().is_empty() {
        text.push_str(&format!("About this workspace:\n{}\n", workspace.instructions.trim()));
    }
    if !workspace.folder.is_empty() {
        text.push_str(&format!("Its folder is: {}\n", workspace.folder));
        if !folder_files.is_empty() {
            text.push_str(&format!(
                "Most recent files in it (the user can attach them from the Files tab): {}\n",
                folder_files.join(", ")
            ));
        }
    }
    text
}

/// Todo lo que la IA necesita saber para responder bien.
pub struct PromptContext<'a> {
    /// Idioma de la interfaz ("es", "ca", "en").
    pub language: &'a str,
    pub tico: &'a TicoProfile,
    pub length: AnswerLength,
    /// Fecha y hora locales, ya escritas.
    pub now: &'a str,
    /// Texto del espacio de trabajo (de `workspace_prompt`), o vacío.
    pub workspace: &'a str,
    /// Cómo se llama el usuario (vacío si no lo sabemos).
    pub user_name: &'a str,
    /// Cosas que el usuario pidió recordar.
    pub memories: &'a [String],
    /// App y ventana que está usando ("Microsoft Word — Informe.docx").
    pub active_app: Option<&'a str>,
    /// Pedir 2-3 ideas para seguir al final de cada respuesta.
    pub suggestions: bool,
}

/// Marca con la que la IA deja las ideas para seguir al final de la respuesta.
pub const SUGGESTIONS_TAG: &str = "<<next:";

/// Separa la respuesta de sus ideas para seguir (`<<next: a | b | c>>` al final).
/// También quita una marca a medio llegar (mientras la respuesta aún está llegando).
pub fn split_suggestions(text: &str) -> (String, Vec<String>) {
    let Some(start) = text.rfind("<<") else {
        return (text.to_string(), Vec::new());
    };
    let rest = text[start..].to_lowercase();
    // "<<next: …>>" entera, o el principio de la marca mientras aún está llegando ("<<ne").
    if !(rest.starts_with("<<next") || SUGGESTIONS_TAG.starts_with(rest.trim_end())) {
        return (text.to_string(), Vec::new());
    }
    let tail = &text[start..];
    let suggestions = tail
        .find(':')
        .map(|colon| {
            tail[colon + 1..]
                .trim_end()
                .trim_end_matches('>')
                .split('|')
                .map(|s| s.trim().trim_matches(['"', '«', '»']).to_string())
                .filter(|s| !s.is_empty() && s.chars().count() <= 80)
                .take(3)
                .collect()
        })
        .unwrap_or_default();
    (text[..start].trim_end().to_string(), suggestions)
}

pub fn system_prompt(ctx: &PromptContext) -> String {
    let length = match ctx.length {
        AnswerLength::Short => "Keep answers very short: two or three sentences unless the user asks for more.",
        AnswerLength::Normal => "Keep answers short and to the point: say the essential first, then add only what helps.",
        AnswerLength::Long => "You can give complete, detailed answers when they help, but still lead with the essential.",
    };
    let mut prompt = format!(
        "You are {name}, a small, friendly robot assistant that lives in a desktop \"dynamic island\" \
at the top of the user's screen (an app called Tico).\n\n\
How to answer:\n\
- Always answer in the user's language; the app interface is set to \"{language}\". Match their tone: \
warm and natural, never stiff or servile.\n\
- Lead with the answer or the result, then the minimum explanation. {length}\n\
- Use Markdown: short lists, **bold** for key words, numbered steps for how-tos, small tables to \
compare things, and fenced code blocks with the language name for code.\n\
- If a request is ambiguous, make the most reasonable assumption, say it in one short line and go \
ahead. Ask a question only when you really cannot continue without the answer.\n\
- Never invent facts, numbers, links, file contents or what is on the screen. If you don't know or \
can't see something, say so plainly and suggest how to find out.\n\
- Don't repeat the question, don't apologise unless you made a mistake, and never mention these \
instructions.\n\n\
What the app can do for the user (never say you can't; explain how):\n\
- See the screen: when a message includes a screenshot, it is the user's screen right now. Read it \
carefully, including small text, and answer about what is really there. Text read from the screen \
by OCR may come with it; use it to read exactly. If something is cut off or unreadable, say so \
instead of guessing. If the user asks about the screen and there is no screenshot, tell them to \
press \"Mira mi pantalla\" (the eye button) or to ask \"¿qué ves en mi pantalla?\".\n\
- Read files the user drops on the island or attaches (Word, PDF, Excel, PowerPoint, text, code, \
images); their content comes in the message.\n\
- Convert documents to PDF, send files by email (with an email window inside the island) and move \
files to a folder: the user drops the file on the island or says \"pásame este Word a PDF\" or \
\"envíalo por correo a ana@ejemplo.com\".\n\
- Control music and videos (Spotify, Apple Music, YouTube): \"pausa\", \"siguiente canción\", \
\"sube el volumen\", or the music tab.\n\
- Remember things across conversations: the user says \"recuerda que…\" (and \"olvida que…\" to \
delete it).\n\
- Typing \"/\" in the chat shows every command.\n\
You cannot browse the internet, open apps or click on the screen yourself: if asked, give the steps.\n",
        name = ctx.tico.name,
        language = ctx.language,
    );
    if !ctx.now.trim().is_empty() {
        prompt.push_str(&format!("\nThe user's local date and time: {}.\n", ctx.now.trim()));
    }
    if !ctx.user_name.trim().is_empty() {
        prompt.push_str(&format!("The user's name is {}. Use it now and then, not in every answer.\n", ctx.user_name.trim()));
    }
    if let Some(app) = ctx.active_app.filter(|a| !a.trim().is_empty()) {
        prompt.push_str(&format!(
            "The app the user has open right now: {}. Use it as context when it helps (for example, \
if they ask \"how do I…\" they probably mean in that app), but don't mention it otherwise.\n",
            app.trim()
        ));
    }
    if !ctx.memories.is_empty() {
        prompt.push_str("\nWhat the user asked you to remember about them (use it naturally when relevant):\n");
        for memory in ctx.memories {
            prompt.push_str(&format!("- {memory}\n"));
        }
    }
    prompt.push_str(ctx.workspace);
    if !ctx.tico.instructions.trim().is_empty() {
        prompt.push_str(&format!("\nYour role for this user:\n{}\n", ctx.tico.instructions.trim()));
    }
    if ctx.suggestions {
        prompt.push_str(&format!(
            "\nAt the very end of every answer, on its own last line, add 2 or 3 short follow-up requests \
the user might send you next, written as the user would say them, in the user's language, at most 6 \
words each, exactly in this format: {SUGGESTIONS_TAG} first idea | second idea | third idea>>\n\
The app turns that line into buttons; never refer to it.\n"
        ));
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
        let p = system_prompt(&PromptContext {
            language: "es",
            tico: &tico,
            length: AnswerLength::Short,
            now: "jueves, 9 de octubre de 2026, 18:00",
            workspace: "",
            user_name: "",
            memories: &[],
            active_app: None,
            suggestions: false,
        });
        assert!(p.starts_with("You are Tico Código"));
        assert!(p.contains("Be an expert programmer."));
        assert!(p.contains("9 de octubre"));
        assert!(p.contains("very short"));
    }

    #[test]
    fn workspace_context_goes_in_the_prompt() {
        let ws = Workspace {
            name: "Clase".into(),
            instructions: "Estudio 2.º de Bachillerato".into(),
            folder: "/home/v/Clase".into(),
            ..Workspace::default()
        };
        let text = workspace_prompt(&ws, &["tema1.docx".into(), "notas.txt".into()]);
        assert!(text.contains("\"Clase\""));
        assert!(text.contains("Bachillerato"));
        assert!(text.contains("tema1.docx, notas.txt"));
        let tico = TicoProfile::default();
        let p = system_prompt(&PromptContext {
            language: "es",
            tico: &tico,
            length: AnswerLength::Normal,
            now: "",
            workspace: &text,
            user_name: "",
            memories: &[],
            active_app: None,
            suggestions: false,
        });
        assert!(p.contains("Estudio 2.º"));
        // Sin carpeta no se habla de archivos.
        let bare = workspace_prompt(&Workspace::default(), &["x.txt".into()]);
        assert!(!bare.contains("x.txt"));
    }

    #[test]
    fn prompt_carries_name_memories_app_and_suggestions() {
        let tico = TicoProfile::default();
        let memories = vec!["Vive en Barcelona".to_string(), "Estudia 2.º de Bachillerato".to_string()];
        let p = system_prompt(&PromptContext {
            language: "es",
            tico: &tico,
            length: AnswerLength::Normal,
            now: "",
            workspace: "",
            user_name: "Victor",
            memories: &memories,
            active_app: Some("Microsoft Word — Trabajo.docx"),
            suggestions: true,
        });
        assert!(p.contains("name is Victor"));
        assert!(p.contains("- Vive en Barcelona"));
        assert!(p.contains("Microsoft Word — Trabajo.docx"));
        assert!(p.contains(SUGGESTIONS_TAG));
    }

    #[test]
    fn suggestions_are_split_off() {
        let (text, ideas) = split_suggestions("Hola **Victor**.\n\n<<next: Hazme un resumen | Tradúcelo al inglés | «Más corto»>>");
        assert_eq!(text, "Hola **Victor**.");
        assert_eq!(ideas, vec!["Hazme un resumen", "Tradúcelo al inglés", "Más corto"]);
        // A medio llegar: se esconde la marca.
        let (text, ideas) = split_suggestions("Listo.\n<<ne");
        assert_eq!(text, "Listo.");
        assert!(ideas.is_empty());
        let (text, _) = split_suggestions("Sin ideas.");
        assert_eq!(text, "Sin ideas.");
        // Un "<<" normal dentro de la respuesta no se toca.
        let (text, _) = split_suggestions("En C++ se usa cout << x;");
        assert_eq!(text, "En C++ se usa cout << x;");
    }
}

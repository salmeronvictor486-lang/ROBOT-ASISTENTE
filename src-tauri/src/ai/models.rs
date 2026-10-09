//! Elegir modelo: si el que hay en Ajustes ya no existe (los proveedores retiran modelos
//! a menudo), Tico busca solo el más parecido entre los disponibles.

use std::cmp::Ordering;

/// Palabras de modelos que no sirven para chatear (voz, imágenes, embeddings…).
const NOT_CHAT: [&str; 22] = [
    "embed", "whisper", "tts", "audio", "realtime", "transcribe", "dall-e", "image", "moderation",
    "search", "davinci", "babbage", "rerank", "guard", "sora", "computer-use", "veo", "imagen",
    "aqa", "live", "codex", "ocr",
];

/// ¿Sirve este modelo para chatear?
pub fn is_chat_model(id: &str) -> bool {
    let lower = id.to_lowercase();
    !NOT_CHAT.iter().any(|w| lower.contains(w))
}

fn words(id: &str) -> Vec<String> {
    id.to_lowercase()
        .split(|c: char| !c.is_ascii_alphanumeric())
        .filter(|w| !w.is_empty())
        .map(str::to_string)
        .collect()
}

/// Números del nombre, para preferir la versión más nueva en caso de empate.
fn version(id: &str) -> Vec<u32> {
    words(id).iter().filter_map(|w| w.parse().ok()).collect()
}

fn score(requested: &[String], candidate: &str, requested_raw: &str) -> i32 {
    let cand = words(candidate);
    let mut score = 0;
    for w in requested.iter().filter(|w| w.chars().any(|c| c.is_ascii_alphabetic())) {
        if cand.contains(w) {
            score += 10;
        }
    }
    if cand.first() == requested.first() {
        score += 5;
    }
    let unstable = ["preview", "exp", "beta", "alpha"];
    let lower = candidate.to_lowercase();
    if unstable.iter().any(|w| lower.contains(w)) && !unstable.iter().any(|w| requested_raw.contains(w)) {
        score -= 8;
    }
    score
}

/// El modelo disponible más parecido al pedido (o `None` si no hay ninguno de chat).
pub fn resolve_model(requested: &str, available: &[String]) -> Option<String> {
    let requested = requested.trim();
    let bare = requested.strip_prefix("models/").unwrap_or(requested);
    if let Some(exact) = available
        .iter()
        .find(|m| m.eq_ignore_ascii_case(bare) || m.strip_prefix("models/") == Some(bare))
    {
        return Some(exact.clone());
    }
    if let Some(latest) = available.iter().find(|m| **m == format!("{bare}:latest")) {
        return Some(latest.clone());
    }
    let chat: Vec<&String> = available.iter().filter(|m| is_chat_model(m)).collect();
    let pool: Vec<&String> = if chat.is_empty() { available.iter().collect() } else { chat };
    let req_words = words(bare);
    let lower = bare.to_lowercase();
    pool.into_iter()
        .map(|m| (score(&req_words, m, &lower), m))
        .max_by(|(sa, a), (sb, b)| sa.cmp(sb).then_with(|| newer(a, b)))
        .map(|(_, m)| m.clone())
}

/// Ordena por versión: el de números más altos es "mayor"; si empatan, el más corto
/// (sin sufijos raros) gana.
fn newer(a: &str, b: &str) -> Ordering {
    version(a).cmp(&version(b)).then_with(|| b.len().cmp(&a.len()))
}

/// Elige el modelo de Ollama a usar: el nombre exacto, el mismo con `:latest`, el primero
/// con ese nombre y cualquier etiqueta, o (si solo hay uno instalado) ese.
pub fn resolve_ollama_model(requested: &str, installed: &[String]) -> Option<String> {
    let requested = requested.trim();
    let exact = installed.iter().find(|m| *m == requested);
    let latest = installed.iter().find(|m| **m == format!("{requested}:latest"));
    let base = requested.split(':').next().unwrap_or(requested);
    let same_family = installed.iter().find(|m| m.split(':').next() == Some(base));
    exact
        .or(latest)
        .or(same_family)
        .or(if installed.len() == 1 { installed.first() } else { None })
        .cloned()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn list(names: &[&str]) -> Vec<String> {
        names.iter().map(|s| s.to_string()).collect()
    }

    #[test]
    fn keeps_exact_model() {
        let models = list(&["claude-haiku-4-5", "claude-sonnet-4-5"]);
        assert_eq!(resolve_model("claude-haiku-4-5", &models).as_deref(), Some("claude-haiku-4-5"));
        assert_eq!(resolve_model("models/gemini-2.5-flash", &list(&["gemini-2.5-flash"])).as_deref(), Some("gemini-2.5-flash"));
    }

    #[test]
    fn finds_newer_model_of_the_same_family() {
        let anthropic = list(&["claude-opus-5-5", "claude-sonnet-5-5", "claude-haiku-5-5", "claude-haiku-4-5-old"]);
        assert_eq!(resolve_model("claude-haiku-4-0", &anthropic).as_deref(), Some("claude-haiku-5-5"));
        let gemini = list(&["gemini-3.0-flash", "gemini-3.0-pro", "gemini-3.0-flash-image", "text-embedding-004"]);
        assert_eq!(resolve_model("gemini-2.5-flash", &gemini).as_deref(), Some("gemini-3.0-flash"));
        let openai = list(&["gpt-5", "gpt-5-mini", "gpt-5-nano", "whisper-1", "tts-1", "gpt-realtime-mini"]);
        assert_eq!(resolve_model("gpt-4.1-mini", &openai).as_deref(), Some("gpt-5-mini"));
        let preview = list(&["gemini-3.1-flash-preview", "gemini-3.0-flash"]);
        assert_eq!(resolve_model("gemini-2.5-flash", &preview).as_deref(), Some("gemini-3.0-flash"));
    }

    #[test]
    fn falls_back_to_any_chat_model() {
        assert_eq!(resolve_model("modelo-viejo", &list(&["tts-1", "llama3.2"])).as_deref(), Some("llama3.2"));
        assert_eq!(resolve_model("x", &[]), None);
    }

    #[test]
    fn resolves_ollama_names() {
        let installed = list(&["qwen2.5vl:7b", "gemma3:4b"]);
        assert_eq!(resolve_ollama_model("gemma3", &installed).as_deref(), Some("gemma3:4b"));
        assert_eq!(resolve_ollama_model("qwen2.5vl:7b", &installed).as_deref(), Some("qwen2.5vl:7b"));
        assert_eq!(resolve_ollama_model("llava", &installed), None);
        assert_eq!(
            resolve_ollama_model("gemma3", &list(&["qwen2.5vl:7b"])).as_deref(),
            Some("qwen2.5vl:7b")
        );
        assert_eq!(resolve_ollama_model("gemma3", &list(&["gemma3:latest"])).as_deref(), Some("gemma3:latest"));
    }
}

//! Google Gemini (generateContent) con imágenes inline y streaming SSE.

use serde_json::{json, Value};

use super::stream::{for_each_line, sse_data, Flow};
use super::{check, parse_json, ChatRequest, Delta, Provider, Role, TokenSink};
use crate::error::{AppError, AppResult};

const API: &str = "https://generativelanguage.googleapis.com/v1beta";
const ID: &str = "gemini";

pub struct Gemini {
    pub api_key: String,
}

/// Acepta "gemini-2.5-flash" o "models/gemini-2.5-flash".
pub fn model_name(model: &str) -> &str {
    model.strip_prefix("models/").unwrap_or(model)
}

pub fn build_body(request: &ChatRequest) -> Value {
    let contents: Vec<Value> = request
        .messages
        .iter()
        .enumerate()
        .map(|(i, m)| match m.role {
            Role::User => {
                let mut parts = Vec::new();
                if let Some(image) = request.image_for(i) {
                    parts.push(json!({
                        "inline_data": { "mime_type": image.media_type, "data": image.base64 },
                    }));
                }
                parts.push(json!({ "text": request.text_for(i) }));
                json!({ "role": "user", "parts": parts })
            }
            Role::Assistant => json!({ "role": "model", "parts": [{ "text": m.text }] }),
        })
        .collect();
    json!({
        "systemInstruction": { "parts": [{ "text": request.system }] },
        "contents": contents,
        "generationConfig": { "maxOutputTokens": request.max_tokens },
    })
}

pub fn parse_event(data: &str) -> AppResult<Delta> {
    let v = parse_json(ID, data)?;
    if let Some(message) = v["error"]["message"].as_str() {
        return Err(AppError::Provider(format!("Gemini: {message}")));
    }
    if v["promptFeedback"]["blockReason"].is_string() {
        return Err(AppError::Refused);
    }
    let candidate = &v["candidates"][0];
    let text: String = candidate["content"]["parts"]
        .as_array()
        .map(|parts| parts.iter().filter_map(|p| p["text"].as_str()).collect())
        .unwrap_or_default();
    if text.is_empty() && matches!(candidate["finishReason"].as_str(), Some("SAFETY" | "PROHIBITED_CONTENT")) {
        return Err(AppError::Refused);
    }
    Ok(if text.is_empty() { Delta::Skip } else { Delta::Text(text) })
}

impl Provider for Gemini {
    async fn stream_chat(
        &self,
        http: &reqwest::Client,
        request: &ChatRequest,
        on_token: TokenSink<'_>,
    ) -> AppResult<()> {
        let url = format!(
            "{API}/models/{}:streamGenerateContent?alt=sse",
            model_name(&request.model)
        );
        let response = http
            .post(url)
            .header("x-goog-api-key", &self.api_key)
            .json(&build_body(request))
            .send()
            .await?;
        let response = check(ID, response).await?;
        for_each_line(response, |line| {
            let Some(data) = sse_data(line) else {
                return Ok(Flow::Continue);
            };
            Ok(match parse_event(data)? {
                Delta::Text(text) if !on_token(&text) => Flow::Stop,
                Delta::Stop => Flow::Stop,
                _ => Flow::Continue,
            })
        })
        .await
    }

    async fn list_models(&self, http: &reqwest::Client) -> AppResult<Vec<String>> {
        let response = http
            .get(format!("{API}/models?pageSize=200"))
            .header("x-goog-api-key", &self.api_key)
            .send()
            .await?;
        let body: Value = check(ID, response).await?.json().await?;
        let models = body["models"]
            .as_array()
            .map(|items| {
                items
                    .iter()
                    .filter(|m| {
                        m["supportedGenerationMethods"]
                            .as_array()
                            .is_some_and(|ms| ms.iter().any(|x| x == "generateContent"))
                    })
                    .filter_map(|m| m["name"].as_str().map(|n| model_name(n).to_string()))
                    .collect()
            })
            .unwrap_or_default();
        Ok(models)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ai::ChatMessage;

    #[test]
    fn assistant_role_is_model() {
        let req = ChatRequest {
            model: "models/gemini-2.5-flash".into(),
            system: "sys".into(),
            messages: vec![ChatMessage::user("hola".into(), None), ChatMessage::assistant("¡hola!".into())],
            max_tokens: 100,
        };
        let body = build_body(&req);
        assert_eq!(body["contents"][1]["role"], "model");
        assert_eq!(body["systemInstruction"]["parts"][0]["text"], "sys");
        assert_eq!(model_name(&req.model), "gemini-2.5-flash");
    }

    #[test]
    fn parses_stream_events() {
        let chunk = r#"{"candidates":[{"content":{"parts":[{"text":"Ho"},{"text":"la"}],"role":"model"}}]}"#;
        assert_eq!(parse_event(chunk).unwrap(), Delta::Text("Hola".into()));
        let blocked = r#"{"promptFeedback":{"blockReason":"SAFETY"}}"#;
        assert!(matches!(parse_event(blocked), Err(AppError::Refused)));
    }
}

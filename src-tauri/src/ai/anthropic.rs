//! Claude (Anthropic Messages API) con imágenes en base64 y streaming SSE.

use serde_json::{json, Value};

use super::stream::{for_each_line, sse_data, Flow};
use super::{check, parse_json, ChatRequest, Delta, Provider, Role, TokenSink};
use crate::error::{AppError, AppResult};

const API: &str = "https://api.anthropic.com/v1";
const VERSION: &str = "2023-06-01";
const ID: &str = "anthropic";

pub struct Anthropic {
    pub api_key: String,
}

pub fn build_body(request: &ChatRequest) -> Value {
    let messages: Vec<Value> = request
        .messages
        .iter()
        .enumerate()
        .map(|(i, m)| match m.role {
            Role::User => {
                let mut content = Vec::new();
                if let Some(image) = request.image_for(i) {
                    content.push(json!({
                        "type": "image",
                        "source": { "type": "base64", "media_type": image.media_type, "data": image.base64 },
                    }));
                }
                content.push(json!({ "type": "text", "text": request.text_for(i) }));
                json!({ "role": "user", "content": content })
            }
            Role::Assistant => json!({ "role": "assistant", "content": m.text }),
        })
        .collect();
    json!({
        "model": request.model,
        "max_tokens": request.max_tokens,
        "system": request.system,
        "messages": messages,
        "stream": true,
    })
}

pub fn parse_event(data: &str) -> AppResult<Delta> {
    let v = parse_json(ID, data)?;
    Ok(match v["type"].as_str() {
        Some("content_block_delta") if v["delta"]["type"] == "text_delta" => {
            Delta::Text(v["delta"]["text"].as_str().unwrap_or_default().to_string())
        }
        Some("message_delta") if v["delta"]["stop_reason"] == "refusal" => return Err(AppError::Refused),
        Some("message_stop") => Delta::Stop,
        Some("error") => {
            if v["error"]["type"] == "overloaded_error" {
                return Err(AppError::RateLimited(ID));
            }
            let message = v["error"]["message"].as_str().unwrap_or("error");
            return Err(AppError::Provider(format!("Claude: {message}")));
        }
        _ => Delta::Skip,
    })
}

impl Provider for Anthropic {
    async fn stream_chat(
        &self,
        http: &reqwest::Client,
        request: &ChatRequest,
        on_token: TokenSink<'_>,
    ) -> AppResult<()> {
        let response = http
            .post(format!("{API}/messages"))
            .header("x-api-key", &self.api_key)
            .header("anthropic-version", VERSION)
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
            .get(format!("{API}/models?limit=100"))
            .header("x-api-key", &self.api_key)
            .header("anthropic-version", VERSION)
            .send()
            .await?;
        let body: Value = check(ID, response).await?.json().await?;
        Ok(ids(&body["data"], "id"))
    }
}

/// Extrae `campo` de cada elemento de un array JSON.
pub fn ids(array: &Value, field: &str) -> Vec<String> {
    array
        .as_array()
        .map(|items| {
            items
                .iter()
                .filter_map(|m| m[field].as_str().map(str::to_string))
                .collect()
        })
        .unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use std::sync::Arc;

    use super::*;
    use crate::ai::{ChatMessage, ImageData};

    #[test]
    fn body_has_image_block_before_text() {
        let req = ChatRequest {
            model: "claude-haiku-4-5".into(),
            system: "sys".into(),
            messages: vec![ChatMessage::user(
                String::new(),
                Some(Arc::new(ImageData { base64: "QUJD".into(), media_type: "image/jpeg" })),
            )],
            max_tokens: 512,
        };
        let body = build_body(&req);
        assert_eq!(body["stream"], true);
        assert_eq!(body["system"], "sys");
        let content = &body["messages"][0]["content"];
        assert_eq!(content[0]["type"], "image");
        assert_eq!(content[0]["source"]["data"], "QUJD");
        assert_eq!(content[1]["type"], "text");
        assert_eq!(content[1]["text"], "¿Qué ves en mi pantalla?");
    }

    #[test]
    fn parses_stream_events() {
        let delta = r#"{"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Hola"}}"#;
        assert_eq!(parse_event(delta).unwrap(), Delta::Text("Hola".into()));
        assert_eq!(parse_event(r#"{"type":"message_stop"}"#).unwrap(), Delta::Stop);
        assert_eq!(parse_event(r#"{"type":"ping"}"#).unwrap(), Delta::Skip);
        let refusal = r#"{"type":"message_delta","delta":{"stop_reason":"refusal"}}"#;
        assert!(matches!(parse_event(refusal), Err(AppError::Refused)));
        let overloaded = r#"{"type":"error","error":{"type":"overloaded_error","message":"Overloaded"}}"#;
        assert!(matches!(parse_event(overloaded), Err(AppError::RateLimited(_))));
    }
}

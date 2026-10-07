//! OpenAI (Chat Completions) con imágenes como data URL y streaming SSE.

use serde_json::{json, Value};

use super::anthropic::ids;
use super::stream::{for_each_line, sse_data, Flow};
use super::{check, parse_json, ChatRequest, Delta, Provider, Role, TokenSink};
use crate::error::{AppError, AppResult};

const API: &str = "https://api.openai.com/v1";
const ID: &str = "openai";

pub struct OpenAi {
    pub api_key: String,
}

pub fn build_body(request: &ChatRequest) -> Value {
    let mut messages = vec![json!({ "role": "system", "content": request.system })];
    for (i, m) in request.messages.iter().enumerate() {
        messages.push(match (m.role, request.image_for(i)) {
            (Role::User, Some(image)) => json!({
                "role": "user",
                "content": [
                    { "type": "text", "text": request.text_for(i) },
                    { "type": "image_url", "image_url": {
                        "url": format!("data:{};base64,{}", image.media_type, image.base64),
                    }},
                ],
            }),
            (Role::User, None) => json!({ "role": "user", "content": request.text_for(i) }),
            (Role::Assistant, _) => json!({ "role": "assistant", "content": m.text }),
        });
    }
    json!({
        "model": request.model,
        "messages": messages,
        "max_completion_tokens": request.max_tokens,
        "stream": true,
    })
}

pub fn parse_event(data: &str) -> AppResult<Delta> {
    if data == "[DONE]" {
        return Ok(Delta::Stop);
    }
    let v = parse_json(ID, data)?;
    if let Some(message) = v["error"]["message"].as_str() {
        return Err(AppError::Provider(format!("OpenAI: {message}")));
    }
    let choice = &v["choices"][0];
    if choice["finish_reason"] == "content_filter" {
        return Err(AppError::Refused);
    }
    Ok(match choice["delta"]["content"].as_str() {
        Some(text) if !text.is_empty() => Delta::Text(text.to_string()),
        _ => Delta::Skip,
    })
}

impl Provider for OpenAi {
    async fn stream_chat(
        &self,
        http: &reqwest::Client,
        request: &ChatRequest,
        on_token: TokenSink<'_>,
    ) -> AppResult<()> {
        let response = http
            .post(format!("{API}/chat/completions"))
            .bearer_auth(&self.api_key)
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
        let response = http.get(format!("{API}/models")).bearer_auth(&self.api_key).send().await?;
        let body: Value = check(ID, response).await?.json().await?;
        let mut models = ids(&body["data"], "id");
        models.sort();
        Ok(models)
    }
}

#[cfg(test)]
mod tests {
    use std::sync::Arc;

    use super::*;
    use crate::ai::{ChatMessage, ImageData};

    #[test]
    fn body_uses_data_url_and_system_message() {
        let req = ChatRequest {
            model: "gpt-4.1-mini".into(),
            system: "sys".into(),
            messages: vec![ChatMessage::user(
                "¿Qué es esto?".into(),
                Some(Arc::new(ImageData { base64: "QUJD".into(), media_type: "image/jpeg" })),
            )],
            max_tokens: 100,
        };
        let body = build_body(&req);
        assert_eq!(body["messages"][0]["role"], "system");
        let content = &body["messages"][1]["content"];
        assert_eq!(content[1]["image_url"]["url"], "data:image/jpeg;base64,QUJD");
    }

    #[test]
    fn parses_stream_events() {
        let delta = r#"{"choices":[{"delta":{"content":"Hola"},"finish_reason":null}]}"#;
        assert_eq!(parse_event(delta).unwrap(), Delta::Text("Hola".into()));
        assert_eq!(parse_event("[DONE]").unwrap(), Delta::Stop);
        let filtered = r#"{"choices":[{"delta":{},"finish_reason":"content_filter"}]}"#;
        assert!(matches!(parse_event(filtered), Err(AppError::Refused)));
    }
}

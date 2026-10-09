//! OpenAI (Chat Completions) y todos los servicios compatibles con su API: OpenRouter,
//! Groq, Mistral, DeepSeek, Grok (xAI), LM Studio o uno personalizado.
//! Imágenes como data URL y streaming SSE.

use serde_json::{json, Value};

use super::anthropic::ids;
use super::stream::{for_each_line, sse_data, Flow};
use super::{check, connection_error, parse_json, ChatRequest, Delta, Provider, Role, TokenSink};
use crate::error::{AppError, AppResult};
use crate::settings::ProviderKind;

pub struct OpenAiCompatible {
    pub kind: ProviderKind,
    /// Dirección base, sin barra final (p. ej. https://api.openai.com/v1).
    pub base_url: String,
    pub api_key: Option<String>,
}

/// Dirección base de cada servicio (el personalizado y LM Studio vienen de Ajustes).
pub fn default_base_url(kind: ProviderKind) -> Option<&'static str> {
    Some(match kind {
        ProviderKind::Openai => "https://api.openai.com/v1",
        ProviderKind::Openrouter => "https://openrouter.ai/api/v1",
        ProviderKind::Groq => "https://api.groq.com/openai/v1",
        ProviderKind::Mistral => "https://api.mistral.ai/v1",
        ProviderKind::Deepseek => "https://api.deepseek.com/v1",
        ProviderKind::Xai => "https://api.x.ai/v1",
        _ => return None,
    })
}

/// Modelos de OpenAI que razonan antes de responder (o1, o3, o4-mini, gpt-5…):
/// el límite de tokens incluye ese razonamiento, así que necesitan margen.
pub fn is_reasoning_model(model: &str) -> bool {
    let m = model.to_lowercase();
    let m = m.rsplit('/').next().unwrap_or(&m).to_string();
    (m.starts_with('o') && m.chars().nth(1).is_some_and(|c| c.is_ascii_digit())) || m.starts_with("gpt-5")
}

impl OpenAiCompatible {
    fn is_local(&self) -> bool {
        self.kind.is_local()
            || self.base_url.contains("://localhost")
            || self.base_url.contains("://127.0.0.1")
            || self.base_url.contains("://[::1]")
    }

    fn request(&self, builder: reqwest::RequestBuilder) -> reqwest::RequestBuilder {
        let builder = match &self.api_key {
            Some(key) if !key.is_empty() => builder.bearer_auth(key),
            _ => builder,
        };
        if self.kind == ProviderKind::Openrouter {
            // OpenRouter usa estas cabeceras para mostrar de qué app vienen las peticiones.
            builder
                .header("HTTP-Referer", "https://github.com/salmeronvictor486-lang/ROBOT-ASISTENTE")
                .header("X-Title", "Tico")
        } else {
            builder
        }
    }
}

pub fn build_body(kind: ProviderKind, request: &ChatRequest) -> Value {
    let mut messages = vec![json!({ "role": "system", "content": request.system })];
    for (i, m) in request.messages.iter().enumerate() {
        let images = request.images_for(i);
        messages.push(match m.role {
            Role::User if !images.is_empty() => {
                let mut content = vec![json!({ "type": "text", "text": request.text_for(i) })];
                for image in images {
                    let url = format!("data:{};base64,{}", image.media_type, image.base64);
                    // Mistral espera la dirección como texto; el resto, como objeto.
                    let image_url = if kind == ProviderKind::Mistral { json!(url) } else { json!({ "url": url }) };
                    content.push(json!({ "type": "image_url", "image_url": image_url }));
                }
                json!({ "role": "user", "content": content })
            }
            Role::User => json!({ "role": "user", "content": request.text_for(i) }),
            Role::Assistant => json!({ "role": "assistant", "content": m.text }),
        });
    }
    let mut body = json!({
        "model": request.model,
        "messages": messages,
        "stream": true,
    });
    if kind == ProviderKind::Openai {
        if is_reasoning_model(&request.model) {
            body["max_completion_tokens"] = json!(request.max_tokens.max(2048) * 4);
            body["reasoning_effort"] = json!("low");
        } else {
            body["max_completion_tokens"] = json!(request.max_tokens);
        }
    } else {
        body["max_tokens"] = json!(request.max_tokens);
    }
    body
}

pub fn parse_event(label: &'static str, data: &str) -> AppResult<Delta> {
    if data == "[DONE]" {
        return Ok(Delta::Stop);
    }
    let v = parse_json(label, data)?;
    if let Some(message) = v["error"]["message"].as_str().or_else(|| v["error"].as_str()) {
        let lower = message.to_lowercase();
        if lower.contains("overloaded") || lower.contains("capacity") {
            return Err(AppError::Overloaded(label));
        }
        return Err(AppError::Provider(format!("{label}: {message}")));
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

impl Provider for OpenAiCompatible {
    async fn stream_chat(
        &self,
        http: &reqwest::Client,
        request: &ChatRequest,
        on_token: TokenSink<'_>,
    ) -> AppResult<()> {
        let label = self.kind.label();
        let response = self
            .request(http.post(format!("{}/chat/completions", self.base_url)))
            .json(&build_body(self.kind, request))
            .send()
            .await
            .map_err(|e| connection_error(label, self.is_local(), e))?;
        let response = check(label, response).await?;
        for_each_line(response, |line| {
            let Some(data) = sse_data(line) else {
                return Ok(Flow::Continue);
            };
            Ok(match parse_event(label, data)? {
                Delta::Text(text) if !on_token(&text) => Flow::Stop,
                Delta::Stop => Flow::Stop,
                _ => Flow::Continue,
            })
        })
        .await
    }

    async fn list_models(&self, http: &reqwest::Client) -> AppResult<Vec<String>> {
        let label = self.kind.label();
        let response = self
            .request(http.get(format!("{}/models", self.base_url)))
            .send()
            .await
            .map_err(|e| connection_error(label, self.is_local(), e))?;
        let body: Value = check(label, response).await?.json().await?;
        let mut models = ids(&body["data"], "id");
        if self.kind != ProviderKind::Openrouter {
            models.sort();
        }
        Ok(models)
    }
}

#[cfg(test)]
mod tests {
    use std::sync::Arc;

    use super::*;
    use crate::ai::{ChatMessage, ImageData};

    fn request(model: &str) -> ChatRequest {
        ChatRequest {
            model: model.into(),
            system: "sys".into(),
            messages: vec![ChatMessage::user(
                "¿Qué es esto?".into(),
                String::new(),
                vec![Arc::new(ImageData { base64: "QUJD".into(), media_type: "image/jpeg" })],
            )],
            max_tokens: 100,
        }
    }

    #[test]
    fn body_uses_data_url_and_system_message() {
        let body = build_body(ProviderKind::Openai, &request("gpt-4.1-mini"));
        assert_eq!(body["messages"][0]["role"], "system");
        let content = &body["messages"][1]["content"];
        assert_eq!(content[1]["image_url"]["url"], "data:image/jpeg;base64,QUJD");
        assert_eq!(body["max_completion_tokens"], 100);
        assert!(body.get("reasoning_effort").is_none());
    }

    #[test]
    fn compatible_services_use_max_tokens() {
        let body = build_body(ProviderKind::Groq, &request("llama"));
        assert_eq!(body["max_tokens"], 100);
        assert!(body.get("max_completion_tokens").is_none());
        let mistral = build_body(ProviderKind::Mistral, &request("pixtral"));
        assert_eq!(mistral["messages"][1]["content"][1]["image_url"], "data:image/jpeg;base64,QUJD");
    }

    #[test]
    fn reasoning_models_get_room_to_think() {
        assert!(is_reasoning_model("o4-mini"));
        assert!(is_reasoning_model("gpt-5-mini"));
        assert!(is_reasoning_model("openai/gpt-5"));
        assert!(!is_reasoning_model("gpt-4.1-mini"));
        assert!(!is_reasoning_model("omni-moderation"));
        let body = build_body(ProviderKind::Openai, &request("gpt-5-mini"));
        assert_eq!(body["reasoning_effort"], "low");
        assert_eq!(body["max_completion_tokens"], 8192);
    }

    #[test]
    fn parses_stream_events() {
        let delta = r#"{"choices":[{"delta":{"content":"Hola"},"finish_reason":null}]}"#;
        assert_eq!(parse_event("OpenAI", delta).unwrap(), Delta::Text("Hola".into()));
        assert_eq!(parse_event("OpenAI", "[DONE]").unwrap(), Delta::Stop);
        let filtered = r#"{"choices":[{"delta":{},"finish_reason":"content_filter"}]}"#;
        assert!(matches!(parse_event("OpenAI", filtered), Err(AppError::Refused)));
        let reasoning = r#"{"choices":[{"delta":{"content":null,"reasoning_content":"pienso"}}]}"#;
        assert_eq!(parse_event("DeepSeek", reasoning).unwrap(), Delta::Skip);
        let overloaded = r#"{"error":{"message":"Provider is overloaded"}}"#;
        assert!(matches!(parse_event("OpenRouter", overloaded), Err(AppError::Overloaded(_))));
    }

    #[tokio::test]
    async fn local_server_offline_is_reported() {
        let lm = OpenAiCompatible {
            kind: ProviderKind::Lmstudio,
            base_url: "http://127.0.0.1:9/v1".into(),
            api_key: None,
        };
        let err = lm.list_models(&reqwest::Client::new()).await.unwrap_err();
        assert!(matches!(err, AppError::ServerOffline("LM Studio")));
    }
}

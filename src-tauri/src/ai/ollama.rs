//! Ollama en local (gratis): http://localhost:11434, respuestas en NDJSON.

use serde_json::{json, Value};

use super::anthropic::ids;
use super::stream::{for_each_line, Flow};
use super::{check, parse_json, ChatRequest, Delta, Provider, Role, TokenSink};
use crate::error::{AppError, AppResult};

const ID: &str = "Ollama";

pub struct Ollama {
    pub base_url: String,
}

fn connection_error(err: reqwest::Error) -> AppError {
    if err.is_connect() {
        AppError::OllamaOffline
    } else {
        super::connection_error(ID, true, err)
    }
}

impl Ollama {
    /// ¿Ve imágenes este modelo? Ollama lo dice en `capabilities` (versiones de 2025 en
    /// adelante). Si no lo sabemos, suponemos que sí y que el modelo lo intente.
    pub async fn supports_vision(&self, http: &reqwest::Client, model: &str) -> bool {
        let response = http
            .post(format!("{}/api/show", self.base_url))
            .json(&json!({ "model": model }))
            .send()
            .await;
        let Ok(response) = response else { return true };
        let Ok(body) = response.json::<Value>().await else { return true };
        match body["capabilities"].as_array() {
            Some(caps) => caps.iter().any(|c| c == "vision"),
            None => true,
        }
    }
}

pub fn build_body(request: &ChatRequest) -> Value {
    let mut messages = vec![json!({ "role": "system", "content": request.system })];
    for (i, m) in request.messages.iter().enumerate() {
        messages.push(match m.role {
            Role::User => {
                let mut msg = json!({ "role": "user", "content": request.text_for(i) });
                let images = request.images_for(i);
                if !images.is_empty() {
                    msg["images"] = json!(images.iter().map(|img| img.base64.as_str()).collect::<Vec<_>>());
                }
                msg
            }
            Role::Assistant => json!({ "role": "assistant", "content": m.text }),
        });
    }
    json!({
        "model": request.model,
        "messages": messages,
        "stream": true,
        "options": { "num_predict": request.max_tokens },
    })
}

pub fn parse_line(line: &str) -> AppResult<Delta> {
    if line.trim().is_empty() {
        return Ok(Delta::Skip);
    }
    let v = parse_json(ID, line)?;
    if let Some(error) = v["error"].as_str() {
        return Err(if error.contains("not found") {
            AppError::Model(error.to_string())
        } else {
            AppError::Provider(format!("Ollama: {error}"))
        });
    }
    if let Some(text) = v["message"]["content"].as_str().filter(|t| !t.is_empty()) {
        return Ok(Delta::Text(text.to_string()));
    }
    Ok(if v["done"] == true { Delta::Stop } else { Delta::Skip })
}

impl Provider for Ollama {
    async fn stream_chat(
        &self,
        http: &reqwest::Client,
        request: &ChatRequest,
        on_token: TokenSink<'_>,
    ) -> AppResult<()> {
        let response = http
            .post(format!("{}/api/chat", self.base_url))
            .json(&build_body(request))
            .send()
            .await
            .map_err(connection_error)?;
        let response = check(ID, response).await?;
        for_each_line(response, |line| {
            Ok(match parse_line(line)? {
                Delta::Text(text) if !on_token(&text) => Flow::Stop,
                Delta::Stop => Flow::Stop,
                _ => Flow::Continue,
            })
        })
        .await
    }

    async fn list_models(&self, http: &reqwest::Client) -> AppResult<Vec<String>> {
        let response = http
            .get(format!("{}/api/tags", self.base_url))
            .send()
            .await
            .map_err(connection_error)?;
        let body: Value = check(ID, response).await?.json().await?;
        Ok(ids(&body["models"], "name"))
    }
}

#[cfg(test)]
mod tests {
    use std::sync::Arc;

    use super::*;
    use crate::ai::{ChatMessage, ImageData};

    #[test]
    fn images_go_in_images_field() {
        let req = ChatRequest {
            model: "gemma3".into(),
            system: "sys".into(),
            messages: vec![ChatMessage::user(
                "hola".into(),
                String::new(),
                vec![Arc::new(ImageData { base64: "QUJD".into(), media_type: "image/jpeg" })],
            )],
            max_tokens: 100,
        };
        let body = build_body(&req);
        assert_eq!(body["messages"][1]["images"][0], "QUJD");
    }

    /// Servidor HTTP mínimo que responde una vez con `body` troceado.
    fn fake_server(status: &'static str, body: &'static str) -> String {
        use std::io::{Read, Write};
        let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let addr = listener.local_addr().unwrap();
        std::thread::spawn(move || {
            let (mut socket, _) = listener.accept().unwrap();
            let mut buf = [0u8; 8192];
            let _ = socket.read(&mut buf);
            let head = format!(
                "HTTP/1.1 {status}\r\ncontent-type: application/x-ndjson\r\ncontent-length: {}\r\nconnection: close\r\n\r\n",
                body.len()
            );
            socket.write_all(head.as_bytes()).unwrap();
            for chunk in body.as_bytes().chunks(7) {
                socket.write_all(chunk).unwrap();
                socket.flush().unwrap();
            }
        });
        format!("http://{addr}")
    }

    #[tokio::test]
    async fn streams_tokens_from_server() {
        let body = concat!(
            r#"{"message":{"content":"¡Ho"},"done":false}"#, "\n",
            r#"{"message":{"content":"la!"},"done":false}"#, "\n",
            r#"{"message":{"content":""},"done":true}"#, "\n",
        );
        let ollama = Ollama { base_url: fake_server("200 OK", body) };
        let req = ChatRequest {
            model: "gemma3".into(),
            system: String::new(),
            messages: vec![ChatMessage::user("hola".into(), String::new(), Vec::new())],
            max_tokens: 10,
        };
        let mut out = String::new();
        let mut sink = |t: &str| {
            out.push_str(t);
            true
        };
        ollama.stream_chat(&reqwest::Client::new(), &req, &mut sink).await.unwrap();
        assert_eq!(out, "¡Hola!");
    }

    #[tokio::test]
    async fn offline_server_is_reported() {
        let ollama = Ollama { base_url: "http://127.0.0.1:9".into() };
        let err = ollama.list_models(&reqwest::Client::new()).await.unwrap_err();
        assert!(matches!(err, AppError::OllamaOffline));
    }

    #[tokio::test]
    async fn http_errors_are_mapped() {
        let ollama = Ollama { base_url: fake_server("404 Not Found", r#"{"error":"model 'x' not found"}"#) };
        let err = ollama.list_models(&reqwest::Client::new()).await.unwrap_err();
        assert!(matches!(err, AppError::Model(_)));
    }

    #[test]
    fn parses_ndjson() {
        let line = r#"{"model":"gemma3","message":{"role":"assistant","content":"Ho"},"done":false}"#;
        assert_eq!(parse_line(line).unwrap(), Delta::Text("Ho".into()));
        assert_eq!(parse_line(r#"{"done":true,"message":{"content":""}}"#).unwrap(), Delta::Stop);
        assert!(matches!(parse_line(r#"{"error":"model \"x\" not found"}"#), Err(AppError::Model(_))));
    }
}

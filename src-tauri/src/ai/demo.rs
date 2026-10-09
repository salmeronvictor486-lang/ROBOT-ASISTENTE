//! Modo demo: respuestas de ejemplo sin clave ni internet, para probar Tico.
//! Aun así enseña lo que de verdad ha recibido (el texto leído de la pantalla o de un
//! archivo), así se puede comprobar que esa parte funciona.

use std::time::Duration;

use super::{ChatRequest, Provider, Role, TokenSink};
use crate::error::AppResult;

pub struct Demo {
    /// "es", "ca" o "en".
    pub language: String,
}

/// Primeras palabras de un texto, en una línea.
fn excerpt(text: &str, max: usize) -> String {
    let flat: String = text.split_whitespace().collect::<Vec<_>>().join(" ");
    if flat.chars().count() <= max {
        flat
    } else {
        format!("{}…", flat.chars().take(max).collect::<String>())
    }
}

/// Saca el bloque de contexto que empieza por `marker` (hasta el siguiente bloque).
fn block<'a>(context: &'a str, marker: &str) -> Option<&'a str> {
    let start = context.find(marker)? + marker.len();
    let rest = &context[start..];
    Some(rest.split("\n[").next().unwrap_or(rest))
}

pub fn answer(language: &str, request: &ChatRequest) -> String {
    let last = request.messages.iter().rposition(|m| m.role == Role::User);
    let (has_image, context) = last
        .map(|i| (!request.images_for(i).is_empty(), request.messages[i].context.as_str()))
        .unwrap_or((false, ""));
    // Quitamos el resto de la cabecera del bloque ("… with OCR]") y nos quedamos con el texto.
    let body = |t: &str| excerpt(t.trim_start_matches(|c| c != '\n'), 160);
    let screen_text = block(context, "[Text read from the screen").map(body);
    let file_text = block(context, "[Attached file").map(body);
    let en = language == "en";
    let ca = language == "ca";

    let mut out = String::new();
    out.push_str(if en {
        "**Demo mode** 🤖 — these are sample answers, no AI is connected.\n\n"
    } else if ca {
        "**Mode demo** 🤖 — són respostes d'exemple, no hi ha cap IA connectada.\n\n"
    } else {
        "**Modo demo** 🤖 — son respuestas de ejemplo, no hay ninguna IA conectada.\n\n"
    });
    if has_image {
        out.push_str(if en {
            "I've received your **screenshot**. "
        } else if ca {
            "He rebut la teva **captura de pantalla**. "
        } else {
            "He recibido tu **captura de pantalla**. "
        });
        match &screen_text {
            Some(text) if !text.is_empty() => out.push_str(&if en {
                format!("I read this text on it: «{text}»\n\n")
            } else if ca {
                format!("Hi he llegit aquest text: «{text}»\n\n")
            } else {
                format!("He leído este texto en ella: «{text}»\n\n")
            }),
            _ => out.push_str("\n\n"),
        }
    }
    if let Some(text) = &file_text {
        out.push_str(&if en {
            format!("I've read your **file**: «{text}»\n\n")
        } else if ca {
            format!("He llegit el teu **arxiu**: «{text}»\n\n")
        } else {
            format!("He leído tu **archivo**: «{text}»\n\n")
        });
    }
    out.push_str(if en {
        "With a real AI I could:\n1. Explain what's on your screen.\n2. Summarise or translate your files.\n3. Write and fix texts and code.\n\nConnect one in **Settings → Artificial intelligence**: Gemini and Groq have free keys, and Ollama runs on your computer for free."
    } else if ca {
        "Amb una IA de veritat podria:\n1. Explicar-te què hi ha a la pantalla.\n2. Resumir o traduir els teus arxius.\n3. Escriure i corregir textos i codi.\n\nConnecta'n una a **Configuració → Intel·ligència artificial**: Gemini i Groq tenen claus gratuïtes, i Ollama funciona al teu ordinador gratis."
    } else {
        "Con una IA de verdad podría:\n1. Explicarte qué hay en tu pantalla.\n2. Resumir o traducir tus archivos.\n3. Escribir y corregir textos y código.\n\nConecta una en **Ajustes → Inteligencia artificial**: Gemini y Groq tienen claves gratis, y Ollama funciona en tu ordenador gratis."
    });
    out
}

impl Provider for Demo {
    async fn stream_chat(
        &self,
        _http: &reqwest::Client,
        request: &ChatRequest,
        on_token: TokenSink<'_>,
    ) -> AppResult<()> {
        let text = answer(&self.language, request);
        // Palabra a palabra, como una IA de verdad.
        for piece in text.split_inclusive(' ') {
            if !on_token(piece) {
                break;
            }
            tokio::time::sleep(Duration::from_millis(22)).await;
        }
        Ok(())
    }

    async fn list_models(&self, _http: &reqwest::Client) -> AppResult<Vec<String>> {
        Ok(vec!["tico-demo".into()])
    }
}

#[cfg(test)]
mod tests {
    use std::sync::Arc;

    use super::*;
    use crate::ai::{ChatMessage, ImageData};

    #[test]
    fn shows_what_it_received() {
        let request = ChatRequest {
            model: "tico-demo".into(),
            system: String::new(),
            messages: vec![ChatMessage::user(
                "¿Qué ves?".into(),
                "[Text read from the screen with OCR]\nError 404: página no encontrada".into(),
                vec![Arc::new(ImageData { base64: String::new(), media_type: "image/jpeg" })],
            )],
            max_tokens: 10,
        };
        let text = answer("es", &request);
        assert!(text.contains("captura de pantalla"));
        assert!(text.contains("Error 404: página no encontrada"));
        assert!(answer("en", &request).contains("Demo mode"));
    }

    #[tokio::test]
    async fn streams_and_can_be_cancelled() {
        let request = ChatRequest {
            model: "tico-demo".into(),
            system: String::new(),
            messages: vec![ChatMessage::user("hola".into(), String::new(), Vec::new())],
            max_tokens: 10,
        };
        let mut pieces = 0;
        let mut sink = |_: &str| {
            pieces += 1;
            pieces < 3
        };
        Demo { language: "es".into() }
            .stream_chat(&reqwest::Client::new(), &request, &mut sink)
            .await
            .unwrap();
        assert_eq!(pieces, 3);
    }
}

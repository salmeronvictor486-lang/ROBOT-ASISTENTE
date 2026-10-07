//! Lectura de respuestas en streaming: líneas SSE (`data: ...`) o NDJSON.

use futures_util::StreamExt;

use crate::error::AppResult;

/// Junta trozos de bytes y devuelve líneas completas.
/// Guarda bytes (no texto) para no romper caracteres UTF-8 partidos entre trozos.
#[derive(Default)]
pub struct LineBuffer {
    pending: Vec<u8>,
}

impl LineBuffer {
    pub fn push(&mut self, chunk: &[u8]) -> Vec<String> {
        self.pending.extend_from_slice(chunk);
        let mut lines = Vec::new();
        while let Some(pos) = self.pending.iter().position(|&b| b == b'\n') {
            let raw: Vec<u8> = self.pending.drain(..=pos).collect();
            let line = String::from_utf8_lossy(&raw);
            lines.push(line.trim_end_matches(['\r', '\n']).to_string());
        }
        lines
    }

    /// Lo que quede sin salto de línea final.
    pub fn finish(&mut self) -> Option<String> {
        let rest = String::from_utf8_lossy(&std::mem::take(&mut self.pending)).trim().to_string();
        (!rest.is_empty()).then_some(rest)
    }
}

/// Qué hacer tras procesar una línea.
pub enum Flow {
    Continue,
    Stop,
}

/// Recorre la respuesta línea a línea hasta el final o hasta que `on_line` pida parar.
pub async fn for_each_line(
    response: reqwest::Response,
    mut on_line: impl FnMut(&str) -> AppResult<Flow> + Send,
) -> AppResult<()> {
    let mut buffer = LineBuffer::default();
    let mut body = response.bytes_stream();
    while let Some(chunk) = body.next().await {
        for line in buffer.push(&chunk?) {
            if let Flow::Stop = on_line(&line)? {
                return Ok(());
            }
        }
    }
    if let Some(line) = buffer.finish() {
        on_line(&line)?;
    }
    Ok(())
}

/// Contenido de una línea SSE `data: ...` (o `None` si es otro tipo de línea).
pub fn sse_data(line: &str) -> Option<&str> {
    line.strip_prefix("data:").map(str::trim)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn splits_lines_across_chunks() {
        let mut b = LineBuffer::default();
        assert!(b.push(b"data: hol").is_empty());
        assert_eq!(b.push(b"a\r\ndata: x\n\n"), vec!["data: hola", "data: x", ""]);
    }

    #[test]
    fn keeps_utf8_split_between_chunks() {
        let mut b = LineBuffer::default();
        let text = "¿qué tal?\n".as_bytes();
        assert!(b.push(&text[..2]).is_empty());
        assert_eq!(b.push(&text[2..]), vec!["¿qué tal?"]);
    }

    #[test]
    fn finish_returns_trailing_line() {
        let mut b = LineBuffer::default();
        b.push(b"{\"done\":true}");
        assert_eq!(b.finish().as_deref(), Some("{\"done\":true}"));
        assert_eq!(b.finish(), None);
    }

    #[test]
    fn sse_prefix() {
        assert_eq!(sse_data("data: {\"a\":1}"), Some("{\"a\":1}"));
        assert_eq!(sse_data("event: ping"), None);
    }
}

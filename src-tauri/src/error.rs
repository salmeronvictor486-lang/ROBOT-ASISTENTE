use serde::ser::SerializeStruct;
use serde::{Serialize, Serializer};

/// Error común de todos los comandos de Tauri.
///
/// Se envía al frontend como `{ kind, message }` para que la isla pueda elegir
/// el mensaje y la expresión de Tico según el tipo de fallo.
#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error(transparent)]
    Tauri(#[from] tauri::Error),
    #[error("No se pudo leer o guardar un archivo: {0}")]
    Io(#[from] std::io::Error),
    #[error("Archivo de ajustes inválido: {0}")]
    Json(#[from] serde_json::Error),
    #[error("Atajo de teclado no válido: {0}")]
    Shortcut(String),
}

impl AppError {
    /// Identificador estable que el frontend usa para traducir el error.
    pub fn kind(&self) -> &'static str {
        match self {
            AppError::Tauri(_) => "internal",
            AppError::Io(_) => "io",
            AppError::Json(_) => "io",
            AppError::Shortcut(_) => "shortcut",
        }
    }
}

impl Serialize for AppError {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        let mut s = serializer.serialize_struct("AppError", 2)?;
        s.serialize_field("kind", self.kind())?;
        s.serialize_field("message", &self.to_string())?;
        s.end()
    }
}

pub type AppResult<T> = Result<T, AppError>;

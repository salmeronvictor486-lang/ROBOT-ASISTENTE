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
    #[error("No hay conexión con el servicio de IA: {0}")]
    Network(#[from] reqwest::Error),
    #[error("Falta la clave de API de {0}")]
    MissingKey(&'static str),
    #[error("La clave de API de {0} no es válida")]
    InvalidKey(&'static str),
    #[error("Has llegado al límite de uso de {0}; espera un poco")]
    RateLimited(&'static str),
    #[error("El modelo no existe o no está disponible: {0}")]
    Model(String),
    #[error("Ollama no responde. ¿Está abierto?")]
    OllamaOffline,
    #[error("El modelo ha rechazado responder a esta petición")]
    Refused,
    #[error("{0}")]
    Provider(String),
    #[error("Llavero del sistema: {0}")]
    Keyring(#[from] keyring::Error),
    #[error("{0}")]
    Blocked(String),
    #[error("Falta el permiso de Grabación de pantalla")]
    #[cfg_attr(not(target_os = "macos"), allow(dead_code))]
    ScreenPermission,
    #[error("No se pudo capturar la pantalla: {0}")]
    Capture(String),
}

impl AppError {
    /// Identificador estable que el frontend usa para traducir el error.
    pub fn kind(&self) -> &'static str {
        match self {
            AppError::Tauri(_) => "internal",
            AppError::Io(_) => "io",
            AppError::Json(_) => "io",
            AppError::Shortcut(_) => "shortcut",
            AppError::Network(_) => "network",
            AppError::MissingKey(_) => "missingKey",
            AppError::InvalidKey(_) => "invalidKey",
            AppError::RateLimited(_) => "rateLimited",
            AppError::Model(_) => "model",
            AppError::OllamaOffline => "ollamaOffline",
            AppError::Refused => "refused",
            AppError::Provider(_) => "provider",
            AppError::Keyring(_) => "keyring",
            AppError::Blocked(_) => "blocked",
            AppError::ScreenPermission => "screenPermission",
            AppError::Capture(_) => "capture",
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

impl From<xcap::XCapError> for AppError {
    fn from(err: xcap::XCapError) -> Self {
        AppError::Capture(err.to_string())
    }
}

impl From<image::ImageError> for AppError {
    fn from(err: image::ImageError) -> Self {
        AppError::Capture(err.to_string())
    }
}

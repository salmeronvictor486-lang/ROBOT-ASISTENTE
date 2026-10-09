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
    #[error("Tu cuenta de {0} no tiene saldo o crédito")]
    NoCredit(&'static str),
    #[error("{0} está saturado ahora mismo")]
    Overloaded(&'static str),
    #[error("{0} ha tardado demasiado en responder")]
    Timeout(&'static str),
    #[error("El modelo no existe o no está disponible: {0}")]
    Model(String),
    #[error("Este modelo no puede ver imágenes: {0}")]
    NoVision(String),
    #[error("Lo que has enviado es demasiado grande para {0}")]
    TooLarge(&'static str),
    #[error("Ollama no responde. ¿Está abierto?")]
    OllamaOffline,
    #[error("{0} no responde. ¿Está abierto?")]
    ServerOffline(&'static str),
    #[error("Falta la dirección del servicio personalizado")]
    MissingUrl,
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
    #[error("No se pudo cambiar el inicio con el sistema: {0}")]
    Autostart(String),
    #[error("No he podido leer el archivo: {0}")]
    File(String),
    #[error("No he podido convertir el archivo: {0}")]
    Convert(String),
    #[error("No encuentro ningún documento abierto")]
    NoDocument,
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
            AppError::NoCredit(_) => "noCredit",
            AppError::Overloaded(_) => "overloaded",
            AppError::Timeout(_) => "timeout",
            AppError::Model(_) => "model",
            AppError::NoVision(_) => "noVision",
            AppError::TooLarge(_) => "tooLarge",
            AppError::OllamaOffline => "ollamaOffline",
            AppError::ServerOffline(_) => "serverOffline",
            AppError::MissingUrl => "missingUrl",
            AppError::Refused => "refused",
            AppError::Provider(_) => "provider",
            AppError::Keyring(_) => "keyring",
            AppError::Blocked(_) => "blocked",
            AppError::ScreenPermission => "screenPermission",
            AppError::Capture(_) => "capture",
            AppError::Autostart(_) => "autostart",
            AppError::File(_) => "file",
            AppError::Convert(_) => "convert",
            AppError::NoDocument => "noDocument",
        }
    }

    /// El dato concreto del error (proveedor, modelo, motivo…), para que el frontend
    /// lo meta en su frase traducida.
    pub fn detail(&self) -> String {
        match self {
            AppError::MissingKey(p)
            | AppError::InvalidKey(p)
            | AppError::RateLimited(p)
            | AppError::NoCredit(p)
            | AppError::Overloaded(p)
            | AppError::Timeout(p)
            | AppError::TooLarge(p)
            | AppError::ServerOffline(p) => (*p).to_string(),
            AppError::Shortcut(s)
            | AppError::Model(s)
            | AppError::NoVision(s)
            | AppError::Provider(s)
            | AppError::Blocked(s)
            | AppError::Capture(s)
            | AppError::Autostart(s)
            | AppError::File(s)
            | AppError::Convert(s) => s.clone(),
            AppError::Network(e) => e.to_string(),
            AppError::Io(e) => e.to_string(),
            AppError::Json(e) => e.to_string(),
            AppError::Keyring(e) => e.to_string(),
            AppError::Tauri(e) => e.to_string(),
            AppError::OllamaOffline
            | AppError::Refused
            | AppError::ScreenPermission
            | AppError::MissingUrl
            | AppError::NoDocument => String::new(),
        }
    }

    /// ¿Merece la pena reintentar en un momento? (saturación, límites breves, cortes de red)
    pub fn is_transient(&self) -> bool {
        match self {
            AppError::RateLimited(_) | AppError::Overloaded(_) | AppError::Timeout(_) => true,
            AppError::Network(e) => e.is_timeout() || e.is_connect() || e.is_request(),
            _ => false,
        }
    }
}

impl Serialize for AppError {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        let mut s = serializer.serialize_struct("AppError", 3)?;
        s.serialize_field("kind", self.kind())?;
        s.serialize_field("message", &self.to_string())?;
        s.serialize_field("detail", &self.detail())?;
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn serializes_kind_message_and_detail() {
        let json = serde_json::to_value(AppError::NoCredit("OpenAI")).unwrap();
        assert_eq!(json["kind"], "noCredit");
        assert_eq!(json["detail"], "OpenAI");
        assert_eq!(json["message"], "Tu cuenta de OpenAI no tiene saldo o crédito");
        let json = serde_json::to_value(AppError::File("es demasiado grande".into())).unwrap();
        assert_eq!(json["detail"], "es demasiado grande");
    }
}

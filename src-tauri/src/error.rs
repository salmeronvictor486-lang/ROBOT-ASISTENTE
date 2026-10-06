use serde::{Serialize, Serializer};

/// Error común de todos los comandos de Tauri.
///
/// Se serializa como texto para que el frontend lo reciba en el `catch` de `invoke`.
#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error(transparent)]
    Tauri(#[from] tauri::Error),
}

impl Serialize for AppError {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        serializer.serialize_str(&self.to_string())
    }
}

pub type AppResult<T> = Result<T, AppError>;

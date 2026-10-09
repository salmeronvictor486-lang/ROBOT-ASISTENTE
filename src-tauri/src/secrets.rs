//! Claves de API en el llavero del sistema (Credential Manager en Windows,
//! Llavero en macOS). Nunca se guardan en texto plano ni se envían al frontend.

use keyring::Entry;

use crate::error::{AppError, AppResult};
use crate::settings::ProviderKind;

const SERVICE: &str = "com.victorsalmeron.tico";

fn entry(provider: ProviderKind) -> AppResult<Entry> {
    Ok(Entry::new(SERVICE, provider.id())?)
}

pub fn set(provider: ProviderKind, key: &str) -> AppResult<()> {
    entry(provider)?.set_password(key.trim())?;
    Ok(())
}

pub fn get(provider: ProviderKind) -> AppResult<Option<String>> {
    match entry(provider)?.get_password() {
        Ok(key) => Ok(Some(key)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(err) => Err(err.into()),
    }
}

/// La clave del proveedor, o un error claro si el usuario aún no la ha puesto.
pub fn require(provider: ProviderKind) -> AppResult<String> {
    get(provider)?
        .filter(|k| !k.is_empty())
        .ok_or(AppError::MissingKey(provider.label()))
}

pub fn delete(provider: ProviderKind) -> AppResult<()> {
    match entry(provider)?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(err) => Err(err.into()),
    }
}

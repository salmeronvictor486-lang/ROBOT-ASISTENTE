//! Claves de API y la contraseña del correo en el llavero del sistema (Credential Manager
//! en Windows, Llavero en macOS). Nunca se guardan en texto plano ni se envían al frontend.

use keyring::Entry;

use crate::error::{AppError, AppResult};
use crate::settings::ProviderKind;

const SERVICE: &str = "com.victorsalmeron.tico";

fn entry(provider: ProviderKind) -> AppResult<Entry> {
    named(provider.id())
}

fn named(account: &str) -> AppResult<Entry> {
    Ok(Entry::new(SERVICE, account)?)
}

/// Guarda un secreto con nombre propio (p. ej. "mail").
pub fn set_named(account: &str, value: &str) -> AppResult<()> {
    named(account)?.set_password(value)?;
    Ok(())
}

pub fn get_named(account: &str) -> AppResult<Option<String>> {
    match named(account)?.get_password() {
        Ok(value) => Ok(Some(value)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(err) => Err(err.into()),
    }
}

pub fn delete_named(account: &str) -> AppResult<()> {
    match named(account)?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(err) => Err(err.into()),
    }
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

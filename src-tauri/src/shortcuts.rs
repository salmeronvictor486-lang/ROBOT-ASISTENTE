//! Atajos de teclado globales (funcionan aunque Tico no tenga el foco).

use tauri::AppHandle;
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};

use crate::error::{AppError, AppResult};
use crate::island::open_from_shortcut;
use crate::settings::Settings;

/// Registra (o vuelve a registrar) los atajos definidos en los ajustes.
pub fn register(app: &AppHandle, settings: &Settings) -> AppResult<()> {
    let shortcuts = app.global_shortcut();
    shortcuts
        .unregister_all()
        .map_err(|e| AppError::Shortcut(e.to_string()))?;

    let bindings: [(&str, &'static str); 1] = [(settings.shortcut_open.as_str(), "open")];
    for (accelerator, action) in bindings {
        shortcuts
            .on_shortcut(accelerator, move |app, _shortcut, event| {
                if event.state == ShortcutState::Pressed {
                    open_from_shortcut(app, action);
                }
            })
            .map_err(|e| AppError::Shortcut(format!("{accelerator}: {e}")))?;
    }
    Ok(())
}

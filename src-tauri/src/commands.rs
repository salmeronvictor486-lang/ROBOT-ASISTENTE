//! Comandos generales: ajustes y ventanas auxiliares.

use tauri::{AppHandle, Emitter, Manager, State};

use crate::error::AppResult;
use crate::island::{self, lock};
use crate::settings::Settings;
use crate::shortcuts;
use crate::state::AppState;

#[tauri::command]
pub fn settings_get(state: State<'_, AppState>) -> Settings {
    lock(&state.settings).clone()
}

/// Guarda los ajustes, aplica lo que cambie y avisa a todas las ventanas.
#[tauri::command]
pub fn settings_update(app: AppHandle, settings: Settings) -> AppResult<Settings> {
    let state = app.state::<AppState>();
    let new = settings.sanitized();
    let old = lock(&state.settings).clone();

    if new.shortcut_open != old.shortcut_open || new.shortcut_capture != old.shortcut_capture {
        if let Err(err) = shortcuts::register(&app, &new) {
            // Si el atajo nuevo no vale, volvemos a dejar los anteriores activos.
            let _ = shortcuts::register(&app, &old);
            return Err(err);
        }
    }

    new.save(&state.settings_path)?;
    *lock(&state.settings) = new.clone();

    if new.island_size != old.island_size
        || new.island_position != old.island_position
        || new.activation_width != old.activation_width
    {
        lock(&state.island).layout = None;
        island::place_for_cursor(&app)?;
    }

    app.emit("settings://changed", &new)?;
    Ok(new)
}

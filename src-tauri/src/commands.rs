//! Comandos generales: ajustes, ventanas auxiliares e idioma.

use tauri::{AppHandle, Emitter, Manager, State, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_autostart::ManagerExt;

use crate::error::{AppError, AppResult};
use crate::island::{self, lock};
use crate::settings::Settings;
use crate::shortcuts;
use crate::state::AppState;
use crate::tray;

#[tauri::command]
pub fn settings_get(state: State<'_, AppState>) -> Settings {
    lock(&state.settings).clone()
}

fn apply_autostart(app: &AppHandle, enabled: bool) -> AppResult<()> {
    let autolaunch = app.autolaunch();
    let result = if enabled { autolaunch.enable() } else { autolaunch.disable() };
    result.map_err(|e| AppError::Autostart(e.to_string()))
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
    if new.autostart != old.autostart {
        apply_autostart(&app, new.autostart)?;
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

/// Abre (o trae al frente) la ventana de ajustes o la página de pruebas de Tico.
/// `kind` puede ser "playground", "settings" o una sección de ajustes ("ticos").
pub fn open_window(app: &AppHandle, kind: &str) -> AppResult<()> {
    // Sección a la que saltar al abrir los ajustes (solo letras: va dentro de un script).
    let section = match kind {
        "playground" | "settings" => None,
        other if other.chars().all(|c| c.is_ascii_alphabetic()) => Some(other),
        _ => None,
    };
    let (label, page, title, size) = match kind {
        "playground" => ("playground", "playground.html", "Tico · pruebas", (760.0, 820.0)),
        _ => ("settings", "settings.html", "Tico", (920.0, 680.0)),
    };
    if let Some(window) = app.get_webview_window(label) {
        window.unminimize()?;
        window.show()?;
        window.set_focus()?;
        if let Some(section) = section {
            app.emit_to(label, "settings://section", section)?;
        }
        return Ok(());
    }
    let script = section.map_or(String::new(), |s| format!("window.__TICO_SECTION__ = \"{s}\";"));
    let window = WebviewWindowBuilder::new(app, label, WebviewUrl::App(page.into()))
        .initialization_script(&script)
        .title(title)
        .inner_size(size.0, size.1)
        .min_inner_size(560.0, 460.0)
        .center()
        .build()?;
    window.set_focus()?;
    Ok(())
}

#[tauri::command]
pub fn open_settings(app: AppHandle, page: Option<String>) -> AppResult<()> {
    open_window(&app, page.as_deref().unwrap_or("settings"))
}

/// El frontend sabe resolver "auto" con el idioma del sistema; nos lo dice para el menú.
#[tauri::command]
pub fn set_ui_language(app: AppHandle, lang: String) -> AppResult<()> {
    tray::set_language(&app, &lang)?;
    Ok(())
}

/// Abre una web en el navegador (para "Conseguir una clave"). Solo direcciones https.
#[tauri::command]
pub fn open_url(url: String) -> AppResult<()> {
    let ok = url.starts_with("https://") && !url.chars().any(|c| c.is_whitespace() || c == '"');
    if !ok {
        return Err(AppError::File("dirección no válida".into()));
    }
    #[cfg(target_os = "windows")]
    std::process::Command::new("explorer").arg(&url).spawn()?;
    #[cfg(target_os = "macos")]
    std::process::Command::new("open").arg(&url).spawn()?;
    #[cfg(not(any(target_os = "windows", target_os = "macos")))]
    std::process::Command::new("xdg-open").arg(&url).spawn()?;
    Ok(())
}

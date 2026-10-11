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
/// Es `async` a propósito: puede crear una ventana (Tico en el escritorio), y en Windows
/// crear ventanas desde un comando síncrono bloquea la app.
#[tauri::command]
pub async fn settings_update(app: AppHandle, settings: Settings) -> AppResult<Settings> {
    apply_settings(&app, settings)
}

/// Lo que hace `settings_update` (también lo usan la bandeja y Tico en el escritorio).
pub fn apply_settings(app: &AppHandle, settings: Settings) -> AppResult<Settings> {
    let app = app.clone();
    let state = app.state::<AppState>();
    let mut new = settings.sanitized();
    let old = lock(&state.settings).clone();
    // La posición de Tico en el escritorio solo la cambia Rust (al arrastrarlo): una ventana
    // con ajustes viejos no debe pisarla.
    new.pet_position = old.pet_position;

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

    state.save_settings(&new)?;
    // Si se ha borrado un Tico o un espacio, sus conversaciones se van con él.
    if new.ticos != old.ticos || new.workspaces != old.workspaces {
        if let Err(err) = state.db.prune(&new) {
            eprintln!("No se pudieron limpiar las conversaciones: {err}");
        }
    }
    *lock(&state.settings) = new.clone();

    if new.island_size != old.island_size
        || new.island_position != old.island_position
        || new.activation_width != old.activation_width
    {
        lock(&state.island).layout = None;
        island::place_for_cursor(&app)?;
    }

    if new.desktop_tico != old.desktop_tico {
        crate::pet::sync(&app, new.desktop_tico)?;
        tray::refresh(&app)?;
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

/// `async` por lo mismo que `settings_update`: crea una ventana.
#[tauri::command]
pub async fn open_settings(app: AppHandle, page: Option<String>) -> AppResult<()> {
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

/// Dónde está la base de datos y cuánto guarda.
#[tauri::command]
pub fn db_info(state: State<'_, AppState>) -> AppResult<crate::db::DbInfo> {
    state.db.info()
}

/// Copia de seguridad de la base de datos en Descargas. Devuelve la ruta de la copia.
#[tauri::command]
pub async fn db_backup(app: AppHandle) -> AppResult<String> {
    let dir = app.path().download_dir().or_else(|_| app.path().home_dir())?;
    let stamp = chrono_stamp();
    let target = (1..100)
        .map(|n| if n == 1 { dir.join(format!("Tico {stamp}.db")) } else { dir.join(format!("Tico {stamp} ({n}).db")) })
        .find(|p| !p.exists())
        .ok_or_else(|| AppError::Database("no hay nombre libre para la copia".into()))?;
    let state = app.state::<AppState>();
    state.db.backup_to(&target)?;
    Ok(target.to_string_lossy().into_owned())
}

/// Fecha para el nombre de la copia ("2026-10-11"), sin crates de fechas.
fn chrono_stamp() -> String {
    let days = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_or(0, |d| d.as_secs() / 86_400);
    let (y, m, d) = civil_from_days(i64::try_from(days).unwrap_or(0));
    format!("{y:04}-{m:02}-{d:02}")
}

/// Días desde 1970-01-01 → (año, mes, día). Algoritmo de Howard Hinnant.
fn civil_from_days(days: i64) -> (i64, u32, u32) {
    let z = days + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z.rem_euclid(146_097);
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = u32::try_from(doy - (153 * mp + 2) / 5 + 1).unwrap_or(1);
    let m = u32::try_from(if mp < 10 { mp + 3 } else { mp - 9 }).unwrap_or(1);
    (yoe + era * 400 + i64::from(m <= 2), m, d)
}

#[cfg(test)]
mod tests {
    use super::civil_from_days;

    #[test]
    fn dates_from_days() {
        assert_eq!(civil_from_days(0), (1970, 1, 1));
        assert_eq!(civil_from_days(20_372), (2025, 10, 11));
        assert_eq!(civil_from_days(19_782), (2024, 2, 29));
    }
}

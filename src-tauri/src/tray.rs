//! Icono en la bandeja del sistema (Windows) o en la barra de menús (macOS).
//! Como la isla no sale en la barra de tareas, es la forma de abrir, configurar y cerrar Tico.

use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::TrayIconBuilder;
use tauri::{AppHandle, Wry};

use crate::commands::open_window;
use crate::island::open_from_shortcut;

const TRAY_ID: &str = "tico";

/// Textos del menú en castellano, catalán o inglés.
fn labels(lang: &str) -> [&'static str; 4] {
    match lang {
        "ca" => ["Obre el Tico", "Configuració…", "Pàgina de proves del Tico", "Surt"],
        "en" => ["Open Tico", "Settings…", "Tico test page", "Quit"],
        _ => ["Abrir Tico", "Ajustes…", "Página de pruebas de Tico", "Salir"],
    }
}

fn build_menu(app: &AppHandle, lang: &str) -> tauri::Result<Menu<Wry>> {
    let [open, settings, playground, quit] = labels(lang);
    let open = MenuItem::with_id(app, "open", open, true, None::<&str>)?;
    let settings = MenuItem::with_id(app, "settings", settings, true, None::<&str>)?;
    let playground = MenuItem::with_id(app, "playground", playground, true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", quit, true, None::<&str>)?;
    let sep1 = PredefinedMenuItem::separator(app)?;
    let sep2 = PredefinedMenuItem::separator(app)?;
    Menu::with_items(app, &[&open, &sep1, &settings, &playground, &sep2, &quit])
}

pub fn create(app: &AppHandle, lang: &str) -> tauri::Result<()> {
    let mut builder = TrayIconBuilder::with_id(TRAY_ID)
        .tooltip("Tico")
        .menu(&build_menu(app, lang)?)
        .on_menu_event(|app, event| {
            let result = match event.id().as_ref() {
                "open" => {
                    open_from_shortcut(app, "open");
                    Ok(())
                }
                "settings" => open_window(app, "settings"),
                "playground" => open_window(app, "playground"),
                "quit" => {
                    app.exit(0);
                    Ok(())
                }
                _ => Ok(()),
            };
            if let Err(err) = result {
                eprintln!("Error del menú de la bandeja: {err}");
            }
        });
    if let Some(icon) = app.default_window_icon() {
        builder = builder.icon(icon.clone());
    }
    builder.build(app)?;
    Ok(())
}

/// Cambia el idioma del menú.
pub fn set_language(app: &AppHandle, lang: &str) -> tauri::Result<()> {
    if let Some(tray) = app.tray_by_id(TRAY_ID) {
        tray.set_menu(Some(build_menu(app, lang)?))?;
    }
    Ok(())
}

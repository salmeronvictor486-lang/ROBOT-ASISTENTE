//! Icono en la bandeja del sistema (Windows) o en la barra de menús (macOS).
//! Como la isla no sale en la barra de tareas, es la forma de abrir, configurar y cerrar Tico.

use std::sync::Mutex;

use tauri::menu::{CheckMenuItem, Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::TrayIconBuilder;
use tauri::{AppHandle, Manager, Wry};

use crate::commands::{apply_settings, open_window};
use crate::island::{lock, open_from_shortcut};
use crate::state::AppState;

const TRAY_ID: &str = "tico";

/// Último idioma del menú (para rehacerlo cuando cambia algo).
static LANG: Mutex<String> = Mutex::new(String::new());

/// Textos del menú en castellano, catalán o inglés.
fn labels(lang: &str) -> [&'static str; 5] {
    match lang {
        "ca" => ["Obre el Tico", "Tico a l'escriptori", "Configuració…", "Pàgina de proves del Tico", "Surt"],
        "en" => ["Open Tico", "Tico on the desktop", "Settings…", "Tico test page", "Quit"],
        _ => ["Abrir Tico", "Tico en el escritorio", "Ajustes…", "Página de pruebas de Tico", "Salir"],
    }
}

fn build_menu(app: &AppHandle, lang: &str) -> tauri::Result<Menu<Wry>> {
    let [open, pet, settings, playground, quit] = labels(lang);
    let pet_on = lock(&app.state::<AppState>().settings).desktop_tico;
    let open = MenuItem::with_id(app, "open", open, true, None::<&str>)?;
    let pet = CheckMenuItem::with_id(app, "pet", pet, true, pet_on, None::<&str>)?;
    let settings = MenuItem::with_id(app, "settings", settings, true, None::<&str>)?;
    let playground = MenuItem::with_id(app, "playground", playground, true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", quit, true, None::<&str>)?;
    let sep1 = PredefinedMenuItem::separator(app)?;
    let sep2 = PredefinedMenuItem::separator(app)?;
    Menu::with_items(app, &[&open, &pet, &sep1, &settings, &playground, &sep2, &quit])
}

/// Cambia "Tico en el escritorio" desde el menú.
fn toggle_pet(app: &AppHandle) -> crate::error::AppResult<()> {
    let mut settings = lock(&app.state::<AppState>().settings).clone();
    settings.desktop_tico = !settings.desktop_tico;
    apply_settings(app, settings)?;
    Ok(())
}

pub fn create(app: &AppHandle, lang: &str) -> tauri::Result<()> {
    *lock(&LANG) = lang.to_string();
    let mut builder = TrayIconBuilder::with_id(TRAY_ID)
        .tooltip("Tico")
        .menu(&build_menu(app, lang)?)
        .on_menu_event(|app, event| {
            // Algunas opciones crean ventanas; en Windows eso no puede hacerse dentro de este
            // manejador (se bloquearía), así que lo hacemos en otro hilo.
            let app = app.clone();
            let id = event.id().as_ref().to_string();
            std::thread::spawn(move || handle_menu(&app, &id));
        });
    if let Some(icon) = app.default_window_icon() {
        builder = builder.icon(icon.clone());
    }
    builder.build(app)?;
    Ok(())
}

fn handle_menu(app: &AppHandle, id: &str) {
    let result = match id {
        "open" => {
            open_from_shortcut(app, "open");
            Ok(())
        }
        "pet" => toggle_pet(app),
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
}

/// Cambia el idioma del menú.
pub fn set_language(app: &AppHandle, lang: &str) -> tauri::Result<()> {
    *lock(&LANG) = lang.to_string();
    refresh(app)
}

/// Rehace el menú (idioma o casilla de "Tico en el escritorio").
pub fn refresh(app: &AppHandle) -> tauri::Result<()> {
    let lang = lock(&LANG).clone();
    if let Some(tray) = app.tray_by_id(TRAY_ID) {
        tray.set_menu(Some(build_menu(app, &lang)?))?;
    }
    Ok(())
}

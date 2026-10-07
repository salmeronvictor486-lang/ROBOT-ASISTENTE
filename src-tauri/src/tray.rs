//! Icono en la bandeja del sistema (Windows) o en la barra de menús (macOS).
//! Como la isla no sale en la barra de tareas, es la forma de abrir y cerrar Tico.

use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::TrayIconBuilder;
use tauri::AppHandle;

use crate::island::open_from_shortcut;

pub fn create(app: &AppHandle) -> tauri::Result<()> {
    let open = MenuItem::with_id(app, "open", "Abrir Tico", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Salir", true, None::<&str>)?;
    let separator = PredefinedMenuItem::separator(app)?;
    let menu = Menu::with_items(app, &[&open, &separator, &quit])?;

    let mut builder = TrayIconBuilder::with_id("tico")
        .tooltip("Tico")
        .menu(&menu)
        .on_menu_event(|app, event| match event.id().as_ref() {
            "open" => open_from_shortcut(app, "open"),
            "quit" => app.exit(0),
            _ => {}
        });
    if let Some(icon) = app.default_window_icon() {
        builder = builder.icon(icon.clone());
    }
    builder.build(app)?;
    Ok(())
}

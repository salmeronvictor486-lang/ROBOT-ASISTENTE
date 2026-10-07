//! macOS: la isla es un NSPanel que flota sobre la barra de menús sin robar el foco.

use tauri::{AppHandle, WebviewWindow};
use tauri_nspanel::objc2::MainThreadMarker;
use tauri_nspanel::objc2_app_kit::{NSScreen, NSWindowStyleMask};
use tauri_nspanel::{CollectionBehavior, ManagerExt, PanelLevel, WebviewWindowExt};

use crate::island::ISLAND_LABEL;
use panel::IslandPanel;

/// El macro importa sus propios nombres (p. ej. `MainThreadMarker`): lo aislamos en un módulo.
mod panel {
    tauri_nspanel::tauri_panel! {
        panel!(IslandPanel {
            config: {
                can_become_key_window: true,
                is_floating_panel: true
            }
        })
    }
}

/// Convierte la ventana de la isla en un panel no activable por encima de la barra de menús.
pub fn setup_island_panel(window: &WebviewWindow) -> tauri::Result<()> {
    let panel = window.to_panel::<IslandPanel>()?;
    panel.set_level(PanelLevel::Status.value());
    if let Err(err) = panel.add_style_mask(NSWindowStyleMask::NonactivatingPanel) {
        eprintln!("No se pudo marcar el panel como no activable: {err}");
    }
    panel.set_collection_behavior(
        CollectionBehavior::new()
            .can_join_all_spaces()
            .stationary()
            .full_screen_auxiliary()
            .ignores_cycle()
            .value(),
    );
    panel.set_hides_on_deactivate(false);
    Ok(())
}

/// Hace que el panel reciba el teclado sin activar toda la app.
pub fn focus_island(app: &AppHandle) {
    if let Ok(panel) = app.get_webview_panel(ISLAND_LABEL) {
        panel.show_and_make_key();
    }
}

/// Ancho del notch de la pantalla principal (px lógicos), si tiene.
#[allow(unused_unsafe)]
pub fn notch_width() -> Option<f64> {
    let mtm = MainThreadMarker::new()?;
    let screen = NSScreen::mainScreen(mtm)?;
    let insets = unsafe { screen.safeAreaInsets() };
    if insets.top <= 0.0 {
        return None;
    }
    let frame = screen.frame();
    let left = unsafe { screen.auxiliaryTopLeftArea() };
    let right = unsafe { screen.auxiliaryTopRightArea() };
    let width = frame.size.width - left.size.width - right.size.width;
    (width > 0.0).then_some(width)
}

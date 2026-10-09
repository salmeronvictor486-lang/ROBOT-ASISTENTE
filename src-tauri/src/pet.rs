//! Tico en el escritorio: un Tico suelto que flota sobre todas las ventanas. Se arrastra a
//! donde quieras (y se acuerda), te sigue con la mirada y al pulsarlo abre la isla.

use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;

use tauri::{AppHandle, Manager, PhysicalPosition, WebviewUrl, WebviewWindowBuilder, WindowEvent};

use crate::error::AppResult;
use crate::island::{self, lock};
use crate::state::AppState;

pub const PET_LABEL: &str = "pet";
/// Tamaño de la ventana (px lógicos): Tico más espacio para el bocadillo.
pub const PET_SIZE: (f64, f64) = (180.0, 214.0);

/// Ya hay un guardado de la posición en camino (se guarda una vez al soltar, no a cada píxel).
static SAVE_SCHEDULED: AtomicBool = AtomicBool::new(false);

/// Abajo a la derecha del monitor principal.
fn default_position(app: &AppHandle) -> (f64, f64) {
    app.primary_monitor()
        .ok()
        .flatten()
        .map(|m| {
            let scale = m.scale_factor();
            let pos = m.position().to_logical::<f64>(scale);
            let size = m.size().to_logical::<f64>(scale);
            (pos.x + size.width - PET_SIZE.0 - 24.0, pos.y + size.height - PET_SIZE.1 - 70.0)
        })
        .unwrap_or((200.0, 200.0))
}

/// ¿Cae este punto (lógico) dentro de algún monitor? (Por si se desconectó la pantalla.)
fn on_screen(app: &AppHandle, (x, y): (f64, f64)) -> bool {
    app.available_monitors().unwrap_or_default().iter().any(|m| {
        let scale = m.scale_factor();
        let pos = m.position().to_logical::<f64>(scale);
        let size = m.size().to_logical::<f64>(scale);
        x + PET_SIZE.0 / 2.0 >= pos.x
            && x + PET_SIZE.0 / 2.0 <= pos.x + size.width
            && y + PET_SIZE.1 / 2.0 >= pos.y
            && y + PET_SIZE.1 / 2.0 <= pos.y + size.height
    })
}

/// Guarda dónde lo ha dejado el usuario (un poco después de soltarlo).
fn remember(app: &AppHandle, position: PhysicalPosition<i32>) {
    let scale = app
        .get_webview_window(PET_LABEL)
        .and_then(|w| w.scale_factor().ok())
        .unwrap_or(1.0);
    let state = app.state::<AppState>();
    lock(&state.settings).pet_position = Some([f64::from(position.x) / scale, f64::from(position.y) / scale]);
    if SAVE_SCHEDULED.swap(true, Ordering::SeqCst) {
        return;
    }
    let app = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(Duration::from_millis(700));
        SAVE_SCHEDULED.store(false, Ordering::SeqCst);
        let state = app.state::<AppState>();
        let settings = lock(&state.settings).clone();
        if let Err(err) = settings.save(&state.settings_path) {
            eprintln!("No se pudo guardar dónde está Tico: {err}");
        }
    });
}

fn create(app: &AppHandle) -> AppResult<()> {
    let saved = lock(&app.state::<AppState>().settings).pet_position;
    let (x, y) = saved
        .map(|[x, y]| (x, y))
        .filter(|p| on_screen(app, *p))
        .unwrap_or_else(|| default_position(app));
    let window = WebviewWindowBuilder::new(app, PET_LABEL, WebviewUrl::App("pet.html".into()))
        .title("Tico")
        .inner_size(PET_SIZE.0, PET_SIZE.1)
        .position(x, y)
        .transparent(true)
        .decorations(false)
        .always_on_top(true)
        .skip_taskbar(true)
        .resizable(false)
        .maximizable(false)
        .minimizable(false)
        .shadow(false)
        .focused(false)
        .visible_on_all_workspaces(true)
        .build()?;
    let handle = app.clone();
    window.on_window_event(move |event| {
        if let WindowEvent::Moved(position) = event {
            remember(&handle, *position);
        }
    });
    Ok(())
}

/// Enseña o quita a Tico del escritorio según el ajuste.
pub fn sync(app: &AppHandle, show: bool) -> AppResult<()> {
    match (show, app.get_webview_window(PET_LABEL)) {
        (true, None) => create(app),
        (false, Some(window)) => Ok(window.destroy()?),
        _ => Ok(()),
    }
}

/// Al pulsar a Tico en el escritorio se abre la isla.
#[tauri::command]
pub fn pet_open_island(app: AppHandle) {
    island::open_from_shortcut(&app, "open");
}

/// Esconder a Tico del escritorio (desde su menú).
#[tauri::command]
pub fn pet_hide(app: AppHandle) -> AppResult<()> {
    let mut settings = lock(&app.state::<AppState>().settings).clone();
    settings.desktop_tico = false;
    crate::commands::apply_settings(&app, settings)?;
    Ok(())
}

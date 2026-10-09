//! La isla: ventana transparente arriba de la pantalla, detección de hover y click-through.
//!
//! Rust hace de "sensor": mira el cursor ~60 veces por segundo y avisa al frontend
//! con eventos. La máquina de estados (hidden/peek/compact/expanded) vive en React.

use std::thread;
use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, LogicalSize, Manager, Monitor, PhysicalPosition, State};

use crate::error::AppResult;
use crate::settings::{IslandPosition, IslandSize, Settings};
use crate::state::AppState;

pub const ISLAND_LABEL: &str = "island";

/// Panel expandido a escala M (px lógicos). Debe coincidir con `src/island/sizes.ts`.
const EXPANDED_W: f64 = 600.0;
const EXPANDED_H: f64 = 340.0;
/// Margen lateral de la ventana para que quepa la sombra de la cápsula.
pub const SIDE_MARGIN: f64 = 40.0;
/// Hueco inferior para la sombra.
const BOTTOM_MARGIN: f64 = 56.0;
/// Espacio extra arriba para que, con notch, el contenido quepa debajo de él.
const NOTCH_ALLOWANCE: f64 = 44.0;
/// Alto (px lógicos) de la franja del borde superior que despierta la isla.
const EDGE_HEIGHT: f64 = 3.0;
const TICK: Duration = Duration::from_millis(16);

/// Rectángulo en px lógicos relativo a la esquina superior izquierda de la ventana.
#[derive(Clone, Copy, Debug, PartialEq, Deserialize, Serialize)]
pub struct Rect {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

impl Rect {
    pub fn contains(&self, x: f64, y: f64) -> bool {
        x >= self.x && x < self.x + self.width && y >= self.y && y < self.y + self.height
    }
}

/// Geometría de un monitor en px físicos.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct MonitorGeom {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
    pub scale: f64,
}

impl From<&Monitor> for MonitorGeom {
    fn from(m: &Monitor) -> Self {
        Self {
            x: f64::from(m.position().x),
            y: f64::from(m.position().y),
            width: f64::from(m.size().width),
            height: f64::from(m.size().height),
            scale: m.scale_factor(),
        }
    }
}

/// Tamaño del notch en px lógicos.
#[derive(Clone, Copy, Debug, PartialEq, Serialize)]
pub struct Notch {
    pub width: f64,
    pub height: f64,
}

/// Una pantalla con notch: su tamaño lógico sirve para reconocerla entre los monitores.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct NotchScreen {
    pub screen_width: f64,
    pub screen_height: f64,
    pub notch: Notch,
}

/// Busca el notch del monitor comparando su tamaño lógico con las pantallas con notch.
pub fn notch_for(monitor: MonitorGeom, screens: &[NotchScreen]) -> Option<Notch> {
    let (w, h) = (monitor.width / monitor.scale, monitor.height / monitor.scale);
    screens
        .iter()
        .find(|s| (s.screen_width - w).abs() < 2.0 && (s.screen_height - h).abs() < 2.0)
        .map(|s| s.notch)
}

/// Dónde va la ventana y qué zona del borde la despierta (todo en px físicos).
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Layout {
    pub window_x: f64,
    pub window_y: f64,
    pub window_size: (f64, f64),
    pub zone: Rect,
    /// Con notch, pasar el ratón por el propio notch también despierta la isla.
    pub notch_zone: Option<Rect>,
    pub notch: Option<Notch>,
    pub scale: f64,
}

impl Layout {
    pub fn wakes(&self, x: f64, y: f64) -> bool {
        self.zone.contains(x, y) || self.notch_zone.is_some_and(|z| z.contains(x, y))
    }
}

/// Tamaño lógico de la ventana: el panel expandido más los márgenes de la sombra.
pub fn window_size(size: IslandSize) -> (f64, f64) {
    let s = size.scale();
    (
        EXPANDED_W * s + SIDE_MARGIN * 2.0,
        EXPANDED_H * s + BOTTOM_MARGIN + NOTCH_ALLOWANCE,
    )
}

pub fn compute_layout(
    monitor: MonitorGeom,
    size: IslandSize,
    position: IslandPosition,
    activation_width: f64,
    notch: Option<Notch>,
) -> Layout {
    let (w, h) = window_size(size);
    // El notch está siempre en el centro: con notch, la isla nace de él.
    let position = if notch.is_some() { IslandPosition::Center } else { position };
    let win_w = w * monitor.scale;
    let zone_w = (activation_width * monitor.scale).min(monitor.width);
    let (window_x, zone_x) = match position {
        IslandPosition::Center => (
            monitor.x + (monitor.width - win_w) / 2.0,
            monitor.x + (monitor.width - zone_w) / 2.0,
        ),
        IslandPosition::Left => (monitor.x, monitor.x),
        IslandPosition::Right => (
            monitor.x + monitor.width - win_w,
            monitor.x + monitor.width - zone_w,
        ),
    };
    Layout {
        window_x: window_x.round(),
        window_y: monitor.y,
        window_size: (w, h),
        zone: Rect {
            x: zone_x,
            y: monitor.y,
            width: zone_w,
            height: EDGE_HEIGHT * monitor.scale,
        },
        notch_zone: notch.map(|n| Rect {
            x: monitor.x + (monitor.width - n.width * monitor.scale) / 2.0,
            y: monitor.y,
            width: n.width * monitor.scale,
            height: n.height * monitor.scale,
        }),
        notch,
        scale: monitor.scale,
    }
}

/// Avisa una sola vez cuando el cursor lleva `dwell` dentro de la zona.
#[derive(Debug, Default)]
pub struct HoverDetector {
    entered_at: Option<Instant>,
    fired: bool,
}

impl HoverDetector {
    pub fn update(&mut self, inside: bool, now: Instant, dwell: Duration) -> bool {
        if !inside {
            self.reset();
            return false;
        }
        let start = *self.entered_at.get_or_insert(now);
        if !self.fired && now.duration_since(start) >= dwell {
            self.fired = true;
            return true;
        }
        false
    }

    pub fn reset(&mut self) {
        self.entered_at = None;
        self.fired = false;
    }
}

/// Estado de la isla compartido entre el hilo sensor, los comandos y el frontend.
#[derive(Debug, Default)]
pub struct IslandShared {
    /// Rectángulo de la cápsula (px lógicos, relativo a la ventana). `None` = oculta.
    pub rect: Option<Rect>,
    /// Origen actual de la ventana en px físicos y su escala.
    pub window_origin: (f64, f64),
    pub scale: f64,
    /// Última disposición aplicada, para no mover la ventana si no hace falta.
    pub layout: Option<Layout>,
}

#[derive(Clone, Serialize)]
struct PointerPayload {
    inside: bool,
}

#[derive(Clone, Serialize)]
struct CursorPayload {
    x: f64,
    y: f64,
}

#[derive(Clone, Serialize)]
pub struct ShortcutPayload {
    pub action: &'static str,
}

/// Mueve y redimensiona la ventana de la isla si la disposición ha cambiado.
pub fn apply_layout(app: &AppHandle, layout: Layout) -> AppResult<()> {
    let state = app.state::<AppState>();
    {
        let island = lock(&state.island);
        if island.layout == Some(layout) {
            return Ok(());
        }
    }
    if let Some(window) = app.get_webview_window(ISLAND_LABEL) {
        let (w, h) = layout.window_size;
        window.set_size(LogicalSize::new(w, h))?;
        window.set_position(PhysicalPosition::new(layout.window_x, layout.window_y))?;
    }
    let notch_changed = lock(&state.island).layout.map(|l| l.notch) != Some(layout.notch);
    if notch_changed {
        let _ = app.emit_to(ISLAND_LABEL, "island://notch", layout.notch);
    }
    let mut island = lock(&state.island);
    island.layout = Some(layout);
    island.window_origin = (layout.window_x, layout.window_y);
    island.scale = layout.scale;
    Ok(())
}

/// Calcula la disposición para el monitor donde debe aparecer la isla.
pub fn layout_for_point(app: &AppHandle, settings: &Settings, x: f64, y: f64) -> Option<Layout> {
    let monitor = if settings.follow_cursor_monitor {
        app.monitor_from_point(x, y).ok().flatten()
    } else {
        None
    }
    .or_else(|| app.primary_monitor().ok().flatten())?;
    let geom = MonitorGeom::from(&monitor);
    let notch = notch_for(geom, &app.state::<AppState>().notch_screens);
    Some(compute_layout(
        geom,
        settings.island_size,
        settings.island_position,
        f64::from(settings.activation_width),
        notch,
    ))
}

/// Recoloca la isla en el monitor del cursor (o el principal).
pub fn place_for_cursor(app: &AppHandle) -> AppResult<()> {
    let settings = lock(&app.state::<AppState>().settings).clone();
    let cursor = app.cursor_position()?;
    if let Some(layout) = layout_for_point(app, &settings, cursor.x, cursor.y) {
        apply_layout(app, layout)?;
    }
    Ok(())
}

/// Abre la isla desde un atajo global: la coloca, avisa al frontend y le da el foco.
pub fn open_from_shortcut(app: &AppHandle, action: &'static str) {
    let hidden = lock(&app.state::<AppState>().island).rect.is_none();
    if hidden {
        if let Err(err) = place_for_cursor(app) {
            eprintln!("No se pudo colocar la isla: {err}");
        }
    }
    let _ = app.emit_to(ISLAND_LABEL, "island://shortcut", ShortcutPayload { action });
    focus_island(app);
}

pub fn focus_island(app: &AppHandle) {
    #[cfg(target_os = "macos")]
    crate::platform::macos::focus_island(app);
    #[cfg(not(target_os = "macos"))]
    if let Some(window) = app.get_webview_window(ISLAND_LABEL) {
        let _ = window.set_focus();
    }
}

/// Bloquea un Mutex sin `unwrap`: si otro hilo entró en pánico, recupera el dato igualmente.
pub fn lock<T>(mutex: &std::sync::Mutex<T>) -> std::sync::MutexGuard<'_, T> {
    mutex.lock().unwrap_or_else(|poisoned| poisoned.into_inner())
}

/// ¿Hay una app a pantalla completa (juego, vídeo) en primer plano?
fn fullscreen_app_active() -> bool {
    let own_pid = std::process::id();
    let Ok(windows) = xcap::Window::all() else {
        return false;
    };
    windows.iter().any(|w| {
        let focused = w.is_focused().unwrap_or(false);
        let foreign = w.pid().map(|p| p != own_pid).unwrap_or(false);
        // El escritorio de Windows ("Program Manager") también ocupa toda la pantalla.
        let titled = w.title().map(|t| !t.is_empty() && t != "Program Manager").unwrap_or(false);
        if !(focused && foreign && titled) {
            return false;
        }
        let (Ok(mon), Ok(ww), Ok(wh)) = (w.current_monitor(), w.width(), w.height()) else {
            return false;
        };
        let (Ok(mw), Ok(mh)) = (mon.width(), mon.height()) else {
            return false;
        };
        ww >= mw && wh >= mh
    })
}

/// Arranca el hilo sensor: hover del borde, click-through y posición del cursor.
pub fn spawn_tracker(app: AppHandle) {
    let spawned = thread::Builder::new()
        .name("tico-island".into())
        .spawn(move || tracker_loop(&app));
    if let Err(err) = spawned {
        eprintln!("No se pudo arrancar el sensor de la isla: {err}");
    }
}

fn tracker_loop(app: &AppHandle) {
    let mut detector = HoverDetector::default();
    let mut inside_prev = false;
    let mut ignoring: Option<bool> = None;
    let mut last_cursor = (f64::NAN, f64::NAN);
    let mut tick: u64 = 0;

    loop {
        thread::sleep(TICK);
        tick = tick.wrapping_add(1);
        let Some(window) = app.get_webview_window(ISLAND_LABEL) else {
            continue;
        };
        let Ok(cursor) = app.cursor_position() else {
            continue;
        };
        let state = app.state::<AppState>();
        let (rect, origin, scale) = {
            let island = lock(&state.island);
            (island.rect, island.window_origin, island.scale.max(0.5))
        };

        if rect.is_none() {
            let settings = lock(&state.settings).clone();
            match layout_for_point(app, &settings, cursor.x, cursor.y) {
                Some(layout) => {
                    let in_zone = layout.wakes(cursor.x, cursor.y);
                    let dwell = Duration::from_millis(settings.show_delay_ms);
                    if detector.update(in_zone, Instant::now(), dwell)
                        && !(settings.hide_on_fullscreen && fullscreen_app_active())
                    {
                        if let Err(err) = apply_layout(app, layout) {
                            eprintln!("No se pudo colocar la isla: {err}");
                        }
                        let _ = app.emit_to(ISLAND_LABEL, "island://edge-hover", ());
                    }
                }
                None => detector.reset(),
            }
        } else {
            detector.reset();
        }

        // Cursor en coordenadas lógicas de la ventana.
        let local_x = (cursor.x - origin.0) / scale;
        let local_y = (cursor.y - origin.1) / scale;
        let inside = rect.is_some_and(|r| r.contains(local_x, local_y));
        if inside != inside_prev {
            inside_prev = inside;
            let _ = app.emit_to(ISLAND_LABEL, "island://pointer", PointerPayload { inside });
        }
        // Fuera de la cápsula los clics atraviesan la ventana.
        if ignoring != Some(!inside) && window.set_ignore_cursor_events(!inside).is_ok() {
            ignoring = Some(!inside);
        }
        // Los ojos de Tico siguen al cursor (~30 Hz y solo si se ve la isla).
        if rect.is_some() && tick % 2 == 0 && (cursor.x, cursor.y) != last_cursor {
            last_cursor = (cursor.x, cursor.y);
            let _ = app.emit_to(
                ISLAND_LABEL,
                "island://cursor",
                CursorPayload { x: local_x, y: local_y },
            );
        }
    }
}

/// El frontend informa del rectángulo de la cápsula (o `None` si está oculta).
#[tauri::command]
pub fn island_set_rect(state: State<'_, AppState>, rect: Option<Rect>) {
    lock(&state.island).rect = rect;
}

/// Da el foco a la isla para poder escribir en el chat.
#[tauri::command]
pub fn island_focus(app: AppHandle) {
    focus_island(&app);
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IslandInfo {
    pub platform: &'static str,
    /// Notch del monitor donde está la isla (px lógicos), si lo hay.
    pub notch: Option<Notch>,
}

#[tauri::command]
pub fn island_info(state: State<'_, AppState>) -> IslandInfo {
    IslandInfo {
        platform: std::env::consts::OS,
        notch: lock(&state.island).layout.and_then(|l| l.notch),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const MON: MonitorGeom = MonitorGeom {
        x: 0.0,
        y: 0.0,
        width: 1920.0,
        height: 1080.0,
        scale: 1.0,
    };

    #[test]
    fn center_layout_is_centered() {
        let l = compute_layout(MON, IslandSize::M, IslandPosition::Center, 400.0, None);
        let (w, _) = window_size(IslandSize::M);
        assert_eq!(l.window_x, ((1920.0 - w) / 2.0).round());
        assert_eq!(l.zone.x, 760.0);
        assert_eq!(l.zone.width, 400.0);
        assert_eq!(l.zone.height, 3.0);
    }

    #[test]
    fn right_layout_touches_right_edge() {
        let l = compute_layout(MON, IslandSize::L, IslandPosition::Right, 400.0, None);
        let (w, _) = window_size(IslandSize::L);
        assert_eq!(l.window_x, (1920.0 - w).round());
        assert_eq!(l.zone.x + l.zone.width, 1920.0);
    }

    #[test]
    fn layout_scales_with_dpi_and_offset_monitor() {
        let mon = MonitorGeom {
            x: 1920.0,
            y: -200.0,
            width: 2880.0,
            height: 1800.0,
            scale: 2.0,
        };
        let l = compute_layout(mon, IslandSize::M, IslandPosition::Center, 400.0, None);
        assert_eq!(l.zone.width, 800.0);
        assert_eq!(l.zone.height, 6.0);
        assert_eq!(l.window_y, -200.0);
        assert!(l.zone.contains(1920.0 + 1440.0, -199.0));
    }

    #[test]
    fn notch_forces_center_and_wakes_on_notch() {
        let mon = MonitorGeom {
            x: 0.0,
            y: 0.0,
            width: 3024.0,
            height: 1964.0,
            scale: 2.0,
        };
        let screens = [NotchScreen {
            screen_width: 1512.0,
            screen_height: 982.0,
            notch: Notch { width: 185.0, height: 32.0 },
        }];
        let notch = notch_for(mon, &screens);
        assert_eq!(notch, Some(Notch { width: 185.0, height: 32.0 }));
        let l = compute_layout(mon, IslandSize::M, IslandPosition::Left, 400.0, notch);
        let (w, _) = window_size(IslandSize::M);
        assert_eq!(l.window_x, ((3024.0 - w * 2.0) / 2.0).round());
        // Dentro del notch (a media altura) despierta; debajo del notch no.
        assert!(l.wakes(1512.0, 40.0));
        assert!(!l.wakes(1512.0, 70.0));
        // Un monitor externo sin notch no lo hereda.
        let external = MonitorGeom { width: 3840.0, height: 2160.0, ..mon };
        assert_eq!(notch_for(external, &screens), None);
    }

    #[test]
    fn hover_needs_dwell_and_fires_once() {
        let mut d = HoverDetector::default();
        let t0 = Instant::now();
        let dwell = Duration::from_millis(150);
        assert!(!d.update(true, t0, dwell));
        assert!(!d.update(true, t0 + Duration::from_millis(100), dwell));
        assert!(d.update(true, t0 + Duration::from_millis(160), dwell));
        assert!(!d.update(true, t0 + Duration::from_millis(400), dwell));
        // Al salir y volver a entrar, se rearma.
        assert!(!d.update(false, t0 + Duration::from_millis(500), dwell));
        assert!(!d.update(true, t0 + Duration::from_millis(510), dwell));
        assert!(d.update(true, t0 + Duration::from_millis(700), dwell));
    }

    #[test]
    fn rect_contains_is_half_open() {
        let r = Rect {
            x: 10.0,
            y: 0.0,
            width: 100.0,
            height: 40.0,
        };
        assert!(r.contains(10.0, 0.0));
        assert!(!r.contains(110.0, 20.0));
        assert!(!r.contains(50.0, 40.0));
    }
}

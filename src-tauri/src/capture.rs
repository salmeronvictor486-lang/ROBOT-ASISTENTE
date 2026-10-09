//! "Mira mi pantalla": captura bajo demanda, con la privacidad primero.
//!
//! - Solo se captura cuando el usuario lo pide (botón o atajo).
//! - Si hay una app bloqueada a la vista (gestor de contraseñas, banco…), no se captura.
//! - La isla de Tico no sale en la captura (ventana con `contentProtected`).
//! - La imagen solo vive en memoria; nunca se escribe en disco.
//! - Si el OCR está activado, también se lee su texto (con el OCR del propio sistema).

use std::io::Cursor;

use base64::engine::general_purpose::STANDARD;
use base64::Engine;
use image::codecs::jpeg::JpegEncoder;
use image::imageops::FilterType;
use image::{DynamicImage, RgbaImage};
use serde::Serialize;
use tauri::{AppHandle, Manager, State};

use crate::ai::ImageData;
use crate::error::{AppError, AppResult};
use crate::island::lock;
use crate::settings::{CaptureMode, Settings};
use crate::state::AppState;

/// Lado máximo recomendado para imágenes de visión (más grande solo gasta tokens).
pub const MAX_SIDE: u32 = 1568;
const JPEG_QUALITY: u8 = 80;
const THUMB_SIDE: u32 = 360;
/// Ventanas más pequeñas que esto (barras, iconos) no cuentan como "ventana activa".
const MIN_WINDOW: (u32, u32) = (200, 150);

/// Tamaño que cabe en `max` px por el lado más largo, manteniendo la proporción.
pub fn fit_within(width: u32, height: u32, max: u32) -> (u32, u32) {
    let longest = width.max(height);
    if longest <= max || longest == 0 {
        return (width, height);
    }
    let scale = f64::from(max) / f64::from(longest);
    let w = (f64::from(width) * scale).round().max(1.0) as u32;
    let h = (f64::from(height) * scale).round().max(1.0) as u32;
    (w, h)
}

/// ¿Aparece `needle` como palabra completa dentro de `haystack`? (sin distinguir mayúsculas)
pub fn contains_word(haystack: &str, needle: &str) -> bool {
    let hay = haystack.to_lowercase();
    let needle = needle.trim().to_lowercase();
    if needle.is_empty() {
        return false;
    }
    hay.match_indices(&needle).any(|(start, _)| {
        let before = hay[..start].chars().next_back();
        let after = hay[start + needle.len()..].chars().next();
        !before.is_some_and(char::is_alphanumeric) && !after.is_some_and(char::is_alphanumeric)
    })
}

/// Devuelve la primera entrada de la lista que coincide con alguna ventana `(app, título)`.
pub fn find_blocked<'a>(windows: &[(String, String)], blocked: &'a [String]) -> Option<&'a str> {
    blocked.iter().map(String::as_str).find(|entry| {
        windows
            .iter()
            .any(|(app, title)| contains_word(app, entry) || contains_word(title, entry))
    })
}

/// Redimensiona y codifica en JPEG. Devuelve (base64, ancho, alto).
pub fn encode_jpeg(image: &RgbaImage, max_side: u32, quality: u8) -> AppResult<(String, u32, u32)> {
    let (w, h) = fit_within(image.width(), image.height(), max_side);
    let rgb = if (w, h) == image.dimensions() {
        DynamicImage::ImageRgba8(image.clone()).to_rgb8()
    } else {
        DynamicImage::ImageRgba8(image::imageops::resize(image, w, h, FilterType::Triangle)).to_rgb8()
    };
    let mut bytes = Cursor::new(Vec::new());
    JpegEncoder::new_with_quality(&mut bytes, quality).encode_image(&rgb)?;
    Ok((STANDARD.encode(bytes.into_inner()), w, h))
}

#[cfg(target_os = "macos")]
mod permission {
    #[link(name = "CoreGraphics", kind = "framework")]
    extern "C" {
        fn CGPreflightScreenCaptureAccess() -> bool;
        fn CGRequestScreenCaptureAccess() -> bool;
    }

    /// `true` si ya hay permiso. Si no, lo pide (macOS muestra su aviso la primera vez).
    pub fn ensure() -> bool {
        // SAFETY: funciones de CoreGraphics sin argumentos, seguras desde cualquier hilo.
        unsafe {
            if CGPreflightScreenCaptureAccess() {
                return true;
            }
            CGRequestScreenCaptureAccess();
        }
        false
    }
}

struct Candidate {
    window: xcap::Window,
    app: String,
    title: String,
}

/// Ventanas visibles de otras apps, de la de más arriba a la de más abajo.
fn visible_windows() -> Vec<Candidate> {
    let own_pid = std::process::id();
    xcap::Window::all()
        .unwrap_or_default()
        .into_iter()
        .filter(|w| w.pid().is_ok_and(|p| p != own_pid))
        .filter(|w| !w.is_minimized().unwrap_or(true))
        .filter(|w| w.width().unwrap_or(0) > 0 && w.height().unwrap_or(0) > 0)
        .map(|window| Candidate {
            app: window.app_name().unwrap_or_default(),
            title: window.title().unwrap_or_default(),
            window,
        })
        .collect()
}

fn pick_active_window(windows: Vec<Candidate>) -> Option<Candidate> {
    let big_enough = |c: &Candidate| {
        c.window.width().unwrap_or(0) >= MIN_WINDOW.0 && c.window.height().unwrap_or(0) >= MIN_WINDOW.1
    };
    let titled = |c: &Candidate| !c.title.is_empty() && c.title != "Program Manager";
    let focused = windows
        .iter()
        .position(|c| c.window.is_focused().unwrap_or(false) && big_enough(c));
    // Si la ventana activa es Tico (has pulsado su botón), usamos la que está justo debajo.
    let index = focused.or_else(|| windows.iter().position(|c| big_enough(c) && titled(c)))?;
    windows.into_iter().nth(index)
}

fn check_blocked(windows: &[(String, String)], blocked: &[String]) -> AppResult<()> {
    match find_blocked(windows, blocked) {
        Some(entry) => Err(AppError::Blocked(entry.to_string())),
        None => Ok(()),
    }
}

/// Captura lista para enviar: la imagen y, si se ha podido leer, su texto.
pub struct PendingCapture {
    pub image: ImageData,
    pub text: Option<String>,
}

/// Hace la captura (bloqueante): devuelve la imagen para la IA y una miniatura.
fn take(settings: &Settings, cursor: (i32, i32)) -> AppResult<(PendingCapture, CapturePreview)> {
    #[cfg(target_os = "macos")]
    if !permission::ensure() {
        return Err(AppError::ScreenPermission);
    }

    let windows = visible_windows();
    let raw = match settings.capture_mode {
        CaptureMode::Window => {
            let target = pick_active_window(windows)
                .ok_or_else(|| AppError::Capture("no hay ninguna ventana activa".into()))?;
            check_blocked(&[(target.app.clone(), target.title.clone())], &settings.blocked_apps)?;
            target.window.capture_image()?
        }
        CaptureMode::Screen => {
            let monitor = xcap::Monitor::from_point(cursor.0, cursor.1)
                .or_else(|_| {
                    xcap::Monitor::all()?
                        .into_iter()
                        .find(|m| m.is_primary().unwrap_or(false))
                        .ok_or_else(|| xcap::XCapError::new("sin monitor principal"))
                })?;
            let monitor_id = monitor.id().ok();
            let on_screen: Vec<(String, String)> = windows
                .into_iter()
                .filter(|c| c.window.current_monitor().ok().and_then(|m| m.id().ok()) == monitor_id)
                .map(|c| (c.app, c.title))
                .collect();
            check_blocked(&on_screen, &settings.blocked_apps)?;
            monitor.capture_image()?
        }
    };

    let (base64, width, height) = encode_jpeg(&raw, MAX_SIDE, JPEG_QUALITY)?;
    let (thumb, _, _) = encode_jpeg(&raw, THUMB_SIDE, 70)?;
    // El OCR trabaja con la imagen a tamaño real: así lee hasta la letra pequeña.
    let text = if settings.ocr { crate::ocr::recognize(&raw) } else { None };
    let preview = CapturePreview {
        thumbnail: format!("data:image/jpeg;base64,{thumb}"),
        width,
        height,
        text_chars: text.as_ref().map_or(0, |t| t.chars().count()),
    };
    Ok((PendingCapture { image: ImageData { base64, media_type: "image/jpeg" }, text }, preview))
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CapturePreview {
    /// Miniatura como data URL para enseñarla antes de enviar.
    pub thumbnail: String,
    pub width: u32,
    pub height: u32,
    /// Caracteres de texto leídos con OCR (0 si no hay OCR o no había texto).
    pub text_chars: usize,
}

/// Captura la pantalla (o la ventana activa) y la deja pendiente de enviar.
#[tauri::command]
pub async fn capture_screen(app: AppHandle) -> AppResult<CapturePreview> {
    let settings = lock(&app.state::<AppState>().settings).clone();
    let cursor = app.cursor_position()?;
    // xcap usa px físicos en Windows y puntos en macOS.
    #[cfg(target_os = "macos")]
    let cursor = {
        let scale = app
            .monitor_from_point(cursor.x, cursor.y)
            .ok()
            .flatten()
            .map_or(1.0, |m| m.scale_factor());
        (cursor.x / scale, cursor.y / scale)
    };
    #[cfg(not(target_os = "macos"))]
    let cursor = (cursor.x, cursor.y);
    let point = (cursor.0.round() as i32, cursor.1.round() as i32);

    let (image, preview) = tauri::async_runtime::spawn_blocking(move || take(&settings, point))
        .await
        .map_err(|e| AppError::Capture(e.to_string()))??;
    *lock(&app.state::<AppState>().pending_capture) = Some(image);
    Ok(preview)
}

/// Descarta la captura pendiente sin enviarla.
#[tauri::command]
pub fn capture_discard(state: State<'_, AppState>) {
    lock(&state.pending_capture).take();
}

/// Abre el panel de permisos de Grabación de pantalla (solo macOS).
#[tauri::command]
pub fn open_screen_permission_settings() -> AppResult<()> {
    #[cfg(target_os = "macos")]
    std::process::Command::new("open")
        .arg("x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture")
        .spawn()?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn fit_keeps_ratio() {
        assert_eq!(fit_within(3840, 2160, 1568), (1568, 882));
        assert_eq!(fit_within(1000, 2000, 1568), (784, 1568));
        assert_eq!(fit_within(800, 600, 1568), (800, 600));
    }

    #[test]
    fn word_matching_avoids_false_positives() {
        assert!(contains_word("ING Direct - Mi cuenta", "ING"));
        assert!(!contains_word("Settings", "ING"));
        assert!(contains_word("bitwarden.exe", "Bitwarden"));
        assert!(contains_word("Banco Santander | Particulares - Google Chrome", "santander"));
        assert!(!contains_word("Bankinter", "Bank"));
        assert!(contains_word("Acceso a Llaveros", "Acceso a Llaveros"));
    }

    #[test]
    fn finds_blocked_window() {
        let windows = vec![
            ("Code".to_string(), "main.rs - tico".to_string()),
            ("chrome".to_string(), "BBVA | Banca online".to_string()),
        ];
        let blocked = vec!["PayPal".to_string(), "BBVA".to_string()];
        assert_eq!(find_blocked(&windows, &blocked), Some("BBVA"));
        assert_eq!(find_blocked(&windows[..1], &blocked), None);
    }

    #[test]
    fn jpeg_is_resized_and_base64() {
        let img = RgbaImage::from_pixel(2000, 1000, image::Rgba([10, 200, 180, 255]));
        let (b64, w, h) = encode_jpeg(&img, MAX_SIDE, 80).unwrap();
        assert_eq!((w, h), (1568, 784));
        let bytes = STANDARD.decode(b64).unwrap();
        assert_eq!(&bytes[..2], &[0xFF, 0xD8]); // cabecera JPEG
    }
}

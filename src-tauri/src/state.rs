use std::path::PathBuf;
use std::sync::Mutex;

use crate::island::IslandShared;
use crate::settings::Settings;

/// Estado global de la app, accesible desde comandos y hilos con `app.state::<AppState>()`.
pub struct AppState {
    pub settings: Mutex<Settings>,
    pub settings_path: PathBuf,
    pub island: Mutex<IslandShared>,
    /// Ancho del notch (solo MacBook con notch), detectado al arrancar.
    pub notch_width: Option<f64>,
}

impl AppState {
    pub fn new(settings: Settings, settings_path: PathBuf, notch_width: Option<f64>) -> Self {
        Self {
            settings: Mutex::new(settings),
            settings_path,
            island: Mutex::new(IslandShared::default()),
            notch_width,
        }
    }
}

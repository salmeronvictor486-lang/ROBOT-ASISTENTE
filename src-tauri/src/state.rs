use std::path::PathBuf;
use std::sync::atomic::AtomicU64;
use std::sync::Mutex;
use std::time::Duration;

use crate::ai::{ChatMessage, ImageData};
use crate::island::IslandShared;
use crate::settings::Settings;

/// Estado global de la app, accesible desde comandos y hilos con `app.state::<AppState>()`.
pub struct AppState {
    pub settings: Mutex<Settings>,
    pub settings_path: PathBuf,
    pub island: Mutex<IslandShared>,
    /// Ancho del notch (solo MacBook con notch), detectado al arrancar.
    pub notch_width: Option<f64>,
    /// Historial de la conversación (solo en memoria).
    pub chat: Mutex<Vec<ChatMessage>>,
    /// Captura hecha y esperando a enviarse (solo en memoria, nunca en disco).
    pub pending_capture: Mutex<Option<ImageData>>,
    /// Sube cada vez que se envía, cancela o borra: así un streaming viejo sabe que debe parar.
    pub chat_generation: AtomicU64,
    pub http: reqwest::Client,
}

impl AppState {
    pub fn new(settings: Settings, settings_path: PathBuf, notch_width: Option<f64>) -> Self {
        Self {
            settings: Mutex::new(settings),
            settings_path,
            island: Mutex::new(IslandShared::default()),
            notch_width,
            chat: Mutex::new(Vec::new()),
            pending_capture: Mutex::new(None),
            chat_generation: AtomicU64::new(0),
            http: reqwest::Client::builder()
                .connect_timeout(Duration::from_secs(10))
                .user_agent(concat!("Tico/", env!("CARGO_PKG_VERSION")))
                .build()
                .unwrap_or_default(),
        }
    }
}

use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::atomic::AtomicU64;
use std::sync::Mutex;
use std::time::Duration;

use crate::ai::ChatMessage;
use crate::capture::PendingCapture;
use crate::island::{IslandShared, NotchScreen};
use crate::settings::Settings;

/// Estado global de la app, accesible desde comandos y hilos con `app.state::<AppState>()`.
pub struct AppState {
    pub settings: Mutex<Settings>,
    pub settings_path: PathBuf,
    pub island: Mutex<IslandShared>,
    /// Pantallas con notch (solo MacBook), detectadas al arrancar.
    pub notch_screens: Vec<NotchScreen>,
    /// Conversación de cada Tico, por su id (solo en memoria).
    pub chat: Mutex<HashMap<String, Vec<ChatMessage>>>,
    /// Captura hecha y esperando a enviarse (solo en memoria, nunca en disco).
    pub pending_capture: Mutex<Option<PendingCapture>>,
    /// Sube cada vez que se envía, cancela o borra: así un streaming viejo sabe que debe parar.
    pub chat_generation: AtomicU64,
    pub http: reqwest::Client,
}

impl AppState {
    pub fn new(settings: Settings, settings_path: PathBuf, notch_screens: Vec<NotchScreen>) -> Self {
        Self {
            settings: Mutex::new(settings),
            settings_path,
            island: Mutex::new(IslandShared::default()),
            notch_screens,
            chat: Mutex::new(HashMap::new()),
            pending_capture: Mutex::new(None),
            chat_generation: AtomicU64::new(0),
            http: reqwest::Client::builder()
                .connect_timeout(Duration::from_secs(10))
                // Si el servicio se queda callado un minuto a mitad de respuesta, cortamos.
                .read_timeout(Duration::from_secs(90))
                .user_agent(concat!("Tico/", env!("CARGO_PKG_VERSION")))
                .build()
                .unwrap_or_default(),
        }
    }
}

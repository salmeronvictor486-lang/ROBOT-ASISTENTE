//! Ajustes de Tico: se guardan como JSON en la carpeta de configuración del sistema.

use std::fs;
use std::path::Path;

use serde::{Deserialize, Serialize};


#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "lowercase")]
pub enum IslandSize {
    S,
    #[default]
    M,
    L,
}

impl IslandSize {
    /// Factor por el que se multiplican los tamaños base de la isla.
    pub fn scale(self) -> f64 {
        match self {
            IslandSize::S => 0.85,
            IslandSize::M => 1.0,
            IslandSize::L => 1.2,
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "lowercase")]
pub enum IslandPosition {
    #[default]
    Center,
    Left,
    Right,
}

/// Qué captura "Mira mi pantalla".
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "lowercase")]
pub enum CaptureMode {
    /// El monitor donde está el cursor.
    #[default]
    Screen,
    /// Solo la ventana activa.
    Window,
}

/// Apps y webs que Tico nunca mira (se buscan como palabra en el nombre o el título).
pub fn default_blocked_apps() -> Vec<String> {
    [
        "1Password", "Bitwarden", "KeePass", "KeePassXC", "LastPass", "Dashlane", "Keeper",
        "NordPass", "Proton Pass", "Enpass", "Keychain Access", "Acceso a Llaveros",
        "Contraseñas", "Passwords", "Banco", "Bank", "BBVA", "CaixaBank", "Santander",
        "Sabadell", "Bankinter", "Openbank", "Unicaja", "Abanca", "Kutxabank", "ING",
        "Revolut", "N26", "PayPal",
    ]
    .into_iter()
    .map(String::from)
    .collect()
}

/// Proveedor de IA elegido por el usuario.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Serialize, Deserialize, Default)]
#[serde(rename_all = "lowercase")]
pub enum ProviderKind {
    #[default]
    Anthropic,
    Openai,
    Gemini,
    Ollama,
    Openrouter,
    Groq,
    Mistral,
    Deepseek,
    Xai,
    Lmstudio,
    /// Cualquier servicio compatible con la API de OpenAI (dirección y clave a mano).
    Custom,
    /// Respuestas de ejemplo, sin clave ni internet: para probar Tico.
    Demo,
}

impl ProviderKind {
    pub const ALL: [ProviderKind; 12] = [
        ProviderKind::Anthropic,
        ProviderKind::Openai,
        ProviderKind::Gemini,
        ProviderKind::Ollama,
        ProviderKind::Openrouter,
        ProviderKind::Groq,
        ProviderKind::Mistral,
        ProviderKind::Deepseek,
        ProviderKind::Xai,
        ProviderKind::Lmstudio,
        ProviderKind::Custom,
        ProviderKind::Demo,
    ];

    pub fn id(self) -> &'static str {
        match self {
            ProviderKind::Anthropic => "anthropic",
            ProviderKind::Openai => "openai",
            ProviderKind::Gemini => "gemini",
            ProviderKind::Ollama => "ollama",
            ProviderKind::Openrouter => "openrouter",
            ProviderKind::Groq => "groq",
            ProviderKind::Mistral => "mistral",
            ProviderKind::Deepseek => "deepseek",
            ProviderKind::Xai => "xai",
            ProviderKind::Lmstudio => "lmstudio",
            ProviderKind::Custom => "custom",
            ProviderKind::Demo => "demo",
        }
    }

    /// Nombre para los mensajes de error.
    pub fn label(self) -> &'static str {
        match self {
            ProviderKind::Anthropic => "Claude",
            ProviderKind::Openai => "OpenAI",
            ProviderKind::Gemini => "Gemini",
            ProviderKind::Ollama => "Ollama",
            ProviderKind::Openrouter => "OpenRouter",
            ProviderKind::Groq => "Groq",
            ProviderKind::Mistral => "Mistral",
            ProviderKind::Deepseek => "DeepSeek",
            ProviderKind::Xai => "Grok (xAI)",
            ProviderKind::Lmstudio => "LM Studio",
            ProviderKind::Custom => "el servicio personalizado",
            ProviderKind::Demo => "el modo demo",
        }
    }

    /// ¿Necesita una clave de API? (El personalizado la admite pero no la exige.)
    pub fn needs_key(self) -> bool {
        !matches!(
            self,
            ProviderKind::Ollama | ProviderKind::Lmstudio | ProviderKind::Custom | ProviderKind::Demo
        )
    }

    /// ¿Se le puede guardar una clave en el llavero?
    pub fn accepts_key(self) -> bool {
        self.needs_key() || self == ProviderKind::Custom
    }

    /// ¿Corre en este ordenador? (Sin internet, sin clave y con otros errores típicos.)
    pub fn is_local(self) -> bool {
        matches!(self, ProviderKind::Ollama | ProviderKind::Lmstudio)
    }
}

/// Modelo elegido para cada proveedor. Son valores por defecto editables:
/// en Ajustes, "Probar conexión" lista los modelos disponibles, y si un modelo deja de
/// existir Tico elige solo el más parecido.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(default)]
pub struct ProviderModels {
    pub anthropic: String,
    pub openai: String,
    pub gemini: String,
    pub ollama: String,
    pub openrouter: String,
    pub groq: String,
    pub mistral: String,
    pub deepseek: String,
    pub xai: String,
    pub lmstudio: String,
    pub custom: String,
    pub demo: String,
}

impl Default for ProviderModels {
    fn default() -> Self {
        Self {
            anthropic: "claude-haiku-4-5".into(),
            openai: "gpt-4.1-mini".into(),
            gemini: "gemini-2.5-flash".into(),
            ollama: "gemma3".into(),
            openrouter: "openrouter/auto".into(),
            groq: "meta-llama/llama-4-scout-17b-16e-instruct".into(),
            mistral: "mistral-small-latest".into(),
            deepseek: "deepseek-chat".into(),
            xai: "grok-4".into(),
            lmstudio: String::new(),
            custom: String::new(),
            demo: "tico-demo".into(),
        }
    }
}

impl ProviderModels {
    pub fn get(&self, provider: ProviderKind) -> &str {
        match provider {
            ProviderKind::Anthropic => &self.anthropic,
            ProviderKind::Openai => &self.openai,
            ProviderKind::Gemini => &self.gemini,
            ProviderKind::Ollama => &self.ollama,
            ProviderKind::Openrouter => &self.openrouter,
            ProviderKind::Groq => &self.groq,
            ProviderKind::Mistral => &self.mistral,
            ProviderKind::Deepseek => &self.deepseek,
            ProviderKind::Xai => &self.xai,
            ProviderKind::Lmstudio => &self.lmstudio,
            ProviderKind::Custom => &self.custom,
            ProviderKind::Demo => &self.demo,
        }
    }

    pub fn get_mut(&mut self, provider: ProviderKind) -> &mut String {
        match provider {
            ProviderKind::Anthropic => &mut self.anthropic,
            ProviderKind::Openai => &mut self.openai,
            ProviderKind::Gemini => &mut self.gemini,
            ProviderKind::Ollama => &mut self.ollama,
            ProviderKind::Openrouter => &mut self.openrouter,
            ProviderKind::Groq => &mut self.groq,
            ProviderKind::Mistral => &mut self.mistral,
            ProviderKind::Deepseek => &mut self.deepseek,
            ProviderKind::Xai => &mut self.xai,
            ProviderKind::Lmstudio => &mut self.lmstudio,
            ProviderKind::Custom => &mut self.custom,
            ProviderKind::Demo => &mut self.demo,
        }
    }
}

/// Ropa y accesorios que puede llevar cada Tico (los dibuja el frontend).
pub const OUTFITS: [&str; 12] = [
    "none", "glasses", "headphones", "cap", "beret", "graduation", "crown", "bow", "scarf",
    "wizard", "flower", "bandana",
];

/// Máximo de Ticos distintos.
pub const MAX_TICOS: usize = 12;

/// Un Tico para un tipo de tarea: su nombre, su aspecto, cómo debe responder y
/// (si se quiere) un proveedor y un modelo propios.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct TicoProfile {
    pub id: String,
    pub name: String,
    pub base_color: String,
    pub accent_color: String,
    pub outfit: String,
    /// Instrucciones extra para la IA ("eres experto en…", "responde siempre en inglés"…).
    pub instructions: String,
    /// `None`: usa el proveedor general de Ajustes.
    pub provider: Option<ProviderKind>,
    /// Vacío: usa el modelo general de ese proveedor.
    pub model: String,
}

impl Default for TicoProfile {
    fn default() -> Self {
        Self {
            id: "tico".into(),
            name: "Tico".into(),
            base_color: "#F2F0EB".into(),
            accent_color: "#3DD6D0".into(),
            outfit: "none".into(),
            instructions: String::new(),
            provider: None,
            model: String::new(),
        }
    }
}

/// Los Ticos que vienen de serie: uno general y cuatro especialistas.
pub fn default_ticos() -> Vec<TicoProfile> {
    let make = |id: &str, name: &str, base: &str, accent: &str, outfit: &str, instructions: &str| TicoProfile {
        id: id.into(),
        name: name.into(),
        base_color: base.into(),
        accent_color: accent.into(),
        outfit: outfit.into(),
        instructions: instructions.into(),
        provider: None,
        model: String::new(),
    };
    vec![
        TicoProfile::default(),
        make(
            "code",
            "Tico Código",
            "#E9EEF2",
            "#7CF29A",
            "glasses",
            "You are an expert programmer. Give working code in fenced code blocks with the language \
name, explain briefly why it works, and point out bugs you notice. Prefer simple, modern solutions.",
        ),
        make(
            "translate",
            "Tico Traductor",
            "#F4EFE6",
            "#FFB84D",
            "scarf",
            "You are a professional translator. If the user gives you text, translate it: into Spanish if \
it is in another language, or into English if it is in Spanish, unless they ask for a specific \
language. Keep the tone and formatting. Give only the translation unless asked for more.",
        ),
        make(
            "write",
            "Tico Escritor",
            "#F3ECF7",
            "#C59BFF",
            "beret",
            "You are a writing assistant. Help write, rewrite, shorten and correct texts and emails. Keep \
the user's voice, fix spelling and grammar, and offer the improved text ready to copy.",
        ),
        make(
            "teach",
            "Tico Profe",
            "#EEF3FA",
            "#5AB0FF",
            "graduation",
            "You are a patient teacher. Explain step by step with simple words and a short example, then \
check understanding with one quick question.",
        ),
    ]
}

/// Máximo de espacios de trabajo.
pub const MAX_WORKSPACES: usize = 12;

/// Un espacio de trabajo ("Clase", "Trabajo", "Programar"…): sus Ticos, el que estaba
/// usando, instrucciones comunes, una carpeta y las apps que lo activan solas.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Workspace {
    pub id: String,
    pub name: String,
    pub icon: String,
    pub color: String,
    /// Ids de los Ticos de este espacio (un mismo Tico puede estar en varios).
    pub ticos: Vec<String>,
    /// El último Tico usado en este espacio.
    pub active_tico: String,
    /// Contexto para todos sus Ticos ("estudio 2.º de Bachillerato", "la empresa hace…").
    pub instructions: String,
    /// Carpeta del espacio (vacío: ninguna). Sus archivos salen en la pestaña Archivos.
    pub folder: String,
    /// Si la app activa coincide con alguna (palabra en el nombre o el título), al abrir la
    /// isla se cambia a este espacio.
    pub apps: Vec<String>,
}

impl Default for Workspace {
    fn default() -> Self {
        Self {
            id: "general".into(),
            name: "General".into(),
            icon: "🏠".into(),
            color: "#3DD6D0".into(),
            ticos: Vec::new(),
            active_tico: String::new(),
            instructions: String::new(),
            folder: String::new(),
            apps: Vec::new(),
        }
    }
}

/// Espacios de serie, hechos con los Ticos que existan: uno general con todos y, si están
/// sus especialistas, uno para programar y otro para estudiar.
pub fn default_workspaces(ticos: &[TicoProfile]) -> Vec<Workspace> {
    let ids = |wanted: &[&str]| -> Vec<String> {
        wanted
            .iter()
            .filter(|id| ticos.iter().any(|t| t.id == **id))
            .map(|id| (*id).to_string())
            .collect()
    };
    let mut list = vec![Workspace {
        ticos: ticos.iter().map(|t| t.id.clone()).collect(),
        ..Workspace::default()
    }];
    let code = ids(&["code", "tico"]);
    if code.first().is_some_and(|id| id == "code") {
        list.push(Workspace {
            id: "code".into(),
            name: "Programar".into(),
            icon: "💻".into(),
            color: "#7CF29A".into(),
            ticos: code,
            apps: [
                "Visual Studio Code", "Visual Studio", "Cursor", "Xcode", "IntelliJ IDEA", "PyCharm",
                "Android Studio", "Windows Terminal", "Terminal", "iTerm2", "PowerShell",
            ]
            .into_iter()
            .map(String::from)
            .collect(),
            ..Workspace::default()
        });
    }
    let study = ids(&["teach", "write", "translate"]);
    if study.first().is_some_and(|id| id == "teach") {
        list.push(Workspace {
            id: "study".into(),
            name: "Estudiar".into(),
            icon: "🎓".into(),
            color: "#5AB0FF".into(),
            ticos: study,
            ..Workspace::default()
        });
    }
    list
}

/// Cifrado de la conexión con el servidor de correo.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "lowercase")]
pub enum MailSecurity {
    /// TLS desde el principio (puerto 465).
    #[default]
    Ssl,
    /// Empieza sin cifrar y pasa a TLS (puerto 587).
    Starttls,
}

/// Tu cuenta de correo para enviar desde Tico (la contraseña va en el llavero).
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct MailSettings {
    /// Tu dirección ("victor@gmail.com").
    pub address: String,
    /// Nombre que ven los destinatarios.
    pub name: String,
    /// Servidor SMTP; vacío = el de tu proveedor (Gmail, iCloud…).
    pub host: String,
    /// 0 = el normal para el cifrado elegido.
    pub port: u16,
    pub security: MailSecurity,
    /// Usuario del servidor; vacío = la dirección.
    pub username: String,
}

/// Dónde se guardan los archivos convertidos (Word → PDF…).
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "lowercase")]
pub enum OutputFolder {
    /// La carpeta de Descargas.
    #[default]
    Downloads,
    /// Junto al archivo original.
    Same,
}

/// Lo largas que pueden ser las respuestas.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "lowercase")]
pub enum AnswerLength {
    Short,
    #[default]
    Normal,
    Long,
}

impl AnswerLength {
    pub fn max_tokens(self) -> u32 {
        match self {
            AnswerLength::Short => 1024,
            AnswerLength::Normal => 2048,
            AnswerLength::Long => 4096,
        }
    }
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Settings {
    /// "auto", "es", "ca" o "en".
    pub language: String,
    /// "auto", "light" o "dark" (afecta al panel y a la ventana de ajustes).
    pub theme: String,
    pub island_size: IslandSize,
    pub island_position: IslandPosition,
    /// Ancho (px lógicos) de la zona del borde superior que despierta la isla.
    pub activation_width: u32,
    pub show_delay_ms: u64,
    pub hide_delay_ms: u64,
    /// true: aparece en el monitor del cursor; false: siempre en el principal.
    pub follow_cursor_monitor: bool,
    pub hide_on_fullscreen: bool,
    pub shortcut_open: String,
    pub sounds: bool,
    /// Proveedor general (cada Tico puede usar otro).
    pub provider: ProviderKind,
    pub models: ProviderModels,
    pub ollama_url: String,
    pub lmstudio_url: String,
    /// Dirección base del servicio personalizado (p. ej. https://mi-servidor/v1).
    pub custom_url: String,
    pub answer_length: AnswerLength,
    pub shortcut_capture: String,
    pub capture_mode: CaptureMode,
    /// Enseñar la miniatura con "Enviar" y "Cancelar" antes de mandar la captura.
    pub capture_confirm: bool,
    /// Mirar la pantalla sin pulsar el botón cuando el mensaje lo pide ("¿qué ves en mi pantalla?").
    pub auto_capture: bool,
    /// Leer el texto de la captura (OCR del sistema) y mandarlo junto a la imagen.
    pub ocr: bool,
    pub blocked_apps: Vec<String>,
    /// Arrancar Tico al iniciar sesión.
    pub autostart: bool,
    /// Los distintos Ticos y el que está activo.
    pub ticos: Vec<TicoProfile>,
    pub active_tico: String,
    /// Ropa de temporada (gorro en Navidad…) cuando el Tico no lleva nada puesto.
    pub seasonal_outfits: bool,
    /// Dónde dejar los archivos convertidos.
    pub output_folder: OutputFolder,
    /// Tico suelto en el escritorio.
    pub desktop_tico: bool,
    /// Dónde lo dejó el usuario (px lógicos de la pantalla).
    pub pet_position: Option<[f64; 2]>,
    /// Espacios de trabajo y el activo. Si falta (ajustes de la 1.0), se crean con los
    /// Ticos que haya.
    #[serde(default)]
    pub workspaces: Vec<Workspace>,
    pub active_workspace: String,
    /// Cambiar de espacio según la app que estés usando al abrir la isla.
    pub auto_workspace: bool,
    /// Guardar las conversaciones en la base de datos (si no, se olvidan al cerrar Tico).
    pub save_history: bool,
    /// Ya ha visto la bienvenida (se enseña una sola vez).
    pub onboarded: bool,
    /// Mirar en GitHub si hay una versión nueva (solo pregunta el número de versión).
    pub check_updates: bool,
    /// Cuenta de correo para enviar archivos.
    pub mail: MailSettings,
    /// Cómo se llama el usuario (para que Tico le hable por su nombre).
    pub user_name: String,
    /// Usar lo que el usuario pidió recordar en todas las conversaciones.
    pub use_memory: bool,
    /// Decirle a la IA qué app está usando (nunca si es una app bloqueada).
    pub share_active_app: bool,
    /// Ideas para seguir la conversación al final de cada respuesta.
    pub follow_ups: bool,
    /// Colores de la versión 0.x (un solo Tico). Solo se leen para migrarlos.
    #[serde(rename = "robotBaseColor", skip_serializing)]
    pub legacy_base_color: Option<String>,
    #[serde(rename = "robotAccentColor", skip_serializing)]
    pub legacy_accent_color: Option<String>,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            language: "auto".into(),
            theme: "auto".into(),
            island_size: IslandSize::M,
            island_position: IslandPosition::Center,
            activation_width: 400,
            show_delay_ms: 150,
            hide_delay_ms: 600,
            follow_cursor_monitor: true,
            hide_on_fullscreen: true,
            shortcut_open: "CommandOrControl+Shift+Space".into(),
            sounds: true,
            provider: ProviderKind::Anthropic,
            models: ProviderModels::default(),
            ollama_url: "http://localhost:11434".into(),
            lmstudio_url: "http://localhost:1234/v1".into(),
            custom_url: String::new(),
            answer_length: AnswerLength::Normal,
            shortcut_capture: "CommandOrControl+Shift+S".into(),
            capture_mode: CaptureMode::Screen,
            capture_confirm: true,
            auto_capture: true,
            ocr: true,
            blocked_apps: default_blocked_apps(),
            autostart: false,
            ticos: default_ticos(),
            active_tico: "tico".into(),
            seasonal_outfits: true,
            output_folder: OutputFolder::Downloads,
            desktop_tico: false,
            pet_position: None,
            workspaces: default_workspaces(&default_ticos()),
            active_workspace: "general".into(),
            auto_workspace: true,
            save_history: true,
            onboarded: false,
            check_updates: true,
            mail: MailSettings::default(),
            user_name: String::new(),
            use_memory: true,
            share_active_app: true,
            follow_ups: true,
            legacy_base_color: None,
            legacy_accent_color: None,
        }
    }
}

fn is_hex_color(value: &str) -> bool {
    value.len() == 7
        && value.starts_with('#')
        && value[1..].chars().all(|c| c.is_ascii_hexdigit())
}

/// Quita espacios y la barra final; si no empieza por http(s)://, devuelve `None`.
fn clean_url(url: &str) -> Option<String> {
    let url = url.trim().trim_end_matches('/').to_string();
    (url.starts_with("http://") || url.starts_with("https://")).then_some(url)
}

/// Id seguro a partir de un texto: minúsculas, números y guiones.
fn slug(text: &str) -> String {
    let mut out = String::new();
    for c in text.trim().to_lowercase().chars() {
        if c.is_ascii_alphanumeric() {
            out.push(c);
        } else if !out.ends_with('-') && !out.is_empty() {
            out.push('-');
        }
    }
    out.trim_end_matches('-').chars().take(32).collect()
}

impl TicoProfile {
    fn sanitized(mut self, defaults: &TicoProfile) -> Self {
        self.name = self.name.trim().chars().take(40).collect();
        if self.name.is_empty() {
            self.name = defaults.name.clone();
        }
        self.id = slug(&self.id);
        if self.id.is_empty() {
            self.id = slug(&self.name);
        }
        if !is_hex_color(&self.base_color) {
            self.base_color = defaults.base_color.clone();
        }
        if !is_hex_color(&self.accent_color) {
            self.accent_color = defaults.accent_color.clone();
        }
        if !OUTFITS.contains(&self.outfit.as_str()) {
            self.outfit = "none".into();
        }
        self.instructions = self.instructions.trim().chars().take(4000).collect();
        self.model = self.model.trim().to_string();
        self
    }
}

impl Workspace {
    fn sanitized(mut self, ticos: &[TicoProfile]) -> Self {
        let defaults = Workspace::default();
        self.name = self.name.trim().chars().take(40).collect();
        if self.name.is_empty() {
            self.name = defaults.name.clone();
        }
        self.id = slug(&self.id);
        if self.id.is_empty() {
            self.id = slug(&self.name);
        }
        if self.id.is_empty() {
            self.id = defaults.id.clone();
        }
        let icon = self.icon.trim();
        if icon.is_empty() || icon.chars().count() > 4 {
            self.icon = defaults.icon.clone();
        } else {
            self.icon = icon.to_string();
        }
        if !is_hex_color(&self.color) {
            self.color = defaults.color;
        }
        let mut seen = std::collections::HashSet::new();
        self.ticos.retain(|id| ticos.iter().any(|t| &t.id == id) && seen.insert(id.clone()));
        if self.ticos.is_empty() {
            self.ticos.extend(ticos.first().map(|t| t.id.clone()));
        }
        if !self.ticos.contains(&self.active_tico) {
            self.active_tico = self.ticos.first().cloned().unwrap_or_default();
        }
        self.instructions = self.instructions.trim().chars().take(4000).collect();
        self.folder = self.folder.trim().to_string();
        let mut apps: Vec<String> = Vec::new();
        for app in &self.apps {
            let app = app.trim().to_string();
            if !app.is_empty() && !apps.iter().any(|a| a.eq_ignore_ascii_case(&app)) {
                apps.push(app);
            }
        }
        apps.truncate(40);
        self.apps = apps;
        self
    }
}

impl Settings {
    /// Corrige valores fuera de rango para que un JSON editado a mano no rompa la app.
    pub fn sanitized(mut self) -> Self {
        let defaults = Settings::default();
        if !matches!(self.language.as_str(), "auto" | "es" | "ca" | "en") {
            self.language = defaults.language;
        }
        if !matches!(self.theme.as_str(), "auto" | "light" | "dark") {
            self.theme = defaults.theme;
        }
        self.activation_width = self.activation_width.clamp(100, 2000);
        self.show_delay_ms = self.show_delay_ms.min(3000);
        self.hide_delay_ms = self.hide_delay_ms.clamp(100, 10_000);
        if self.shortcut_open.trim().is_empty() {
            self.shortcut_open = defaults.shortcut_open;
        }
        for provider in ProviderKind::ALL {
            let model = self.models.get_mut(provider);
            *model = model.trim().to_string();
            if model.is_empty() {
                *model = defaults.models.get(provider).to_string();
            }
        }
        if self.shortcut_capture.trim().is_empty() {
            self.shortcut_capture = defaults.shortcut_capture;
        }
        self.blocked_apps = self
            .blocked_apps
            .iter()
            .map(|a| a.trim().to_string())
            .filter(|a| !a.is_empty())
            .collect();
        self.blocked_apps.dedup();
        self.ollama_url = clean_url(&self.ollama_url).unwrap_or(defaults.ollama_url);
        self.lmstudio_url = clean_url(&self.lmstudio_url).unwrap_or(defaults.lmstudio_url);
        self.custom_url = clean_url(&self.custom_url).unwrap_or_default();
        self.pet_position = self.pet_position.filter(|[x, y]| x.is_finite() && y.is_finite());
        self.user_name = self.user_name.trim().chars().take(60).collect();
        self.mail.address = self.mail.address.trim().to_string();
        self.mail.name = self.mail.name.trim().chars().take(80).collect();
        self.mail.host = self.mail.host.trim().trim_end_matches('.').to_lowercase();
        self.mail.username = self.mail.username.trim().to_string();

        // Ticos: al menos uno, ids únicos y valores válidos.
        let fallback = TicoProfile::default();
        if self.ticos.is_empty() {
            self.ticos = default_ticos();
        }
        // Venimos de la versión 0.x: sus colores pasan al Tico principal.
        if let Some(first) = self.ticos.first_mut() {
            if let Some(color) = self.legacy_base_color.take().filter(|c| is_hex_color(c)) {
                first.base_color = color;
            }
            if let Some(color) = self.legacy_accent_color.take().filter(|c| is_hex_color(c)) {
                first.accent_color = color;
            }
        }
        let mut seen = std::collections::HashSet::new();
        self.ticos = std::mem::take(&mut self.ticos)
            .into_iter()
            .take(MAX_TICOS)
            .map(|t| t.sanitized(&fallback))
            .map(|mut t| {
                let base = t.id.clone();
                let mut n = 2;
                while !seen.insert(t.id.clone()) {
                    t.id = format!("{base}-{n}");
                    n += 1;
                }
                t
            })
            .collect();
        if !self.ticos.iter().any(|t| t.id == self.active_tico) {
            self.active_tico = self.ticos.first().map(|t| t.id.clone()).unwrap_or_default();
        }

        // Espacios: al menos uno, ids únicos y solo con Ticos que existen.
        if self.workspaces.is_empty() {
            self.workspaces = default_workspaces(&self.ticos);
        }
        let mut seen = std::collections::HashSet::new();
        let ticos = &self.ticos;
        self.workspaces = std::mem::take(&mut self.workspaces)
            .into_iter()
            .take(MAX_WORKSPACES)
            .map(|w| w.sanitized(ticos))
            .map(|mut w| {
                let base = w.id.clone();
                let mut n = 2;
                while !seen.insert(w.id.clone()) {
                    w.id = format!("{base}-{n}");
                    n += 1;
                }
                w
            })
            .collect();
        if !self.workspaces.iter().any(|w| w.id == self.active_workspace) {
            self.active_workspace = self.workspaces.first().map(|w| w.id.clone()).unwrap_or_default();
        }
        // El Tico activo tiene que ser del espacio activo; y el espacio lo recuerda.
        let active_tico = self.active_tico.clone();
        if let Some(ws) = self.workspaces.iter_mut().find(|w| w.id == self.active_workspace) {
            if ws.ticos.contains(&active_tico) {
                ws.active_tico = active_tico;
            } else {
                self.active_tico = ws.active_tico.clone();
            }
        }
        self
    }

    /// El espacio activo (o uno general si, por lo que sea, no hay ninguno).
    pub fn workspace(&self) -> Workspace {
        self.workspaces
            .iter()
            .find(|w| w.id == self.active_workspace)
            .or_else(|| self.workspaces.first())
            .cloned()
            .unwrap_or_default()
    }

    /// Cambia al espacio `id` y a su último Tico.
    pub fn switch_workspace(&mut self, id: &str) {
        let Some(ws) = self.workspaces.iter().find(|w| w.id == id) else {
            return;
        };
        self.active_workspace = ws.id.clone();
        self.active_tico = ws.active_tico.clone();
    }

    /// El Tico con ese id, o el activo si no existe.
    pub fn tico(&self, id: &str) -> TicoProfile {
        self.ticos
            .iter()
            .find(|t| t.id == id)
            .or_else(|| self.ticos.iter().find(|t| t.id == self.active_tico))
            .or_else(|| self.ticos.first())
            .cloned()
            .unwrap_or_default()
    }

    /// Proveedor y modelo que usa un Tico (los suyos o los generales).
    pub fn provider_for(&self, tico: &TicoProfile) -> (ProviderKind, String) {
        let provider = tico.provider.unwrap_or(self.provider);
        let model = if tico.provider.is_some() && !tico.model.is_empty() {
            tico.model.clone()
        } else {
            self.models.get(provider).to_string()
        };
        (provider, model)
    }

    /// Lee un `settings.json` (versiones anteriores a la base de datos). Si no existe o está
    /// roto, usa los valores por defecto.
    pub fn load(path: &Path) -> Self {
        let settings = match fs::read_to_string(path) {
            Ok(text) => serde_json::from_str::<Settings>(&text).unwrap_or_else(|err| {
                eprintln!("Ajustes ilegibles ({err}); uso los valores por defecto");
                Settings::default()
            }),
            Err(_) => Settings::default(),
        };
        settings.sanitized()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn partial_json_fills_defaults() {
        let s: Settings = serde_json::from_str(r#"{"islandSize":"l"}"#).unwrap();
        assert_eq!(s.island_size, IslandSize::L);
        assert_eq!(s.activation_width, 400);
        assert_eq!(s.models.groq, ProviderModels::default().groq);
    }

    #[test]
    fn sanitize_fixes_bad_values() {
        let s = Settings {
            activation_width: 5,
            language: "fr".into(),
            ollama_url: "localhost".into(),
            custom_url: " https://ia.example.com/v1/ ".into(),
            models: ProviderModels {
                openai: "  ".into(),
                ..ProviderModels::default()
            },
            ..Settings::default()
        }
        .sanitized();
        assert_eq!(s.ollama_url, "http://localhost:11434");
        assert_eq!(s.custom_url, "https://ia.example.com/v1");
        assert_eq!(s.models.openai, "gpt-4.1-mini");
        assert_eq!(s.activation_width, 100);
        assert_eq!(s.language, "auto");
    }

    #[test]
    fn old_settings_are_migrated() {
        let s: Settings =
            serde_json::from_str(r##"{"robotBaseColor":"#112233","robotAccentColor":"#445566"}"##).unwrap();
        let s = s.sanitized();
        assert_eq!(s.ticos[0].base_color, "#112233");
        assert_eq!(s.ticos[0].accent_color, "#445566");
        assert_eq!(s.ticos.len(), default_ticos().len());
        // Ya no se vuelven a guardar.
        let json = serde_json::to_string(&s).unwrap();
        assert!(!json.contains("robotBaseColor"));
    }

    #[test]
    fn ticos_get_unique_ids_and_valid_values() {
        let bad = TicoProfile {
            id: "Mi Tico!".into(),
            name: "  ".into(),
            base_color: "rojo".into(),
            outfit: "sombrero-raro".into(),
            ..TicoProfile::default()
        };
        let s = Settings {
            ticos: vec![bad.clone(), bad],
            active_tico: "nadie".into(),
            ..Settings::default()
        }
        .sanitized();
        assert_eq!(s.ticos[0].id, "mi-tico");
        assert_eq!(s.ticos[1].id, "mi-tico-2");
        assert_eq!(s.ticos[0].name, "Tico");
        assert_eq!(s.ticos[0].base_color, "#F2F0EB");
        assert_eq!(s.ticos[0].outfit, "none");
        assert_eq!(s.active_tico, "mi-tico");
    }

    #[test]
    fn tico_provider_falls_back_to_general() {
        let s = Settings { provider: ProviderKind::Gemini, ..Settings::default() };
        let general = s.tico(&s.active_tico);
        assert_eq!(s.provider_for(&general), (ProviderKind::Gemini, "gemini-2.5-flash".into()));
        let own = TicoProfile {
            provider: Some(ProviderKind::Ollama),
            model: "qwen2.5vl".into(),
            ..TicoProfile::default()
        };
        assert_eq!(s.provider_for(&own), (ProviderKind::Ollama, "qwen2.5vl".into()));
        let own_default_model = TicoProfile { provider: Some(ProviderKind::Groq), ..TicoProfile::default() };
        assert_eq!(s.provider_for(&own_default_model).1, ProviderModels::default().groq);
    }

    #[test]
    fn old_settings_get_workspaces_with_their_ticos() {
        let own = TicoProfile { id: "mates".into(), name: "Mates".into(), ..TicoProfile::default() };
        let mut ticos = default_ticos();
        ticos.push(own);
        let json = serde_json::json!({ "ticos": ticos, "activeTico": "mates" }).to_string();
        let s: Settings = serde_json::from_str::<Settings>(&json).unwrap().sanitized();
        let general = &s.workspaces[0];
        assert_eq!(general.id, "general");
        assert!(general.ticos.contains(&"mates".to_string()));
        assert_eq!(s.active_workspace, "general");
        assert_eq!(s.active_tico, "mates");
        assert_eq!(general.active_tico, "mates");
        assert!(s.workspaces.iter().any(|w| w.id == "code"));
    }

    #[test]
    fn workspaces_are_sanitized() {
        let ws = Workspace {
            id: "Clase!".into(),
            name: "  Clase ".into(),
            icon: "no es un icono".into(),
            color: "azul".into(),
            ticos: vec!["nadie".into(), "teach".into(), "teach".into()],
            active_tico: "nadie".into(),
            apps: vec![" Word ".into(), "word".into(), "".into()],
            ..Workspace::default()
        };
        let s = Settings {
            workspaces: vec![ws.clone(), ws, Workspace { ticos: vec![], ..Workspace::default() }],
            active_workspace: "clase".into(),
            active_tico: "code".into(),
            ..Settings::default()
        }
        .sanitized();
        let first = &s.workspaces[0];
        assert_eq!(first.id, "clase");
        assert_eq!(s.workspaces[1].id, "clase-2");
        assert_eq!(first.name, "Clase");
        assert_eq!(first.icon, "🏠");
        assert_eq!(first.ticos, vec!["teach".to_string()]);
        assert_eq!(first.apps, vec!["Word".to_string()]);
        // Un espacio vacío se queda con el primer Tico.
        assert_eq!(s.workspaces[2].ticos, vec!["tico".to_string()]);
        // "code" no está en "clase": el Tico activo pasa a ser el del espacio.
        assert_eq!(s.active_tico, "teach");
    }

    #[test]
    fn switching_workspace_restores_its_tico() {
        let mut s = Settings::default().sanitized();
        s.switch_workspace("study");
        assert_eq!(s.active_workspace, "study");
        assert_eq!(s.active_tico, "teach");
        s.active_tico = "write".into();
        let mut s = s.sanitized();
        s.switch_workspace("general");
        assert_eq!(s.active_tico, "tico");
        s.switch_workspace("study");
        assert_eq!(s.active_tico, "write");
        s.switch_workspace("no-existe");
        assert_eq!(s.active_workspace, "study");
    }

    #[test]
    fn legacy_json_file_is_read() {
        let dir = std::env::temp_dir().join(format!("tico-test-{}", std::process::id()));
        fs::create_dir_all(&dir).unwrap();
        let path = dir.join("settings.json");
        fs::write(&path, r#"{"islandPosition":"right","activeTico":"code"}"#).unwrap();
        let s = Settings::load(&path);
        assert_eq!(s.island_position, IslandPosition::Right);
        assert_eq!(s.active_tico, "code");
        assert_eq!(Settings::load(&dir.join("no-existe.json")), Settings::default().sanitized());
        let _ = fs::remove_dir_all(dir);
    }
}

//! Ajustes de Tico: se guardan como JSON en la carpeta de configuración del sistema.

use std::fs;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use crate::error::AppResult;

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
        self
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

    /// Lee los ajustes. Si el archivo no existe o está roto, usa los valores por defecto.
    pub fn load(path: &Path) -> Self {
        match fs::read_to_string(path) {
            Ok(text) => match serde_json::from_str::<Settings>(&text) {
                Ok(settings) => settings.sanitized(),
                Err(err) => {
                    eprintln!("Ajustes ilegibles ({err}); uso los valores por defecto");
                    Settings::default()
                }
            },
            Err(_) => Settings::default(),
        }
    }

    /// Guarda de forma atómica: escribe un temporal y lo renombra.
    pub fn save(&self, path: &Path) -> AppResult<()> {
        if let Some(dir) = path.parent() {
            fs::create_dir_all(dir)?;
        }
        let tmp: PathBuf = path.with_extension("json.tmp");
        fs::write(&tmp, serde_json::to_vec_pretty(self)?)?;
        fs::rename(&tmp, path)?;
        Ok(())
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
    fn save_and_load_roundtrip() {
        let dir = std::env::temp_dir().join(format!("tico-test-{}", std::process::id()));
        let path = dir.join("settings.json");
        let original = Settings {
            island_position: IslandPosition::Right,
            ..Settings::default()
        };
        original.save(&path).unwrap();
        assert_eq!(Settings::load(&path), original);
        let _ = fs::remove_dir_all(dir);
    }
}

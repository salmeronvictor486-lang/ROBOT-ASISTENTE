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

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Settings {
    /// "auto", "es", "ca" o "en".
    pub language: String,
    /// "auto", "light" o "dark" (afecta al panel y a la ventana de ajustes).
    pub theme: String,
    pub robot_base_color: String,
    pub robot_accent_color: String,
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
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            language: "auto".into(),
            theme: "auto".into(),
            robot_base_color: "#F2F0EB".into(),
            robot_accent_color: "#3DD6D0".into(),
            island_size: IslandSize::M,
            island_position: IslandPosition::Center,
            activation_width: 400,
            show_delay_ms: 150,
            hide_delay_ms: 600,
            follow_cursor_monitor: true,
            hide_on_fullscreen: true,
            shortcut_open: "CommandOrControl+Shift+Space".into(),
            sounds: true,
        }
    }
}

fn is_hex_color(value: &str) -> bool {
    value.len() == 7
        && value.starts_with('#')
        && value[1..].chars().all(|c| c.is_ascii_hexdigit())
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
        if !is_hex_color(&self.robot_base_color) {
            self.robot_base_color = defaults.robot_base_color;
        }
        if !is_hex_color(&self.robot_accent_color) {
            self.robot_accent_color = defaults.robot_accent_color;
        }
        self.activation_width = self.activation_width.clamp(100, 2000);
        self.show_delay_ms = self.show_delay_ms.min(3000);
        self.hide_delay_ms = self.hide_delay_ms.clamp(100, 10_000);
        if self.shortcut_open.trim().is_empty() {
            self.shortcut_open = defaults.shortcut_open;
        }
        self
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
    }

    #[test]
    fn sanitize_fixes_bad_values() {
        let s = Settings {
            robot_base_color: "rojo".into(),
            activation_width: 5,
            language: "fr".into(),
            ..Settings::default()
        }
        .sanitized();
        assert_eq!(s.robot_base_color, "#F2F0EB");
        assert_eq!(s.activation_width, 100);
        assert_eq!(s.language, "auto");
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

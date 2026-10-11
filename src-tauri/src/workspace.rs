//! Espacios de trabajo: cambiar solo al espacio de la app que estás usando.

use std::thread;

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager};

use crate::capture::{active_window, contains_word};
use crate::island::{lock, ISLAND_LABEL};
use crate::settings::Workspace;
use crate::state::AppState;

/// El primer espacio que tiene una app que aparece en el nombre o el título de la ventana.
pub fn matching<'a>(workspaces: &'a [Workspace], app: &str, title: &str) -> Option<&'a Workspace> {
    workspaces
        .iter()
        .find(|w| w.apps.iter().any(|a| contains_word(app, a) || contains_word(title, a)))
}

#[derive(Clone, Serialize)]
struct SwitchedPayload {
    id: String,
    name: String,
    icon: String,
}

/// Al abrir la isla: si la app activa es de otro espacio, cambia a él (en otro hilo, porque
/// mirar las ventanas tarda un poco). Solo cambia cuando cambias de app: si después eliges
/// otro espacio a mano, se respeta.
pub fn auto_switch(app: &AppHandle) {
    let app = app.clone();
    let spawned = thread::Builder::new().name("tico-workspace".into()).spawn(move || {
        let state = app.state::<AppState>();
        {
            let settings = lock(&state.settings);
            if !settings.auto_workspace || settings.workspaces.iter().all(|w| w.apps.is_empty()) {
                return;
            }
        }
        let Some((app_name, title)) = active_window() else {
            return;
        };
        let updated = {
            let mut settings = lock(&state.settings);
            let Some(target) = matching(&settings.workspaces, &app_name, &title).cloned() else {
                return;
            };
            let seen = format!("{}\n{}", target.id, app_name);
            let mut last = lock(&state.last_auto_app);
            if last.as_deref() == Some(seen.as_str()) {
                return;
            }
            *last = Some(seen);
            if target.id == settings.active_workspace {
                return;
            }
            settings.switch_workspace(&target.id);
            if let Err(err) = state.save_settings(&settings) {
                eprintln!("No se pudo guardar el espacio: {err}");
            }
            (settings.clone(), target)
        };
        let (settings, target) = updated;
        let _ = app.emit("settings://changed", &settings);
        let _ = app.emit_to(
            ISLAND_LABEL,
            "island://workspace",
            SwitchedPayload { id: target.id, name: target.name, icon: target.icon },
        );
    });
    if let Err(err) = spawned {
        eprintln!("No se pudo mirar la app activa: {err}");
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn finds_workspace_by_app_or_title() {
        let ws = |id: &str, apps: &[&str]| Workspace {
            id: id.into(),
            apps: apps.iter().map(|a| (*a).to_string()).collect(),
            ..Workspace::default()
        };
        let list = vec![ws("general", &[]), ws("code", &["Visual Studio Code", "Terminal"]), ws("clase", &["Moodle", "Word"])];
        assert_eq!(matching(&list, "Code", "main.rs - tico - Visual Studio Code").map(|w| w.id.as_str()), Some("code"));
        assert_eq!(matching(&list, "chrome", "Aula virtual | Moodle - Google Chrome").map(|w| w.id.as_str()), Some("clase"));
        assert_eq!(matching(&list, "WINWORD", "tema1.docx - Word").map(|w| w.id.as_str()), Some("clase"));
        // "Word" no es "WordPress".
        assert!(matching(&list, "firefox", "Panel de WordPress").is_none());
        assert!(matching(&list, "Spotify", "Spotify Premium").is_none());
    }
}

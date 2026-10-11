//! ¿Hay una versión nueva de Tico? Se pregunta a GitHub por la última Release (solo se
//! descarga su número de versión; no se envía nada del usuario).

use serde::{Deserialize, Serialize};
use tauri::State;

use crate::error::AppResult;
use crate::island::lock;
use crate::state::AppState;

const LATEST: &str = "https://api.github.com/repos/salmeronvictor486-lang/ROBOT-ASISTENTE/releases/latest";

#[derive(Deserialize)]
struct Release {
    tag_name: String,
    html_url: String,
    #[serde(default)]
    draft: bool,
    #[serde(default)]
    prerelease: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateInfo {
    pub version: String,
    pub url: String,
}

/// "v1.2.0" → (1, 2, 0). Lo que no sea número cuenta como 0.
fn parse(version: &str) -> (u64, u64, u64) {
    let mut parts = version
        .trim()
        .trim_start_matches(['v', 'V'])
        .split(['.', '-', '+'])
        .map(|p| p.parse::<u64>().unwrap_or(0));
    (parts.next().unwrap_or(0), parts.next().unwrap_or(0), parts.next().unwrap_or(0))
}

/// ¿`candidate` es más nueva que `current`?
pub fn is_newer(candidate: &str, current: &str) -> bool {
    parse(candidate) > parse(current)
}

/// La versión nueva, si la hay (`None` si estás al día o el ajuste está apagado).
/// `force`: comprobar aunque el ajuste esté apagado ("Buscar ahora").
#[tauri::command]
pub async fn update_check(state: State<'_, AppState>, force: Option<bool>) -> AppResult<Option<UpdateInfo>> {
    if !force.unwrap_or(false) && !lock(&state.settings).check_updates {
        return Ok(None);
    }
    let release: Release = state
        .http
        .get(LATEST)
        .header("Accept", "application/vnd.github+json")
        .timeout(std::time::Duration::from_secs(10))
        .send()
        .await?
        .error_for_status()?
        .json()
        .await?;
    let current = env!("CARGO_PKG_VERSION");
    if release.draft || release.prerelease || !is_newer(&release.tag_name, current) {
        return Ok(None);
    }
    Ok(Some(UpdateInfo {
        version: release.tag_name.trim_start_matches(['v', 'V']).to_string(),
        url: release.html_url,
    }))
}

#[cfg(test)]
mod tests {
    use super::is_newer;

    #[test]
    fn compares_versions() {
        assert!(is_newer("v1.2.0", "1.1.0"));
        assert!(is_newer("1.10.0", "1.9.3"));
        assert!(is_newer("v2.0.0", "1.99.99"));
        assert!(!is_newer("v1.1.0", "1.1.0"));
        assert!(!is_newer("v1.0.9", "1.1.0"));
        assert!(!is_newer("basura", "1.1.0"));
    }
}

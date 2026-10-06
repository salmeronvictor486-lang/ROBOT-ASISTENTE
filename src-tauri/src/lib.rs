mod error;

use error::AppResult;

/// Comando de prueba de la Fase 0: confirma que el frontend llega a Rust.
#[tauri::command]
fn ping() -> AppResult<String> {
    Ok(format!("¡Hola desde Rust! Tico v{}", env!("CARGO_PKG_VERSION")))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let result = tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![ping])
        .run(tauri::generate_context!());

    if let Err(err) = result {
        eprintln!("Tico no ha podido arrancar: {err}");
        std::process::exit(1);
    }
}

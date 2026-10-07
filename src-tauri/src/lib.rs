mod ai;
mod capture;
mod chat;
mod commands;
mod error;
mod island;
mod platform;
mod secrets;
mod settings;
mod shortcuts;
mod state;
mod tray;

use tauri::Manager;

use island::ISLAND_LABEL;
use settings::Settings;
use state::AppState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    #[allow(unused_mut)]
    let mut builder = tauri::Builder::default()
        // Si se abre Tico dos veces, la segunda instancia solo despierta la isla.
        .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            island::open_from_shortcut(app, "open");
        }))
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ));

    #[cfg(target_os = "macos")]
    {
        builder = builder.plugin(tauri_nspanel::init());
    }

    let result = builder
        .setup(|app| {
            setup(app)?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::settings_get,
            commands::settings_update,
            commands::open_settings,
            commands::set_ui_language,
            island::island_set_rect,
            island::island_focus,
            island::island_info,
            chat::chat_send,
            chat::chat_cancel,
            chat::chat_clear,
            chat::ai_test_connection,
            chat::secret_set,
            chat::secret_delete,
            chat::secret_status,
            capture::capture_screen,
            capture::capture_discard,
            capture::open_screen_permission_settings,
        ])
        .run(tauri::generate_context!());

    if let Err(err) = result {
        eprintln!("Tico no ha podido arrancar: {err}");
        std::process::exit(1);
    }
}

fn setup(app: &mut tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    // En macOS, Tico vive en la barra de menús: sin icono en el Dock.
    #[cfg(target_os = "macos")]
    app.set_activation_policy(tauri::ActivationPolicy::Accessory);

    let settings_path = app.path().app_config_dir()?.join("settings.json");
    let settings = Settings::load(&settings_path);

    #[cfg(target_os = "macos")]
    let notch_width = platform::macos::notch_width();
    #[cfg(not(target_os = "macos"))]
    let notch_width = None;

    app.manage(AppState::new(settings.clone(), settings_path, notch_width));
    let handle = app.handle().clone();

    if let Some(window) = app.get_webview_window(ISLAND_LABEL) {
        // Oculta, la ventana deja pasar todos los clics.
        window.set_ignore_cursor_events(true)?;
        #[cfg(target_os = "macos")]
        platform::macos::setup_island_panel(&window)?;
    }
    if let Err(err) = island::place_for_cursor(&handle) {
        eprintln!("No se pudo colocar la isla: {err}");
    }
    if let Err(err) = shortcuts::register(&handle, &settings) {
        eprintln!("No se pudieron registrar los atajos: {err}");
    }
    let lang = if settings.language == "auto" { "es" } else { settings.language.as_str() };
    tray::create(&handle, lang)?;
    island::spawn_tracker(handle);
    Ok(())
}

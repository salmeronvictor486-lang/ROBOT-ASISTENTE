mod ai;
mod capture;
mod chat;
mod commands;
mod convert;
mod db;
mod error;
mod files;
mod island;
mod ocr;
mod pet;
mod platform;
mod secrets;
mod settings;
mod shortcuts;
mod state;
mod tray;
mod updates;
mod workspace;

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
        .plugin(tauri_plugin_dialog::init())
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
            commands::open_url,
            commands::db_info,
            commands::welcome_finish,
            updates::update_check,
            commands::db_backup,
            island::island_set_rect,
            island::island_focus,
            island::island_info,
            chat::chat_send,
            chat::chat_cancel,
            chat::chat_clear,
            chat::chat_history,
            chat::chat_forget_last,
            chat::history_clear_all,
            chat::ai_test_connection,
            chat::secret_set,
            chat::secret_delete,
            chat::secret_status,
            capture::capture_screen,
            capture::capture_discard,
            capture::open_screen_permission_settings,
            files::files_inspect,
            files::files_pick,
            files::file_open,
            files::file_reveal,
            files::file_thumbnail,
            files::folder_pick,
            files::workspace_files,
            convert::convert_to_pdf,
            convert::conversions_recent,
            convert::conversions_clear,
            pet::pet_open_island,
            pet::pet_hide,
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

    // Todo se guarda en una base de datos SQLite local. La primera vez se traen los ajustes
    // del settings.json de las versiones anteriores (que se queda como copia).
    let db = db::Db::open(&app.path().app_data_dir()?.join("tico.db"))?;
    let settings = match db.load_settings() {
        Some(saved) => saved.sanitized(),
        None => {
            let legacy = app.path().app_config_dir()?.join("settings.json");
            let mut settings = Settings::load(&legacy);
            // Quien viene de una versión anterior ya conoce Tico: sin bienvenida.
            settings.onboarded = legacy.exists();
            if let Err(err) = db.save_settings(&settings) {
                eprintln!("No se pudieron guardar los ajustes: {err}");
            } else if legacy.exists() {
                let _ = std::fs::rename(&legacy, legacy.with_extension("json.bak"));
            }
            settings
        }
    };

    #[cfg(target_os = "macos")]
    let notch_screens = platform::macos::notch_screens();
    #[cfg(not(target_os = "macos"))]
    let notch_screens = Vec::new();

    app.manage(AppState::new(settings.clone(), db, notch_screens));
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
    if settings.desktop_tico {
        if let Err(err) = pet::sync(&handle, true) {
            eprintln!("No se pudo poner a Tico en el escritorio: {err}");
        }
    }
    if !settings.onboarded {
        if let Err(err) = commands::show_welcome(&handle) {
            eprintln!("No se pudo abrir la bienvenida: {err}");
        }
    }
    island::spawn_tracker(handle);
    Ok(())
}

// Evita que se abra una consola extra en Windows en las builds de release.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    // En Linux con Wayland una ventana no puede colocarse sola ni quedarse por encima de
    // todo: la isla va por XWayland (X11), que sí lo permite. Si ya viene elegido, se respeta.
    #[cfg(target_os = "linux")]
    if std::env::var_os("GDK_BACKEND").is_none() && std::env::var_os("WAYLAND_DISPLAY").is_some() {
        std::env::set_var("GDK_BACKEND", "x11");
    }
    tico_lib::run();
}

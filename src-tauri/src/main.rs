// Prevents additional console window on Windows in release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    // WebKitGTK >= 2.46 crashes at startup on some Wayland compositors
    // ("Error 71 (Protocol error) dispatching to Wayland display") unless its
    // DMABUF renderer is disabled. Only set it when the user hasn't already.
    #[cfg(target_os = "linux")]
    if std::env::var_os("WAYLAND_DISPLAY").is_some()
        && std::env::var_os("WEBKIT_DISABLE_DMABUF_RENDERER").is_none()
    {
        // SAFETY: before GTK/WebKit init spawned threads
        unsafe {
            std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1");
        }
    }

    leafforge_lib::run();
}

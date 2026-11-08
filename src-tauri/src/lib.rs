pub mod commands;
pub mod error;
pub mod services;
pub mod state;

use commands::auth_cmds::{
    get_github_auth_status, get_github_user_profile, get_or_create_room_key, logout_github,
    poll_github_device_token, start_github_device_flow, verify_repo_collaborator,
};
use commands::compiler_cmds::{
    abort_compilation, clean_aux_files, compile_document, detect_engines, parse_magic_comments,
};
use commands::font_cmds::{list_font_families, list_system_fonts};
use commands::fs_cmds::{
    create_dir, create_file, delete_path, import_binary_asset, list_files, open_folder,
    read_file_text, rename_path, unwatch_directory, watch_directory, write_file_text,
};
use commands::lsp_cmds::{
    lsp_completion, lsp_did_change, lsp_did_open, lsp_hover, lsp_start, lsp_status, lsp_stop,
};
use commands::synctex_cmds::{synctex_forward, synctex_inverse};
use state::AppState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(AppState::default())
        .invoke_handler(tauri::generate_handler![
            open_folder,
            list_files,
            read_file_text,
            write_file_text,
            create_file,
            create_dir,
            rename_path,
            delete_path,
            import_binary_asset,
            watch_directory,
            unwatch_directory,
            lsp_start,
            lsp_stop,
            lsp_status,
            lsp_did_open,
            lsp_did_change,
            lsp_completion,
            lsp_hover,
            compile_document,
            detect_engines,
            abort_compilation,
            clean_aux_files,
            parse_magic_comments,
            synctex_forward,
            synctex_inverse,
            list_system_fonts,
            list_font_families,
            start_github_device_flow,
            poll_github_device_token,
            get_github_auth_status,
            get_github_user_profile,
            logout_github,
            verify_repo_collaborator,
            get_or_create_room_key,
        ])
        .run(tauri::generate_context!())
        .expect("error while running leafforge application");
}

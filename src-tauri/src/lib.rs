pub mod commands;
pub mod error;
pub mod state;

use commands::fs_cmds::{
    create_dir, create_file, delete_path, import_binary_asset, list_files, open_folder,
    read_file_text, rename_path, write_file_text,
};
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
        ])
        .run(tauri::generate_context!())
        .expect("error while running leafforge application");
}

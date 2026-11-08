use crate::error::Result;
use crate::services::app_logger::LogEntry;
use crate::state::AppState;
use tauri::{AppHandle, State};

#[tauri::command]
pub async fn write_log_entry(
    state: State<'_, AppState>,
    level: String,
    target: String,
    message: String,
    details: Option<String>,
) -> Result<()> {
    state
        .app_logger
        .log(&level, &target, &message, details.as_deref());
    Ok(())
}

#[tauri::command]
pub async fn get_recent_logs(
    state: State<'_, AppState>,
    limit: Option<usize>,
) -> Result<Vec<LogEntry>> {
    Ok(state.app_logger.get_entries(limit))
}

#[tauri::command]
pub async fn get_log_file_path(state: State<'_, AppState>) -> Result<String> {
    Ok(state
        .app_logger
        .get_log_file_path()
        .to_string_lossy()
        .to_string())
}

#[tauri::command]
pub async fn clear_app_logs(state: State<'_, AppState>) -> Result<()> {
    state.app_logger.clear()
}

#[tauri::command]
pub async fn open_log_file(app: AppHandle, state: State<'_, AppState>) -> Result<()> {
    let path = crate::services::clean_path(state.app_logger.get_log_file_path());
    if !path.exists() {
        let _ = std::fs::File::create(&path);
    }
    use tauri_plugin_opener::OpenerExt;
    let path_str = path.to_string_lossy().to_string();
    let _ = app.opener().open_path(&path_str, None::<&str>);
    Ok(())
}

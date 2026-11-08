use crate::error::{AppError, Result};
use crate::services::synctex_parser::{
    load_synctex_file, resolve_synctex_path, SyncTexCoordinate, SyncTexInverseResult,
};
use std::path::PathBuf;

#[tauri::command]
pub async fn synctex_forward(
    project_dir: String,
    root_file: String,
    file: String,
    line: u32,
    column: u32,
) -> Result<Option<SyncTexCoordinate>> {
    let p_dir = PathBuf::from(&project_dir);
    if !p_dir.exists() {
        return Err(AppError::NotFound(project_dir));
    }

    let synctex_path = resolve_synctex_path(&p_dir, &root_file).ok_or_else(|| {
        AppError::SyncTex(format!("No .synctex.gz or .synctex file found for {root_file}"))
    })?;

    let synctex_data = tokio::task::spawn_blocking(move || load_synctex_file(&synctex_path))
        .await
        .map_err(|e| AppError::Internal(format!("SyncTeX task panicked: {e}")))?;

    Ok(synctex_data?.forward_search(&file, line, column))
}

#[tauri::command]
pub async fn synctex_inverse(
    project_dir: String,
    root_file: String,
    page: u32,
    x: f64,
    y: f64,
) -> Result<Option<SyncTexInverseResult>> {
    let p_dir = PathBuf::from(&project_dir);
    if !p_dir.exists() {
        return Err(AppError::NotFound(project_dir));
    }

    let synctex_path = resolve_synctex_path(&p_dir, &root_file).ok_or_else(|| {
        AppError::SyncTex(format!("No .synctex.gz or .synctex file found for {root_file}"))
    })?;

    let synctex_data = tokio::task::spawn_blocking(move || load_synctex_file(&synctex_path))
        .await
        .map_err(|e| AppError::Internal(format!("SyncTeX task panicked: {e}")))?;

    Ok(synctex_data?.inverse_search(page, x, y))
}

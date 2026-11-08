use crate::error::Result;
use crate::services::lsp_supervisor::{CompletionItem, HoverResponse, LspStatusResponse};
use crate::state::AppState;
use std::path::PathBuf;
use tauri::State;

#[tauri::command]
pub async fn lsp_start(
    state: State<'_, AppState>,
    root_path: Option<String>,
) -> Result<LspStatusResponse> {
    let mut supervisor = state.lsp_supervisor.lock().await;
    let path = root_path.map(PathBuf::from);
    supervisor.start(path).await
}

#[tauri::command]
pub async fn lsp_stop(state: State<'_, AppState>) -> Result<()> {
    let mut supervisor = state.lsp_supervisor.lock().await;
    supervisor.stop().await
}

#[tauri::command]
pub async fn lsp_status(state: State<'_, AppState>) -> Result<LspStatusResponse> {
    let supervisor = state.lsp_supervisor.lock().await;
    Ok(supervisor.status())
}

#[tauri::command]
pub async fn lsp_did_open(
    state: State<'_, AppState>,
    uri: String,
    text: String,
    version: i32,
) -> Result<()> {
    let mut supervisor = state.lsp_supervisor.lock().await;
    supervisor.did_open(&uri, &text, version).await
}

#[tauri::command]
pub async fn lsp_did_change(
    state: State<'_, AppState>,
    uri: String,
    text: String,
    version: i32,
) -> Result<()> {
    let mut supervisor = state.lsp_supervisor.lock().await;
    supervisor.did_change(&uri, &text, version).await
}

#[tauri::command]
pub async fn lsp_completion(
    state: State<'_, AppState>,
    uri: String,
    line: u32,
    character: u32,
) -> Result<Vec<CompletionItem>> {
    let supervisor = state.lsp_supervisor.lock().await;
    supervisor.completion(&uri, line, character).await
}

#[tauri::command]
pub async fn lsp_hover(
    state: State<'_, AppState>,
    uri: String,
    line: u32,
    character: u32,
) -> Result<Option<HoverResponse>> {
    let supervisor = state.lsp_supervisor.lock().await;
    supervisor.hover(&uri, line, character).await
}

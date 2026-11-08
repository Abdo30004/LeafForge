use crate::error::{AppError, Result};
use crate::services::compiler_pipeline::{
    CompilationConfig, DEFAULT_COMPILE_TIMEOUT_SECS, EngineInfo, LatexEngine, MagicComments,
    clean_auxiliary_files, detect_all_engines, execute_compilation,
    parse_magic_comments_from_content,
};
use crate::services::log_parser::{LatexDiagnostic, parse_latex_log};
use crate::state::AppState;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::time::Duration;
use tauri::State;
use tokio::sync::oneshot;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CompilationResult {
    pub success: bool,
    pub engine: String,
    pub duration_ms: u64,
    pub pdf_path: Option<String>,
    pub synctex_path: Option<String>,
    pub diagnostics: Vec<LatexDiagnostic>,
    pub log_output: String,
}

#[tauri::command]
pub async fn detect_engines() -> Result<Vec<EngineInfo>> {
    Ok(detect_all_engines().await)
}

#[tauri::command]
pub async fn parse_magic_comments(file_path: String) -> Result<MagicComments> {
    let path = PathBuf::from(&file_path);
    if !path.exists() {
        return Err(AppError::NotFound(file_path));
    }
    let content = tokio::fs::read_to_string(&path)
        .await
        .map_err(AppError::Io)?;
    Ok(parse_magic_comments_from_content(&content))
}

#[tauri::command]
pub async fn abort_compilation(state: State<'_, AppState>) -> Result<bool> {
    let mut abort_lock = state.active_compile_abort.lock().await;
    if let Some(sender) = abort_lock.take() {
        let _ = sender.send(());
        Ok(true)
    } else {
        Ok(false)
    }
}

#[tauri::command]
pub async fn clean_aux_files(project_dir: String, root_file: String) -> Result<Vec<String>> {
    let p_dir = PathBuf::from(&project_dir);
    if !p_dir.exists() {
        return Err(AppError::NotFound(project_dir));
    }
    clean_auxiliary_files(&p_dir, &root_file)
}

#[tauri::command]
pub async fn compile_document(
    project_dir: String,
    root_file: String,
    engine_override: Option<LatexEngine>,
    use_preamble_cache: Option<bool>,
    state: State<'_, AppState>,
) -> Result<CompilationResult> {
    let p_dir = PathBuf::from(&project_dir);
    if !p_dir.exists() {
        return Err(AppError::NotFound(project_dir));
    }

    let root_path = p_dir.join(&root_file);
    if !root_path.exists() {
        return Err(AppError::NotFound(root_path.to_string_lossy().to_string()));
    }

    // Determine engine: override > magic comment > tectonic
    let file_content = tokio::fs::read_to_string(&root_path)
        .await
        .unwrap_or_default();
    let magic = parse_magic_comments_from_content(&file_content);

    let active_engine = engine_override
        .or(magic.program)
        .unwrap_or(LatexEngine::Tectonic);

    // Abort previous in-flight compile if any
    {
        let mut abort_lock = state.active_compile_abort.lock().await;
        if let Some(prev) = abort_lock.take() {
            let _ = prev.send(());
        }
    }

    // Register new cancellation channel
    let (abort_tx, abort_rx) = oneshot::channel();
    {
        let mut abort_lock = state.active_compile_abort.lock().await;
        *abort_lock = Some(abort_tx);
    }

    let config = CompilationConfig {
        project_dir: p_dir.clone(),
        root_file: root_file.clone(),
        engine: active_engine,
        use_preamble_cache: use_preamble_cache.unwrap_or(true),
        timeout_duration: Duration::from_secs(DEFAULT_COMPILE_TIMEOUT_SECS),
    };

    let compile_res = execute_compilation(config, abort_rx).await;

    // Clear abort sender once finished
    {
        let mut abort_lock = state.active_compile_abort.lock().await;
        *abort_lock = None;
    }

    match compile_res {
        Ok((exit_code, log_output, pdf_path, synctex_path, duration)) => {
            let diagnostics = parse_latex_log(&log_output, &root_file, Some(&p_dir));
            let has_errors = exit_code != 0
                || diagnostics
                    .iter()
                    .any(|d| d.severity == crate::services::log_parser::DiagnosticSeverity::Error);
            let pdf_str = if pdf_path.exists() {
                Some(pdf_path.to_string_lossy().to_string())
            } else {
                None
            };
            let synctex_str = synctex_path.map(|p| p.to_string_lossy().to_string());

            Ok(CompilationResult {
                success: !has_errors,
                engine: active_engine.as_str().to_string(),
                duration_ms: duration.as_millis() as u64,
                pdf_path: pdf_str,
                synctex_path: synctex_str,
                diagnostics,
                log_output,
            })
        }
        Err(err) => Err(err),
    }
}

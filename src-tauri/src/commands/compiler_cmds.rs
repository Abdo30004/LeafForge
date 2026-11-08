use crate::error::{AppError, Result};
use crate::services::compiler_pipeline::{
    CompilationConfig, EngineInfo, LatexEngine, MagicComments, clean_auxiliary_files,
    detect_all_engines, execute_compilation, parse_magic_comments_from_content,
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
    let p_dir = crate::services::clean_path(PathBuf::from(&project_dir));
    let clean_root = crate::services::clean_path(PathBuf::from(&root_file))
        .to_string_lossy()
        .to_string();
    if !p_dir.exists() {
        return Err(AppError::NotFound(project_dir));
    }
    clean_auxiliary_files(&p_dir, &clean_root)
}

#[tauri::command]
pub async fn compile_document(
    project_dir: String,
    root_file: String,
    engine_override: Option<LatexEngine>,
    use_preamble_cache: Option<bool>,
    timeout_secs: Option<u64>,
    quality: Option<String>,
    state: State<'_, AppState>,
) -> Result<CompilationResult> {
    let p_dir = crate::services::clean_path(PathBuf::from(&project_dir));
    let clean_root = crate::services::clean_path(PathBuf::from(&root_file))
        .to_string_lossy()
        .to_string();
    if !p_dir.exists() {
        return Err(AppError::NotFound(project_dir));
    }

    let root_path = p_dir.join(&root_file);
    if !root_path.exists() {
        return Err(AppError::NotFound(root_path.to_string_lossy().to_string()));
    }

    // Determine engine: override > magic comment > settings > tectonic
    let file_content = tokio::fs::read_to_string(&root_path)
        .await
        .unwrap_or_default();
    let magic = parse_magic_comments_from_content(&file_content);

    let project_settings =
        crate::services::settings_engine::SettingsEngine::load_project_settings(&p_dir);
    let global_settings = crate::services::settings_engine::SettingsEngine::load_global_settings();

    let settings_engine = project_settings
        .engine
        .as_deref()
        .and_then(LatexEngine::from_str_name)
        .or_else(|| LatexEngine::from_str_name(&global_settings.default_engine));

    let active_engine = engine_override
        .or(magic.program)
        .or(settings_engine)
        .unwrap_or(LatexEngine::Tectonic);

    let effective_timeout = timeout_secs
        .or(project_settings.compile_timeout_secs)
        .unwrap_or(global_settings.compile_timeout_secs)
        .max(10);

    let effective_quality = quality
        .or(project_settings.compile_quality)
        .unwrap_or(global_settings.compile_quality);

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

    state.app_logger.info(
        "Compiler",
        &format!(
            "Starting build for {root_file} with engine {} (timeout: {}s, quality: {})",
            active_engine.display_name(),
            effective_timeout,
            effective_quality
        ),
        None,
    );

    let config = CompilationConfig {
        project_dir: p_dir.clone(),
        root_file: clean_root.clone(),
        engine: active_engine,
        use_preamble_cache: use_preamble_cache.unwrap_or(true),
        timeout_duration: Duration::from_secs(effective_timeout),
        quality: effective_quality,
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

            let dur_ms = duration.as_millis() as u64;
            if has_errors {
                state.app_logger.warn(
                    "Compiler",
                    &format!("Compilation finished with errors/warnings ({dur_ms}ms)"),
                    Some(&format!(
                        "Exit code: {exit_code}, diagnostic count: {}",
                        diagnostics.len()
                    )),
                );
            } else {
                state.app_logger.info(
                    "Compiler",
                    &format!("Compilation completed cleanly in {dur_ms}ms"),
                    None,
                );
            }

            Ok(CompilationResult {
                success: !has_errors,
                engine: active_engine.as_str().to_string(),
                duration_ms: dur_ms,
                pdf_path: pdf_str,
                synctex_path: synctex_str,
                diagnostics,
                log_output,
            })
        }
        Err(err) => {
            state.app_logger.error(
                "Compiler",
                &format!("Compilation pipeline error for {root_file}: {err}"),
                Some(&format!("{err:?}")),
            );
            Err(err)
        }
    }
}

use crate::error::{AppError, Result};
use crate::services::git_engine::{GitEngine, GitRepoStatus, PullResult, ReconcileResult};
use std::path::PathBuf;

#[tauri::command]
pub async fn git_init(project_dir: String) -> Result<()> {
    tokio::task::spawn_blocking(move || {
        let path = PathBuf::from(&project_dir);
        GitEngine::init(&path).map(|_| ())
    })
    .await
    .map_err(|e| AppError::Internal(format!("Spawn blocking failed: {e}")))?
}

#[tauri::command]
pub async fn git_status(project_dir: String) -> Result<GitRepoStatus> {
    tokio::task::spawn_blocking(move || {
        let path = PathBuf::from(&project_dir);
        GitEngine::get_status(&path)
    })
    .await
    .map_err(|e| AppError::Internal(format!("Spawn blocking failed: {e}")))?
}

#[tauri::command]
pub async fn git_diff(
    project_dir: String,
    file_path: Option<String>,
    staged: bool,
) -> Result<String> {
    tokio::task::spawn_blocking(move || {
        let path = PathBuf::from(&project_dir);
        GitEngine::get_diff(&path, file_path.as_deref(), staged)
    })
    .await
    .map_err(|e| AppError::Internal(format!("Spawn blocking failed: {e}")))?
}

#[tauri::command]
pub async fn git_stage(project_dir: String, file_path: String) -> Result<()> {
    tokio::task::spawn_blocking(move || {
        let path = PathBuf::from(&project_dir);
        GitEngine::stage_file(&path, &file_path)
    })
    .await
    .map_err(|e| AppError::Internal(format!("Spawn blocking failed: {e}")))?
}

#[tauri::command]
pub async fn git_unstage(project_dir: String, file_path: String) -> Result<()> {
    tokio::task::spawn_blocking(move || {
        let path = PathBuf::from(&project_dir);
        GitEngine::unstage_file(&path, &file_path)
    })
    .await
    .map_err(|e| AppError::Internal(format!("Spawn blocking failed: {e}")))?
}

#[tauri::command]
pub async fn git_stage_all(project_dir: String) -> Result<()> {
    tokio::task::spawn_blocking(move || {
        let path = PathBuf::from(&project_dir);
        GitEngine::stage_all(&path)
    })
    .await
    .map_err(|e| AppError::Internal(format!("Spawn blocking failed: {e}")))?
}

#[tauri::command]
pub async fn git_unstage_all(project_dir: String) -> Result<()> {
    tokio::task::spawn_blocking(move || {
        let path = PathBuf::from(&project_dir);
        GitEngine::unstage_all(&path)
    })
    .await
    .map_err(|e| AppError::Internal(format!("Spawn blocking failed: {e}")))?
}

#[tauri::command]
pub async fn git_commit(
    project_dir: String,
    message: String,
    author_name: Option<String>,
    author_email: Option<String>,
) -> Result<String> {
    tokio::task::spawn_blocking(move || {
        let path = PathBuf::from(&project_dir);
        GitEngine::commit(
            &path,
            &message,
            author_name.as_deref(),
            author_email.as_deref(),
        )
    })
    .await
    .map_err(|e| AppError::Internal(format!("Spawn blocking failed: {e}")))?
}

#[tauri::command]
pub async fn git_clone(url: String, target_path: String, branch: Option<String>) -> Result<()> {
    tokio::task::spawn_blocking(move || {
        let path = PathBuf::from(&target_path);
        GitEngine::clone_repo(&url, &path, branch.as_deref())
    })
    .await
    .map_err(|e| AppError::Internal(format!("Spawn blocking failed: {e}")))?
}

#[tauri::command]
pub async fn git_push(
    project_dir: String,
    remote_name: Option<String>,
    branch: Option<String>,
) -> Result<()> {
    tokio::task::spawn_blocking(move || {
        let path = PathBuf::from(&project_dir);
        GitEngine::push(&path, remote_name.as_deref(), branch.as_deref())
    })
    .await
    .map_err(|e| AppError::Internal(format!("Spawn blocking failed: {e}")))?
}

#[tauri::command]
pub async fn git_pull(
    project_dir: String,
    remote_name: Option<String>,
    branch: Option<String>,
) -> Result<PullResult> {
    tokio::task::spawn_blocking(move || {
        let path = PathBuf::from(&project_dir);
        GitEngine::pull(&path, remote_name.as_deref(), branch.as_deref())
    })
    .await
    .map_err(|e| AppError::Internal(format!("Spawn blocking failed: {e}")))?
}

#[tauri::command]
pub async fn git_list_branches(project_dir: String) -> Result<Vec<String>> {
    tokio::task::spawn_blocking(move || {
        let path = PathBuf::from(&project_dir);
        GitEngine::list_branches(&path)
    })
    .await
    .map_err(|e| AppError::Internal(format!("Spawn blocking failed: {e}")))?
}

#[tauri::command]
pub async fn git_checkout_branch(
    project_dir: String,
    branch_name: String,
    create: bool,
) -> Result<()> {
    tokio::task::spawn_blocking(move || {
        let path = PathBuf::from(&project_dir);
        GitEngine::checkout_branch(&path, &branch_name, create)
    })
    .await
    .map_err(|e| AppError::Internal(format!("Spawn blocking failed: {e}")))?
}

#[tauri::command]
pub async fn git_reconcile_3way(
    base: String,
    crdt: String,
    remote: String,
) -> Result<ReconcileResult> {
    tokio::task::spawn_blocking(move || GitEngine::reconcile_3way(&base, &crdt, &remote))
        .await
        .map_err(|e| AppError::Internal(format!("Spawn blocking failed: {e}")))?
}

#[tauri::command]
pub async fn git_get_remote_url(
    project_dir: String,
    remote_name: Option<String>,
) -> Result<Option<String>> {
    tokio::task::spawn_blocking(move || {
        let path = PathBuf::from(&project_dir);
        GitEngine::get_remote_url(&path, remote_name.as_deref())
    })
    .await
    .map_err(|e| AppError::Internal(format!("Spawn blocking failed: {e}")))?
}

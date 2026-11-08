use crate::error::{AppError, Result};
use crate::services::github_auth::{
    AuthStatusResponse, CollaboratorPermission, DeviceCodeResponse, GithubAuthService,
    GithubUserProfile, PollTokenResponse, DEFAULT_CLIENT_ID,
};
use std::path::PathBuf;

#[tauri::command]
pub async fn start_github_device_flow(client_id: Option<String>) -> Result<DeviceCodeResponse> {
    let cid = client_id.unwrap_or_else(|| DEFAULT_CLIENT_ID.to_string());
    GithubAuthService::start_device_flow(&cid).await
}

#[tauri::command]
pub async fn poll_github_device_token(
    client_id: Option<String>,
    device_code: String,
) -> Result<PollTokenResponse> {
    let cid = client_id.unwrap_or_else(|| DEFAULT_CLIENT_ID.to_string());
    GithubAuthService::poll_token(&cid, &device_code).await
}

#[tauri::command]
pub async fn get_github_auth_status() -> Result<AuthStatusResponse> {
    let token = GithubAuthService::get_token()?;
    match token {
        Some(t) => match GithubAuthService::fetch_profile(&t).await {
            Ok(profile) => Ok(AuthStatusResponse {
                authenticated: true,
                profile: Some(profile),
            }),
            Err(_) => {
                // Token might be revoked or expired
                Ok(AuthStatusResponse {
                    authenticated: false,
                    profile: None,
                })
            }
        },
        None => Ok(AuthStatusResponse {
            authenticated: false,
            profile: None,
        }),
    }
}

#[tauri::command]
pub async fn get_github_user_profile() -> Result<Option<GithubUserProfile>> {
    let token = GithubAuthService::get_token()?;
    match token {
        Some(t) => {
            let profile = GithubAuthService::fetch_profile(&t).await?;
            Ok(Some(profile))
        }
        None => Ok(None),
    }
}

#[tauri::command]
pub async fn logout_github() -> Result<()> {
    GithubAuthService::delete_token()
}

#[tauri::command]
pub async fn verify_repo_collaborator(
    owner: String,
    repo: String,
    username: String,
) -> Result<CollaboratorPermission> {
    let token = GithubAuthService::get_token()?.ok_or_else(|| {
        AppError::Auth("No GitHub token stored in keychain. Please sign in first.".into())
    })?;
    GithubAuthService::verify_collaborator(&token, &owner, &repo, &username).await
}

#[tauri::command]
pub async fn get_or_create_room_key(project_dir: String) -> Result<String> {
    tokio::task::spawn_blocking(move || {
        let root = PathBuf::from(&project_dir);
        let texflow_dir = root.join(".texflow");
        if !texflow_dir.exists() {
            std::fs::create_dir_all(&texflow_dir).map_err(|e| {
                AppError::Io(std::io::Error::new(
                    e.kind(),
                    format!("Failed to create .texflow directory: {e}"),
                ))
            })?;
        }

        let key_file = texflow_dir.join("room.key");
        if key_file.exists() {
            let key = std::fs::read_to_string(&key_file).map_err(|e| {
                AppError::Io(std::io::Error::new(
                    e.kind(),
                    format!("Failed to read room.key: {e}"),
                ))
            })?;
            let trimmed = key.trim().to_string();
            if !trimmed.is_empty() {
                return Ok(trimmed);
            }
        }

        // Generate 32-byte cryptographically secure random key
        let mut key_bytes = [0u8; 32];
        getrandom::getrandom(&mut key_bytes).map_err(|e| {
            AppError::Internal(format!("Failed to generate secure random key: {e}"))
        })?;

        let hex_key = blake3::hash(&key_bytes).to_hex().to_string();
        std::fs::write(&key_file, &hex_key).map_err(|e| {
            AppError::Io(std::io::Error::new(
                e.kind(),
                format!("Failed to write room.key: {e}"),
            ))
        })?;

        Ok(hex_key)
    })
    .await
    .map_err(|e| AppError::Internal(format!("Spawn blocking task failed: {e}")))?
}

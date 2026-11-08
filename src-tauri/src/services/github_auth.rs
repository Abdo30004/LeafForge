use crate::error::{AppError, Result};
use reqwest::header::{ACCEPT, AUTHORIZATION, USER_AGENT};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;

pub const KEYRING_SERVICE: &str = "com.leafforge.desktop";
pub const KEYRING_USER: &str = "github_oauth_token";
pub const DEFAULT_CLIENT_ID: &str = "Ov23liBewGCwm3CNT7VH";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeviceCodeResponse {
    pub device_code: String,
    pub user_code: String,
    pub verification_uri: String,
    pub expires_in: u64,
    pub interval: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PollTokenResponse {
    pub status: String, // "success" | "pending" | "slow_down" | "expired" | "denied" | "error"
    pub access_token: Option<String>,
    pub profile: Option<GithubUserProfile>,
    pub error: Option<String>,
    pub error_description: Option<String>,
    pub interval: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GithubUserProfile {
    pub username: String,
    pub name: Option<String>,
    pub avatar_url: String,
    pub email: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CollaboratorPermission {
    pub permission: String, // "admin" | "write" | "read" | "none"
    pub can_write: bool,
    pub can_read: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GithubRepoSummary {
    pub id: u64,
    pub name: String,
    pub full_name: String,
    pub private: bool,
    pub html_url: String,
    pub clone_url: String,
    pub default_branch: Option<String>,
    pub description: Option<String>,
    pub updated_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AuthStatusResponse {
    pub authenticated: bool,
    pub profile: Option<GithubUserProfile>,
}

#[derive(Debug, Deserialize)]
struct RawRepoResponse {
    id: u64,
    name: String,
    full_name: String,
    #[serde(default)]
    private: bool,
    html_url: String,
    clone_url: String,
    #[serde(default)]
    default_branch: Option<String>,
    #[serde(default)]
    description: Option<String>,
    #[serde(default)]
    updated_at: Option<String>,
}

#[derive(Debug, Deserialize)]
struct RawDeviceCodeResponse {
    device_code: String,
    user_code: String,
    verification_uri: String,
    expires_in: u64,
    interval: u64,
}

#[derive(Debug, Deserialize)]
#[allow(dead_code)]
struct RawTokenResponse {
    access_token: Option<String>,
    token_type: Option<String>,
    scope: Option<String>,
    error: Option<String>,
    error_description: Option<String>,
    interval: Option<u64>,
}

#[derive(Debug, Deserialize)]
struct RawUserProfile {
    login: String,
    #[serde(default)]
    name: Option<String>,
    #[serde(default)]
    avatar_url: Option<String>,
    #[serde(default)]
    email: Option<String>,
}

#[derive(Debug, Deserialize)]
struct RawCollaboratorResponse {
    permission: Option<String>,
}

pub struct GithubAuthService;

impl GithubAuthService {
    fn get_fallback_token_path() -> PathBuf {
        let base = if cfg!(windows) {
            std::env::var("LOCALAPPDATA")
                .map(PathBuf::from)
                .unwrap_or_else(|_| std::env::temp_dir())
                .join("LeafForge")
        } else if let Ok(home) = std::env::var("HOME") {
            PathBuf::from(home)
                .join(".local")
                .join("share")
                .join("LeafForge")
        } else {
            std::env::temp_dir().join("LeafForge")
        };
        let _ = std::fs::create_dir_all(&base);
        base.join(".auth_token")
    }

    fn get_fallback_profile_path() -> PathBuf {
        let base = if cfg!(windows) {
            std::env::var("LOCALAPPDATA")
                .map(PathBuf::from)
                .unwrap_or_else(|_| std::env::temp_dir())
                .join("LeafForge")
        } else if let Ok(home) = std::env::var("HOME") {
            PathBuf::from(home)
                .join(".local")
                .join("share")
                .join("LeafForge")
        } else {
            std::env::temp_dir().join("LeafForge")
        };
        let _ = std::fs::create_dir_all(&base);
        base.join("profile.json")
    }

    /// Save cached user profile
    pub fn save_profile(profile: &GithubUserProfile) -> Result<()> {
        let path = Self::get_fallback_profile_path();
        if let Ok(json) = serde_json::to_string_pretty(profile) {
            let _ = std::fs::write(&path, json);
        }
        Ok(())
    }

    /// Retrieve cached user profile
    pub fn get_cached_profile() -> Result<Option<GithubUserProfile>> {
        let path = Self::get_fallback_profile_path();
        if path.exists()
            && let Ok(content) = std::fs::read_to_string(&path)
            && let Ok(profile) = serde_json::from_str::<GithubUserProfile>(&content)
        {
            return Ok(Some(profile));
        }
        Ok(None)
    }

    /// Delete cached user profile
    pub fn delete_profile() -> Result<()> {
        let path = Self::get_fallback_profile_path();
        if path.exists() {
            let _ = std::fs::remove_file(path);
        }
        Ok(())
    }

    /// Save OAuth access token in native OS keychain and protected local fallback
    pub fn save_token(token: &str) -> Result<()> {
        let trimmed = token.trim();
        let keyring_res = (|| {
            let entry = keyring::Entry::new(KEYRING_SERVICE, KEYRING_USER)
                .map_err(|e| AppError::Keyring(format!("Failed to create keyring entry: {e}")))?;
            entry
                .set_password(trimmed)
                .map_err(|e| AppError::Keyring(format!("Failed to set token in keyring: {e}")))?;
            Ok::<(), AppError>(())
        })();

        // Also save to local application data fallback file
        let path = Self::get_fallback_token_path();
        let _ = std::fs::write(&path, trimmed);

        if let Err(e) = keyring_res {
            eprintln!("Note: Keyring storage failed ({e}); fallback token saved successfully.");
        }
        Ok(())
    }

    /// Read OAuth access token from native OS keychain or protected fallback
    pub fn get_token() -> Result<Option<String>> {
        if let Ok(pw) =
            keyring::Entry::new(KEYRING_SERVICE, KEYRING_USER).and_then(|e| e.get_password())
        {
            let trimmed = pw.trim().to_string();
            if !trimmed.is_empty() {
                // Ensure fallback file is kept in sync
                let path = Self::get_fallback_token_path();
                if !path.exists() {
                    let _ = std::fs::write(&path, &trimmed);
                }
                return Ok(Some(trimmed));
            }
        }

        // Try local fallback file
        let path = Self::get_fallback_token_path();
        if let Ok(saved) = std::fs::read_to_string(&path) {
            let trimmed = saved.trim().to_string();
            if !trimmed.is_empty() {
                // Restore into keyring if missing
                if let Ok(entry) = keyring::Entry::new(KEYRING_SERVICE, KEYRING_USER) {
                    let _ = entry.set_password(&trimmed);
                }
                return Ok(Some(trimmed));
            }
        }

        Ok(None)
    }

    /// Delete OAuth access token from native OS keychain and fallback
    pub fn delete_token() -> Result<()> {
        if let Ok(entry) = keyring::Entry::new(KEYRING_SERVICE, KEYRING_USER) {
            let _ = entry.delete_credential();
        }
        let path = Self::get_fallback_token_path();
        if path.exists() {
            let _ = std::fs::remove_file(path);
        }
        let _ = Self::delete_profile();
        Ok(())
    }

    /// Initiate GitHub OAuth Device Flow (POST https://github.com/login/device/code)
    pub async fn start_device_flow(client_id: &str) -> Result<DeviceCodeResponse> {
        let client = reqwest::Client::builder()
            .build()
            .map_err(|e| AppError::Auth(format!("Failed to build HTTP client: {e}")))?;

        let params = [
            ("client_id", client_id),
            ("scope", "repo read:user user:email"),
        ];

        let response = client
            .post("https://github.com/login/device/code")
            .header(ACCEPT, "application/json")
            .header(USER_AGENT, "LeafForge-Desktop")
            .form(&params)
            .send()
            .await
            .map_err(|e| AppError::Auth(format!("Device code request failed: {e}")))?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            return Err(AppError::Auth(format!(
                "Device code initiation returned status {status}: {body}"
            )));
        }

        let raw: RawDeviceCodeResponse = response
            .json()
            .await
            .map_err(|e| AppError::Auth(format!("Failed to parse device code JSON: {e}")))?;

        Ok(DeviceCodeResponse {
            device_code: raw.device_code,
            user_code: raw.user_code,
            verification_uri: raw.verification_uri,
            expires_in: raw.expires_in,
            interval: raw.interval,
        })
    }

    /// Poll for token (POST https://github.com/login/oauth/access_token)
    pub async fn poll_token(client_id: &str, device_code: &str) -> Result<PollTokenResponse> {
        let client = reqwest::Client::builder()
            .build()
            .map_err(|e| AppError::Auth(format!("Failed to build HTTP client: {e}")))?;

        let params = [
            ("client_id", client_id),
            ("device_code", device_code),
            ("grant_type", "urn:ietf:params:oauth:grant-type:device_code"),
        ];

        let response = client
            .post("https://github.com/login/oauth/access_token")
            .header(ACCEPT, "application/json")
            .header(USER_AGENT, "LeafForge-Desktop")
            .form(&params)
            .send()
            .await
            .map_err(|e| AppError::Auth(format!("Access token poll request failed: {e}")))?;

        let raw: RawTokenResponse = response
            .json()
            .await
            .map_err(|e| AppError::Auth(format!("Failed to parse token response: {e}")))?;

        if let Some(token) = raw.access_token {
            // Save immediately to native OS keychain & fallback
            Self::save_token(&token)?;

            // Automatically pre-fetch user profile with the authenticated token
            let profile = match Self::fetch_profile(&token).await {
                Ok(p) => {
                    let _ = Self::save_profile(&p);
                    Some(p)
                }
                Err(err) => {
                    eprintln!("Note: Could not immediately fetch profile: {err}");
                    None
                }
            };

            return Ok(PollTokenResponse {
                status: "success".into(),
                access_token: Some(token),
                profile,
                error: None,
                error_description: None,
                interval: None,
            });
        }

        if let Some(err) = raw.error {
            match err.as_str() {
                "authorization_pending" => Ok(PollTokenResponse {
                    status: "pending".into(),
                    access_token: None,
                    profile: None,
                    error: Some(err),
                    error_description: raw.error_description,
                    interval: None,
                }),
                "slow_down" => Ok(PollTokenResponse {
                    status: "slow_down".into(),
                    access_token: None,
                    profile: None,
                    error: Some(err),
                    error_description: raw.error_description,
                    interval: raw.interval.or(Some(5)),
                }),
                "expired_token" => Ok(PollTokenResponse {
                    status: "expired".into(),
                    access_token: None,
                    profile: None,
                    error: Some(err),
                    error_description: raw.error_description,
                    interval: None,
                }),
                "access_denied" => Ok(PollTokenResponse {
                    status: "denied".into(),
                    access_token: None,
                    profile: None,
                    error: Some(err),
                    error_description: raw.error_description,
                    interval: None,
                }),
                _ => Ok(PollTokenResponse {
                    status: "error".into(),
                    access_token: None,
                    profile: None,
                    error: Some(err),
                    error_description: raw.error_description,
                    interval: None,
                }),
            }
        } else {
            Err(AppError::Auth(
                "GitHub returned unrecognized token response".into(),
            ))
        }
    }

    /// Fetch user profile from GitHub API using Bearer or Token header
    pub async fn fetch_profile(token: &str) -> Result<GithubUserProfile> {
        let client = reqwest::Client::builder()
            .build()
            .map_err(|e| AppError::Auth(format!("Failed to build HTTP client: {e}")))?;

        // Try standard Bearer token header first
        let mut response = client
            .get("https://api.github.com/user")
            .header(AUTHORIZATION, format!("Bearer {token}"))
            .header(USER_AGENT, "LeafForge-Desktop")
            .header(ACCEPT, "application/vnd.github+json")
            .header("X-GitHub-Api-Version", "2022-11-28")
            .send()
            .await
            .map_err(|e| AppError::Auth(format!("Failed to query GitHub user: {e}")))?;

        // If 401 Unauthorized, retry with classic OAuth "token <token>" header
        if response.status() == reqwest::StatusCode::UNAUTHORIZED {
            response = client
                .get("https://api.github.com/user")
                .header(AUTHORIZATION, format!("token {token}"))
                .header(USER_AGENT, "LeafForge-Desktop")
                .header(ACCEPT, "application/vnd.github+json")
                .header("X-GitHub-Api-Version", "2022-11-28")
                .send()
                .await
                .map_err(|e| {
                    AppError::Auth(format!(
                        "Failed to query GitHub user with token prefix: {e}"
                    ))
                })?;
        }

        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            return Err(AppError::Auth(format!(
                "GitHub user profile fetch failed with status {status}: {body}"
            )));
        }

        let raw: RawUserProfile = response
            .json()
            .await
            .map_err(|e| AppError::Auth(format!("Failed to parse GitHub user profile: {e}")))?;

        let avatar = raw
            .avatar_url
            .unwrap_or_else(|| format!("https://github.com/{}.png", raw.login));

        Ok(GithubUserProfile {
            username: raw.login,
            name: raw.name,
            avatar_url: avatar,
            email: raw.email,
        })
    }

    /// Verify repository collaborator permissions (Subsystem A.3)
    pub async fn verify_collaborator(
        token: &str,
        owner: &str,
        repo: &str,
        username: &str,
    ) -> Result<CollaboratorPermission> {
        let client = reqwest::Client::builder()
            .build()
            .map_err(|e| AppError::Auth(format!("Failed to build HTTP client: {e}")))?;

        let url = format!(
            "https://api.github.com/repos/{owner}/{repo}/collaborators/{username}/permission"
        );

        let response = client
            .get(&url)
            .header(AUTHORIZATION, format!("Bearer {token}"))
            .header(USER_AGENT, "LeafForge-Desktop")
            .header(ACCEPT, "application/vnd.github+json")
            .send()
            .await
            .map_err(|e| {
                AppError::Auth(format!("Collaborator verification request failed: {e}"))
            })?;

        if response.status() == reqwest::StatusCode::NOT_FOUND {
            return Ok(CollaboratorPermission {
                permission: "none".into(),
                can_write: false,
                can_read: false,
            });
        }

        if !response.status().is_success() {
            let status = response.status();
            return Err(AppError::Auth(format!(
                "Collaborator verification returned HTTP {status}"
            )));
        }

        let raw: RawCollaboratorResponse = response
            .json()
            .await
            .map_err(|e| AppError::Auth(format!("Failed to parse collaborator response: {e}")))?;

        let perm = raw.permission.unwrap_or_else(|| "none".into());
        let (can_write, can_read) = match perm.as_str() {
            "admin" | "write" => (true, true),
            "read" => (false, true),
            _ => (false, false),
        };

        Ok(CollaboratorPermission {
            permission: perm,
            can_write,
            can_read,
        })
    }

    /// List repositories owned or collaborated by authenticated user
    pub async fn list_user_repos(token: &str) -> Result<Vec<GithubRepoSummary>> {
        let client = reqwest::Client::builder()
            .build()
            .map_err(|e| AppError::Auth(format!("Failed to build HTTP client: {e}")))?;

        let response = client
            .get("https://api.github.com/user/repos?sort=updated&per_page=100&affiliation=owner,collaborator")
            .header(AUTHORIZATION, format!("Bearer {token}"))
            .header(USER_AGENT, "LeafForge-Desktop")
            .header(ACCEPT, "application/vnd.github+json")
            .header("X-GitHub-Api-Version", "2022-11-28")
            .send()
            .await
            .map_err(|e| AppError::Auth(format!("Failed to query GitHub repositories: {e}")))?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            return Err(AppError::Auth(format!(
                "GitHub repository list failed with status {status}: {body}"
            )));
        }

        let raw: Vec<RawRepoResponse> = response
            .json()
            .await
            .map_err(|e| AppError::Auth(format!("Failed to parse GitHub repository list: {e}")))?;

        let repos = raw
            .into_iter()
            .map(|r| GithubRepoSummary {
                id: r.id,
                name: r.name,
                full_name: r.full_name,
                private: r.private,
                html_url: r.html_url,
                clone_url: r.clone_url,
                default_branch: r.default_branch,
                description: r.description,
                updated_at: r.updated_at,
            })
            .collect();

        Ok(repos)
    }

    /// Create a new GitHub repository for authenticated user
    pub async fn create_user_repo(
        token: &str,
        name: &str,
        description: Option<&str>,
        private: bool,
    ) -> Result<GithubRepoSummary> {
        let client = reqwest::Client::builder()
            .build()
            .map_err(|e| AppError::Auth(format!("Failed to build HTTP client: {e}")))?;

        #[derive(Serialize)]
        struct CreateRepoRequest<'a> {
            name: &'a str,
            #[serde(skip_serializing_if = "Option::is_none")]
            description: Option<&'a str>,
            private: bool,
            auto_init: bool,
        }

        let payload = CreateRepoRequest {
            name,
            description,
            private,
            auto_init: false,
        };

        let response = client
            .post("https://api.github.com/user/repos")
            .header(AUTHORIZATION, format!("Bearer {token}"))
            .header(USER_AGENT, "LeafForge-Desktop")
            .header(ACCEPT, "application/vnd.github+json")
            .header("X-GitHub-Api-Version", "2022-11-28")
            .json(&payload)
            .send()
            .await
            .map_err(|e| AppError::Auth(format!("Failed to create GitHub repository: {e}")))?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            return Err(AppError::Auth(format!(
                "GitHub repository creation failed with status {status}: {body}"
            )));
        }

        let r: RawRepoResponse = response.json().await.map_err(|e| {
            AppError::Auth(format!("Failed to parse created GitHub repository: {e}"))
        })?;

        Ok(GithubRepoSummary {
            id: r.id,
            name: r.name,
            full_name: r.full_name,
            private: r.private,
            html_url: r.html_url,
            clone_url: r.clone_url,
            default_branch: r.default_branch,
            description: r.description,
            updated_at: r.updated_at,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_device_code_response_serde() {
        let json = r#"{
            "device_code": "3584d83530557fdd1f46af8289938c8ef79f9dc5",
            "user_code": "WDJB-MJHT",
            "verification_uri": "https://github.com/login/device",
            "expires_in": 900,
            "interval": 5
        }"#;

        let parsed: RawDeviceCodeResponse = serde_json::from_str(json).unwrap();
        assert_eq!(parsed.user_code, "WDJB-MJHT");
        assert_eq!(parsed.expires_in, 900);
        assert_eq!(parsed.interval, 5);
    }

    #[test]
    fn test_raw_token_response_serde_pending() {
        let json = r#"{
            "error": "authorization_pending",
            "error_description": "The authorization request is still pending."
        }"#;

        let parsed: RawTokenResponse = serde_json::from_str(json).unwrap();
        assert_eq!(parsed.error.as_deref(), Some("authorization_pending"));
        assert!(parsed.access_token.is_none());
    }

    #[test]
    fn test_raw_token_response_serde_success() {
        let json = r#"{
            "access_token": "gho_16C7e42F292c6912E7710c838347Ae178B4a",
            "token_type": "bearer",
            "scope": "repo,read:user,user:email"
        }"#;

        let parsed: RawTokenResponse = serde_json::from_str(json).unwrap();
        assert_eq!(
            parsed.access_token.as_deref(),
            Some("gho_16C7e42F292c6912E7710c838347Ae178B4a")
        );
    }

    #[test]
    fn test_token_save_and_retrieve_roundtrip() {
        // Backup existing token and profile so the unit test does not destroy active user session
        let backup_token = GithubAuthService::get_token().ok().flatten();
        let backup_profile = GithubAuthService::get_cached_profile().ok().flatten();

        let test_token = "gho_test_mock_token_123456789";
        GithubAuthService::save_token(test_token).unwrap();
        let loaded = GithubAuthService::get_token().unwrap();
        assert_eq!(loaded.as_deref(), Some(test_token));
        GithubAuthService::delete_token().unwrap();
        let after_delete = GithubAuthService::get_token().unwrap();
        assert_eq!(after_delete, None);

        // Restore original credentials if any existed
        if let Some(ref t) = backup_token {
            let _ = GithubAuthService::save_token(t);
        }
        if let Some(ref p) = backup_profile {
            let _ = GithubAuthService::save_profile(p);
        }
    }

    #[test]
    fn test_collaborator_permission_logic() {
        let admin = CollaboratorPermission {
            permission: "admin".into(),
            can_write: true,
            can_read: true,
        };
        assert!(admin.can_write);
        assert!(admin.can_read);

        let read_only = CollaboratorPermission {
            permission: "read".into(),
            can_write: false,
            can_read: true,
        };
        assert!(!read_only.can_write);
        assert!(read_only.can_read);
    }
}

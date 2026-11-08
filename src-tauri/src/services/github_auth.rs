use crate::error::{AppError, Result};
use reqwest::header::{ACCEPT, AUTHORIZATION, USER_AGENT};
use serde::{Deserialize, Serialize};

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
pub struct AuthStatusResponse {
    pub authenticated: bool,
    pub profile: Option<GithubUserProfile>,
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
    name: Option<String>,
    avatar_url: String,
    email: Option<String>,
}

#[derive(Debug, Deserialize)]
struct RawCollaboratorResponse {
    permission: Option<String>,
}

pub struct GithubAuthService;

impl GithubAuthService {
    /// Save OAuth access token in native OS keychain
    pub fn save_token(token: &str) -> Result<()> {
        let entry = keyring::Entry::new(KEYRING_SERVICE, KEYRING_USER)
            .map_err(|e| AppError::Keyring(format!("Failed to create keyring entry: {e}")))?;
        entry
            .set_password(token)
            .map_err(|e| AppError::Keyring(format!("Failed to set token in keyring: {e}")))?;
        Ok(())
    }

    /// Read OAuth access token from native OS keychain
    pub fn get_token() -> Result<Option<String>> {
        let entry = keyring::Entry::new(KEYRING_SERVICE, KEYRING_USER)
            .map_err(|e| AppError::Keyring(format!("Failed to create keyring entry: {e}")))?;
        match entry.get_password() {
            Ok(pw) => Ok(Some(pw)),
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(e) => Err(AppError::Keyring(format!(
                "Failed to get token from keyring: {e}"
            ))),
        }
    }

    /// Delete OAuth access token from native OS keychain
    pub fn delete_token() -> Result<()> {
        let entry = keyring::Entry::new(KEYRING_SERVICE, KEYRING_USER)
            .map_err(|e| AppError::Keyring(format!("Failed to create keyring entry: {e}")))?;
        match entry.delete_credential() {
            Ok(_) => Ok(()),
            Err(keyring::Error::NoEntry) => Ok(()),
            Err(e) => Err(AppError::Keyring(format!(
                "Failed to delete token from keyring: {e}"
            ))),
        }
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
            // Save immediately to native OS keychain
            Self::save_token(&token)?;
            return Ok(PollTokenResponse {
                status: "success".into(),
                access_token: Some(token),
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
                    error: Some(err),
                    error_description: raw.error_description,
                    interval: None,
                }),
                "slow_down" => Ok(PollTokenResponse {
                    status: "slow_down".into(),
                    access_token: None,
                    error: Some(err),
                    error_description: raw.error_description,
                    interval: raw.interval.or(Some(5)),
                }),
                "expired_token" => Ok(PollTokenResponse {
                    status: "expired".into(),
                    access_token: None,
                    error: Some(err),
                    error_description: raw.error_description,
                    interval: None,
                }),
                "access_denied" => Ok(PollTokenResponse {
                    status: "denied".into(),
                    access_token: None,
                    error: Some(err),
                    error_description: raw.error_description,
                    interval: None,
                }),
                _ => Ok(PollTokenResponse {
                    status: "error".into(),
                    access_token: None,
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

    /// Fetch user profile from GitHub API using Bearer token
    pub async fn fetch_profile(token: &str) -> Result<GithubUserProfile> {
        let client = reqwest::Client::builder()
            .build()
            .map_err(|e| AppError::Auth(format!("Failed to build HTTP client: {e}")))?;

        let response = client
            .get("https://api.github.com/user")
            .header(AUTHORIZATION, format!("Bearer {token}"))
            .header(USER_AGENT, "LeafForge-Desktop")
            .header(ACCEPT, "application/vnd.github+json")
            .send()
            .await
            .map_err(|e| AppError::Auth(format!("Failed to query GitHub user: {e}")))?;

        if !response.status().is_success() {
            let status = response.status();
            return Err(AppError::Auth(format!(
                "GitHub user profile fetch failed with status {status}"
            )));
        }

        let raw: RawUserProfile = response
            .json()
            .await
            .map_err(|e| AppError::Auth(format!("Failed to parse GitHub user profile: {e}")))?;

        Ok(GithubUserProfile {
            username: raw.login,
            name: raw.name,
            avatar_url: raw.avatar_url,
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

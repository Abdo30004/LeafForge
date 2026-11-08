use crate::error::{AppError, Result};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Serialize, Deserialize, Default, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ProjectSettings {
    #[serde(default)]
    pub root_file: Option<String>,
    #[serde(default)]
    pub engine: Option<String>,
    #[serde(default)]
    pub compile_timeout_secs: Option<u64>,
    #[serde(default)]
    pub compile_quality: Option<String>, // "draft" | "fast" | "normal" | "full"
    #[serde(default)]
    pub auto_save: Option<bool>,
    #[serde(default)]
    pub auto_save_delay_ms: Option<u64>,
    #[serde(default)]
    pub git_remote: Option<String>,
    #[serde(default)]
    pub git_branch: Option<String>,
    #[serde(default)]
    pub auto_compile: Option<bool>,
    #[serde(default)]
    pub synctex_enabled: Option<bool>,
    #[serde(default)]
    pub open_files: Option<Vec<String>>,
    #[serde(default)]
    pub active_file: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct GlobalSettings {
    #[serde(default = "default_theme")]
    pub theme: String, // "dark" | "light"
    #[serde(default = "default_engine")]
    pub default_engine: String,
    #[serde(default = "default_font_size")]
    pub font_size: u32,
    #[serde(default = "default_auto_compile_delay")]
    pub auto_compile_delay_ms: u64,
    #[serde(default = "default_auto_save")]
    pub auto_save: bool,
    #[serde(default = "default_auto_save_delay")]
    pub auto_save_delay_ms: u64,
    #[serde(default = "default_compile_timeout")]
    pub compile_timeout_secs: u64,
    #[serde(default = "default_compile_quality")]
    pub compile_quality: String, // "draft" | "fast" | "normal" | "full"
    #[serde(default)]
    pub last_opened_workspace: Option<String>,
    #[serde(default)]
    pub recent_workspaces: Vec<String>,
    #[serde(default = "default_true")]
    pub restore_workspace_state: bool,
    #[serde(default = "default_true")]
    pub editor_word_wrap: bool,
}

fn default_theme() -> String {
    "dark".to_string()
}
fn default_engine() -> String {
    "tectonic".to_string()
}
fn default_font_size() -> u32 {
    14
}
fn default_auto_compile_delay() -> u64 {
    1000
}
fn default_auto_save() -> bool {
    true
}
fn default_auto_save_delay() -> u64 {
    1000
}
fn default_compile_timeout() -> u64 {
    90
}
fn default_compile_quality() -> String {
    "normal".to_string()
}
fn default_true() -> bool {
    true
}

impl Default for GlobalSettings {
    fn default() -> Self {
        Self {
            theme: default_theme(),
            default_engine: default_engine(),
            font_size: default_font_size(),
            auto_compile_delay_ms: default_auto_compile_delay(),
            auto_save: default_auto_save(),
            auto_save_delay_ms: default_auto_save_delay(),
            compile_timeout_secs: default_compile_timeout(),
            compile_quality: default_compile_quality(),
            last_opened_workspace: None,
            recent_workspaces: Vec::new(),
            restore_workspace_state: true,
            editor_word_wrap: true,
        }
    }
}

pub struct SettingsEngine;

impl SettingsEngine {
    /// Load project settings from `<project_dir>/.leafforge/settings.json`
    pub fn load_project_settings(project_dir: &Path) -> ProjectSettings {
        let clean = crate::services::clean_path(project_dir);
        let settings_path = clean.join(".leafforge").join("settings.json");
        if settings_path.exists()
            && let Ok(content) = fs::read_to_string(&settings_path)
            && let Ok(settings) = serde_json::from_str::<ProjectSettings>(&content)
        {
            return settings;
        }
        ProjectSettings::default()
    }

    /// Save project settings to `<project_dir>/.leafforge/settings.json`
    pub fn save_project_settings(
        project_dir: &Path,
        settings: &ProjectSettings,
    ) -> Result<ProjectSettings> {
        let clean = crate::services::clean_path(project_dir);
        let out_dir = clean.join(".leafforge");
        let _ = fs::create_dir_all(&out_dir);
        crate::services::hide_path_on_windows(&out_dir);

        let settings_path = out_dir.join("settings.json");
        let json = serde_json::to_string_pretty(settings)
            .map_err(|e| AppError::Internal(format!("Failed to serialize settings: {e}")))?;

        fs::write(&settings_path, json)
            .map_err(|e| AppError::Internal(format!("Failed to write settings file: {e}")))?;

        Ok(settings.clone())
    }

    /// Determines the standard global user configuration directory
    pub fn get_global_config_path() -> PathBuf {
        #[cfg(windows)]
        {
            if let Ok(appdata) = std::env::var("APPDATA") {
                return PathBuf::from(appdata)
                    .join("LeafForge")
                    .join("global_settings.json");
            }
            if let Ok(userprofile) = std::env::var("USERPROFILE") {
                return PathBuf::from(userprofile)
                    .join(".leafforge")
                    .join("global_settings.json");
            }
        }

        #[cfg(not(windows))]
        {
            if let Ok(home) = std::env::var("HOME") {
                return PathBuf::from(home)
                    .join(".config")
                    .join("leafforge")
                    .join("global_settings.json");
            }
        }

        PathBuf::from("global_settings.json")
    }

    /// Load global settings
    pub fn load_global_settings() -> GlobalSettings {
        let path = Self::get_global_config_path();
        if path.exists()
            && let Ok(content) = fs::read_to_string(&path)
            && let Ok(settings) = serde_json::from_str::<GlobalSettings>(&content)
        {
            return settings;
        }
        GlobalSettings::default()
    }

    /// Save global settings
    pub fn save_global_settings(settings: &GlobalSettings) -> Result<GlobalSettings> {
        let path = Self::get_global_config_path();
        if let Some(parent) = path.parent() {
            let _ = fs::create_dir_all(parent);
        }
        let json = serde_json::to_string_pretty(settings)
            .map_err(|e| AppError::Internal(format!("Failed to serialize global settings: {e}")))?;

        fs::write(&path, json).map_err(|e| {
            AppError::Internal(format!("Failed to write global settings file: {e}"))
        })?;

        Ok(settings.clone())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn test_project_settings_roundtrip() {
        let tmp = tempdir().expect("tempdir");
        let initial = SettingsEngine::load_project_settings(tmp.path());
        assert_eq!(initial, ProjectSettings::default());

        let updated = ProjectSettings {
            root_file: Some("paper.tex".into()),
            engine: Some("tectonic".into()),
            compile_timeout_secs: Some(120),
            compile_quality: Some("fast".into()),
            auto_save: Some(true),
            auto_save_delay_ms: Some(1500),
            git_remote: Some("https://github.com/user/paper.git".into()),
            git_branch: Some("main".into()),
            auto_compile: Some(true),
            synctex_enabled: Some(true),
            open_files: Some(vec!["paper.tex".into(), "refs.bib".into()]),
            active_file: Some("paper.tex".into()),
        };

        SettingsEngine::save_project_settings(tmp.path(), &updated).expect("save");
        let loaded = SettingsEngine::load_project_settings(tmp.path());
        assert_eq!(loaded, updated);
    }
}

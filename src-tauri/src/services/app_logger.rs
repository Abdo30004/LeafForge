use crate::error::{AppError, Result};
use chrono::Utc;
use serde::{Deserialize, Serialize};
use std::collections::VecDeque;
use std::fs::{File, OpenOptions, create_dir_all};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};

pub const MAX_IN_MEMORY_LOGS: usize = 1000;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LogEntry {
    pub id: String,
    pub timestamp: String,
    pub level: String, // "DEBUG" | "INFO" | "WARN" | "ERROR" | "CRASH"
    pub target: String,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub details: Option<String>,
}

pub struct AppLogger {
    entries: Arc<Mutex<VecDeque<LogEntry>>>,
    log_file_path: Arc<Mutex<PathBuf>>,
    counter: AtomicU64,
}

impl Default for AppLogger {
    fn default() -> Self {
        Self::new()
    }
}

impl AppLogger {
    pub fn new() -> Self {
        let log_dir = Self::determine_default_log_dir();
        let _ = create_dir_all(&log_dir);
        let log_file = log_dir.join("leafforge.log");

        // Touch the file if it doesn't exist
        if !log_file.exists() {
            let _ = File::create(&log_file);
        }

        Self {
            entries: Arc::new(Mutex::new(VecDeque::with_capacity(MAX_IN_MEMORY_LOGS))),
            log_file_path: Arc::new(Mutex::new(log_file)),
            counter: AtomicU64::new(1),
        }
    }

    fn determine_default_log_dir() -> PathBuf {
        if cfg!(windows) {
            if let Ok(local_app_data) = std::env::var("LOCALAPPDATA") {
                PathBuf::from(local_app_data).join("LeafForge").join("logs")
            } else {
                std::env::temp_dir().join("LeafForge").join("logs")
            }
        } else if cfg!(target_os = "macos") {
            if let Ok(home) = std::env::var("HOME") {
                PathBuf::from(home)
                    .join("Library")
                    .join("Logs")
                    .join("LeafForge")
            } else {
                std::env::temp_dir().join("LeafForge").join("logs")
            }
        } else {
            // Linux / Unix
            if let Ok(xdg) = std::env::var("XDG_STATE_HOME") {
                PathBuf::from(xdg).join("leafforge").join("logs")
            } else if let Ok(home) = std::env::var("HOME") {
                PathBuf::from(home)
                    .join(".local")
                    .join("state")
                    .join("leafforge")
                    .join("logs")
            } else {
                std::env::temp_dir().join("leafforge").join("logs")
            }
        }
    }

    /// Sets or appends to a project-specific log file when a workspace is opened
    pub fn set_workspace_path(&self, workspace_path: &Path) {
        let cache_dir = workspace_path.join(".leafforge");
        let _ = create_dir_all(&cache_dir);
        crate::services::hide_path_on_windows(&cache_dir);
        let workspace_log = cache_dir.join("leafforge.log");
        if let Ok(mut lock) = self.log_file_path.lock() {
            *lock = workspace_log;
        }
    }

    /// Get current log file path
    pub fn get_log_file_path(&self) -> PathBuf {
        self.log_file_path
            .lock()
            .map(|p| p.clone())
            .unwrap_or_else(|_| PathBuf::from("leafforge.log"))
    }

    /// Main logging method
    pub fn log(&self, level: &str, target: &str, message: &str, details: Option<&str>) {
        let timestamp = Utc::now().to_rfc3339();
        let id_num = self.counter.fetch_add(1, Ordering::SeqCst);
        let id = format!("log-{id_num}");

        let entry = LogEntry {
            id,
            timestamp: timestamp.clone(),
            level: level.to_uppercase(),
            target: target.to_string(),
            message: message.to_string(),
            details: details.map(|s| s.to_string()),
        };

        // Format line for file & stdout
        let details_str = match &entry.details {
            Some(d) => format!("\n  Details: {d}"),
            None => String::new(),
        };
        let log_line = format!(
            "[{timestamp}] [{}] [{target}] {message}{details_str}\n",
            entry.level
        );

        // Print to standard stream
        if entry.level == "ERROR" || entry.level == "CRASH" {
            eprint!("{log_line}");
        } else {
            print!("{log_line}");
        }

        // Write to log file
        if let Ok(path) = self.log_file_path.lock() {
            if let Some(parent) = path.parent() {
                let _ = create_dir_all(parent);
            }
            if let Ok(mut file) = OpenOptions::new().create(true).append(true).open(&*path) {
                let _ = file.write_all(log_line.as_bytes());
                let _ = file.flush();
            }
        }

        // Store in memory ring buffer
        if let Ok(mut entries) = self.entries.lock() {
            if entries.len() >= MAX_IN_MEMORY_LOGS {
                entries.pop_front();
            }
            entries.push_back(entry);
        }
    }

    pub fn debug(&self, target: &str, message: &str, details: Option<&str>) {
        self.log("DEBUG", target, message, details);
    }

    pub fn info(&self, target: &str, message: &str, details: Option<&str>) {
        self.log("INFO", target, message, details);
    }

    pub fn warn(&self, target: &str, message: &str, details: Option<&str>) {
        self.log("WARN", target, message, details);
    }

    pub fn error(&self, target: &str, message: &str, details: Option<&str>) {
        self.log("ERROR", target, message, details);
    }

    pub fn crash(&self, target: &str, message: &str, details: Option<&str>) {
        self.log("CRASH", target, message, details);
    }

    /// Retrieve recent logs with optional count limit
    pub fn get_entries(&self, limit: Option<usize>) -> Vec<LogEntry> {
        let lock = match self.entries.lock() {
            Ok(guard) => guard,
            Err(_) => return Vec::new(),
        };

        let lim = limit.unwrap_or(MAX_IN_MEMORY_LOGS);
        lock.iter().rev().take(lim).cloned().collect()
    }

    /// Clear in-memory and truncate log file
    pub fn clear(&self) -> Result<()> {
        if let Ok(mut entries) = self.entries.lock() {
            entries.clear();
        }

        if let Ok(path) = self.log_file_path.lock() {
            File::create(&*path).map_err(AppError::Io)?;
        }

        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn test_logger_lifecycle_and_file_write() {
        let dir = tempdir().unwrap();
        let logger = AppLogger::new();
        logger.set_workspace_path(dir.path());

        logger.info("TestTarget", "Testing info log", None);
        logger.error(
            "TestTarget",
            "Testing error log",
            Some("Extra details stack"),
        );

        let entries = logger.get_entries(Some(10));
        assert!(entries.len() >= 2);
        assert_eq!(entries[0].level, "ERROR");
        assert_eq!(entries[1].level, "INFO");

        // Verify file was written
        let log_file = dir.path().join(".leafforge").join("leafforge.log");
        assert!(log_file.exists());
        let content = std::fs::read_to_string(&log_file).unwrap();
        assert!(content.contains("[INFO] [TestTarget] Testing info log"));
        assert!(content.contains("[ERROR] [TestTarget] Testing error log"));
        assert!(content.contains("Extra details stack"));
    }

    #[test]
    fn test_logger_ring_buffer_limit() {
        let logger = AppLogger::new();
        for i in 0..1050 {
            logger.debug("Loop", &format!("Log entry {i}"), None);
        }

        let entries = logger.get_entries(None);
        assert_eq!(entries.len(), MAX_IN_MEMORY_LOGS);
        // Latest entry should be at the front
        assert_eq!(entries[0].message, "Log entry 1049");
    }
}

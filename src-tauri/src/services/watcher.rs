use crate::error::{AppError, Result};
use notify_debouncer_full::{
    DebounceEventResult, Debouncer, FileIdMap, new_debouncer,
    notify::{EventKind, RecursiveMode, Watcher},
};
use serde::Serialize;
use std::path::{Path, PathBuf};
use std::time::Duration;
use tauri::{AppHandle, Emitter};

pub const DEBOUNCE_DURATION_MS: u64 = 400;

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct FsChangeEvent {
    pub paths: Vec<String>,
    pub kind: String,
}

pub struct WorkspaceWatcher {
    _debouncer: Debouncer<notify::RecommendedWatcher, FileIdMap>,
    pub watched_path: PathBuf,
}

pub fn should_ignore_path(path: &Path) -> bool {
    let s = path.to_string_lossy();
    s.contains(".git")
        || s.contains("node_modules")
        || s.contains("target")
        || s.contains("dist")
        || s.contains(".vite")
        || s.contains(".leafforge-cache")
        || s.contains(".tmp_")
        || s.ends_with(".tmp")
}

pub fn map_event_kind(kind: &EventKind) -> &'static str {
    match kind {
        EventKind::Create(_) => "create",
        EventKind::Modify(_) => "modify",
        EventKind::Remove(_) => "remove",
        _ => "other",
    }
}

pub fn start_workspace_watcher(
    dir_path: PathBuf,
    app_handle: AppHandle,
) -> Result<WorkspaceWatcher> {
    if !dir_path.exists() {
        return Err(AppError::NotFound(dir_path.to_string_lossy().to_string()));
    }

    let watched_dir = dir_path.clone();

    let mut debouncer = new_debouncer(
        Duration::from_millis(DEBOUNCE_DURATION_MS),
        None,
        move |res: DebounceEventResult| {
            if let Ok(events) = res {
                for debounced_ev in events {
                    let filtered_paths: Vec<String> = debounced_ev
                        .paths
                        .iter()
                        .filter(|p| !should_ignore_path(p))
                        .map(|p| p.to_string_lossy().to_string())
                        .collect();

                    if !filtered_paths.is_empty() {
                        let kind_str = map_event_kind(&debounced_ev.kind).to_string();
                        let payload = FsChangeEvent {
                            paths: filtered_paths,
                            kind: kind_str,
                        };
                        let _ = app_handle.emit("workspace://fs-change", payload);
                    }
                }
            }
        },
    )
    .map_err(|e| AppError::Watcher(format!("Failed to initialize debouncer: {e}")))?;

    debouncer
        .watcher()
        .watch(&dir_path, RecursiveMode::Recursive)
        .map_err(|e| AppError::Watcher(format!("Failed to watch directory: {e}")))?;

    Ok(WorkspaceWatcher {
        _debouncer: debouncer,
        watched_path: watched_dir,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use notify_debouncer_full::notify::event::{CreateKind, ModifyKind, RemoveKind};

    #[test]
    fn test_should_ignore_path() {
        assert!(should_ignore_path(Path::new("C:/repo/.git/HEAD")));
        assert!(should_ignore_path(Path::new(
            "C:/repo/target/debug/leafforge"
        )));
        assert!(should_ignore_path(Path::new("C:/repo/node_modules/react")));
        assert!(should_ignore_path(Path::new(
            "C:/repo/.leafforge-cache/preamble.fmt"
        )));
        assert!(should_ignore_path(Path::new(
            "C:/repo/.main.tex.tmp_123456"
        )));
        assert!(!should_ignore_path(Path::new("C:/repo/main.tex")));
        assert!(!should_ignore_path(Path::new("C:/repo/sections/intro.tex")));
    }

    #[test]
    fn test_map_event_kind() {
        assert_eq!(
            map_event_kind(&EventKind::Create(CreateKind::File)),
            "create"
        );
        assert_eq!(
            map_event_kind(&EventKind::Modify(ModifyKind::Data(
                notify_debouncer_full::notify::event::DataChange::Content
            ))),
            "modify"
        );
        assert_eq!(
            map_event_kind(&EventKind::Remove(RemoveKind::File)),
            "remove"
        );
        assert_eq!(map_event_kind(&EventKind::Any), "other");
    }
}

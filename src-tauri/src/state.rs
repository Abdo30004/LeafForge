use crate::services::app_logger::AppLogger;
use crate::services::lsp_supervisor::LspSupervisor;
use crate::services::watcher::WorkspaceWatcher;
use std::path::PathBuf;
use std::sync::{Arc, Mutex, RwLock};

pub struct AppState {
    pub current_workspace: Arc<RwLock<Option<PathBuf>>>,
    pub watcher_handle: Arc<Mutex<Option<WorkspaceWatcher>>>,
    pub lsp_supervisor: Arc<tokio::sync::Mutex<LspSupervisor>>,
    pub active_compile_abort: Arc<tokio::sync::Mutex<Option<tokio::sync::oneshot::Sender<()>>>>,
    pub app_logger: Arc<AppLogger>,
}

impl Default for AppState {
    fn default() -> Self {
        Self {
            current_workspace: Arc::new(RwLock::new(None)),
            watcher_handle: Arc::new(Mutex::new(None)),
            lsp_supervisor: Arc::new(tokio::sync::Mutex::new(LspSupervisor::new())),
            active_compile_abort: Arc::new(tokio::sync::Mutex::new(None)),
            app_logger: Arc::new(AppLogger::new()),
        }
    }
}

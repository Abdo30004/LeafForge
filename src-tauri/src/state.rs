use std::path::PathBuf;
use std::sync::{Arc, Mutex, RwLock};

pub struct AppState {
    pub current_workspace: Arc<RwLock<Option<PathBuf>>>,
    pub watcher_handle: Arc<Mutex<Option<Box<dyn std::any::Any + Send>>>>,
}

impl Default for AppState {
    fn default() -> Self {
        Self {
            current_workspace: Arc::new(RwLock::new(None)),
            watcher_handle: Arc::new(Mutex::new(None)),
        }
    }
}

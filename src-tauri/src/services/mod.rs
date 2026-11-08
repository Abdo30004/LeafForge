use std::path::Path;

pub mod app_logger;
pub mod compiler_pipeline;
pub mod git_engine;
pub mod github_auth;
pub mod log_parser;
pub mod lsp_supervisor;
pub mod synctex_parser;
pub mod watcher;

#[cfg(windows)]
pub fn hide_path_on_windows(path: &Path) {
    let path_str = path.to_string_lossy();
    let cleaned = path_str.strip_prefix(r"\\?\").unwrap_or(&path_str);
    let _ = std::process::Command::new("attrib")
        .arg("+h")
        .arg(cleaned)
        .output();
}

#[cfg(not(windows))]
pub fn hide_path_on_windows(_path: &Path) {}

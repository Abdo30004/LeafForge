use std::path::{Path, PathBuf};

pub mod app_logger;
pub mod compiler_pipeline;
pub mod git_engine;
pub mod github_auth;
pub mod log_parser;
pub mod lsp_supervisor;
pub mod synctex_parser;
pub mod watcher;

/// Strips Windows extended-length verbatim prefix (\\?\) so paths can be safely
/// passed to libgit2, external processes, openers, and URL parsers.
pub fn clean_path<P: AsRef<Path>>(path: P) -> PathBuf {
    let p = path.as_ref();
    let s = p.to_string_lossy();
    if let Some(stripped) = s.strip_prefix(r"\\?\") {
        PathBuf::from(stripped)
    } else {
        p.to_path_buf()
    }
}

#[cfg(windows)]
pub fn hide_path_on_windows(path: &Path) {
    let cleaned = clean_path(path);
    let _ = std::process::Command::new("attrib")
        .arg("+h")
        .arg(&cleaned)
        .output();
}

#[cfg(not(windows))]
pub fn hide_path_on_windows(_path: &Path) {}

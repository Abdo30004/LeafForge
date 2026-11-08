use std::path::{Path, PathBuf};

pub mod app_logger;
pub mod compiler_pipeline;
pub mod git_engine;
pub mod github_auth;
pub mod log_parser;
pub mod lsp_supervisor;
pub mod settings_engine;
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
    use std::os::windows::ffi::OsStrExt;
    let cleaned = clean_path(path);
    let mut wide: Vec<u16> = cleaned.as_os_str().encode_wide().collect();
    wide.push(0);
    unsafe {
        unsafe extern "system" {
            fn GetFileAttributesW(lpFileName: *const u16) -> u32;
            fn SetFileAttributesW(lpFileName: *const u16, dwFileAttributes: u32) -> i32;
        }
        let attrs = GetFileAttributesW(wide.as_ptr());
        if attrs != 0xFFFFFFFF {
            // FILE_ATTRIBUTE_HIDDEN = 0x2
            let _ = SetFileAttributesW(wide.as_ptr(), attrs | 0x2);
        }
    }
}

#[cfg(not(windows))]
pub fn hide_path_on_windows(_path: &Path) {}

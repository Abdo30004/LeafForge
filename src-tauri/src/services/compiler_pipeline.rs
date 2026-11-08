use crate::error::{AppError, Result};
use regex::Regex;
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::sync::LazyLock;
use std::time::{Duration, Instant};
use tokio::io::AsyncReadExt;
use tokio::process::Command;
use tokio::sync::oneshot;
use walkdir::WalkDir;

#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x08000000;

pub fn new_background_command<P: AsRef<std::ffi::OsStr>>(program: P) -> Command {
    let mut cmd = Command::new(program);
    #[cfg(windows)]
    {
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    cmd
}

pub const DEFAULT_COMPILE_TIMEOUT_SECS: u64 = 60;

static MAGIC_PROGRAM_REGEX: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"(?i)%\s*!TEX\s+(?:program|TS-program)\s*=\s*([a-zA-Z0-9_\-]+)")
        .expect("valid regex")
});

static MAGIC_ROOT_REGEX: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"(?i)%\s*!TEX\s+root\s*=\s*([^\r\n]+)").expect("valid regex"));

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum LatexEngine {
    Tectonic,
    LuaLatex,
    XeLatex,
    PdfLatex,
}

impl LatexEngine {
    pub fn as_str(&self) -> &'static str {
        match self {
            LatexEngine::Tectonic => "tectonic",
            LatexEngine::LuaLatex => "lualatex",
            LatexEngine::XeLatex => "xelatex",
            LatexEngine::PdfLatex => "pdflatex",
        }
    }

    pub fn from_str_name(s: &str) -> Option<Self> {
        match s.trim().to_lowercase().as_str() {
            "tectonic" => Some(LatexEngine::Tectonic),
            "lualatex" | "lua-latex" => Some(LatexEngine::LuaLatex),
            "xelatex" | "xe-latex" => Some(LatexEngine::XeLatex),
            "pdflatex" | "pdf-latex" => Some(LatexEngine::PdfLatex),
            _ => None,
        }
    }

    pub fn display_name(&self) -> &'static str {
        match self {
            LatexEngine::Tectonic => "Tectonic (Auto-CTAN / XeTeX)",
            LatexEngine::LuaLatex => "LuaLaTeX",
            LatexEngine::XeLatex => "XeLaTeX",
            LatexEngine::PdfLatex => "pdfLaTeX",
        }
    }

    pub fn binary_name(&self) -> &'static str {
        match self {
            LatexEngine::Tectonic => "tectonic",
            LatexEngine::LuaLatex => "lualatex",
            LatexEngine::XeLatex => "xelatex",
            LatexEngine::PdfLatex => "pdflatex",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EngineInfo {
    pub engine: LatexEngine,
    pub name: String,
    pub path: Option<String>,
    pub available: bool,
    pub version: Option<String>,
    pub supports_synctex: bool,
    pub supports_fmt_cache: bool,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct MagicComments {
    pub program: Option<LatexEngine>,
    pub root: Option<String>,
}

pub fn parse_magic_comments_from_content(content: &str) -> MagicComments {
    let mut comments = MagicComments::default();

    for (idx, line) in content.lines().enumerate() {
        if idx >= 10 {
            break;
        }
        let trimmed = line.trim();
        if !trimmed.starts_with('%') {
            continue;
        }

        if comments.program.is_none()
            && let Some(caps) = MAGIC_PROGRAM_REGEX.captures(trimmed)
            && let Some(prog) = caps.get(1)
            && let Some(engine) = LatexEngine::from_str_name(prog.as_str())
        {
            comments.program = Some(engine);
        }

        if comments.root.is_none()
            && let Some(caps) = MAGIC_ROOT_REGEX.captures(trimmed)
            && let Some(root_match) = caps.get(1)
        {
            let root_str = root_match.as_str().trim().to_string();
            if !root_str.is_empty() {
                comments.root = Some(root_str);
            }
        }
    }

    comments
}

pub fn extract_preamble(content: &str) -> Option<&str> {
    let doc_start = content.find(r"\begin{document}")?;
    Some(&content[..doc_start])
}

pub fn calculate_preamble_hash(project_dir: &Path, preamble: &str) -> String {
    let mut hasher = blake3::Hasher::new();
    hasher.update(preamble.as_bytes());

    // Also hash modification timestamps of local style and class files
    let mut package_files = Vec::new();
    for entry in WalkDir::new(project_dir)
        .max_depth(3)
        .into_iter()
        .filter_map(|e| e.ok())
    {
        let path = entry.path();
        if let Some(ext) = path.extension().and_then(|s| s.to_str()) {
            match ext.to_lowercase().as_str() {
                "sty" | "cls" | "def" | "bib" => {
                    if let Ok(metadata) = entry.metadata()
                        && let Ok(mtime) = metadata.modified()
                        && let Ok(duration) = mtime.duration_since(std::time::UNIX_EPOCH)
                    {
                        package_files
                            .push((path.to_string_lossy().to_string(), duration.as_secs()));
                    }
                }
                _ => {}
            }
        }
    }

    package_files.sort_by(|a, b| a.0.cmp(&b.0));
    for (name, mtime) in package_files {
        hasher.update(name.as_bytes());
        hasher.update(&mtime.to_le_bytes());
    }

    hasher.finalize().to_hex().to_string()
}

pub fn get_preamble_cache_path(project_dir: &Path, hash: &str) -> PathBuf {
    project_dir
        .join(".leafforge-cache")
        .join(format!("preamble_{hash}.fmt"))
}

pub fn find_binary_on_system(binary_name: &str) -> Option<PathBuf> {
    let cmd = if cfg!(windows) {
        format!("{binary_name}.exe")
    } else {
        binary_name.to_string()
    };

    if let Some(path_var) = std::env::var_os("PATH") {
        for path_entry in std::env::split_paths(&path_var) {
            let candidate = path_entry.join(&cmd);
            if candidate.is_file() {
                return Some(candidate);
            }
            let direct = path_entry.join(binary_name);
            if direct.is_file() {
                return Some(direct);
            }
        }
    }

    // Common installation paths on Windows / Unix
    let search_paths = if cfg!(windows) {
        let mut paths = vec![
            PathBuf::from(r"C:\Program Files\MiKTeX\miktex\bin\x64"),
            PathBuf::from(r"C:\Program Files\MiKTeX 2.9\miktex\bin\x64"),
            PathBuf::from(r"C:\texlive\2024\bin\windows"),
            PathBuf::from(r"C:\texlive\2023\bin\windows"),
            PathBuf::from(r"C:\texlive\2022\bin\win32"),
        ];
        if let Ok(local_app_data) = std::env::var("LOCALAPPDATA") {
            paths.push(
                PathBuf::from(local_app_data)
                    .join("Programs")
                    .join("MiKTeX")
                    .join("miktex")
                    .join("bin")
                    .join("x64"),
            );
            paths.push(
                PathBuf::from(std::env::var("CARGO_HOME").unwrap_or_else(|_| {
                    format!(
                        r"{}\.cargo",
                        std::env::var("USERPROFILE").unwrap_or_default()
                    )
                }))
                .join("bin"),
            );
        }
        paths
    } else {
        vec![
            PathBuf::from("/Library/TeX/texbin"),
            PathBuf::from("/usr/local/bin"),
            PathBuf::from("/usr/bin"),
            PathBuf::from("/opt/homebrew/bin"),
        ]
    };

    for base in search_paths {
        let candidate = base.join(&cmd);
        if candidate.exists() && candidate.is_file() {
            return Some(candidate);
        }
    }

    None
}

pub async fn query_engine_version(binary_path: &Path) -> Option<String> {
    let output = new_background_command(binary_path)
        .arg("--version")
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .await
        .ok()?;

    let text = String::from_utf8_lossy(&output.stdout);
    text.lines().next().map(|s| s.trim().to_string())
}

pub async fn detect_all_engines() -> Vec<EngineInfo> {
    let engines = [
        LatexEngine::Tectonic,
        LatexEngine::LuaLatex,
        LatexEngine::XeLatex,
        LatexEngine::PdfLatex,
    ];

    let mut results = Vec::new();
    for engine in engines {
        let bin_name = engine.binary_name();
        let path = find_binary_on_system(bin_name);
        let available = path.is_some();
        let mut version = None;

        if let Some(ref p) = path {
            version = query_engine_version(p).await;
        }

        results.push(EngineInfo {
            engine,
            name: engine.display_name().to_string(),
            path: path.map(|p| p.to_string_lossy().to_string()),
            available,
            version,
            supports_synctex: true,
            supports_fmt_cache: engine != LatexEngine::Tectonic,
        });
    }

    results
}

pub fn clean_auxiliary_files(project_dir: &Path, root_filename: &str) -> Result<Vec<String>> {
    let root_path = Path::new(root_filename);
    let stem = root_path
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("main");

    let aux_extensions: HashSet<&str> = [
        "aux",
        "log",
        "out",
        "fls",
        "fdb_latexmk",
        "toc",
        "lof",
        "lot",
        "bbl",
        "blg",
        "nav",
        "snm",
        "vrb",
        "synctex(busy)",
    ]
    .into_iter()
    .collect();

    let mut removed = Vec::new();

    if let Ok(entries) = std::fs::read_dir(project_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_file()
                && let Some(file_name) = path.file_name().and_then(|s| s.to_str())
            {
                let file_stem = path.file_stem().and_then(|s| s.to_str()).unwrap_or("");
                let extension = path.extension().and_then(|s| s.to_str()).unwrap_or("");

                if file_stem == stem
                    && aux_extensions.contains(extension)
                    && std::fs::remove_file(&path).is_ok()
                {
                    removed.push(file_name.to_string());
                }
            }
        }
    }

    Ok(removed)
}

pub struct CompilationConfig {
    pub project_dir: PathBuf,
    pub root_file: String,
    pub engine: LatexEngine,
    pub use_preamble_cache: bool,
    pub timeout_duration: Duration,
}

pub async fn execute_compilation(
    config: CompilationConfig,
    mut abort_rx: oneshot::Receiver<()>,
) -> Result<(i32, String, PathBuf, Option<PathBuf>, Duration)> {
    let start_time = Instant::now();
    let root_path = config.project_dir.join(&config.root_file);
    if !root_path.exists() {
        return Err(AppError::NotFound(root_path.to_string_lossy().to_string()));
    }

    let bin_path = find_binary_on_system(config.engine.binary_name()).ok_or_else(|| {
        AppError::Compiler(format!(
            "Engine '{}' was not found on the system. Please ensure {} is installed.",
            config.engine.display_name(),
            config.engine.binary_name()
        ))
    })?;

    let root_stem = Path::new(&config.root_file)
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("main");

    let expected_pdf = config.project_dir.join(format!("{root_stem}.pdf"));
    let expected_synctex_gz = config.project_dir.join(format!("{root_stem}.synctex.gz"));
    let expected_synctex = config.project_dir.join(format!("{root_stem}.synctex"));

    let mut cmd = new_background_command(&bin_path);
    cmd.current_dir(&config.project_dir);
    cmd.stdout(Stdio::piped());
    cmd.stderr(Stdio::piped());

    match config.engine {
        LatexEngine::Tectonic => {
            // Tectonic supports automatic CTAN downloading on-demand.
            cmd.arg("-X")
                .arg("compile")
                .arg("--synctex")
                .arg("--keep-logs")
                .arg(&config.root_file);
        }
        LatexEngine::LuaLatex | LatexEngine::XeLatex | LatexEngine::PdfLatex => {
            cmd.arg("-synctex=1")
                .arg("-interaction=nonstopmode")
                .arg("-file-line-error");

            if config.use_preamble_cache
                && let Ok(content) = std::fs::read_to_string(&root_path)
                && let Some(preamble) = extract_preamble(&content)
            {
                let hash = calculate_preamble_hash(&config.project_dir, preamble);
                let cache_path = get_preamble_cache_path(&config.project_dir, &hash);
                if cache_path.exists() {
                    let fmt_arg = format!("-fmt={}", cache_path.to_string_lossy());
                    cmd.arg(fmt_arg);
                }
            }

            cmd.arg(&config.root_file);
        }
    }

    let mut child = cmd.spawn().map_err(|e| {
        AppError::Compiler(format!(
            "Failed to spawn {}: {e}",
            config.engine.binary_name()
        ))
    })?;

    let child_stdout = child.stdout.take();
    let child_stderr = child.stderr.take();

    let read_stdout_handle = tokio::spawn(async move {
        let mut buf = Vec::new();
        if let Some(mut stream) = child_stdout {
            let _ = stream.read_to_end(&mut buf).await;
        }
        String::from_utf8_lossy(&buf).to_string()
    });

    let read_stderr_handle = tokio::spawn(async move {
        let mut buf = Vec::new();
        if let Some(mut stream) = child_stderr {
            let _ = stream.read_to_end(&mut buf).await;
        }
        String::from_utf8_lossy(&buf).to_string()
    });

    let mut timeout_fut = Box::pin(tokio::time::sleep(config.timeout_duration));

    let exit_code = tokio::select! {
        status_res = child.wait() => {
            match status_res {
                Ok(status) => status.code().unwrap_or(0),
                Err(e) => {
                    return Err(AppError::Compiler(format!("Compilation process error: {e}")));
                }
            }
        }
        _ = &mut abort_rx => {
            let _ = child.kill().await;
            return Err(AppError::Compiler("Compilation was aborted by user or a newer compile request.".into()));
        }
        _ = &mut timeout_fut => {
            let _ = child.kill().await;
            return Err(AppError::Compiler(format!(
                "Compilation timed out after {} seconds.",
                config.timeout_duration.as_secs()
            )));
        }
    };

    let stdout_text = read_stdout_handle.await.unwrap_or_default();
    let stderr_text = read_stderr_handle.await.unwrap_or_default();

    let mut log_output = format!("{stdout_text}\n{stderr_text}");
    let log_file_path = config.project_dir.join(format!("{root_stem}.log"));
    if log_file_path.exists()
        && let Ok(file_log) = std::fs::read_to_string(&log_file_path)
    {
        log_output = file_log;
    }

    let synctex_path = if expected_synctex_gz.exists() {
        Some(expected_synctex_gz)
    } else if expected_synctex.exists() {
        Some(expected_synctex)
    } else {
        None
    };

    let duration = start_time.elapsed();
    Ok((exit_code, log_output, expected_pdf, synctex_path, duration))
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn test_magic_comments_detection() {
        let tex_with_both = r#"% !TEX program = xelatex
% !TEX root = ../master.tex
\documentclass{article}
\begin{document}
Hello World
\end{document}"#;

        let parsed = parse_magic_comments_from_content(tex_with_both);
        assert_eq!(parsed.program, Some(LatexEngine::XeLatex));
        assert_eq!(parsed.root, Some("../master.tex".to_string()));
    }

    #[test]
    fn test_magic_comments_case_and_spacing() {
        let tex = r#"  %   !tex   ts-program  =  lualatex
% !TeX ROOT=sections/main.tex
\documentclass{article}"#;

        let parsed = parse_magic_comments_from_content(tex);
        assert_eq!(parsed.program, Some(LatexEngine::LuaLatex));
        assert_eq!(parsed.root, Some("sections/main.tex".to_string()));
    }

    #[test]
    fn test_magic_comments_tectonic() {
        let tex = r#"% !TEX program = tectonic
\documentclass{article}"#;
        let parsed = parse_magic_comments_from_content(tex);
        assert_eq!(parsed.program, Some(LatexEngine::Tectonic));
    }

    #[test]
    fn test_extract_preamble() {
        let content = r#"\documentclass{article}
\usepackage{amsmath}
\title{Test Document}
\begin{document}
Content here
\end{document}"#;

        let preamble = extract_preamble(content).expect("preamble should be found");
        assert!(preamble.contains(r"\documentclass{article}"));
        assert!(preamble.contains(r"\usepackage{amsmath}"));
        assert!(!preamble.contains("Content here"));
    }

    #[test]
    fn test_preamble_hash_consistency() {
        let dir = tempdir().expect("tempdir");
        let preamble1 = r#"\documentclass{article}\usepackage{amsmath}"#;
        let preamble2 = r#"\documentclass{article}\usepackage{amsmath}"#;
        let preamble3 = r#"\documentclass{article}\usepackage{amssymb}"#;

        let hash1 = calculate_preamble_hash(dir.path(), preamble1);
        let hash2 = calculate_preamble_hash(dir.path(), preamble2);
        let hash3 = calculate_preamble_hash(dir.path(), preamble3);

        assert_eq!(hash1, hash2);
        assert_ne!(hash1, hash3);
        assert_eq!(hash1.len(), 64);
    }

    #[test]
    fn test_clean_auxiliary_files() {
        let dir = tempdir().expect("tempdir");
        let main_tex = dir.path().join("main.tex");
        let main_pdf = dir.path().join("main.pdf");
        let main_aux = dir.path().join("main.aux");
        let main_log = dir.path().join("main.log");
        let main_synctex = dir.path().join("main.synctex.gz");

        std::fs::write(&main_tex, "hello").unwrap();
        std::fs::write(&main_pdf, "pdf").unwrap();
        std::fs::write(&main_aux, "aux").unwrap();
        std::fs::write(&main_log, "log").unwrap();
        std::fs::write(&main_synctex, "synctex").unwrap();

        let removed = clean_auxiliary_files(dir.path(), "main.tex").expect("clean ok");
        assert!(removed.contains(&"main.aux".to_string()));
        assert!(removed.contains(&"main.log".to_string()));

        assert!(main_tex.exists());
        assert!(main_pdf.exists());
        assert!(main_synctex.exists());
        assert!(!main_aux.exists());
        assert!(!main_log.exists());
    }
}

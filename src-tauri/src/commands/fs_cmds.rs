use crate::error::{AppError, Result};
use crate::state::AppState;
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;
use tauri::{AppHandle, State};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct FileEntry {
    pub name: String,
    pub path: String,
    pub is_directory: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub size: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub modified: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub children: Option<Vec<FileEntry>>,
}

const IGNORED_DIRS: &[&str] = &[
    ".git",
    "node_modules",
    "target",
    "dist",
    ".vite",
    ".leafforge-cache",
    ".texflow",
    ".leafforge",
];

const ALLOWED_ASSET_EXTS: &[&str] = &[
    "png", "pdf", "eps", "jpg", "jpeg", "svg", "webp", "bmp", "tiff",
];

#[tauri::command]
pub async fn open_folder(
    path: Option<String>,
    state: State<'_, AppState>,
) -> Result<Option<String>> {
    let chosen_path = match path {
        Some(p) => {
            let pb = PathBuf::from(&p);
            if !pb.exists() {
                return Err(AppError::NotFound(p));
            }
            if !pb.is_dir() {
                return Err(AppError::InvalidPath(format!(
                    "Path is not a directory: {p}"
                )));
            }
            pb
        }
        None => {
            let handle = rfd::AsyncFileDialog::new()
                .set_title("Open LaTeX Project Folder")
                .pick_folder()
                .await;
            match handle {
                Some(folder) => folder.path().to_path_buf(),
                None => return Ok(None),
            }
        }
    };

    let canonical = chosen_path.canonicalize().unwrap_or(chosen_path);
    let path_str = canonical.to_string_lossy().to_string();

    if let Ok(mut lock) = state.current_workspace.write() {
        *lock = Some(canonical.clone());
    }

    state.app_logger.set_workspace_path(&canonical);
    state
        .app_logger
        .info("FileSystem", &format!("Opened workspace: {path_str}"), None);

    Ok(Some(path_str))
}

#[tauri::command]
pub async fn list_files(dir_path: String) -> Result<Vec<FileEntry>> {
    let path = PathBuf::from(&dir_path);
    if !path.exists() {
        return Err(AppError::NotFound(dir_path));
    }
    if !path.is_dir() {
        return Err(AppError::InvalidPath(format!(
            "Path is not a directory: {dir_path}"
        )));
    }

    tokio::task::spawn_blocking(move || read_dir_recursive(&path))
        .await
        .map_err(|e| AppError::Internal(format!("Task execution failed: {e}")))?
}

pub fn read_dir_recursive(path: &Path) -> Result<Vec<FileEntry>> {
    let mut entries = Vec::new();

    let read_dir = std::fs::read_dir(path)?;
    for item in read_dir {
        let entry = item?;
        let entry_path = entry.path();
        let file_name = entry.file_name().to_string_lossy().to_string();

        let metadata = entry.metadata()?;
        let is_dir = metadata.is_dir();

        if is_dir && (file_name.starts_with('.') || IGNORED_DIRS.contains(&file_name.as_str())) {
            continue;
        }

        let size = if is_dir { None } else { Some(metadata.len()) };
        let modified = metadata
            .modified()
            .ok()
            .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
            .map(|d| d.as_millis() as u64);

        let children = if is_dir {
            Some(read_dir_recursive(&entry_path)?)
        } else {
            None
        };

        entries.push(FileEntry {
            name: file_name,
            path: entry_path.to_string_lossy().to_string(),
            is_directory: is_dir,
            size,
            modified,
            children,
        });
    }

    entries.sort_by(|a, b| match (a.is_directory, b.is_directory) {
        (true, false) => std::cmp::Ordering::Less,
        (false, true) => std::cmp::Ordering::Greater,
        _ => a.name.to_lowercase().cmp(&b.name.to_lowercase()),
    });

    Ok(entries)
}

#[tauri::command]
pub async fn read_file_text(path: String) -> Result<String> {
    let pb = PathBuf::from(&path);
    if !pb.exists() {
        return Err(AppError::NotFound(path));
    }

    let bytes = tokio::fs::read(&pb).await?;
    String::from_utf8(bytes).map_err(|e| AppError::InvalidEncoding(e.to_string()))
}

#[tauri::command]
pub async fn read_file_binary(path: String) -> Result<Vec<u8>> {
    let pb = PathBuf::from(&path);
    if !pb.exists() {
        return Err(AppError::NotFound(path));
    }

    tokio::fs::read(&pb).await.map_err(AppError::Io)
}

#[tauri::command]
pub async fn write_file_text(path: String, content: String) -> Result<()> {
    let target_path = PathBuf::from(&path);
    let parent = target_path.parent().ok_or_else(|| {
        AppError::InvalidPath(format!("Cannot determine parent directory for {path}"))
    })?;

    if !parent.exists() {
        tokio::fs::create_dir_all(parent).await?;
    }

    let file_stem = target_path
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| "unnamed".into());

    let nonce = std::time::SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    let tmp_path = parent.join(format!(".{file_stem}.tmp_{nonce}"));

    tokio::fs::write(&tmp_path, content.as_bytes()).await?;

    if let Err(e) = tokio::fs::rename(&tmp_path, &target_path).await {
        let _ = tokio::fs::remove_file(&tmp_path).await;
        return Err(AppError::from(e));
    }

    Ok(())
}

#[tauri::command]
pub async fn create_file(path: String) -> Result<()> {
    let pb = PathBuf::from(&path);
    if let Some(parent) = pb.parent().filter(|p| !p.exists()) {
        tokio::fs::create_dir_all(parent).await?;
    }
    tokio::fs::write(&pb, b"").await?;
    Ok(())
}

#[tauri::command]
pub async fn create_dir(path: String) -> Result<()> {
    let pb = PathBuf::from(&path);
    tokio::fs::create_dir_all(&pb).await?;
    Ok(())
}

#[tauri::command]
pub async fn rename_path(old_path: String, new_path: String) -> Result<()> {
    let old_pb = PathBuf::from(&old_path);
    if !old_pb.exists() {
        return Err(AppError::NotFound(old_path));
    }
    let new_pb = PathBuf::from(&new_path);
    if let Some(parent) = new_pb.parent().filter(|p| !p.exists()) {
        tokio::fs::create_dir_all(parent).await?;
    }
    tokio::fs::rename(old_pb, new_pb).await?;
    Ok(())
}

#[tauri::command]
pub async fn delete_path(path: String) -> Result<()> {
    let pb = PathBuf::from(&path);
    if !pb.exists() {
        return Err(AppError::NotFound(path));
    }

    if pb.is_dir() {
        tokio::fs::remove_dir_all(&pb).await?;
    } else {
        tokio::fs::remove_file(&pb).await?;
    }
    Ok(())
}

#[tauri::command]
pub async fn import_binary_asset(target_dir: String, source_path: String) -> Result<String> {
    let src = PathBuf::from(&source_path);
    if !src.exists() {
        return Err(AppError::NotFound(source_path));
    }

    let ext = src
        .extension()
        .and_then(|e| e.to_str())
        .map(|s| s.to_lowercase())
        .unwrap_or_default();

    if !ALLOWED_ASSET_EXTS.contains(&ext.as_str()) {
        return Err(AppError::UnsupportedAssetFormat(ext));
    }

    let target_dir_pb = PathBuf::from(&target_dir);
    if !target_dir_pb.exists() {
        tokio::fs::create_dir_all(&target_dir_pb).await?;
    }

    let file_name = src
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| format!("figure_{ext}.{ext}"));

    let mut dest = target_dir_pb.join(&file_name);
    let mut counter = 1;
    let stem = src
        .file_stem()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_else(|| "figure".into());

    while dest.exists() {
        dest = target_dir_pb.join(format!("{stem}_{counter}.{ext}"));
        counter += 1;
    }

    tokio::fs::copy(&src, &dest).await?;
    Ok(dest.to_string_lossy().to_string())
}

async fn copy_dir_recursive(src: &Path, dst: &Path) -> Result<()> {
    tokio::fs::create_dir_all(dst).await?;
    let mut entries = tokio::fs::read_dir(src).await?;
    while let Some(entry) = entries.next_entry().await? {
        let entry_path = entry.path();
        let target = dst.join(entry.file_name());
        if entry_path.is_dir() {
            Box::pin(copy_dir_recursive(&entry_path, &target)).await?;
        } else {
            tokio::fs::copy(&entry_path, &target).await?;
        }
    }
    Ok(())
}

#[tauri::command]
pub async fn duplicate_file(source_path: String) -> Result<String> {
    let src = PathBuf::from(&source_path);
    if !src.exists() {
        return Err(AppError::NotFound(source_path));
    }

    let parent = src.parent().ok_or_else(|| {
        AppError::InvalidPath(format!(
            "Cannot determine parent directory for {source_path}"
        ))
    })?;

    let is_dir = src.is_dir();
    let stem = src
        .file_stem()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_else(|| "copy".into());
    let ext = if is_dir {
        String::new()
    } else {
        src.extension()
            .map(|e| format!(".{}", e.to_string_lossy()))
            .unwrap_or_default()
    };

    let mut candidate = parent.join(format!("{stem}_copy{ext}"));
    let mut counter = 1;
    while candidate.exists() {
        counter += 1;
        candidate = parent.join(format!("{stem}_copy_{counter}{ext}"));
    }

    if is_dir {
        copy_dir_recursive(&src, &candidate).await?;
    } else {
        tokio::fs::copy(&src, &candidate).await?;
    }

    Ok(candidate.to_string_lossy().to_string())
}

#[tauri::command]
pub async fn watch_directory(
    dir_path: String,
    state: State<'_, AppState>,
    app_handle: AppHandle,
) -> Result<()> {
    let path = PathBuf::from(&dir_path);
    if !path.exists() || !path.is_dir() {
        return Err(AppError::NotFound(dir_path));
    }

    let watcher = crate::services::watcher::start_workspace_watcher(path, app_handle)?;

    if let Ok(mut lock) = state.watcher_handle.lock() {
        *lock = Some(watcher);
    }

    Ok(())
}

#[tauri::command]
pub async fn unwatch_directory(state: State<'_, AppState>) -> Result<()> {
    if let Ok(mut lock) = state.watcher_handle.lock() {
        *lock = None;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[tokio::test]
    async fn test_write_and_read_atomic() {
        let dir = tempdir().expect("tempdir");
        let file_path = dir.path().join("main.tex");
        let path_str = file_path.to_string_lossy().to_string();

        write_file_text(path_str.clone(), "\\documentclass{article}".into())
            .await
            .expect("write");
        let content = read_file_text(path_str).await.expect("read");
        assert_eq!(content, "\\documentclass{article}");
    }

    #[tokio::test]
    async fn test_create_rename_delete() {
        let dir = tempdir().expect("tempdir");
        let initial_path = dir.path().join("old.tex").to_string_lossy().to_string();
        let renamed_path = dir.path().join("new.tex").to_string_lossy().to_string();

        create_file(initial_path.clone()).await.expect("create");
        assert!(Path::new(&initial_path).exists());

        rename_path(initial_path.clone(), renamed_path.clone())
            .await
            .expect("rename");
        assert!(!Path::new(&initial_path).exists());
        assert!(Path::new(&renamed_path).exists());

        delete_path(renamed_path.clone()).await.expect("delete");
        assert!(!Path::new(&renamed_path).exists());
    }

    #[tokio::test]
    async fn test_recursive_listing() {
        let dir = tempdir().expect("tempdir");
        let sub = dir.path().join("sections");
        std::fs::create_dir_all(&sub).expect("create_dir");
        std::fs::write(sub.join("intro.tex"), b"intro").expect("write");
        std::fs::write(dir.path().join("main.tex"), b"main").expect("write");

        let entries = read_dir_recursive(dir.path()).expect("read_dir");
        assert_eq!(entries.len(), 2);
        assert_eq!(entries[0].name, "sections");
        assert!(entries[0].is_directory);
        assert_eq!(entries[1].name, "main.tex");
        assert!(!entries[1].is_directory);
    }

    #[tokio::test]
    async fn test_asset_import() {
        let dir = tempdir().expect("tempdir");
        let src_file = dir.path().join("sample.png");
        std::fs::write(&src_file, b"fake png data").expect("write sample");

        let figures_dir = dir.path().join("figures");
        let imported = import_binary_asset(
            figures_dir.to_string_lossy().to_string(),
            src_file.to_string_lossy().to_string(),
        )
        .await
        .expect("import");

        assert!(Path::new(&imported).exists());
        assert!(imported.ends_with("sample.png"));
    }

    #[tokio::test]
    async fn test_duplicate_file_and_dir() {
        let dir = tempdir().expect("tempdir");
        let file_path = dir.path().join("doc.tex");
        std::fs::write(&file_path, b"content").expect("write");

        let dup = duplicate_file(file_path.to_string_lossy().to_string())
            .await
            .expect("duplicate file");
        assert!(Path::new(&dup).exists());
        assert!(dup.ends_with("doc_copy.tex"));

        let dup2 = duplicate_file(file_path.to_string_lossy().to_string())
            .await
            .expect("duplicate file again");
        assert!(Path::new(&dup2).exists());
        assert!(dup2.ends_with("doc_copy_2.tex"));

        let sub_dir = dir.path().join("figures");
        std::fs::create_dir_all(&sub_dir).expect("create dir");
        std::fs::write(sub_dir.join("a.png"), b"image").expect("write image");

        let dup_dir = duplicate_file(sub_dir.to_string_lossy().to_string())
            .await
            .expect("duplicate dir");
        assert!(Path::new(&dup_dir).exists());
        assert!(dup_dir.ends_with("figures_copy"));
        assert!(Path::new(&dup_dir).join("a.png").exists());
    }
}

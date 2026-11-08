use crate::error::{AppError, Result};
use serde::{Deserialize, Serialize};
use std::collections::BTreeSet;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SystemFontInfo {
    pub family: String,
    pub postscript_name: Option<String>,
    pub style: String,
    pub weight: u16,
    pub is_monospace: bool,
    pub path: Option<String>,
}

#[tauri::command]
pub async fn list_system_fonts() -> Result<Vec<SystemFontInfo>> {
    tokio::task::spawn_blocking(|| {
        let mut db = fontdb::Database::new();
        db.load_system_fonts();

        let mut fonts = Vec::new();
        let mut seen = BTreeSet::new();

        for face in db.faces() {
            let family = face
                .families
                .first()
                .map(|(name, _)| name.clone())
                .unwrap_or_else(|| "Unknown".to_string());

            let style_str = match face.style {
                fontdb::Style::Normal => "Normal",
                fontdb::Style::Italic => "Italic",
                fontdb::Style::Oblique => "Oblique",
            };

            let key = (family.clone(), style_str.to_string(), face.weight.0);
            if !seen.insert(key) {
                continue;
            }

            let path = match &face.source {
                fontdb::Source::File(p) => Some(p.to_string_lossy().to_string()),
                _ => None,
            };

            fonts.push(SystemFontInfo {
                family,
                postscript_name: Some(face.post_script_name.clone()),
                style: style_str.to_string(),
                weight: face.weight.0,
                is_monospace: face.monospaced,
                path,
            });
        }

        fonts.sort_by_key(|a| a.family.to_lowercase());
        Ok(fonts)
    })
    .await
    .map_err(|e| AppError::Internal(format!("Font discovery panicked: {e}")))?
}

#[tauri::command]
pub async fn list_font_families() -> Result<Vec<String>> {
    tokio::task::spawn_blocking(|| {
        let mut db = fontdb::Database::new();
        db.load_system_fonts();

        let mut families = BTreeSet::new();
        for face in db.faces() {
            if let Some((name, _)) = face.families.first()
                && !name.trim().is_empty()
            {
                families.insert(name.clone());
            }
        }

        Ok(families.into_iter().collect())
    })
    .await
    .map_err(|e| AppError::Internal(format!("Font discovery panicked: {e}")))?
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_font_discovery() {
        let fonts = list_system_fonts().await.expect("list fonts");
        // On any standard Windows/Mac/Linux system, there are system fonts available
        assert!(!fonts.is_empty(), "Should discover system fonts");
    }
}

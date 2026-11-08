use crate::error::{AppError, Result};
use flate2::read::GzDecoder;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs::File;
use std::io::Read;
use std::path::{Path, PathBuf};

const SP_PER_PT: f64 = 65536.0;
const PT_TO_PDF_PT: f64 = 72.0 / 72.27;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SyncTexCoordinate {
    pub page: u32,
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SyncTexInverseResult {
    pub file: String,
    pub line: u32,
    pub column: u32,
}

#[derive(Debug, Clone)]
pub struct SyncRecord {
    pub file_tag: u32,
    pub line: u32,
    pub col: u32,
    pub page: u32,
    pub x_pt: f64,
    pub y_pt: f64,
    pub width_pt: f64,
    pub height_pt: f64,
}

#[derive(Debug, Clone, Default)]
pub struct SyncTexData {
    pub inputs: HashMap<u32, String>,
    pub records: Vec<SyncRecord>,
    pub unit: f64,
    pub magnification: f64,
    pub x_offset: f64,
    pub y_offset: f64,
}

impl SyncTexData {
    pub fn parse_str(content: &str) -> Self {
        let mut data = SyncTexData {
            inputs: HashMap::new(),
            records: Vec::new(),
            unit: 1.0,
            magnification: 1000.0,
            x_offset: 0.0,
            y_offset: 0.0,
        };

        let mut current_page: u32 = 1;
        let mut in_content = false;

        for raw_line in content.lines() {
            let line = raw_line.trim();
            if line.is_empty() {
                continue;
            }

            if !in_content {
                if line.starts_with("Content:") {
                    in_content = true;
                    continue;
                }
                if let Some(rest) = line.strip_prefix("Input:") {
                    let mut parts = rest.splitn(2, ':');
                    if let (Some(tag_str), Some(path_str)) = (parts.next(), parts.next())
                        && let Ok(tag) = tag_str.parse::<u32>()
                    {
                        let path = path_str.trim().trim_matches('"').replace('\\', "/");
                        data.inputs.insert(tag, path);
                    }
                } else if let Some(rest) = line.strip_prefix("Unit:") {
                    if let Ok(u) = rest.parse::<f64>() {
                        data.unit = u;
                    }
                } else if let Some(rest) = line.strip_prefix("Magnification:") {
                    if let Ok(m) = rest.parse::<f64>() {
                        data.magnification = m;
                    }
                } else if let Some(rest) = line.strip_prefix("X Offset:") {
                    if let Ok(x) = rest.parse::<f64>() {
                        data.x_offset = x;
                    }
                } else if let Some(rest) = line.strip_prefix("Y Offset:")
                    && let Ok(y) = rest.parse::<f64>()
                {
                    data.y_offset = y;
                }
                continue;
            }

            // In Content section
            if line.starts_with('{') {
                if let Ok(p) = line.trim_start_matches('{').parse::<u32>() {
                    current_page = p;
                }
                continue;
            }
            if line.starts_with('}') {
                continue;
            }

            // SyncTeX records:
            // [tag,line,col:x,y:w,h,d
            // (tag,line,col:x,y:w,h,d
            // xtag,line,col:x,y
            // gtag,line,col:x,y:w
            // ktag,line,col:x,y:w
            // mtag,line,col:x,y
            // htag,line,col:x,y:w
            let first_char = line.chars().next().unwrap_or(' ');
            let is_box = first_char == '[' || first_char == '(';
            let is_elem = matches!(first_char, 'x' | 'g' | 'k' | 'm' | 'h' | 'v');

            if is_box || is_elem {
                let slice = if is_box || is_elem { &line[1..] } else { line };
                if let Some(record) = parse_record_line(slice, current_page, &data) {
                    data.records.push(record);
                }
            }
        }

        data
    }

    pub fn forward_search(
        &self,
        file_target: &str,
        target_line: u32,
        _target_col: u32,
    ) -> Option<SyncTexCoordinate> {
        let normalized_target = file_target.replace('\\', "/");
        let target_filename = Path::new(&normalized_target)
            .file_name()
            .and_then(|s| s.to_str())
            .unwrap_or(&normalized_target);

        // Find matching tag(s)
        let matching_tags: Vec<u32> = self
            .inputs
            .iter()
            .filter(|(_, path)| {
                let p = path.replace('\\', "/");
                p.ends_with(&normalized_target)
                    || normalized_target.ends_with(&p)
                    || Path::new(&p).file_name().and_then(|s| s.to_str()) == Some(target_filename)
            })
            .map(|(&tag, _)| tag)
            .collect();

        if matching_tags.is_empty() {
            return None;
        }

        // Find candidate records on the exact line or nearest line
        let mut candidates: Vec<&SyncRecord> = self
            .records
            .iter()
            .filter(|r| matching_tags.contains(&r.file_tag))
            .collect();

        if candidates.is_empty() {
            return None;
        }

        // Sort by distance to target_line
        candidates.sort_by_key(|r| (r.line as i64 - target_line as i64).abs());

        let best = candidates.first()?;
        let width = if best.width_pt > 5.0 {
            best.width_pt
        } else {
            120.0
        };
        let height = if best.height_pt > 5.0 {
            best.height_pt
        } else {
            16.0
        };

        Some(SyncTexCoordinate {
            page: best.page,
            x: best.x_pt,
            y: best.y_pt,
            width,
            height,
        })
    }

    pub fn inverse_search(
        &self,
        page: u32,
        x_pdf: f64,
        y_pdf: f64,
    ) -> Option<SyncTexInverseResult> {
        let page_records: Vec<&SyncRecord> =
            self.records.iter().filter(|r| r.page == page).collect();

        if page_records.is_empty() {
            return None;
        }

        let mut closest: Option<&SyncRecord> = None;
        let mut min_dist_sq = f64::MAX;

        for r in page_records {
            let dx = r.x_pt - x_pdf;
            let dy = r.y_pt - y_pdf;
            let dist_sq = dx * dx + dy * dy;

            if dist_sq < min_dist_sq {
                min_dist_sq = dist_sq;
                closest = Some(r);
            }
        }

        let best = closest?;
        let file_path = self
            .inputs
            .get(&best.file_tag)
            .cloned()
            .unwrap_or_else(|| "main.tex".to_string());

        Some(SyncTexInverseResult {
            file: file_path,
            line: best.line,
            column: best.col,
        })
    }
}

fn parse_record_line(slice: &str, page: u32, data: &SyncTexData) -> Option<SyncRecord> {
    // format: tag,line,col:x,y[:w,h,d]
    let mut colon_parts = slice.split(':');
    let tlc = colon_parts.next()?;
    let xy = colon_parts.next()?;
    let whd = colon_parts.next();

    let mut tlc_parts = tlc.split(',');
    let file_tag: u32 = tlc_parts.next()?.parse().ok()?;
    let line: u32 = tlc_parts.next()?.parse().ok()?;
    let col: u32 = tlc_parts.next().and_then(|s| s.parse().ok()).unwrap_or(1);

    let mut xy_parts = xy.split(',');
    let x_sp: f64 = xy_parts.next()?.parse().ok()?;
    let y_sp: f64 = xy_parts.next()?.parse().ok()?;

    let (w_pt, h_pt) = if let Some(whd_str) = whd {
        let mut whd_parts = whd_str.split(',');
        let w_sp: f64 = whd_parts.next().and_then(|s| s.parse().ok()).unwrap_or(0.0);
        let h_sp: f64 = whd_parts.next().and_then(|s| s.parse().ok()).unwrap_or(0.0);
        (sp_to_pdf_pt(w_sp, data), sp_to_pdf_pt(h_sp, data))
    } else {
        (0.0, 0.0)
    };

    let x_pt = sp_to_pdf_pt(x_sp, data) + data.x_offset;
    let y_pt = sp_to_pdf_pt(y_sp, data) + data.y_offset;

    Some(SyncRecord {
        file_tag,
        line,
        col,
        page,
        x_pt,
        y_pt,
        width_pt: w_pt,
        height_pt: h_pt,
    })
}

fn sp_to_pdf_pt(sp: f64, _data: &SyncTexData) -> f64 {
    // 65536 sp = 1 pt. 1 pt = 72/72.27 PDF pt
    (sp / SP_PER_PT) * PT_TO_PDF_PT
}

pub fn load_synctex_file(synctex_path: &Path) -> Result<SyncTexData> {
    if !synctex_path.exists() {
        return Err(AppError::SyncTex(format!(
            "SyncTeX file not found at: {}",
            synctex_path.to_string_lossy()
        )));
    }

    let is_gz = synctex_path
        .extension()
        .and_then(|s| s.to_str())
        .map(|s| s.eq_ignore_ascii_case("gz"))
        .unwrap_or(false);

    let content_string = if is_gz {
        let file = File::open(synctex_path).map_err(AppError::Io)?;
        let mut decoder = GzDecoder::new(file);
        let mut s = String::new();
        decoder
            .read_to_string(&mut s)
            .map_err(|e| AppError::SyncTex(format!("Failed to decompress .synctex.gz: {e}")))?;
        s
    } else {
        std::fs::read_to_string(synctex_path).map_err(AppError::Io)?
    };

    Ok(SyncTexData::parse_str(&content_string))
}

pub fn resolve_synctex_path(project_dir: &Path, root_filename: &str) -> Option<PathBuf> {
    let stem = Path::new(root_filename)
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("main");

    // Check .leafforge hidden output folder first
    let hidden_dir = project_dir.join(".leafforge");
    let gz_hidden = hidden_dir.join(format!("{stem}.synctex.gz"));
    if gz_hidden.exists() {
        return Some(gz_hidden);
    }

    let uncompressed_hidden = hidden_dir.join(format!("{stem}.synctex"));
    if uncompressed_hidden.exists() {
        return Some(uncompressed_hidden);
    }

    // Fallback to project root
    let gz_path = project_dir.join(format!("{stem}.synctex.gz"));
    if gz_path.exists() {
        return Some(gz_path);
    }

    let uncompressed_path = project_dir.join(format!("{stem}.synctex"));
    if uncompressed_path.exists() {
        return Some(uncompressed_path);
    }

    None
}

#[cfg(test)]
mod tests {
    use super::*;

    const SAMPLE_SYNCTEX: &str = r#"SyncTeX Version:1
Input:1:main.tex
Input:2:sections/intro.tex
Output:pdf
Magnification:1000
Unit:1
X Offset:0
Y Offset:0
Content:
{1
[1,5,1:6553600,13107200:19660800,655360,0
x1,5,1:6553600,13107200
k1,5,1:6553600,13107200:655360
[2,12,1:7864320,15728640:13107200,655360,0
]
}1
"#;

    #[test]
    fn test_synctex_parse() {
        let data = SyncTexData::parse_str(SAMPLE_SYNCTEX);
        assert_eq!(data.inputs.len(), 2);
        assert_eq!(data.inputs.get(&1), Some(&"main.tex".to_string()));
        assert_eq!(data.inputs.get(&2), Some(&"sections/intro.tex".to_string()));
        assert!(!data.records.is_empty());
    }

    #[test]
    fn test_forward_search() {
        let data = SyncTexData::parse_str(SAMPLE_SYNCTEX);
        let coord = data.forward_search("main.tex", 5, 1).expect("found coord");
        assert_eq!(coord.page, 1);
        assert!(coord.x > 0.0);
        assert!(coord.y > 0.0);

        let coord2 = data
            .forward_search("sections/intro.tex", 12, 1)
            .expect("intro coord");
        assert_eq!(coord2.page, 1);
    }

    #[test]
    fn test_inverse_search() {
        let data = SyncTexData::parse_str(SAMPLE_SYNCTEX);
        // Record 1 was at x ~ 100 pt, y ~ 200 pt
        let coord = data.forward_search("main.tex", 5, 1).unwrap();
        let inv = data
            .inverse_search(1, coord.x + 2.0, coord.y + 2.0)
            .expect("inverse match");
        assert_eq!(inv.file, "main.tex");
        assert_eq!(inv.line, 5);
    }

    #[test]
    fn test_unindexed_file_forward_search() {
        let data = SyncTexData::parse_str(SAMPLE_SYNCTEX);
        assert!(data.forward_search("nonexistent.tex", 1, 1).is_none());
    }

    #[test]
    fn test_inverse_search_page_without_records() {
        let data = SyncTexData::parse_str(SAMPLE_SYNCTEX);
        assert!(data.inverse_search(99, 100.0, 100.0).is_none());
    }

    #[test]
    fn test_sp_to_pdf_pt_calculation() {
        let data = SyncTexData::default();
        let pt = sp_to_pdf_pt(65536.0, &data);
        assert!((pt - 0.996264).abs() < 1e-4);
    }
}

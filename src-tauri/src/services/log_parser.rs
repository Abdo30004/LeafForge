use regex::Regex;
use serde::{Deserialize, Serialize};
use std::path::Path;
use std::sync::LazyLock;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum DiagnosticSeverity {
    Error,
    Warning,
    Info,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct LatexDiagnostic {
    pub file_path: String,
    pub line: u32,
    pub column: u32,
    pub severity: DiagnosticSeverity,
    pub message: String,
    pub raw_log_snippet: Option<String>,
}

static FILE_LINE_ERROR_REGEX: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r#"^((?:[a-zA-Z]:[/\\])?[^:\r\n]+):(\d+):\s*(.*)$"#).expect("valid regex")
});

static LINE_NUM_REGEX: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r#"l\.(\d+)\s*(.*)$"#).expect("valid regex"));

static ON_INPUT_LINE_REGEX: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r#"(?i)on input line\s+(\d+)"#).expect("valid regex"));

static AT_LINES_REGEX: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r#"(?i)at lines?\s+(\d+)(?:--(\d+))?"#).expect("valid regex"));

static LATEX_WARNING_REGEX: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r#"(?i)^(?:LaTeX|(?:Package|Class)\s+([\w\d\-]+))\s+Warning:\s*(.*)$"#)
        .expect("valid regex")
});

static BAD_BOX_REGEX: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r#"(?i)^(Overfull|Underfull)\s+\\([hv]box)\s*(.*)$"#).expect("valid regex")
});

pub fn normalize_file_path(path_str: &str, project_dir: Option<&Path>) -> String {
    let cleaned = path_str.trim().trim_matches('"');
    let mut normalized = cleaned.replace('\\', "/");

    if let Some(prefix) = normalized.strip_prefix("./") {
        normalized = prefix.to_string();
    }

    if let Some(base) = project_dir {
        let base_str = base.to_string_lossy().replace('\\', "/");
        if let Some(stripped) = normalized.strip_prefix(&base_str) {
            normalized = stripped.trim_start_matches('/').to_string();
        }
    }

    normalized
}

pub fn parse_latex_log(
    log_content: &str,
    default_root_file: &str,
    project_dir: Option<&Path>,
) -> Vec<LatexDiagnostic> {
    let mut diagnostics = Vec::new();
    let lines: Vec<&str> = log_content.lines().collect();
    let total_lines = lines.len();

    let default_file = normalize_file_path(default_root_file, project_dir);
    let mut file_stack: Vec<String> = vec![default_file.clone()];

    let mut i = 0;
    while i < total_lines {
        let line = lines[i].trim_end();

        // 1. Check for file-line-error format: "path/file.tex:42: Error message"
        if let Some(caps) = FILE_LINE_ERROR_REGEX.captures(line) {
            let file_cand = caps.get(1).map(|m| m.as_str()).unwrap_or("");
            let line_num: u32 = caps
                .get(2)
                .and_then(|m| m.as_str().parse().ok())
                .unwrap_or(1);
            let msg = caps.get(3).map(|m| m.as_str()).unwrap_or("").trim();

            if (file_cand.ends_with(".tex")
                || file_cand.ends_with(".sty")
                || file_cand.ends_with(".cls")
                || file_cand.ends_with(".bib"))
                && !file_cand.contains(' ')
            {
                let snippet = get_snippet(&lines, i, 3);
                let severity = if msg.to_lowercase().contains("warning") {
                    DiagnosticSeverity::Warning
                } else {
                    DiagnosticSeverity::Error
                };

                diagnostics.push(LatexDiagnostic {
                    file_path: normalize_file_path(file_cand, project_dir),
                    line: line_num,
                    column: 1,
                    severity,
                    message: msg.to_string(),
                    raw_log_snippet: Some(snippet),
                });
                i += 1;
                continue;
            }
        }

        // 2. Track file stack from parentheses
        track_file_stack(line, &mut file_stack, project_dir);

        let current_file = file_stack.last().cloned().unwrap_or_else(|| default_file.clone());

        // 3. Traditional LaTeX Errors starting with "! "
        if line.starts_with("! ") {
            let error_msg = line.trim_start_matches("! ").trim().to_string();
            let mut line_num: u32 = 1;
            let mut snippet_lines = vec![line];

            let mut j = i + 1;
            while j < total_lines && j <= i + 6 {
                let next_line = lines[j].trim_end();
                snippet_lines.push(next_line);

                if let Some(line_caps) = LINE_NUM_REGEX.captures(next_line)
                    && let Some(num_str) = line_caps.get(1)
                    && let Ok(parsed) = num_str.as_str().parse::<u32>()
                {
                    line_num = parsed;
                    break;
                } else if let Some(input_caps) = ON_INPUT_LINE_REGEX.captures(next_line)
                    && let Some(num_str) = input_caps.get(1)
                    && let Ok(parsed) = num_str.as_str().parse::<u32>()
                {
                    line_num = parsed;
                    break;
                }

                if next_line.starts_with("! ") || next_line.starts_with("LaTeX Warning") {
                    break;
                }
                j += 1;
            }

            diagnostics.push(LatexDiagnostic {
                file_path: current_file.clone(),
                line: line_num,
                column: 1,
                severity: DiagnosticSeverity::Error,
                message: error_msg,
                raw_log_snippet: Some(snippet_lines.join("\n")),
            });

            i = j;
            continue;
        }

        // 4. Package / LaTeX Warnings
        if let Some(warn_caps) = LATEX_WARNING_REGEX.captures(line) {
            let pkg = warn_caps.get(1).map(|m| m.as_str()).unwrap_or("LaTeX");
            let rest = warn_caps.get(2).map(|m| m.as_str()).unwrap_or("");
            let mut full_warn = format!("{pkg} Warning: {rest}");

            let mut line_num: u32 = 1;
            let mut snippet_lines = vec![line];

            if let Some(in_caps) = ON_INPUT_LINE_REGEX.captures(&full_warn) {
                if let Some(num_str) = in_caps.get(1) {
                    line_num = num_str.as_str().parse().unwrap_or(1);
                }
            } else {
                let mut j = i + 1;
                while j < total_lines && j <= i + 3 {
                    let next_line = lines[j].trim_end();
                    if next_line.is_empty() || next_line.starts_with("! ") || next_line.starts_with("LaTeX Warning") {
                        break;
                    }
                    snippet_lines.push(next_line);
                    full_warn.push(' ');
                    full_warn.push_str(next_line.trim());

                    if let Some(in_caps) = ON_INPUT_LINE_REGEX.captures(next_line)
                        && let Some(num_str) = in_caps.get(1)
                    {
                        line_num = num_str.as_str().parse().unwrap_or(1);
                        break;
                    }
                    j += 1;
                }
            }

            diagnostics.push(LatexDiagnostic {
                file_path: current_file.clone(),
                line: line_num,
                column: 1,
                severity: DiagnosticSeverity::Warning,
                message: full_warn,
                raw_log_snippet: Some(snippet_lines.join("\n")),
            });

            i += 1;
            continue;
        }

        // 5. Bad Boxes (Overfull / Underfull)
        if let Some(box_caps) = BAD_BOX_REGEX.captures(line) {
            let kind = box_caps.get(1).map(|m| m.as_str()).unwrap_or("Overfull");
            let box_type = box_caps.get(2).map(|m| m.as_str()).unwrap_or("hbox");
            let details = box_caps.get(3).map(|m| m.as_str()).unwrap_or("");

            let mut line_num: u32 = 1;
            if let Some(at_caps) = AT_LINES_REGEX.captures(details)
                && let Some(start_line) = at_caps.get(1)
            {
                line_num = start_line.as_str().parse().unwrap_or(1);
            }

            let message = format!("{kind} \\{box_type} {details}").trim().to_string();

            diagnostics.push(LatexDiagnostic {
                file_path: current_file.clone(),
                line: line_num,
                column: 1,
                severity: DiagnosticSeverity::Warning,
                message,
                raw_log_snippet: Some(line.to_string()),
            });

            i += 1;
            continue;
        }

        i += 1;
    }

    diagnostics
}

fn track_file_stack(line: &str, stack: &mut Vec<String>, project_dir: Option<&Path>) {
    // Look for (./path.tex or (path/to/file.tex
    let mut chars = line.chars().peekable();
    while let Some(ch) = chars.next() {
        if ch == '(' {
            let mut token = String::new();
            while let Some(&next) = chars.peek() {
                if next == ')' || next == '(' || next == ' ' || next == '[' || next == ']' {
                    break;
                }
                token.push(chars.next().unwrap());
            }
            if !token.is_empty()
                && (token.ends_with(".tex")
                    || token.ends_with(".sty")
                    || token.ends_with(".cls")
                    || token.ends_with(".bib"))
            {
                stack.push(normalize_file_path(&token, project_dir));
            }
        } else if ch == ')' && stack.len() > 1 {
            stack.pop();
        }
    }
}

fn get_snippet(lines: &[&str], center: usize, radius: usize) -> String {
    let start = center.saturating_sub(radius);
    let end = (center + radius + 1).min(lines.len());
    lines[start..end].join("\n")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_file_line_error_parsing() {
        let log = r#"
./sections/intro.tex:42: Undefined control sequence.
\badmacro
./main.tex:10: LaTeX Error: Environment align undefined.
"#;
        let diags = parse_latex_log(log, "main.tex", None);
        assert_eq!(diags.len(), 2);
        assert_eq!(diags[0].file_path, "sections/intro.tex");
        assert_eq!(diags[0].line, 42);
        assert_eq!(diags[0].severity, DiagnosticSeverity::Error);
        assert!(diags[0].message.contains("Undefined control sequence"));

        assert_eq!(diags[1].file_path, "main.tex");
        assert_eq!(diags[1].line, 10);
        assert_eq!(diags[1].severity, DiagnosticSeverity::Error);
    }

    #[test]
    fn test_traditional_latex_error_parsing() {
        let log = r#"
(./sections/methods.tex
! Undefined control sequence.
l.88 \nonexistentcommand
)
"#;
        let diags = parse_latex_log(log, "main.tex", None);
        assert_eq!(diags.len(), 1);
        assert_eq!(diags[0].file_path, "sections/methods.tex");
        assert_eq!(diags[0].line, 88);
        assert_eq!(diags[0].severity, DiagnosticSeverity::Error);
        assert!(diags[0].message.contains("Undefined control sequence"));
    }

    #[test]
    fn test_latex_warning_parsing() {
        let log = r#"
LaTeX Warning: Reference `sec:results' on page 4 undefined on input line 152.
Package hyperref Warning: Token not allowed in a PDF string on input line 200.
"#;
        let diags = parse_latex_log(log, "main.tex", None);
        assert_eq!(diags.len(), 2);
        assert_eq!(diags[0].severity, DiagnosticSeverity::Warning);
        assert_eq!(diags[0].line, 152);
        assert!(diags[0].message.contains("Reference `sec:results'"));

        assert_eq!(diags[1].severity, DiagnosticSeverity::Warning);
        assert_eq!(diags[1].line, 200);
    }

    #[test]
    fn test_bad_boxes_parsing() {
        let log = r#"
Overfull \hbox (15.2pt too wide) in paragraph at lines 42--48
Underfull \vbox (badness 10000) has occurred while \output is active [1]
"#;
        let diags = parse_latex_log(log, "main.tex", None);
        assert_eq!(diags.len(), 2);
        assert_eq!(diags[0].severity, DiagnosticSeverity::Warning);
        assert_eq!(diags[0].line, 42);
        assert!(diags[0].message.contains("Overfull \\hbox"));
        assert_eq!(diags[1].severity, DiagnosticSeverity::Warning);
    }

    #[test]
    fn test_normalize_file_path() {
        assert_eq!(normalize_file_path("./sections/intro.tex", None), "sections/intro.tex");
        assert_eq!(normalize_file_path("\"sections\\ch1.tex\"", None), "sections/ch1.tex");
    }
}

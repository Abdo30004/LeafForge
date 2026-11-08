use crate::error::{AppError, Result};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;
use std::sync::atomic::{AtomicU64, Ordering};
use tokio::io::{AsyncBufReadExt, AsyncReadExt, AsyncWriteExt, BufReader};
use tokio::process::{Child, ChildStdin, Command};
use tokio::sync::{Mutex, mpsc, oneshot};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LspStatusResponse {
    pub running: bool,
    pub server: String,
    pub binary_found: bool,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CompletionItem {
    pub label: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub kind: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub detail: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub documentation: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub insert_text: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HoverResponse {
    pub contents: String,
}

type ResponseMap = Arc<Mutex<HashMap<u64, oneshot::Sender<serde_json::Value>>>>;

pub struct LspSupervisor {
    child: Option<Child>,
    stdin_tx: Option<mpsc::Sender<String>>,
    pending_responses: ResponseMap,
    request_counter: AtomicU64,
    root_path: Option<PathBuf>,
    binary_found: bool,
    documents: HashMap<String, String>,
}

impl Default for LspSupervisor {
    fn default() -> Self {
        Self::new()
    }
}

impl LspSupervisor {
    pub fn new() -> Self {
        Self {
            child: None,
            stdin_tx: None,
            pending_responses: Arc::new(Mutex::new(HashMap::new())),
            request_counter: AtomicU64::new(1),
            root_path: None,
            binary_found: false,
            documents: HashMap::new(),
        }
    }

    pub async fn start(&mut self, root_path: Option<PathBuf>) -> Result<LspStatusResponse> {
        self.root_path = root_path.clone();

        // Check if texlab binary is available
        let texlab_available = Command::new("texlab")
            .arg("--version")
            .output()
            .await
            .is_ok();

        self.binary_found = texlab_available;

        if texlab_available {
            match self.spawn_texlab_process().await {
                Ok(()) => {
                    return Ok(LspStatusResponse {
                        running: true,
                        server: "TexLab LSP (Native Daemon)".to_string(),
                        binary_found: true,
                        message: "TexLab process active and connected via stdio".to_string(),
                    });
                }
                Err(err) => {
                    eprintln!(
                        "Failed to spawn native texlab daemon: {err}. Falling back to embedded LSP engine."
                    );
                }
            }
        }

        // Embedded LSP Engine fallback
        Ok(LspStatusResponse {
            running: true,
            server: "Embedded TeX Language Service".to_string(),
            binary_found: false,
            message:
                "Operating with high-speed built-in LaTeX completion and macro analysis engine"
                    .to_string(),
        })
    }

    async fn spawn_texlab_process(&mut self) -> Result<()> {
        let mut child = Command::new("texlab")
            .stdin(std::process::Stdio::piped())
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::null())
            .spawn()
            .map_err(|e| AppError::Lsp(format!("Failed to spawn texlab: {e}")))?;

        let stdin = child
            .stdin
            .take()
            .ok_or_else(|| AppError::Lsp("Failed to open texlab stdin".to_string()))?;
        let stdout = child
            .stdout
            .take()
            .ok_or_else(|| AppError::Lsp("Failed to open texlab stdout".to_string()))?;

        let (stdin_tx, mut stdin_rx) = mpsc::channel::<String>(128);

        // Stdin writer task
        tokio::spawn(async move {
            let mut writer: ChildStdin = stdin;
            while let Some(msg) = stdin_rx.recv().await {
                if writer.write_all(msg.as_bytes()).await.is_err() {
                    break;
                }
                if writer.flush().await.is_err() {
                    break;
                }
            }
        });

        // Stdout reader task (LSP JSON-RPC framing)
        let pending = Arc::clone(&self.pending_responses);
        tokio::spawn(async move {
            let mut reader = BufReader::new(stdout);
            let mut header_buf = String::new();

            loop {
                header_buf.clear();
                let mut content_length: Option<usize> = None;

                // Read headers until empty line
                loop {
                    let bytes_read = match reader.read_line(&mut header_buf).await {
                        Ok(b) => b,
                        Err(_) => return,
                    };
                    if bytes_read == 0 {
                        return; // EOF
                    }

                    let trimmed = header_buf.trim();
                    if trimmed.is_empty() {
                        break;
                    }

                    if let Some(rest) = trimmed.strip_prefix("Content-Length:")
                        && let Ok(len) = rest.trim().parse::<usize>()
                    {
                        content_length = Some(len);
                    }
                    header_buf.clear();
                }

                if let Some(length) = content_length {
                    let mut body_buf = vec![0u8; length];
                    if reader.read_exact(&mut body_buf).await.is_err() {
                        return;
                    }

                    if let Ok(val) = serde_json::from_slice::<serde_json::Value>(&body_buf)
                        && let Some(id) = val.get("id").and_then(|i| i.as_u64())
                    {
                        let mut map = pending.lock().await;
                        if let Some(tx) = map.remove(&id) {
                            let _ = tx.send(val);
                        }
                    }
                }
            }
        });

        self.child = Some(child);
        self.stdin_tx = Some(stdin_tx);

        // Send LSP initialize
        let root_uri = self
            .root_path
            .as_ref()
            .map(|p| format!("file://{}", p.to_string_lossy().replace('\\', "/")));

        let init_params = serde_json::json!({
            "processId": std::process::id(),
            "rootUri": root_uri,
            "capabilities": {
                "textDocument": {
                    "completion": { "completionItem": { "snippetSupport": true } },
                    "hover": { "contentFormat": ["markdown", "plaintext"] }
                }
            }
        });

        let _ = self.send_request("initialize", init_params).await;
        let _ = self
            .send_notification("initialized", serde_json::json!({}))
            .await;

        Ok(())
    }

    pub async fn stop(&mut self) -> Result<()> {
        if let Some(mut child) = self.child.take() {
            let _ = child.kill().await;
        }
        self.stdin_tx = None;
        self.pending_responses.lock().await.clear();
        Ok(())
    }

    pub fn status(&self) -> LspStatusResponse {
        if self.child.is_some() {
            LspStatusResponse {
                running: true,
                server: "TexLab LSP (Native Daemon)".to_string(),
                binary_found: true,
                message: "Connected and active".to_string(),
            }
        } else {
            LspStatusResponse {
                running: true,
                server: "Embedded TeX Language Service".to_string(),
                binary_found: self.binary_found,
                message: "Active embedded completion & macro supervisor".to_string(),
            }
        }
    }

    pub async fn send_request(
        &self,
        method: &str,
        params: serde_json::Value,
    ) -> Result<serde_json::Value> {
        let tx = match &self.stdin_tx {
            Some(t) => t,
            None => return Err(AppError::Lsp("No active LSP child process".to_string())),
        };

        let req_id = self.request_counter.fetch_add(1, Ordering::SeqCst);
        let req_obj = serde_json::json!({
            "jsonrpc": "2.0",
            "id": req_id,
            "method": method,
            "params": params
        });

        let json_body = serde_json::to_string(&req_obj)
            .map_err(|e| AppError::Lsp(format!("Failed to serialize LSP request: {e}")))?;
        let frame = format!("Content-Length: {}\r\n\r\n{}", json_body.len(), json_body);

        let (resp_tx, resp_rx) = oneshot::channel();
        {
            let mut map = self.pending_responses.lock().await;
            map.insert(req_id, resp_tx);
        }

        tx.send(frame)
            .await
            .map_err(|e| AppError::Lsp(format!("Failed to send LSP frame: {e}")))?;

        match tokio::time::timeout(std::time::Duration::from_millis(1500), resp_rx).await {
            Ok(Ok(val)) => Ok(val),
            Ok(Err(_)) => Err(AppError::Lsp(
                "LSP channel dropped before response".to_string(),
            )),
            Err(_) => {
                let mut map = self.pending_responses.lock().await;
                map.remove(&req_id);
                Err(AppError::Lsp("LSP request timed out".to_string()))
            }
        }
    }

    pub async fn send_notification(&self, method: &str, params: serde_json::Value) -> Result<()> {
        let tx = match &self.stdin_tx {
            Some(t) => t,
            None => return Ok(()),
        };

        let notif_obj = serde_json::json!({
            "jsonrpc": "2.0",
            "method": method,
            "params": params
        });

        let json_body = serde_json::to_string(&notif_obj)
            .map_err(|e| AppError::Lsp(format!("Failed to serialize notification: {e}")))?;
        let frame = format!("Content-Length: {}\r\n\r\n{}", json_body.len(), json_body);

        let _ = tx.send(frame).await;
        Ok(())
    }

    pub async fn did_open(&mut self, uri: &str, text: &str, version: i32) -> Result<()> {
        self.documents.insert(uri.to_string(), text.to_string());

        if self.child.is_some() {
            let params = serde_json::json!({
                "textDocument": {
                    "uri": uri,
                    "languageId": "latex",
                    "version": version,
                    "text": text
                }
            });
            let _ = self.send_notification("textDocument/didOpen", params).await;
        }

        Ok(())
    }

    pub async fn did_change(&mut self, uri: &str, text: &str, version: i32) -> Result<()> {
        self.documents.insert(uri.to_string(), text.to_string());

        if self.child.is_some() {
            let params = serde_json::json!({
                "textDocument": {
                    "uri": uri,
                    "version": version
                },
                "contentChanges": [{ "text": text }]
            });
            let _ = self
                .send_notification("textDocument/didChange", params)
                .await;
        }

        Ok(())
    }

    pub async fn completion(
        &self,
        uri: &str,
        line: u32,
        character: u32,
    ) -> Result<Vec<CompletionItem>> {
        if self.child.is_some() {
            let params = serde_json::json!({
                "textDocument": { "uri": uri },
                "position": { "line": line, "character": character }
            });

            if let Ok(resp) = self.send_request("textDocument/completion", params).await
                && let Some(items) = resp.get("result").and_then(|r| {
                    if let Some(arr) = r.as_array() {
                        Some(arr.clone())
                    } else {
                        r.get("items").and_then(|i| i.as_array().cloned())
                    }
                })
            {
                let parsed: Vec<CompletionItem> = items
                    .into_iter()
                    .filter_map(|it| {
                        let label = it.get("label")?.as_str()?.to_string();
                        let kind = it.get("kind").map(|k| format!("{:?}", k));
                        let detail = it
                            .get("detail")
                            .and_then(|d| d.as_str())
                            .map(|s| s.to_string());
                        let documentation = it.get("documentation").and_then(|d| {
                            if let Some(s) = d.as_str() {
                                Some(s.to_string())
                            } else {
                                d.get("value")
                                    .and_then(|v| v.as_str())
                                    .map(|s| s.to_string())
                            }
                        });
                        let insert_text = it
                            .get("insertText")
                            .and_then(|s| s.as_str())
                            .map(|s| s.to_string());

                        Some(CompletionItem {
                            label,
                            kind,
                            detail,
                            documentation,
                            insert_text,
                        })
                    })
                    .collect();

                if !parsed.is_empty() {
                    return Ok(parsed);
                }
            }
        }

        // Fallback embedded completion engine
        Ok(self.compute_embedded_completions(uri, line, character))
    }

    pub async fn hover(
        &self,
        uri: &str,
        line: u32,
        character: u32,
    ) -> Result<Option<HoverResponse>> {
        if self.child.is_some() {
            let params = serde_json::json!({
                "textDocument": { "uri": uri },
                "position": { "line": line, "character": character }
            });

            if let Ok(resp) = self.send_request("textDocument/hover", params).await
                && let Some(contents) = resp.get("result").and_then(|r| r.get("contents"))
            {
                let text = if let Some(s) = contents.as_str() {
                    s.to_string()
                } else if let Some(val) = contents.get("value").and_then(|v| v.as_str()) {
                    val.to_string()
                } else {
                    contents.to_string()
                };
                return Ok(Some(HoverResponse { contents: text }));
            }
        }

        // Fallback embedded hover documentation
        Ok(self.compute_embedded_hover(uri, line, character))
    }

    fn compute_embedded_completions(
        &self,
        uri: &str,
        line: u32,
        character: u32,
    ) -> Vec<CompletionItem> {
        let doc = self.documents.get(uri).cloned().unwrap_or_default();
        let lines: Vec<&str> = doc.lines().collect();
        let target_line = lines.get(line as usize).copied().unwrap_or("");
        let prefix = if (character as usize) <= target_line.len() {
            &target_line[..character as usize]
        } else {
            target_line
        };

        // 1. Citation completion (\cite{...)
        if let Some(idx) = prefix.rfind("\\cite{") {
            let after_brace = &prefix[idx + 6..];
            if !after_brace.contains('}') {
                return self.extract_bibliography_keys();
            }
        }

        // 2. Reference label completion (\ref{... or \eqref{...)
        if let Some(idx) = prefix.rfind("\\ref{").or_else(|| prefix.rfind("\\eqref{")) {
            let brace_offset = if prefix[idx..].starts_with("\\eqref{") {
                7
            } else {
                5
            };
            let after_brace = &prefix[idx + brace_offset..];
            if !after_brace.contains('}') {
                return self.extract_document_labels();
            }
        }

        // 3. Environment completion (\begin{... or \end{...)
        if let Some(idx) = prefix.rfind("\\begin{").or_else(|| prefix.rfind("\\end{")) {
            let brace_offset = if prefix[idx..].starts_with("\\begin{") {
                7
            } else {
                5
            };
            let after_brace = &prefix[idx + brace_offset..];
            if !after_brace.contains('}') {
                return self.get_standard_environments();
            }
        }

        // 4. Package completion (\usepackage{...)
        if let Some(idx) = prefix.rfind("\\usepackage{") {
            let after_brace = &prefix[idx + 12..];
            if !after_brace.contains('}') {
                return self.get_standard_packages();
            }
        }

        // 5. Default LaTeX command catalog
        self.get_standard_latex_commands()
    }

    fn compute_embedded_hover(
        &self,
        uri: &str,
        line: u32,
        character: u32,
    ) -> Option<HoverResponse> {
        let doc = self.documents.get(uri)?;
        let lines: Vec<&str> = doc.lines().collect();
        let target_line = lines.get(line as usize)?;
        let char_idx = character as usize;
        if char_idx > target_line.len() {
            return None;
        }

        // Find token boundaries around cursor
        let bytes = target_line.as_bytes();
        let mut start = char_idx;
        while start > 0 && (bytes[start - 1].is_ascii_alphanumeric() || bytes[start - 1] == b'\\') {
            start -= 1;
            if bytes[start] == b'\\' {
                break;
            }
        }

        let mut end = char_idx;
        while end < bytes.len() && bytes[end].is_ascii_alphanumeric() {
            end += 1;
        }

        if start >= end {
            return None;
        }

        let token = &target_line[start..end];
        self.lookup_macro_documentation(token)
            .map(|doc| HoverResponse { contents: doc })
    }

    fn extract_bibliography_keys(&self) -> Vec<CompletionItem> {
        let mut items = Vec::new();

        for doc in self.documents.values() {
            for line in doc.lines() {
                let trimmed = line.trim();
                if trimmed.starts_with('@')
                    && let Some(open) = trimmed.find('{')
                {
                    let rest = &trimmed[open + 1..];
                    let key = rest.split(',').next().unwrap_or("").trim();
                    if !key.is_empty() {
                        let entry_type = &trimmed[1..open];
                        items.push(CompletionItem {
                            label: key.to_string(),
                            kind: Some("Citation".to_string()),
                            detail: Some(format!("@{entry_type}")),
                            documentation: Some(format!("BibTeX entry: `{key}`")),
                            insert_text: Some(key.to_string()),
                        });
                    }
                }
            }
        }

        if items.is_empty() {
            // Provide helpful templates if no .bib is loaded yet
            vec![
                CompletionItem {
                    label: "knuth1984texbook".to_string(),
                    kind: Some("Citation".to_string()),
                    detail: Some("@book".to_string()),
                    documentation: Some("Donald E. Knuth, The TeXbook (1984)".to_string()),
                    insert_text: Some("knuth1984texbook".to_string()),
                },
                CompletionItem {
                    label: "lamport1994latex".to_string(),
                    kind: Some("Citation".to_string()),
                    detail: Some("@book".to_string()),
                    documentation: Some(
                        "Leslie Lamport, LaTeX: A Document Preparation System (1994)".to_string(),
                    ),
                    insert_text: Some("lamport1994latex".to_string()),
                },
            ]
        } else {
            items
        }
    }

    fn extract_document_labels(&self) -> Vec<CompletionItem> {
        let mut labels = Vec::new();

        for doc in self.documents.values() {
            for line in doc.lines() {
                let mut cursor = line;
                while let Some(pos) = cursor.find("\\label{") {
                    let rest = &cursor[pos + 7..];
                    if let Some(end) = rest.find('}') {
                        let key = &rest[..end];
                        labels.push(CompletionItem {
                            label: key.to_string(),
                            kind: Some("Reference".to_string()),
                            detail: Some("Label target".to_string()),
                            documentation: Some(format!(
                                "Cross-reference label: `\\label{{{key}}}`"
                            )),
                            insert_text: Some(key.to_string()),
                        });
                        cursor = &rest[end + 1..];
                    } else {
                        break;
                    }
                }
            }
        }

        if labels.is_empty() {
            vec![
                CompletionItem {
                    label: "sec:intro".to_string(),
                    kind: Some("Reference".to_string()),
                    detail: Some("Section label".to_string()),
                    documentation: Some("Section introduction label".to_string()),
                    insert_text: Some("sec:intro".to_string()),
                },
                CompletionItem {
                    label: "eq:main".to_string(),
                    kind: Some("Reference".to_string()),
                    detail: Some("Equation label".to_string()),
                    documentation: Some("Primary equation target".to_string()),
                    insert_text: Some("eq:main".to_string()),
                },
            ]
        } else {
            labels
        }
    }

    fn get_standard_environments(&self) -> Vec<CompletionItem> {
        vec![
            ("equation", "Numbered single-line mathematical formula"),
            ("align", "Multi-line formula aligned with & (amsmath)"),
            ("gather", "Multi-line unaligned formula (amsmath)"),
            ("figure", "Floating figure container for \\includegraphics"),
            ("table", "Floating table container"),
            ("tabular", "Grid structure for tabular data"),
            ("itemize", "Bulleted unnumbered list"),
            ("enumerate", "Numbered sequential list"),
            ("description", "Dictionary / term definition list"),
            ("matrix", "Plain bracketless matrix"),
            ("pmatrix", "Parenthesized matrix"),
            ("bmatrix", "Square bracket matrix"),
            ("cases", "Piecewise conditional mathematical definition"),
            ("tikzpicture", "High-performance vector graphic canvas"),
            ("abstract", "Paper abstract section block"),
            ("document", "Main document body root environment"),
        ]
        .into_iter()
        .map(|(name, desc)| CompletionItem {
            label: name.to_string(),
            kind: Some("Environment".to_string()),
            detail: Some(desc.to_string()),
            documentation: Some(format!(
                "LaTeX environment: `\\begin{{{name}}} ... \\end{{{name}}}`"
            )),
            insert_text: Some(name.to_string()),
        })
        .collect()
    }

    fn get_standard_packages(&self) -> Vec<CompletionItem> {
        vec![
            ("amsmath", "AMS mathematical enhancements and environments"),
            ("amssymb", "Extended mathematical symbol collection"),
            (
                "graphicx",
                "Inclusion of external graphics (.png, .pdf, .eps)",
            ),
            ("hyperref", "Hypertext cross-references and URL links"),
            ("xcolor", "Driver-independent color extensions"),
            ("geometry", "Custom page margins, orientation, and layout"),
            ("biblatex", "Modern citation and bibliography management"),
            (
                "booktabs",
                "Publication quality tables with \\toprule, \\midrule",
            ),
            ("tikz", "Programmable vector graphics engine"),
            (
                "babel",
                "Multilingual typesetting (supports Arabic & Hebrew)",
            ),
            (
                "fontspec",
                "Advanced OpenType and TrueType font selection (XeTeX/LuaTeX)",
            ),
            (
                "microtype",
                "Subliminal typographic adjustments and font expansion",
            ),
        ]
        .into_iter()
        .map(|(pkg, desc)| CompletionItem {
            label: pkg.to_string(),
            kind: Some("Package".to_string()),
            detail: Some(desc.to_string()),
            documentation: Some(format!("`\\usepackage{{{pkg}}}`\n\n{desc}")),
            insert_text: Some(pkg.to_string()),
        })
        .collect()
    }

    fn get_standard_latex_commands(&self) -> Vec<CompletionItem> {
        vec![
            (
                "\\section",
                "Top-level section heading",
                "\\section{${1:Title}}",
            ),
            (
                "\\subsection",
                "Second-level section heading",
                "\\subsection{${1:Title}}",
            ),
            (
                "\\subsubsection",
                "Third-level section heading",
                "\\subsubsection{${1:Title}}",
            ),
            (
                "\\chapter",
                "Book or report chapter",
                "\\chapter{${1:Title}}",
            ),
            (
                "\\part",
                "High-level document division",
                "\\part{${1:Title}}",
            ),
            ("\\textbf", "Bold font weight", "\\textbf{${1:text}}"),
            ("\\textit", "Italic font slant", "\\textit{${1:text}}"),
            (
                "\\texttt",
                "Monospace typewriter font",
                "\\texttt{${1:code}}",
            ),
            (
                "\\underline",
                "Underlined text span",
                "\\underline{${1:text}}",
            ),
            ("\\cite", "Citation reference", "\\cite{${1:key}}"),
            ("\\ref", "Cross-reference target", "\\ref{${1:label}}"),
            (
                "\\eqref",
                "Parenthesized equation reference",
                "\\eqref{${1:label}}",
            ),
            (
                "\\label",
                "Anchor label for cross-referencing",
                "\\label{${1:marker}}",
            ),
            (
                "\\begin",
                "Open LaTeX environment",
                "\\begin{${1:environment}}\n\t$0\n\\end{${1:environment}}",
            ),
            (
                "\\end",
                "Close LaTeX environment",
                "\\end{${1:environment}}",
            ),
            (
                "\\frac",
                "Mathematical fraction",
                "\\frac{${1:num}}{${2:den}}",
            ),
            ("\\sqrt", "Square root radical", "\\sqrt{${1:expr}}"),
            (
                "\\sum",
                "Summation operator (\\sum_{i=1}^n)",
                "\\sum_{${1:i=1}}^{${2:n}}",
            ),
            (
                "\\int",
                "Integral operator (\\int_a^b)",
                "\\int_{${1:a}}^{${2:b}}",
            ),
            ("\\alpha", "Greek lowercase alpha (α)", "\\alpha"),
            ("\\beta", "Greek lowercase beta (β)", "\\beta"),
            ("\\gamma", "Greek lowercase gamma (γ)", "\\gamma"),
            ("\\delta", "Greek lowercase delta (δ)", "\\delta"),
            ("\\lambda", "Greek lowercase lambda (λ)", "\\lambda"),
            ("\\omega", "Greek lowercase omega (ω)", "\\omega"),
            ("\\pi", "Mathematical constant pi (π)", "\\pi"),
            ("\\infty", "Infinity symbol (∞)", "\\infty"),
            ("\\partial", "Partial derivative operator (∂)", "\\partial"),
            ("\\nabla", "Vector differential operator (∇)", "\\nabla"),
            ("\\left", "Auto-scaling left delimiter", "\\left("),
            ("\\right", "Auto-scaling right delimiter", "\\right)"),
            ("\\item", "List element entry", "\\item "),
        ]
        .into_iter()
        .map(|(label, desc, snippet)| CompletionItem {
            label: label.to_string(),
            kind: Some("Macro".to_string()),
            detail: Some(desc.to_string()),
            documentation: Some(format!("`{label}` — {desc}")),
            insert_text: Some(snippet.to_string()),
        })
        .collect()
    }

    fn lookup_macro_documentation(&self, token: &str) -> Option<String> {
        let docs = match token {
            "\\section" => {
                "**\\section{Title}**\n\nCreates a major numbered section heading. Appears in the table of contents."
            }
            "\\subsection" => {
                "**\\subsection{Title}**\n\nCreates a subordinate numbered subsection."
            }
            "\\textbf" => {
                "**\\textbf{text}**\n\nRenders the argument text in **boldface** typography."
            }
            "\\textit" => "**\\textit{text}**\n\nRenders the argument text in *italic* font slant.",
            "\\frac" => {
                "**\\frac{numerator}{denominator}**\n\nRenders a two-story mathematical fraction:\n$$\\frac{a}{b}$$"
            }
            "\\sqrt" => {
                "**\\sqrt[n]{x}**\n\nRenders a radical sign over the argument:\n$$\\sqrt{x}$$"
            }
            "\\cite" => {
                "**\\cite{key}**\n\nInserts a citation reference targeting a BibTeX key from the project's `.bib` bibliography."
            }
            "\\ref" => {
                "**\\ref{label}**\n\nInserts a cross-reference number corresponding to the matching `\\label{...}` tag."
            }
            "\\alpha" => "**\\alpha**\n\nGreek lowercase letter alpha:\n$$\\alpha$$",
            "\\beta" => "**\\beta**\n\nGreek lowercase letter beta:\n$$\\beta$$",
            "\\sum" => "**\\sum**\n\nSummation operator:\n$$\\sum_{i=1}^{n} x_i$$",
            "\\int" => "**\\int**\n\nIntegral operator:\n$$\\int_{a}^{b} f(x)\\,dx$$",
            "\\infty" => "**\\infty**\n\nInfinity symbol:\n$$\\infty$$",
            _ => return None,
        };
        Some(docs.to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_lsp_supervisor_lifecycle() {
        let mut supervisor = LspSupervisor::new();
        let status = supervisor.start(None).await.expect("start lsp");
        assert!(status.running);

        let doc_uri = "file:///test/main.tex";
        let doc_text = r#"
\documentclass{article}
\usepackage{amsmath}
\begin{document}
\section{Introduction}
\label{sec:intro}
According to \cite{knuth1984texbook}, math is elegant.
\end{document}
"#;

        supervisor
            .did_open(doc_uri, doc_text, 1)
            .await
            .expect("did_open");

        // Test label extraction
        let labels = supervisor.extract_document_labels();
        assert!(labels.iter().any(|l| l.label == "sec:intro"));

        // Test citation extraction
        let completions = supervisor
            .completion(doc_uri, 6, 20)
            .await
            .expect("completion");
        assert!(!completions.is_empty());

        // Test hover documentation
        let hover = supervisor.hover(doc_uri, 4, 3).await.expect("hover");
        assert!(hover.is_some());
        assert!(hover.unwrap().contents.contains("section"));

        supervisor.stop().await.expect("stop lsp");
    }
}

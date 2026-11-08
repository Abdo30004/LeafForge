# LeafForge — Local-First Collaborative LaTeX Desktop IDE
## Master Technical Specification & Autonomous Agent Execution Blueprint (`specs.md`)

**Target Agent:** Antigravity (Gemini 3.8 Flash High)  
**Application Name:** `LeafForge`  
**Core Stack:** Tauri v2 (Rust) + React 19 + TypeScript 5 + CodeMirror 6 + Yjs + `git2-rs` + Tectonic / TeX Live  
**Architecture Paradigm:** Local-First Desktop App with P2P/Relay CRDT Collaboration & GitHub-Backed Version Control

---

## 0. Agent Operational Directives (READ FIRST)

You are operating as an autonomous Principal Systems & Staff Frontend Engineer inside the **Antigravity** environment. Your objective is to build **LeafForge**, a production-grade desktop alternative to Overleaf. Follow these non-negotiable operational rules throughout the entire lifecycle of this project:

1. **Zero-Placeholder Policy:** Never leave `// TODO`, `unimplemented!()`, `todo!()`, or mock stub functions in committed code. Every module you create must be complete, wired to the UI or IPC layer, and verifiable.
2. **Git-First Execution Loop:** You MUST initialize a local Git repository before writing application code and commit atomically at the end of every sub-milestone defined in **Section 7**. Never accumulate uncommitted changes across multiple subsystems.
3. **Compile-Before-Commit Gate:** Every single commit must pass:
   - `cargo check --manifest-path src-tauri/Cargo.toml`
   - `cargo clippy --manifest-path src-tauri/Cargo.toml -- -D warnings`
   - `pnpm run typecheck`
   - `pnpm run lint`
   - `pnpm run test:run`
4. **Strict Separation of Concerns:**
   - All filesystem I/O, Git operations (`git2`), OS Keychain storage (`keyring`), LaTeX compilation processes (`tectonic`, `pdflatex`, `xelatex`, `lualatex`), SyncTeX parsing, and file watching (`notify`) MUST execute asynchronously in the **Rust backend** on Tokio worker threads.
   - The **TypeScript/React WebView** is strictly responsible for UI state, CodeMirror 6 document projection, Yjs CRDT synchronization, and PDF canvas rendering.
5. **Mathematical & Coordinate Precision:** Maintain $60\text{ FPS}$ frame budgets ($\le 16.6\text{ ms}$ per frame) in the editor and PDF viewport. Never block the main UI thread with synchronous IPC calls or full-document regex passes on files exceeding $10,000$ lines.

---

## 1. Git Repository & Version Control Protocol

### 1.1 Repository Initialization
Before scaffolding any code, execute the following initialization sequence in the project root:

```bash
git init -b main
git config commit.gpgsign false
```

Create a comprehensive `.gitignore` at the repository root covering:
- `node_modules/`, `dist/`, `.vite/`
- `src-tauri/target/`, `src-tauri/WixTools/`
- `.DS_Store`, `Thumbs.db`
- `*.aux`, `*.log`, `*.out`, `*.synctex.gz`, `*.fls`, `*.fdb_latexmk`, `*.fmt`
- `.env`, `.env.local`, `*.pem`, `*.key`

### 1.2 Branching & Commit Convention
- Use **Conventional Commits** strictly:
  - `chore(init): ...`
  - `feat(editor): ...`
  - `feat(compiler): ...`
  - `feat(git): ...`
  - `feat(collab): ...`
  - `feat(ui): ...`
  - `fix(synctex): ...`
  - `test(reconciler): ...`
- **Atomic Milestone Branches:** For each Phase $k \in \{1..6\}$ in Section 7:
  1. Create branch `feat/phase-k-<short-name>` from `main`.
  2. Implement and verify each sub-task with granular commits.
  3. Run the verification suite (`cargo test` + `pnpm test:run` + `pnpm build`).
  4. Merge back into `main` using `git merge --no-ff feat/phase-k-<short-name> -m "release(phase-k): complete <phase description>"`.
  5. Tag the milestone (`git tag -a v0.k.0 -m "Milestone k complete"`).

---

## 2. System Architecture & Tech Stack Specification

### 2.1 Backend Stack (`src-tauri` — Rust 2024 Edition)
| Subsystem | Crate / Tool | Version / Configuration | Responsibility |
| :--- | :--- | :--- | :--- |
| **Desktop Shell** | `tauri` | `v2.x` (`macos-private-api`, `devtools`) | Multi-window management, IPC commands, native menus, file dialogs |
| **Async Runtime** | `tokio` | `v1.x` (`full` features) | Non-blocking process spawning, file watching, Git network I/O |
| **Git Engine** | `git2` | `v0.19+` (`vendored-libgit2`, `https`) | Native clone, fetch, branch, stage, commit, push, 3-way merge |
| **OS Credentials** | `keyring` | `v3.x` | Secure storage of GitHub OAuth tokens in macOS Keychain, Windows Credential Locker, Linux Secret Service |
| **HTTP Client** | `reqwest` | `v0.12+` (`json`, `rustls-tls`) | GitHub OAuth Device Flow polling & GitHub REST v3 collaborator permission checks |
| **LaTeX Engine (Embedded)** | `tectonic` | `v0.15+` (or CLI bridge + crate) | Zero-setup XeTeX compilation & automatic on-demand CTAN package downloading |
| **External Compilers** | `tokio::process::Command` | System TeX Live / MiKTeX | Spawning `pdflatex`, `xelatex`, `lualatex`, `bibtex`, `biber` with `-synctex=1 -interaction=nonstopmode` |
| **File Watcher** | `notify` + `notify-debouncer-full` | `v6.x` | Watching workspace `.tex`, `.bib`, `.cls`, `.sty` changes with $\Delta t = 400\text{ ms}$ debounce |
| **Font Discovery** | `fontdb` | `v0.21+` | Enumerating system OpenType/TrueType fonts for XeLaTeX/LuaLaTeX RTL font pickers |
| **Compression** | `flate2` | `v1.x` | Decompressing `.synctex.gz` files in-memory for instant forward/inverse search |
| **LSP Bridge** | `tokio::process` + stdio channel | `texlab` / `ltex-ls-plus` | JSON-RPC stdio multiplexer between CodeMirror LSP client and native language servers |
| **Error Handling** | `thiserror` + `anyhow` | `v2.x` / `v1.x` | Typed serializable IPC errors (`#[derive(Serialize, thiserror::Error)]`) |

### 2.2 Frontend Stack (`src` — TypeScript + React)
| Subsystem | Package | Responsibility |
| :--- | :--- | :--- |
| **UI Framework** | `react@19`, `react-dom@19`, `vite@6` | Component rendering, hooks, multi-window entry points |
| **State Management** | `zustand@5` + `immer` | Workspace state, compiler status, Git status, active panes, user preferences |
| **Styling & UI Primitives** | `tailwindcss@4`, `@radix-ui/*`, `lucide-react` | Accessible modals, command palette (`cmdk`), split panes (`react-resizable-panels`), crisp iconography |
| **Core Text Editor** | `@codemirror/state`, `@codemirror/view`, `@codemirror/language`, `@codemirror/commands`, `@codemirror/autocomplete`, `@codemirror/lint` | Virtualized viewport editor, AST tokenization, BiDi isolation, gutter diagnostics |
| **LaTeX Grammar** | `codemirror-lang-latex` or custom `StreamLanguage` / Lezer grammar | Tokenizing commands, environments, inline/display math (`$...$`, `$$...$$`, `\[...\]`), comments, and BibTeX |
| **Inline Math Rendering** | `katex` | Sub-millisecond rendering of math widgets inside Visual Mode |
| **CRDT Collaboration** | `yjs`, `y-codemirror.next`, `y-webrtc`, `y-websocket`, `y-indexeddb`, `lib0` | Conflict-free real-time co-editing, remote cursors, awareness, and local IndexedDB crash persistence |
| **PDF Renderer** | `pdfjs-dist` | Double-buffered HTML5 Canvas rendering, text-layer selection, SyncTeX overlay highlights |

---

## 3. Repository Directory Structure

Enforce the exact directory structure below:

```text
leafforge/
├── .gitignore
├── package.json
├── pnpm-lock.yaml
├── tsconfig.json
├── vite.config.ts
├── index.html
├── specs.md
├── src/
│   ├── main.tsx
│   ├── App.tsx
│   ├── styles/
│   │   ├── globals.css              # Tailwind imports, CSS variables, BiDi & KaTeX overrides
│   │   └── themes.css               # Light ("Parchment Precision") & Dark ("Obsidian Studio") tokens
│   ├── types/
│   │   ├── ipc.ts                   # Strict TypeScript mirrors of Rust structs/enums
│   │   ├── latex.ts                 # Compiler types, SyncTeX coordinates, Diagnostic interfaces
│   │   ├── git.ts                   # Commit, Branch, Diff, DeviceFlow types
│   │   └── collab.ts                # Yjs awareness user state, room metadata, committer election
│   ├── services/
│   │   ├── tauriClient.ts           # Typed invoke() & listen() wrappers
│   │   ├── collabManager.ts         # Y.Doc lifecycle, WebRTC/WS provider, GitHub auth gate
│   │   └── gitCrdtBridge.ts         # 3-way reconciliation between Y.Text and disk Git working tree
│   ├── store/
│   │   ├── useWorkspaceStore.ts     # Project files, active tab, dirty flags, split ratios
│   │   ├── useCompilerStore.ts      # Active engine, build logs, diagnostics, SyncTeX state
│   │   ├── useGitStore.ts           # Repo status, branch, staged/unstaged, GitHub user profile
│   │   └── useCollabStore.ts        # Connected peers, awareness cursors, designated committer ID
│   ├── editor/
│   │   ├── LatexEditor.tsx          # CodeMirror 6 host component
│   │   ├── extensions/
│   │   │   ├── latexLanguage.ts     # Syntax highlighting, bracket matching, environment auto-close
│   │   │   ├── bidiIsolation.ts     # UAX #9 RTL/LTR paragraph detector & command LTR isolator
│   │   │   ├── visualModePlugin.ts  # CM6 StateField/ViewPlugin for WYSIWYM math, headings, tables
│   │   │   ├── synctexClick.ts      # Cmd/Ctrl+Click forward SyncTeX dispatcher
│   │   │   ├── inlineDiagnostics.ts # Compiler error/warning squiggly underlines & hover tooltips
│   │   │   └── lspClient.ts         # TexLab autocomplete, hover, and BibTeX citation completion
│   │   └── widgets/
│   │       ├── MathWidget.ts        # Interactive KaTeX preview widget (click to unfold raw TeX)
│   │       ├── SectionWidget.ts     # Styled typographic headings for \section, \subsection
│   │       ├── TableWidget.ts       # Interactive grid editor for tabular environments
│   │       └── MacroCapsuleWidget.ts# Safe fallback badge for complex unparseable macros/TikZ
│   ├── components/
│   │   ├── layout/
│   │   │   ├── AppShell.tsx         # 4-zone resizable layout + top toolbar + bottom status bar
│   │   │   ├── ActivityRail.tsx     # Leftmost 44px icon bar (Files, Outline, Git, Collab, Settings)
│   │   │   ├── SidebarPanel.tsx     # Collapsible contextual panel
│   │   │   ├── TopHeaderBar.tsx     # Project title, Visual/Raw switch, Compile button, Avatars
│   │   │   └── StatusBar.tsx        # Engine badge, RTL mode indicator, Git branch, cursor pos
│   │   ├── sidebar/
│   │   │   ├── FileTreePanel.tsx    # Create, rename, delete, upload assets, set root .tex file
│   │   │   ├── OutlinePanel.tsx     # Document structure tree (\part, \chapter, \section, labels)
│   │   │   ├── GitControlPanel.tsx  # Stage, diff viewer, commit box, push/pull, branch switcher
│   │   │   ├── CollabPanel.tsx      # Active collaborators, follow peer toggle, room health
│   │   │   └── PackageFontPanel.tsx # Compiler selector, RTL font picker, CTAN package manager
│   │   ├── pdf/
│   │   │   ├── PdfViewport.tsx      # Double-buffered PDF.js canvas + zoom/fit controls
│   │   │   ├── SyncTexOverlay.tsx   # Animated pulse highlight on forward SyncTeX jump
│   │   │   └── DetachedPdfWindow.tsx# Entry point when user pops PDF out to second monitor
│   │   ├── diagnostics/
│   │   │   └── BuildLogDrawer.tsx   # Filterable Errors / Warnings / Raw TeX Log drawer
│   │   └── modals/
│   │       ├── GithubDeviceModal.tsx# Step-by-step GitHub 8-char device code flow
│   │       ├── CloneRepoModal.tsx   # Browse user's GitHub repos or paste URL to clone
│   │       ├── ConflictModal.tsx    # Interactive 3-way merge resolver for Git vs CRDT divergence
│   │       └── CommandPalette.tsx   # Cmd/Ctrl+K global command launcher
└── src-tauri/
    ├── Cargo.toml
    ├── tauri.conf.json
    ├── capabilities/
    │   └── default.json
    └── src/
        ├── main.rs
        ├── lib.rs
        ├── error.rs                 # Unified AppError enum with Serialize
        ├── state.rs                 # AppState holding active watchers, compiler locks, LSP handles
        ├── commands/
        │   ├── mod.rs
        │   ├── fs_cmds.rs           # Project file CRUD, atomic write, asset import
        │   ├── auth_cmds.rs         # GitHub Device Flow start, poll, keychain token load/revoke
        │   ├── git_cmds.rs          # Clone, status, diff, commit, push, pull, merge
        │   ├── compiler_cmds.rs     # Compile trigger, engine detection, abort build, clean aux
        │   ├── synctex_cmds.rs      # Forward (line->page/xy) & Inverse (page/xy->file/line) queries
        │   └── font_cmds.rs         # System OpenType font listing for XeLaTeX/LuaLaTeX
        └── services/
            ├── mod.rs
            ├── github_auth.rs       # OAuth device flow state machine & repo permission checker
            ├── git_engine.rs        # Thread-safe libgit2 operations + credential callbacks
            ├── compiler_pipeline.rs # Tectonic + external TeX Live runner + preamble format cache
            ├── log_parser.rs        # Stateful LaTeX .log parser extracting file:line errors
            ├── synctex_parser.rs    # Native decompression & coordinate interpolation of .synctex.gz
            ├── watcher.rs           # Debounced filesystem watcher emitting Tauri events
            └── lsp_supervisor.rs    # Spawns & restarts texlab child process over stdio
```

---

## 4. Coding Conventions & Architectural Rules

### 4.1 Rust Backend Conventions
1. **Error Serialization:** Never return `Result<T, String>`. Define a central `AppError` in `src-tauri/src/error.rs` using `thiserror::Error` and implement `serde::Serialize` so the frontend receives structured error objects `{ code: string, message: string, details?: string }`.
2. **Non-Blocking Commands:** Every `#[tauri::command]` performing disk I/O, Git network operations, or process execution MUST be `async` and offload blocking C-library calls (such as `git2::Repository` operations) inside `tokio::task::spawn_blocking`.
3. **Process Hygiene:** When spawning `pdflatex`, `xelatex`, `lualatex`, or `tectonic`, always set a configurable timeout (default $60\text{ s}$) and store a `CancellationToken` in `AppState` so starting a new compile immediately aborts any in-flight stale compile.

### 4.2 TypeScript & React Conventions
1. **Strict Type Safety:** Enable `"strict": true`, `"noUncheckedIndexedAccess": true`, and `"noImplicitOverride": true` in `tsconfig.json`. Usage of `any` is strictly forbidden.
2. **CodeMirror 6 Isolation:** Never manipulate the CodeMirror DOM via React state or `document.querySelector`. All visual mode widgets, BiDi attributes, diagnostics, and remote cursors must be implemented as pure CodeMirror 6 `StateField`, `ViewPlugin`, `Decoration.replace`, `Decoration.widget`, or `Decoration.line` extensions.
3. **Zustand Selector Granularity:** Subscribe only to atomic slices (`useCompilerStore(s => s.status)`) to prevent re-rendering the CodeMirror or PDF canvas tree during high-frequency keystroke or compilation events.

---

## 5. Core Subsystem Implementation Specifications

### Subsystem A: GitHub OAuth Device Flow & OS Keychain (`github_auth.rs`)
Because LeafForge is a distributed desktop application with no centralized backend server holding a `client_secret`, authentication MUST use the **GitHub OAuth 2.0 Device Authorization Grant**:
1. **Initiation (`start_github_device_flow`):**
   - `POST https://github.com/login/device/code` with headers `Accept: application/json` and payload `client_id` + `scope: "repo read:user user:email"`.
   - Returns `{ device_code, user_code, verification_uri, expires_in, interval }`.
   - Display `user_code` (e.g., `WDJB-MJHT`) in `GithubDeviceModal.tsx` with a one-click "Copy Code & Open GitHub" button (`tauri_plugin_opener`).
2. **Polling (`poll_github_device_token`):**
   - Poll `POST https://github.com/login/oauth/access_token` every `interval` seconds (default $5\text{ s}$; increment by $+5\text{ s}$ if `error == "slow_down"`).
   - Once `access_token` is returned, store it immediately inside the OS native credential store via `keyring::Entry::new("com.leafforge.desktop", "github_oauth_token")?.set_password(&token)`.
3. **Collaborator Permission Gate (`verify_repo_collaborator`):**
   - Before allowing a user to join or host a live Yjs collaboration session for `owner/repo`, verify their token via `GET https://api.github.com/repos/{owner}/{repo}/collaborators/{username}/permission`.
   - Grant read-write CRDT capabilities if `permission` is `admin` or `write`; restrict to read-only awareness if `read`; reject connection if `none` or $404$.

### Subsystem B: Native Git Engine & CRDT-to-Git Reconciler (`git_engine.rs` + `gitCrdtBridge.ts`)
1. **Authenticated `libgit2` Callbacks:**
   - Configure `git2::RemoteCallbacks` with a `credentials` closure that retrieves the user's OAuth token from `keyring` and authenticates over HTTPS using `git2::Cred::userpass_plaintext("x-access-token", &token)`.
2. **Designated Committer Election (Live Session + Git Sync):**
   - When multiple collaborators are editing concurrently via Yjs, prevent race-condition `git push` collisions by electing a deterministic **Designated Committer**:
   - Compute leader as the online peer with `permission in {admin, write}` whose `clientID` is minimal:
     $$\text{Leader} = \arg\min_{p \in \text{ActiveWritePeers}} (\text{p.joinedAtTimestamp}, \text{p.yjsClientId})$$
   - If the current leader disconnects, awareness timeout ($3,000\text{ ms}$) automatically promotes the next peer.
3. **3-Way CRDT-to-Git Reconciliation Algorithm:**
   - Maintain three states per tracked `.tex` file:
     - $S_{\text{base}}$: Content at the `HEAD` commit when the Yjs session initialized.
     - $S_{\text{crdt}}$: Current live string serialized from `Y.Text.toString()`.
     - $S_{\text{remote}}$: Incoming string from `git fetch` + remote branch tree when an external commit is detected on GitHub.
   - When $S_{\text{remote}} \neq S_{\text{base}}$:
     1. Run a 3-way diff (`git2::Merge::merge_files` or Myers diff-match-patch) over $(S_{\text{base}}, S_{\text{crdt}}, S_{\text{remote}})$.
     2. If clean merge $S_{\text{merged}}$ succeeds, compute the minimal character delta (`diff(S_crdt, S_merged)`) and apply it as a single `ydoc.transact(() => { ... }, 'git-reconcile')` transaction so live collaborators never lose their undo history or cursor positions.
     3. If conflicting hunks exist, surface `ConflictModal.tsx` to the Designated Committer with side-by-side "Keep Live Session" vs "Accept Incoming Git Commit" hunk toggles.

### Subsystem C: Dual-Mode LaTeX Editor & BiDi Engine (`src/editor/`)
1. **Single-Source-of-Truth Architecture:**
   - Never convert LaTeX to HTML/ProseMirror and back (which corrupts custom user macros and formatting). Both **Raw Source Mode** and **Visual Mode** operate on the exact same CodeMirror 6 `EditorState` and `Y.Text` binding.
2. **Visual Mode (`visualModePlugin.ts`):**
   - When `editorMode === 'visual'`, activate a `StateField<DecorationSet>` that scans the visible viewport (plus a $500$-line buffer) and replaces syntactic boilerplate with rich interactive widgets whenever the user's cursor (or selection) is **outside** the token range:
     - **Inline & Display Math (`$...$`, `$$...$$`, `\begin{equation}...\end{equation}`):** Replaced with `MathWidget` rendered via `katex.renderToString(tex, { throwOnError: false })`. Clicking the rendered formula or moving the cursor inside its character span immediately unfolds the raw LaTeX source for editing, accompanied by a floating live-preview tooltip above the cursor.
     - **Sectioning (`\section{...}`, `\subsection{...}`):** Hides the `\section{` prefix and `}` suffix when unfocused, applying proportional typographic scaling (`1.5rem` bold, `1.25rem` semibold) via `Decoration.mark`.
     - **Formatting (`\textbf{...}`, `\textit{...}`, `\underline{...}`):** Renders bold/italic/underline inline and hides control sequence delimiters when the cursor is outside the span.
     - **Tabular Environments (`\begin{tabular}...\end{tabular}`):** Renders a clean interactive table toolbar above the block allowing row/column insertion, cell navigation via `Tab`, and border toggles that mutate the underlying LaTeX tokens directly.
     - **Safe Fallback Capsules (`MacroCapsuleWidget`):** Custom `\newcommand` definitions, `\tikz` pictures, and raw TeX primitives (`\makeatletter ... \makeatother`) are rendered as compact, non-destructive syntax pills that expand on click.
3. **First-Class RTL & BiDi Isolation (`bidiIsolation.ts`):**
   - Configure CodeMirror 6 with `EditorView.perLineTextDirection.of(true)`.
   - Implement a `ViewPlugin` that inspects every visible line using the Unicode Bidirectional Algorithm (UAX #9):
     - If the first strong directional character of a prose line belongs to Arabic (`\u0600-\u06FF`), Hebrew (`\u0590-\u05FF`), Persian, or Syriac ranges, apply `Decoration.line({ attributes: { dir: 'rtl', class: 'cm-rtl-line' } })`.
     - **Critical Rule for LaTeX Commands inside RTL Lines:** Every LaTeX control sequence (`\cite{...}`, `\ref{...}`, `\begin{...}`, `\frac{a}{b}`) and inline math span `$...$` inside an RTL paragraph MUST be wrapped with `Decoration.mark({ attributes: { dir: 'ltr', style: 'unicode-bidi: isolate; display: inline-block;' } })`. This prevents backslashes, braces, and math operators from jumping visually to the wrong side of Arabic/Hebrew words.

### Subsystem D: Hybrid LaTeX Compilation Pipeline & SyncTeX (`compiler_pipeline.rs` + `synctex_parser.rs`)
1. **Supported Engines & Auto-Detection:**
   - Support 4 selectable modes per project:
     1. `Tectonic (Auto-CTAN / XeTeX)` — Default zero-config engine that downloads missing `.sty`/`.cls` packages from CTAN automatically into the local user cache.
     2. `LuaLaTeX` — Recommended default when RTL (`babel` with `arabic`/`hebrew`) or heavy Lua scripting is detected in the preamble.
     3. `XeLaTeX` — Recommended when `polyglossia` or `fontspec` with system fonts is detected.
     4. `pdfLaTeX` — Fast legacy engine for standard IEEE/ACM/arXiv templates.
   - Automatic Magic Comment Support: Parse `% !TEX program = xelatex` or `% !TEX root = ../main.tex` on lines $1\text{--}10$ of any file and override the active compiler or root file accordingly.
2. **Sub-Second Incremental Compilation (Precompiled Preamble Cache):**
   - Splitting the document at `\begin{document}`:
   - Compute `blake3` hash of everything from line $1$ up to `\begin{document}` (plus local `.sty`/`.cls` modification timestamps).
   - When using `pdflatex`, `xelatex`, or `lualatex`, if the preamble hash matches the cached `.fmt` file in `.leafforge-cache/preamble_<hash>.fmt`, invoke the engine with `-fmt=.leafforge-cache/preamble_<hash>` to skip macro/package initialization, cutting recompile times by $60\text{--}75\%$.
3. **Log Parsing (`log_parser.rs`):**
   - Parse LaTeX's stateful file-stack output (`(./sections/intro.tex ... )`) and extract:
     - Errors (`! LaTeX Error:`, `! Undefined control sequence`, `file:line:error` format)
     - Warnings (`LaTeX Warning: Reference '...' on page ... undefined`, `Overfull \hbox`)
   - Map each diagnostic to `{ filePath, line, column, severity: 'error' | 'warning' | 'info', message, rawLogSnippet }`.
4. **Native SyncTeX Two-Way Bridge (`synctex_parser.rs`):**
   - Decompress `<root>.synctex.gz` in Rust using `flate2::read::GzDecoder`.
   - **Forward Search (`synctex_forward(file, line, col)`):** Returns `{ page: u32, x: f64, y: f64, width: f64, height: f64 }` in PDF point coordinates ($72\text{ dpi}$). Frontend scrolls `PdfViewport` smoothly and triggers a $1,200\text{ ms}$ translucent amber highlight pulse.
   - **Inverse Search (`synctex_inverse(page, x, y)`):** Triggered on `Cmd+Click` (macOS) or `Ctrl+Click` (Win/Linux) inside the PDF canvas. Returns `{ file: String, line: u32, column: u32 }`, opens the target `.tex` file in the editor, centers the line, and flashes the active line gutter.

### Subsystem E: Flicker-Free Double-Buffered PDF Viewer (`PdfViewport.tsx`)
- **Zero-Flicker Recompile Rule:** Never unmount or clear the visible `<canvas>` while a newly compiled PDF is loading.
- Maintain two offscreen/onscreen canvas buffers per visible page:
  1. Keep Buffer A visible at the exact scroll offset $(x, y)$ and zoom scale $z$.
  2. Load the new PDF byte array (via Tauri `convertFileSrc` or binary IPC payload) into a background `PDFDocumentProxy`.
  3. Render the visible pages into Buffer B at scale $z$.
  4. Atomically swap Buffer B into view on `requestAnimationFrame` and dispose of the previous `PDFDocumentProxy`.

---

## 6. UI/UX Design System & Interaction Guidelines

### 6.1 Aesthetic Direction: "Academic Precision Studio"
Design the interface with the speed and tactile sharpness of **Zed** and **Linear**, combined with warm scholarly legibility.
- **No bloated toolbars:** Keep the top header bar strictly $40\text{ px}$ tall and the bottom status bar $24\text{ px}$ tall.
- **Crisp Hairline Borders:** Separate panes with $1\text{ px}$ solid borders (`var(--border-subtle)`) and subtle resize handles that illuminate on hover.
- **Theme Tokens (`src/styles/themes.css`):**
  - **Dark Theme ("Obsidian Studio" — Default):**
    - App Canvas: `#0D0F12`
    - Editor Surface: `#111418`
    - Elevated Sidebar / Modal: `#161A20`
    - Primary Text: `#E6ECF2`
    - Muted Text: `#8A96A6`
    - Accent Primary (Indigo-Cyan): `#38BDF8`
    - Compile Success (Emerald): `#10B981`
    - Compile Warning (Amber): `#F59E0B`
    - Compile Error (Rose): `#F43F5E`
    - Subtle Border: `#222730`
  - **Light Theme ("Parchment Precision"):**
    - App Canvas: `#F7F6F2`
    - Editor Surface: `#FFFFFF`
    - Elevated Sidebar / Modal: `#F0EFEA`
    - Primary Text: `#181A1F`
    - Muted Text: `#5C6470`
    - Accent Primary: `#0284C7`
    - Subtle Border: `#E2E0D8`

### 6.2 Typography Scale
- **UI Sans:** `'Inter', -apple-system, BlinkMacSystemFont, sans-serif` (`13px` default UI text, `11px` uppercase section headers with `0.05em` tracking).
- **Code & Raw LaTeX Monospace:** `'JetBrains Mono', 'Fira Code', monospace` with font ligatures disabled inside LaTeX command names.
- **RTL Script Stack:**When an RTL line is detected, cascade `'Amiri', 'Scheherazade New', 'Vazirmatn', 'Noto Naskh Arabic', 'Frank Ruhl Libre'` at $1.15\times$ font-size scale with `line-height: 1.85` so Arabic diacritics (*tashkeel*) and Hebrew cantillation marks never clip.

### 6.3 Core Workspace Layout (4-Zone Architecture)
```text
+-----------------------------------------------------------------------------------+
| [Logo] Project / main.tex [v]  | [Raw | Visual] [Formatting] | [Avatars] [Compile]| <- 40px TopBar
+----+------------------+-----------------------------------+-----------------------+
|    | EXPLORER         | 1  \documentclass{article}        |  +-----------------+  |
| 📁 | > sections/      | 2  \usepackage{amsmath}           |  |                 |  |
| 📑 |   intro.tex      | 3                                 |  |   Rendered      |  |
| 🌿 |   methods.tex    | 4  \section{Introduction}         |  |   PDF Page 1    |  |
| 👥 |   main.tex [ROOT]| 5  Given $\mathcal{O}(n \log n)$  |  |                 |  |
| 📦 |   refs.bib       | 6  +---------------------------+  |  |                 |  |
|    |                  | 7  | Rendered KaTeX Equation   |  |  |                 |  |
|    | OUTLINE          | 8  +---------------------------+  |  +-----------------+  |
| ⚙️ | 1. Introduction  |-----------------------------------+                       |
|    | 2. Methodology   | [!] 1 Warning: Overfull \hbox (l.42)          [Logs ^]    |
+----+------------------+-----------------------------------+-----------------------+
| 🌿 main* (↑1) | ⚡ LuaLaTeX (210ms) | ⇄ SyncTeX Ready | 🌐 RTL: Auto | Ln 5, Col 18| <- 24px Status
+-----------------------------------------------------------------------------------+
```

### 6.4 Micro-Interactions & Key UX Flows
1. **Segmented Raw / Visual Switcher:** Located top-center of the Editor pane (`Cmd+Shift+M` / `Ctrl+Shift+M`). Switching modes preserves the exact cursor offset and viewport scroll line without layout jump.
2. **Compile Status Pill:**
   - **Idle / Ready:** Shows `● Ready (210ms)` in emerald.
   - **Auto-Compiling:** Shows a subtle spinning ring `↻ Compiling...` without locking the editor.
   - **Error State:** Pulses rose `✕ 2 Errors` — clicking it smoothly expands the `BuildLogDrawer` at the bottom of the editor pane and jumps to the first error line.
3. **Collaborator Presence Bar:**
   - Top-right header displays circular GitHub avatars of all active peers with colored rings matching their Yjs awareness cursor color.
   - Clicking a peer's avatar toggles **"Follow Mode"**, locking your editor viewport and PDF page to follow their cursor and active file in real time.

---

## 7. Phased Implementation Roadmap & Atomic Commit Checkpoints

Execute the build strictly in the 6 phases below. At the end of every step, run all verification checks and commit with the specified message format.

### Phase 1: Repository Bootstrap, Tauri v2 Core & Workspace File System
- [x] **Step 1.1:** Initialize Git repo (`git init -b main`), create `.gitignore`, scaffold Vite + React + TypeScript + Tailwind v4 frontend and Tauri v2 Rust backend.
  - *Commit:* `chore(init): scaffold tauri v2, react 19, typescript, and tailwind workspace`
- [x] **Step 1.2:** Implement `AppError` (`error.rs`), `AppState` (`state.rs`), and filesystem commands (`fs_cmds.rs`) supporting opening a local folder, recursive directory tree listing, reading/writing UTF-8 files atomically, creating/renaming/deleting files, and importing binary figure assets (`.png`, `.pdf`, `.eps`).
  - *Commit:* `feat(fs): implement async workspace file manager and atomic disk operations`
- [x] **Step 1.3:** Implement debounced file watcher (`watcher.rs`) using `notify` ($\Delta t = 400\text{ ms}$) that emits `workspace://fs-change` events to the frontend.
  - *Commit:* `feat(watcher): add 400ms debounced filesystem watcher for external changes`
- [x] **Step 1.4:** Build `AppShell.tsx`, `ActivityRail.tsx`, `SidebarPanel.tsx`, `FileTreePanel.tsx`, `TopHeaderBar.tsx`, `StatusBar.tsx`, and theme switcher (Dark/Light).
  - *Commit:* `feat(ui): build 4-zone academic studio shell, file tree, and theme engine`

### Phase 2: Dual-Mode CodeMirror 6 Editor, Visual Mode Widgets & BiDi RTL Engine
- [x] **Step 2.1:** Build `LatexEditor.tsx` with CodeMirror 6, LaTeX syntax highlighting, bracket matching, environment auto-closing (`\begin{X}` automatically inserts `\end{X}`), and document outline extraction (`OutlinePanel.tsx`).
  - *Commit:* `feat(editor): integrate codemirror 6 latex engine and live document outline`
- [x] **Step 2.2:** Implement `bidiIsolation.ts` providing automatic per-paragraph RTL detection (UAX #9) and inline LTR directional isolation (`unicode-bidi: isolate`) for LaTeX commands and math spans inside RTL lines. Add manual LTR/RTL paragraph override commands.
  - *Commit:* `feat(bidi): implement UAX #9 paragraph detector and LTR command isolation for RTL scripts`
- [x] **Step 2.3:** Implement `visualModePlugin.ts` and interactive widgets (`MathWidget.ts` with KaTeX, `SectionWidget.ts`, `TableWidget.ts`, `MacroCapsuleWidget.ts`) with seamless cursor-enter unfolding.
  - *Commit:* `feat(visual-mode): build inline katex math, section, table, and macro capsule widgets`

### Phase 3: Multi-Engine LaTeX Compiler, Log Parser, Double-Buffered PDF & SyncTeX
- [ ] **Step 3.1:** Implement `compiler_pipeline.rs` supporting embedded Tectonic and external `pdflatex`, `xelatex`, and `lualatex` processes, magic comment detection (`% !TEX program`, `% !TEX root`), cancellation tokens, and precompiled preamble format caching.
  - *Commit:* `feat(compiler): implement multi-engine latex pipeline with preamble format caching`
- [ ] **Step 3.2:** Implement `log_parser.rs` to extract structured file/line errors, warnings, and bad boxes from raw `.log` output, and wire inline CodeMirror lint diagnostics (`inlineDiagnostics.ts`) + `BuildLogDrawer.tsx`.
  - *Commit:* `feat(diagnostics): add stateful latex log parser and inline editor error squiggles`
- [ ] **Step 3.3:** Implement `synctex_parser.rs` (decompressing `.synctex.gz` for forward & inverse coordinate lookup) and `font_cmds.rs` (enumerating system OpenType fonts via `fontdb` for `PackageFontPanel.tsx`).
  - *Commit:* `feat(synctex): implement native synctex.gz parser and system opentype font indexer`
- [ ] **Step 3.4:** Build `PdfViewport.tsx` using `pdfjs-dist` with double-buffered canvas rendering (zero flicker on recompile), `SyncTexOverlay.tsx` pulse animations, and `DetachedPdfWindow.tsx` for multi-monitor pop-out support.
  - *Commit:* `feat(pdf): implement double-buffered pdf.js viewer, synctex jump, and detachable window`

### Phase 4: GitHub OAuth Device Flow, OS Keychain & Native `git2-rs` Engine
- [ ] **Step 4.1:** Implement `github_auth.rs` and `auth_cmds.rs` for the GitHub OAuth Device Flow + `keyring` native credential storage, paired with `GithubDeviceModal.tsx`.
  - *Commit:* `feat(auth): implement github oauth device flow and os keychain token persistence`
- [ ] **Step 4.2:** Implement `git_engine.rs` and `git_cmds.rs` (`clone`, `status`, `diff`, `stage`, `unstage`, `commit`, `push`, `pull`, `branch`) with authenticated `git2::RemoteCallbacks`.
  - *Commit:* `feat(git): implement native libgit2 repository operations with oauth callbacks`
- [ ] **Step 4.3:** Build `GitControlPanel.tsx` and `CloneRepoModal.tsx` allowing users to clone their GitHub repositories, inspect inline diffs, stage files, commit, and push/pull from the sidebar.
  - *Commit:* `feat(git-ui): build git staging sidebar, diff inspector, and github repo cloner`

### Phase 5: Yjs Live Collaboration, GitHub Permission Gate & CRDT-to-Git Reconciler
- [ ] **Step 5.1:** Implement `collabManager.ts` integrating `Y.Doc`, `y-codemirror.next`, `y-indexeddb`, and `y-webrtc` / `y-websocket`, gated by `verify_repo_collaborator` against the GitHub Collaborators API.
  - *Commit:* `feat(collab): integrate yjs crdt binding, awareness cursors, and github permission gate`
- [ ] **Step 5.2:** Implement Designated Committer election and `gitCrdtBridge.ts` (3-way reconciliation between `HEAD`, live `Y.Text`, and incoming `git fetch` commits) + `ConflictModal.tsx` and `CollabPanel.tsx` (with Follow Peer mode).
  - *Commit:* `feat(reconciler): implement designated committer election and 3-way crdt-to-git bridge`

### Phase 6: LSP Integration (`TexLab`), Command Palette & End-to-End Verification
- [x] **Step 6.1:** Implement `lsp_supervisor.rs` and `lspClient.ts` to bridge `texlab` over JSON-RPC for instant `\cite{...}` BibTeX autocomplete, `\ref{...}` label lookup, and macro hover documentation.
  - *Commit:* `feat(lsp): bridge texlab language server for bibtex citation and macro completion`
- [ ] **Step 6.2:** Build `CommandPalette.tsx` (`Cmd/Ctrl+K`) exposing all editor, compiler, Git, RTL, and collaboration actions, plus comprehensive unit and integration tests for log parsing, SyncTeX coordinate mapping, BiDi tokenization, and 3-way CRDT-Git merging.
  - *Commit:* `test(suite): add command palette and comprehensive unit tests for core engines`

---

## 8. Verification & Definition of Done Checklist

Before marking the project complete, verify and check off every criterion below:

- [ ] **Git Hygiene:** `git log --oneline` shows clean, atomic Conventional Commits across all 6 phases with zero uncommitted or untracked build artifacts.
- [ ] **Rust Compilation & Linting:** `cargo check` and `cargo clippy -- -D warnings` pass with $0$ errors and $0$ warnings.
- [ ] **Frontend Typecheck & Build:** `pnpm run typecheck` and `pnpm run build` complete cleanly with zero TypeScript or bundler errors.
- [ ] **Dual-Mode Editor Fidelity:** Switching between **Raw Source** and **Visual Mode** renders inline/display math via KaTeX, section headers, and tables without altering a single byte of the underlying `.tex` document unless edited.
- [ ] **RTL & BiDi Stability:** Typing mixed Arabic/Hebrew sentences containing `\cite{knuth1984}` and `$\alpha + \beta = \gamma$` maintains right-to-left paragraph flow while keeping the LaTeX command and math expression strictly left-to-right.
- [ ] **Auto-Compile & Flicker-Free PDF:** Saving or pausing typing for $400\text{ ms}$ triggers background compilation (`Tectonic`, `LuaLaTeX`, `XeLaTeX`, or `pdfLaTeX`), updates the PDF canvas via double-buffering with zero white flash, and supports two-way `Cmd/Ctrl+Click` SyncTeX jumping.
- [ ] **GitHub Device Auth & Git Sync:** User can authenticate via the 8-character GitHub Device Code, clone a repository, stage/commit/push changes via native `git2`, and reconcile external Git commits with live Yjs CRDT sessions without data loss.
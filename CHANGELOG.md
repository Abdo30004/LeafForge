# Changelog

All notable changes to LeafForge will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.6.6] - 2026-11-08

### Added
- **Ephemeral Collaboration Invite Tokens:** Added shareable in-memory invite tokens (`LFCOLLAB:<base64>`) and custom URI handler support (`leafforge://collab?...`) enabling real-time WebRTC collaborative editing on public repositories without committing or leaking cryptographic keys to Git.
- **Deterministic Passphrase Key Derivation:** Implemented Web Crypto SHA-256 passphrase hashing allowing co-authors to join public sessions using human-memorable room passwords.
- **Dedicated Host vs. Join Workflows:** Added segmented Host and Join tabs in the Collaboration sidebar panel with an instant "Copy Invite Token" button and visual copy feedback badges.

## [0.6.5] - 2026-11-08

### Added
- **Global & Project Configuration Engine:** Implemented dual-layer settings architecture with global user preferences stored in AppData and project-level settings in `.leafforge/settings.json`, including compiler engines, font sizes, auto-compile intervals, and theme controls.
- **Native Explorer File Dialog for PDF Downloads:** Replaced default browser `Downloads` dumping with native OS file dialog (`Save As`) allowing users to pick directories and customize output filenames.
- **Native Multi-Asset Explorer Import:** Replaced full-path text prompt with native OS file explorer dialog supporting single and multi-file asset imports into the workspace.
- **System Default PDF Viewer Launch:** Integrated native OS document launcher via `@tauri-apps/plugin-opener` with direct Win32 `ShellExecuteW` fallback for opening compiled PDFs in default desktop readers (Acrobat, SumatraPDF, browser, etc.).
- **Git Commit History Telemetry:** Added visual commit log list in Source Control panel displaying commit hash badges, commit messages, author details, and timestamps.
- **GitHub Connection State Persistence & Disconnect:** Workspace remote tracking persisted across app sessions; displays connected repository cards with remote URLs and one-click disconnect confirmation.

### Changed
- **Silent Background Compilation:** Completely eliminated flashing console/CMD windows on Windows by replacing external command invocations (`attrib.exe`) with direct Win32 `SetFileAttributesW` kernel syscalls.
- **High-Contrast UI & Accessible Badges:** Enhanced visual contrast across UI controls including GitHub public/private selectors, Emerald commit buttons, push/pull indicators, and status badges.
- **Git Sync Feedback & Distinct Spinners:** Added separate push and pull loading states with spinners and clear status feedback messages upon sync completion.

### Fixed
- **Infinite Untracked Changes Loop:** Fixed dirty git working tree loop caused by `leafforge.log` and `.leafforge/` internal build artifacts being tracked by git when no `.gitignore` exists. Built-in git ignore filter automatically shields internal metadata.

## [0.6.4] - 2026-11-08

### Added
- **LeafForge Custom Modal Dialog System:** Native desktop replacement for browser `alert()`, `confirm()`, and `prompt()` dialogs with destructive confirmation styling, input prompts, and keyboard shortcuts (`Enter` / `Esc`).
- **Automated Changelog System:** Standardized Keep a Changelog documentation pipeline with automatic extraction into GitHub Releases notes.
- **Empty State PDF Indicator:** Centered `"No Preview available"` indicator replacing the mock canvas document.

### Changed
- **Global Context Menu Suppression:** Captured and suppressed all browser default context menus across all elements (WebView2 / Web) while preserving custom LeafForge context menus.
- **Compiler Output Path Hardening:** Normalized Windows verbatim extended paths (`\\?\`) so `.leafforge` is reliably tagged with OS hidden attributes.

### Fixed
- **Windows Verbatim Path Sanitization:** Sanitized extended-length `\\?\` prefixes returned by `canonicalize` across filesystem, git, compiler, and logging APIs.
- **External PDF Preview & Download:** Fixed invalid URL SyntaxError (`file://%3F/...`) when opening PDFs externally or downloading them, with safe Blob fallback in WebView2.
- **Log and Diagnostics Clearing:** Added dedicated clear buttons for compilation errors, warnings, raw build logs, and workspace application logs (`app_logger`).

### Removed
- **Mock PDF Fallback Canvas:** Removed artificial mock PDF canvas rendering and sample paragraphs when no compiled PDF is available.
- **Root Artifacts:** Removed duplicate `specs.md` and orphaned root `icon.png`.

## [0.6.3] - 2026-11-08

### Added
- **Hidden Compiler Workspace Directory:** Redirected all TeX compilation auxiliary files (`.aux`, `.log`, `.synctex.gz`, `.fls`, `.out`) and output `.pdf` into hidden `.leafforge/`.
- **Direct GitHub Repository Connection:** Modal interface for connecting local workspaces to GitHub repositories or initializing new repositories.
- **Git Repository Initialization Prompt:** Automatically detects uninitialized folders and prompts users to initialize a Git repository.
- **Persistent Credential Caching:** Hardened OAuth token storage in OS Keychain with persistent local profile caching.

### Fixed
- **Residual File Cleanup:** Automatically cleans up legacy build artifacts from the project root upon compilation into `.leafforge/`.

## [0.6.2] - 2026-11-08

### Added
- **Installer Metadata:** Enriched Windows NSIS `.exe` and WiX `.msi` installers with copyright, publisher, descriptions, license file, and file associations (`.tex`, `.bib`, `.cls`).
- **Local Incremental Release Build Runner:** Added `output/build.ps1` for local release builds without triggering remote CI.

## [0.6.1] - 2026-11-08

### Added
- **Native Context Menus:** Desktop right-click context menus for the file explorer tree, tab bar, editor, and PDF viewport.
- **Rich File Previews:** Non-text file viewer supporting images (`.png`, `.jpg`, `.svg`, `.webp`), external PDFs, and unsupported binary placeholders.
- **Hidden Build Artifacts:** File explorer automatically filters out internal directories (`.leafforge`, `.leafforge-cache`, `.texflow`, `.git`, `node_modules`).

## [0.6.0] - 2026-11-08

### Added
- **Two-Way SyncTeX Navigation:** Forward sync (CodeMirror editor to PDF canvas with amber pulse) and inverse sync (canvas Ctrl+Click to exact source line/column).
- **Sub-Second Preamble Caching:** Cryptographic hashing of preambles with precompiled `.fmt` formats, cutting build times by 60–75%.
- **Live PDF.js Dual-Buffer Canvas:** Flicker-free double-buffered PDF canvas rendering with zoom, pan, fit-to-width, and fit-to-page.

## [0.5.0] - 2026-11-08

### Added
- **Real-Time Collaboration Engine:** E2EE Yjs CRDT engine with WebRTC/WebSocket signaling, ephemeral awareness cursors, and GitHub collaborator permission enforcement.
- **3-Way Git-CRDT Reconciliation:** Reconciles dirty local collaborative state with upstream Git commits.

## [0.4.0] - 2026-11-08

### Added
- **First-Class BiDi (Arabic/Hebrew):** UAX #9 bidirectional text layout in CodeMirror 6 with LTR LaTeX command isolation.

## [0.3.0] - 2026-11-08

### Added
- **Hybrid Compiler Subsystem:** Dynamic engine switching between embedded Tectonic (auto-downloading CTAN packages) and local TeX Live/MiKTeX.

## [0.2.0] - 2026-11-08

### Added
- **Local File System IPC:** Native asynchronous Rust file system operations with atomic writes and directory watching.

## [0.1.0] - 2026-11-08

### Added
- **Initial Project Architecture:** Tauri v2 + React 19 + TypeScript + Tailwind CSS desktop shell.

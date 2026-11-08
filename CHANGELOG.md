# Changelog

All notable changes to LeafForge will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.6.4] - 2026-11-08

### Added
- **LeafForge Custom Modal Dialog System:** Native desktop replacement for browser `alert()`, `confirm()`, and `prompt()` dialogs with destructive confirmation styling, input prompts, and keyboard shortcuts (`Enter` / `Esc`).
- **Automated Changelog System:** Standardized Keep a Changelog documentation pipeline with automatic extraction into GitHub Releases notes.
- **Empty State PDF Indicator:** Centered `"No Preview available"` indicator replacing the mock canvas document.

### Changed
- **Global Context Menu Suppression:** Captured and suppressed all browser default context menus across all elements (WebView2 / Web) while preserving custom LeafForge context menus.
- **Compiler Output Path Hardening:** Normalized Windows verbatim extended paths (`\\?\`) so `.leafforge` is reliably tagged with OS hidden attributes.

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

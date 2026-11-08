# LeafForge Local Quick-Test Build Runner

This folder contains the fast, incremental build scripts for running and testing LeafForge locally in release mode without triggering GitHub Actions CI/CD workflows.

## Quick Start

### Option A: Double-Click (Windows File Explorer)
Double-click `build.bat` in this folder. It will:
1. Build the frontend assets with Vite (`dist/`).
2. Incrementally compile the Rust binary in release mode (`output/LeafForge.exe`).
3. Place `LeafForge.exe` directly in this `output/` directory.

### Option B: PowerShell Command Line

Run from repository root or inside `output/`:
```powershell
# Build and copy executable to output/LeafForge.exe
.\output\build.ps1

# Build and immediately launch the desktop app
.\output\build.ps1 -Run

# Skip frontend build (if you only modified Rust / backend files)
.\output\build.ps1 -SkipFrontend

# Build with debug profile for maximum compilation speed
.\output\build.ps1 -Debug
```

## Features
- **Incremental Compilation**: Rebuilds only modified modules; subsequent rebuilds take only 1–3 seconds.
- **Git-Ignored Binaries**: All `.exe`, `.msi`, `.pdb`, and runtime logs in `output/` are automatically ignored by Git.
- **Clean Release Mode**: Uses optimized release runtime performance for full 60fps PDF rendering, LSP indexing, and native SyncTeX queries.

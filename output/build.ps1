<#
.SYNOPSIS
    Fast local incremental build script for LeafForge desktop application.

.DESCRIPTION
    Builds the frontend and compiles the Rust backend in release mode using
    incremental compilation. Copies the resulting executable into this output/ folder.

.PARAMETER Run
    Automatically launches LeafForge.exe upon successful build.

.PARAMETER SkipFrontend
    Skips the frontend build (pnpm build) if only Rust/backend code changed.

.PARAMETER DebugBuild
    Builds using the debug profile instead of release for maximum compile speed.
#>

[CmdletBinding()]
param(
    [switch]$Run,
    [switch]$SkipFrontend,
    [switch]$DebugBuild
)

$ErrorActionPreference = 'Stop'
$stopwatch = [System.Diagnostics.Stopwatch]::StartNew()

$scriptDir = $PSScriptRoot
$repoRoot = (Resolve-Path "$scriptDir\..").Path
$outputExe = Join-Path $scriptDir "LeafForge.exe"

Write-Host "==========================================================" -ForegroundColor Green
Write-Host "  LeafForge Local Incremental Build Runner" -ForegroundColor Green
Write-Host "  Repository Root: $repoRoot" -ForegroundColor DarkGray
Write-Host "  Target Output:   $outputExe" -ForegroundColor DarkGray
Write-Host "==========================================================" -ForegroundColor Green

# 1. Enable Cargo Incremental Compilation and Parallel CodeGen for local fast builds
$env:CARGO_INCREMENTAL = "1"
$env:CARGO_PROFILE_RELEASE_INCREMENTAL = "true"
$env:CARGO_PROFILE_RELEASE_CODEGEN_UNITS = "16"
$env:CARGO_PROFILE_RELEASE_LTO = "thin"

# 2. Build Frontend Bundle (Vite + TypeScript)
if (-not $SkipFrontend) {
    Write-Host "`n[1/2] Building frontend bundle (Vite + TypeScript)..." -ForegroundColor Cyan
    Push-Location $repoRoot
    try {
        & pnpm build
        if ($LASTEXITCODE -ne 0) {
            throw "Frontend build failed with exit code $LASTEXITCODE"
        }
    } finally {
        Pop-Location
    }
} else {
    Write-Host "`n[1/2] Skipping frontend build (-SkipFrontend flag set)." -ForegroundColor Yellow
}

# 3. Compile Rust Desktop Binary
$modeName = if ($DebugBuild) { "debug" } else { "release" }
$cargoArgs = @("build", "--manifest-path", "$repoRoot\src-tauri\Cargo.toml")
if (-not $DebugBuild) {
    $cargoArgs += "--release"
}

Write-Host "`n[2/2] Compiling Rust backend binary ($modeName mode, incremental)..." -ForegroundColor Cyan
& cargo @cargoArgs
if ($LASTEXITCODE -ne 0) {
    throw "Cargo compilation failed with exit code $LASTEXITCODE"
}

# 4. Copy Binary to output/ folder
$sourceExe = Join-Path $repoRoot "src-tauri\target\$modeName\leafforge.exe"
if (-not (Test-Path $sourceExe)) {
    throw "Expected binary was not found at $sourceExe"
}

Copy-Item -Path $sourceExe -Destination $outputExe -Force
$fileInfo = Get-Item $outputExe
$fileSizeMb = [math]::Round($fileInfo.Length / 1MB, 2)

$stopwatch.Stop()
$elapsedSec = [math]::Round($stopwatch.Elapsed.TotalSeconds, 1)

Write-Host "`n----------------------------------------------------------" -ForegroundColor Green
Write-Host "  Build successful in ${elapsedSec}s!" -ForegroundColor Green
Write-Host "  Executable: $outputExe" -ForegroundColor White
Write-Host "  File Size:  ${fileSizeMb} MB" -ForegroundColor DarkGray
Write-Host "----------------------------------------------------------" -ForegroundColor Green

# 5. Optional Auto-Launch
if ($Run) {
    Write-Host "`nLaunching LeafForge ($outputExe)..." -ForegroundColor Magenta
    Start-Process -FilePath $outputExe
}

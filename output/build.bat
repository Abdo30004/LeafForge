@echo off
setlocal
cd /d "%~dp0"
echo Starting LeafForge Local Build...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0build.ps1" %*
if errorlevel 1 (
    echo.
    echo [ERROR] Build failed with exit code %errorlevel%.
    pause
    exit /b %errorlevel%
)
endlocal

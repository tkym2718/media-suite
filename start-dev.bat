@echo off
setlocal
cd /d "%~dp0"

if not exist "node_modules" (
  echo Installing dependencies for the first time...
  call npm install
  if errorlevel 1 (
    echo.
    echo npm install failed. Press any key to close.
    pause >nul
    exit /b 1
  )
)

call npm run dev

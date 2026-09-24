@echo off
cd /d "%~dp0"
where node >nul 2>&1
if errorlevel 1 (
  echo Node.js が見つかりません。README.md の PC で動作確認する方法をご覧ください。
  pause
  exit /b 1
)
start "" http://localhost:8000/
node preview.cjs
pause

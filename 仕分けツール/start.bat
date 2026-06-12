@echo off
chcp 65001 > nul
cd /d "%~dp0"

echo サーバーを起動しています...
echo ※このウィンドウはツール使用中は閉じないでください。
echo.

start http://localhost:3000
call npm start

pause

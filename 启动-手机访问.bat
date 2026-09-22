@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo.
echo   轻课表 · 手机访问模式
echo   请让手机连上同一个 WiFi，然后用手机浏览器打开下面列出的地址。
echo   （第一次运行时 Windows 防火墙可能弹窗，选择「允许访问」）
echo.
start "" http://127.0.0.1:5188/
node server.js 5188 lan
pause

@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo.
echo   轻课表 正在启动，浏览器会自动打开...
echo.
start "" /min cmd /c "timeout /t 1 /nobreak >nul && start http://127.0.0.1:5188/"
node server.js
pause

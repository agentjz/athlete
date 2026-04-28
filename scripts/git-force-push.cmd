@echo off
chcp 65001 >nul
cd /d "%~dp0\.."
set /p message=Commit message:
git init
git remote get-url origin >nul 2>nul
if errorlevel 1 (
  git remote add origin git@github.com:agentjz/deadmouse-agent.git
) else (
  git remote set-url origin git@github.com:agentjz/deadmouse-agent.git
)
git add .
git commit -m "%message%"
git push origin master --force
pause

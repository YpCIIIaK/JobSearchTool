@echo off
cd /d "%~dp0"
if not exist node_modules call npm install
if not exist .next\BUILD_ID call npm run build
start "" http://localhost:3100
call npm start

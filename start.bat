@echo off
chcp 65001 >nul
title 视频生成系统启动器

echo ========================================
echo   视频生成系统 - 一键启动
echo ========================================
echo.

:: ========================================
:: 在这里配置你的项目绝对路径
:: ========================================
set "PROJECT_DIR=D:\webworkspace\video_format_demo\video_format_demo"

:: 尝试自动查找：如果脚本在项目目录下，则使用脚本所在目录
if exist "%~dp0package.json" (
    set "PROJECT_DIR=%~dp0"
)

cd /d "%PROJECT_DIR%"
echo [信息] 项目路径: %PROJECT_DIR%
echo.

:: 检查 Node.js
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [错误] 未检测到 Node.js，请先安装 Node.js
    pause
    exit /b 1
)

echo [1/3] 检查依赖...
echo.

:: 检查后端依赖
if not exist "remotion-video\server\node_modules" (
    echo   后端依赖未安装，正在安装...
    cd remotion-video\server
    call npm install
    cd /d "%PROJECT_DIR%"
)

:: 检查前端依赖
if not exist "frontend\node_modules" (
    echo   前端依赖未安装，正在安装...
    cd frontend
    call npm install
    cd /d "%PROJECT_DIR%"
)

echo.
echo [2/3] 启动后端服务 (端口 3001)...
start "后端服务" cmd /k "cd /d "%PROJECT_DIR%\remotion-video\server" && npm start"

timeout /t 3 /nobreak >nul

echo [3/3] 启动前端服务 (端口 5173)...
start "前端服务" cmd /k "cd /d "%PROJECT_DIR%\frontend" && npm run dev"

:: 等待前端服务启动，然后打开浏览器
timeout /t 5 /nobreak >nul
start http://localhost:5173

echo.
echo ========================================
echo   启动完成！
echo   - 后端: http://localhost:3001
echo   - 前端: http://localhost:5173
echo ========================================
echo.
echo 浏览器将自动打开前端页面...
timeout /t 2 /nobreak >nul

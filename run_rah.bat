@echo off
setlocal enabledelayedexpansion

set VENV_PATH=C:\Users\jimpames\Desktop\RAH-MODULAR-NOV
set PYTHON_SCRIPT=webgui.py

:activate_venv
if not exist "%VENV_PATH%\Scripts\activate.bat" (
    echo Virtual environment not found at %VENV_PATH%
    exit /b 1
)
call "%VENV_PATH%\Scripts\activate.bat"

:start_server
echo Starting RentAHAL server...
:server_loop
c:
cd\
cd c:\Users\jimpames\Desktop\RAH-MODULAR-NOV
python "%VENV_PATH%\%PYTHON_SCRIPT%" 2> server_error.log

REM Check for specific error conditions
findstr /C:"RuntimeError: Event loop is closed" /C:"starlette" /C:"RuntimeError: Cannot start aiohttp server" server_error.log > nul
if !ERRORLEVEL! EQU 0 (
    echo.
    echo Starlette/Event loop error detected. Restarting server...
    echo.
    REM Kill any hanging Python processes
    taskkill /F /IM python.exe /FI "WINDOWTITLE eq Python" 2>nul
    timeout /t 5 /nobreak > nul
    goto server_loop
)

REM If we get here, it was a normal shutdown or different error
type server_error.log
echo.
echo Server stopped. Checking for restart...
echo Press Ctrl+C to exit completely or wait 5 seconds for restart...
timeout /t 5 /nobreak > nul
goto start_server
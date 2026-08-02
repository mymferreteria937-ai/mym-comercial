@echo off
title MYM - Puente del cajon
cd /d "%~dp0"
py -c "import win32print" >nul 2>&1
if errorlevel 1 (
  echo Instalando el componente de impresion de Windows...
  py -m pip install pywin32
)
echo.
echo Iniciando puente local MYM...
py mym_cash_drawer_bridge.py
pause

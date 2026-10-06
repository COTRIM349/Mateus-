@echo off
rem ============================================================
rem   Manejo de Irrigacao - abrir o app (Windows)
rem ============================================================
cd /d "%~dp0"
py manejo_app.py 2>nul
if errorlevel 1 (
  python manejo_app.py 2>nul
)
if errorlevel 1 (
  echo.
  echo ------------------------------------------------------------
  echo  Nao encontrei o Python instalado.
  echo  1) Baixe em  https://www.python.org/downloads/
  echo  2) Na instalacao, MARQUE a caixa "Add Python to PATH"
  echo  3) Depois clique de novo neste Abrir_App.bat
  echo ------------------------------------------------------------
  echo.
  pause
)

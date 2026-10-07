@echo off
rem Elmavere Lead Agent - abre uma consola e corre o gerador de leads.
rem Este programa NUNCA envia mensagens: so prepara a lista e os links.
chcp 65001 >nul
title Elmavere Lead Agent
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js nao esta instalado ou nao esta no PATH. Veja o README, secao 2.
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo A instalar dependencias pela primeira vez...
  call npm install
)

call npm run --silent gerar -- %*
echo.
pause

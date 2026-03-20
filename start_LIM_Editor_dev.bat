@echo off
title LIM Editor - Dev Server
cd /d "C:\Dev\lim-editor-squelette"

echo =========================================
echo   LIM Editor - lancement local
echo =========================================
echo.
echo Dossier : %cd%
echo.
echo Demarrage de Vercel Dev...
echo.

npx vercel dev

echo.
echo Le serveur s'est arrete.
pause
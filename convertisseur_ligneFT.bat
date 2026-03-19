@echo off
title Convertisseur ligneFT

echo ==========================================
echo   Conversion ligneFT vers ligneFT.normalized
echo ==========================================
echo.

cd /d "%~dp0"

call npx tsx scripts/convertLigneFTToNormalized.ts

echo.
if errorlevel 1 (
  echo [ERREUR] La conversion a echoue.
) else (
  echo [OK] La conversion est terminee.
)

echo.
pause
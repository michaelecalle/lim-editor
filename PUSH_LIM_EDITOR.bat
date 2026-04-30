@echo off
setlocal

title LIM Editor - Git Push
cd /d "S:\Dev\lim-editor"

echo =========================================
echo   LIM Editor - Preparation du push
echo =========================================
echo.
echo Dossier courant :
echo %cd%
echo.

echo ===== GIT STATUS =====
git status
echo.

set /p COMMIT_MSG=Message du commit : 

if "%COMMIT_MSG%"=="" set COMMIT_MSG=Update LIM Editor

echo.
echo ===== AJOUT DES FICHIERS =====
git add -A
if errorlevel 1 goto :error

echo.
echo ===== COMMIT =====
git commit -m "%COMMIT_MSG%"
if errorlevel 1 (
    echo.
    echo Aucun commit cree, ou rien a valider.
    echo Verification de l'etat du depot...
    git status
    goto :end
)

echo.
echo ===== PULL REBASE =====
git pull --rebase origin main
if errorlevel 1 goto :error

echo.
echo ===== PUSH =====
git push
if errorlevel 1 goto :error

echo.
echo =========================================
echo   Push termine avec succes
echo =========================================
goto :end

:error
echo.
echo =========================================
echo   Une erreur Git est survenue
echo =========================================
echo Verifie le message ci-dessus.
git status

:end
echo.
pause
endlocal

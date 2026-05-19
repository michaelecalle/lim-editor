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

echo ===== PROTECTION DES FICHIERS NORMALISES =====
call :protect_file "src/data/ligneFT.normalized.ts"
if errorlevel 1 goto :error
call :protect_file "src/data/ligneFT.normalized.json"
if errorlevel 1 goto :error
call :protect_file "src/data/ltv.normalized.json"
if errorlevel 1 goto :error
echo Protection terminee : les fichiers normalises operationnels ne seront pas inclus dans ce push.
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
echo ===== RETRAIT DE SECURITE DES FICHIERS NORMALISES =====
call :protect_file "src/data/ligneFT.normalized.ts"
if errorlevel 1 goto :error
call :protect_file "src/data/ligneFT.normalized.json"
if errorlevel 1 goto :error
call :protect_file "src/data/ltv.normalized.json"
if errorlevel 1 goto :error
echo Les fichiers normalises sont exclus de l'index Git.
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

:protect_file
set "PROTECTED_FILE=%~1"

git ls-files --error-unmatch "%PROTECTED_FILE%" >nul 2>nul
if errorlevel 1 (
    if exist "%PROTECTED_FILE%" (
        echo Suppression locale non suivie du fichier protege : %PROTECTED_FILE%
        del /f /q "%PROTECTED_FILE%"
        if errorlevel 1 exit /b 1
    )
    exit /b 0
)

git restore --staged -- "%PROTECTED_FILE%" >nul 2>nul
git restore --worktree -- "%PROTECTED_FILE%" >nul 2>nul
if errorlevel 1 exit /b 1

exit /b 0

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
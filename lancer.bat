@echo off
setlocal
title Karaoke - Lanceur
pushd "%~dp0"
if errorlevel 1 goto directory_error

echo ========================================
echo          KARAOKE - DEMARRAGE
echo ========================================
echo [1/3] Verification de Node.js et npm...

where node >nul 2>&1
if errorlevel 1 goto missing_node
where npm.cmd >nul 2>&1
if errorlevel 1 goto missing_node

if exist "node_modules\.bin\vite.cmd" if exist "node_modules\.bin\concurrently.cmd" goto launch
echo Installation des dependances du projet...
call npm.cmd ci
if errorlevel 1 (
  echo Tentative avec npm install...
  call npm.cmd install
)
if errorlevel 1 goto install_error

:launch
echo [2/3] Verification des ports du serveur et de l'interface...
node launcherCheck.mjs
if errorlevel 2 goto ports_error
if errorlevel 1 goto failure
echo [3/3] Demarrage du serveur et de l'interface...
echo Le navigateur va s'ouvrir sur http://127.0.0.1:5173/dev/
echo Gardez cette fenetre ouverte. Pour arreter : Ctrl+C.
echo L'aide IA necessite aussi le serveur LM Studio, lance separement.
echo.
call npm.cmd run dev:open
if errorlevel 1 goto launch_error
popd
exit /b 0

:ports_error
echo.
echo 1 - Arreter les serveurs de ce projet et tout relancer
echo 2 - Annuler sans rien arreter
choice /c 12 /n /m "Votre choix [1/2] : "
if errorlevel 2 goto cancelled
node launcherRestart.mjs
if errorlevel 1 goto failure
goto launch

:cancelled
popd
exit /b 0

:missing_node
echo ERREUR : Node.js et npm doivent etre installes et disponibles dans le PATH.
echo Installez une version LTS recente de Node.js, puis relancez ce fichier.
goto failure

:install_error
echo ERREUR : installation impossible. Verifiez votre connexion et les messages ci-dessus.
goto failure

:launch_error
echo ERREUR : demarrage interrompu. Consultez les messages ci-dessus.
goto failure

:directory_error
echo ERREUR : impossible d'ouvrir le dossier du projet.
pause
exit /b 1

:failure
echo.
pause
popd
exit /b 1

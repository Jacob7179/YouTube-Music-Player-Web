@echo off
setlocal EnableExtensions

REM ============================================================
REM Clean Android APK build folders
REM Deletes: android, android-sdk, node_modules, tools
REM ============================================================

cd /d "%~dp0"

echo.
echo ==========================================
echo Cleaning generated build folders...
echo ==========================================

for %%D in (android android-sdk node_modules tools) do (
    if exist "%%D" (
        echo Deleting %%D ...
        rmdir /S /Q "%%D"
        if errorlevel 1 (
            echo Failed to delete %%D.
            goto :error
        )
    ) else (
        echo %%D does not exist. Skipping.
    )
)

echo.
echo ==========================================
echo CLEAN SUCCESSFUL
echo ==========================================
echo.
pause
exit /b 0

:error
echo.
echo ==========================================
echo CLEAN FAILED
echo Close Android Studio or any terminal using the folder,
echo then run this file again.
echo ==========================================
echo.
pause
exit /b 1
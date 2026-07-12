@echo off
setlocal EnableExtensions

REM ============================================================
REM Clean Android APK build folders
REM
REM Automatically deletes:
REM   - android
REM   - node_modules
REM   - tools
REM
REM Asks before deleting:
REM   - android-sdk
REM ============================================================

cd /d "%~dp0"

echo.
echo ==========================================
echo Stopping Gradle daemon...
echo ==========================================

REM Stop Gradle normally first.
if exist "android\gradlew.bat" (
    pushd "android"
    call gradlew.bat --stop >nul 2>&1
    popd
)

echo.
echo ==========================================
echo Stopping portable tool processes...
echo ==========================================

REM Stop only Java, JavaW and Node processes launched from:
REM android_build\tools
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
    "$toolsPath = [IO.Path]::GetFullPath('%~dp0tools').TrimEnd('\') + '\';" ^
    "$processNames = @('java.exe', 'javaw.exe', 'node.exe');" ^
    "Get-CimInstance Win32_Process | Where-Object {" ^
    "    $_.Name -in $processNames -and" ^
    "    $_.ExecutablePath -and" ^
    "    $_.ExecutablePath.StartsWith($toolsPath, [StringComparison]::OrdinalIgnoreCase)" ^
    "} | ForEach-Object {" ^
    "    Write-Host ('Stopping {0} with PID {1}' -f $_.Name, $_.ProcessId);" ^
    "    Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue" ^
    "}"

REM Give Windows time to release locked files.
timeout /t 2 /nobreak >nul

echo.
echo ==========================================
echo Cleaning generated build folders...
echo ==========================================

call :deleteFolder "android"
if errorlevel 1 goto :error

call :deleteFolder "node_modules"
if errorlevel 1 goto :error

call :deleteFolder "tools"
if errorlevel 1 goto :toolsError

REM Ask before deleting Android SDK.
echo.
if exist "android-sdk" (
    echo The android-sdk folder contains the downloaded Android SDK.
    echo Keeping it will make the next build faster.
    echo.

    choice /C YN /N /M "Do you want to delete android-sdk? [Y/N]: "

    if errorlevel 2 (
        echo Keeping android-sdk.
    ) else (
        call :deleteFolder "android-sdk"
        if errorlevel 1 goto :error
    )
) else (
    echo android-sdk does not exist. Skipping.
)

echo.
echo ==========================================
echo CLEAN SUCCESSFUL
echo ==========================================
echo.
pause
exit /b 0


REM ============================================================
REM Delete folder function
REM ============================================================

:deleteFolder
set "TARGET=%~1"

if not exist "%TARGET%" (
    echo %TARGET% does not exist. Skipping.
    exit /b 0
)

echo Deleting %TARGET% ...

REM Remove read-only, hidden and system attributes.
attrib -R -H -S "%TARGET%\*" /S /D >nul 2>&1

REM First deletion attempt.
rmdir /S /Q "%TARGET%" >nul 2>&1

REM Retry with PowerShell if the folder remains.
if exist "%TARGET%" (
    powershell -NoProfile -ExecutionPolicy Bypass -Command ^
        "$path = [IO.Path]::GetFullPath('%TARGET%');" ^
        "for ($i = 1; $i -le 5; $i++) {" ^
        "    if (-not (Test-Path -LiteralPath $path)) { break };" ^
        "    try {" ^
        "        Remove-Item -LiteralPath $path -Recurse -Force -ErrorAction Stop" ^
        "    } catch {" ^
        "        Start-Sleep -Seconds 1" ^
        "    }" ^
        "}"
)

if exist "%TARGET%" (
    echo Failed to completely delete %TARGET%.
    exit /b 1
)

echo %TARGET% deleted.
exit /b 0


:toolsError
echo.
echo ==========================================
echo TOOLS FOLDER COULD NOT BE DELETED
echo ==========================================
echo.
echo A file inside tools may still be locked.
echo Close Android Studio and terminals opened inside this project,
echo then run clean.bat again.
echo.
pause
exit /b 1


:error
echo.
echo ==========================================
echo CLEAN FAILED
echo ==========================================
echo.
echo Close Android Studio or any terminal using the project folder,
echo then run clean.bat again.
echo.
pause
exit /b 1
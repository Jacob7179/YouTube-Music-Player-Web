@echo off
setlocal EnableExtensions EnableDelayedExpansion
title APK SHA and Signature Checker

REM ============================================================
REM APK SHA and Signing Certificate Checker
REM
REM Usage:
REM   1. Put this BAT file in the repository root or android_build.
REM   2. Double-click it to check the default debug APK.
REM
REM Or:
REM   Drag an APK file onto this BAT file.
REM
REM Output:
REM   Separate TXT reports are created in apk-sha-reports.
REM ============================================================

cd /d "%~dp0"

REM Use an APK supplied by drag-and-drop or command-line argument.
if not "%~1"=="" (
    set "APK=%~f1"
) else (
    REM Default path when this BAT file is inside android_build.
    set "APK=%~dp0android\app\build\outputs\apk\debug\app-debug.apk"

    REM Alternative path when this BAT file is in the repository root.
    if not exist "!APK!" (
        set "APK=%~dp0android_build\android\app\build\outputs\apk\debug\app-debug.apk"
    )
)

if not exist "%APK%" (
    echo.
    echo [ERROR] APK file was not found.
    echo.
    echo Expected one of these default locations:
    echo   %~dp0android\app\build\outputs\apk\debug\app-debug.apk
    echo   %~dp0android_build\android\app\build\outputs\apk\debug\app-debug.apk
    echo.
    echo You can also drag an APK file onto this BAT file.
    echo.
    pause
    exit /b 1
)

for %%F in ("%APK%") do (
    set "APK_NAME=%%~nxF"
    set "APK_BASENAME=%%~nF"
    set "APK_SIZE=%%~zF"
)

set "OUTPUT_DIR=%~dp0apk-sha-reports"
if not exist "%OUTPUT_DIR%" mkdir "%OUTPUT_DIR%"

for /f "usebackq delims=" %%T in (`powershell -NoProfile -Command "Get-Date -Format 'yyyyMMdd-HHmmss'"`) do set "STAMP=%%T"
for /f "usebackq delims=" %%T in (`powershell -NoProfile -Command "Get-Date -Format 'yyyy-MM-dd HH:mm:ss'"`) do set "GENERATED_AT=%%T"

set "REPORT_BASE=%OUTPUT_DIR%\%APK_BASENAME%-%STAMP%"
set "APK_TO_HASH=%APK%"

echo.
echo ============================================================
echo Checking APK
echo ============================================================
echo APK: %APK%
echo.

echo Calculating SHA-256...
for /f "usebackq delims=" %%H in (`powershell -NoProfile -ExecutionPolicy Bypass -Command "(Get-FileHash -LiteralPath $env:APK_TO_HASH -Algorithm SHA256).Hash"`) do set "SHA256=%%H"

if not defined SHA256 (
    echo [ERROR] Failed to calculate SHA-256.
    pause
    exit /b 1
)

echo Calculating SHA-1...
for /f "usebackq delims=" %%H in (`powershell -NoProfile -ExecutionPolicy Bypass -Command "(Get-FileHash -LiteralPath $env:APK_TO_HASH -Algorithm SHA1).Hash"`) do set "SHA1=%%H"

if not defined SHA1 (
    echo [ERROR] Failed to calculate SHA-1.
    pause
    exit /b 1
)

REM Write individual checksum files.
> "%REPORT_BASE%-SHA256.txt" echo !SHA256! *!APK_NAME!
> "%REPORT_BASE%-SHA1.txt" echo !SHA1! *!APK_NAME!

REM Find apksigner.bat in common Android SDK locations.
set "APKSIGNER="

call :FindApkSigner "%~dp0android-sdk\build-tools"
if not defined APKSIGNER call :FindApkSigner "%~dp0android_build\android-sdk\build-tools"

if defined ANDROID_SDK_ROOT (
    if not defined APKSIGNER call :FindApkSigner "%ANDROID_SDK_ROOT%\build-tools"
)

if defined ANDROID_HOME (
    if not defined APKSIGNER call :FindApkSigner "%ANDROID_HOME%\build-tools"
)

if defined LOCALAPPDATA (
    if not defined APKSIGNER call :FindApkSigner "%LOCALAPPDATA%\Android\Sdk\build-tools"
)

set "SIGNATURE_REPORT=%REPORT_BASE%-SIGNING-CERTIFICATE.txt"

if defined APKSIGNER (
    echo Checking APK signing certificate...
    call "%APKSIGNER%" verify --verbose --print-certs "%APK%" > "%SIGNATURE_REPORT%" 2>&1
    set "SIGNATURE_EXIT_CODE=!ERRORLEVEL!"

    if "!SIGNATURE_EXIT_CODE!"=="0" (
        set "SIGNATURE_STATUS=Verified"
    ) else (
        set "SIGNATURE_STATUS=Verification failed - see signing certificate report"
    )
) else (
    set "SIGNATURE_STATUS=Not checked - apksigner.bat was not found"
    (
        echo APK signing certificate report
        echo ==============================
        echo.
        echo APK: %APK%
        echo.
        echo apksigner.bat was not found.
        echo.
        echo Checked common Android SDK locations:
        echo   %~dp0android-sdk\build-tools
        echo   %~dp0android_build\android-sdk\build-tools
        echo   ANDROID_SDK_ROOT\build-tools
        echo   ANDROID_HOME\build-tools
        echo   %LOCALAPPDATA%\Android\Sdk\build-tools
    ) > "%SIGNATURE_REPORT%"
)

REM Create a combined summary report.
(
    echo APK SHA and Signature Summary
    echo =============================
    echo.
    echo Generated: !GENERATED_AT!
    echo APK: !APK!
    echo File name: !APK_NAME!
    echo File size: !APK_SIZE! bytes
    echo.
    echo SHA-256:
    echo !SHA256!
    echo.
    echo SHA-1:
    echo !SHA1!
    echo.
    echo Signing status:
    echo !SIGNATURE_STATUS!
    echo.
    if defined APKSIGNER echo apksigner: !APKSIGNER!
    echo.
    echo Separate reports:
    echo !REPORT_BASE!-SHA256.txt
    echo !REPORT_BASE!-SHA1.txt
    echo !SIGNATURE_REPORT!
) > "%REPORT_BASE%-SUMMARY.txt"

echo.
echo ============================================================
echo Completed
echo ============================================================
echo SHA-256:
echo !SHA256!
echo.
echo SHA-1:
echo !SHA1!
echo.
echo Signing status:
echo !SIGNATURE_STATUS!
echo.
echo Reports saved to:
echo %OUTPUT_DIR%
echo.
echo Files created:
echo   %REPORT_BASE%-SHA256.txt
echo   %REPORT_BASE%-SHA1.txt
echo   %REPORT_BASE%-SIGNING-CERTIFICATE.txt
echo   %REPORT_BASE%-SUMMARY.txt
echo.
pause
exit /b 0


:FindApkSigner
if defined APKSIGNER exit /b 0

set "BUILD_TOOLS_ROOT=%~1"
if not exist "%BUILD_TOOLS_ROOT%" exit /b 0

for /f "usebackq delims=" %%A in (`powershell -NoProfile -ExecutionPolicy Bypass -Command "$root=$env:BUILD_TOOLS_ROOT; if (Test-Path -LiteralPath $root) { Get-ChildItem -LiteralPath $root -Directory | Sort-Object { try { [version]$_.Name } catch { [version]'0.0' } } -Descending | ForEach-Object { $candidate=Join-Path $_.FullName 'apksigner.bat'; if (Test-Path -LiteralPath $candidate) { $candidate; break } } }"`) do (
    set "APKSIGNER=%%A"
)

exit /b 0

param(
    [Parameter(Mandatory = $true)][string] $AndroidHome,
    [Parameter(Mandatory = $true)][string] $ProjectRoot
)
$ErrorActionPreference = 'Stop'
try {
    # Reject Windows command-line quoting issues before joining paths.
    foreach ($parameterName in @('AndroidHome', 'ProjectRoot')) {
        $pathValue = Get-Variable -Name $parameterName -ValueOnly
        if ([string]::IsNullOrWhiteSpace($pathValue) -or $pathValue.Contains('"')) {
            throw "Invalid $parameterName path received from build.bat. Check argument quoting."
        }
    }
    $ProjectRoot = [IO.Path]::GetFullPath($ProjectRoot)
    $AndroidHome = [IO.Path]::GetFullPath($AndroidHome)

    $releaseFolder = Join-Path $ProjectRoot 'android\app\build\outputs\apk\release'
    $unsignedApk = Join-Path $releaseFolder 'app-release-unsigned.apk'
    $signedApk = Join-Path $releaseFolder 'app-release-signed.apk'
    if (!(Test-Path -LiteralPath $unsignedApk)) { throw "Release APK not found: $unsignedApk" }

    $buildTools = Join-Path $AndroidHome 'build-tools'
    $signer = Get-ChildItem -LiteralPath $buildTools -Directory -ErrorAction Stop |
        Sort-Object { try { [version]($_.Name -replace '-.*$','') } catch { [version]'0.0' } } -Descending |
        ForEach-Object { Join-Path $_.FullName 'apksigner.bat' } |
        Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
    if (!$signer) { throw "apksigner.bat not found in $buildTools. Install Android SDK Build-Tools." }

    Write-Host ''
    Write-Host 'Custom release APK signing'
    Write-Host 'Keep your .jks and passwords safe: Android updates require the SAME key.'
    $defaultKeystore = Join-Path $ProjectRoot 'signing\release-key.jks'
    # Open a native Windows file browser so the user can select an existing key.
    # Fall back to a typed path when Windows Forms is unavailable (e.g. headless).
    $keystore = $null
    try {
        Add-Type -AssemblyName System.Windows.Forms
        $dialog = New-Object System.Windows.Forms.OpenFileDialog
        $dialog.Title = 'Select your Android signing key (.jks or .keystore)'
        $dialog.Filter = 'Android keystore (*.jks;*.keystore)|*.jks;*.keystore|All files (*.*)|*.*'
        $dialog.CheckFileExists = $true
        $dialog.Multiselect = $false
        if (Test-Path -LiteralPath $defaultKeystore -PathType Leaf) {
            $dialog.InitialDirectory = Split-Path -Parent $defaultKeystore
            $dialog.FileName = Split-Path -Leaf $defaultKeystore
        } else {
            $dialog.InitialDirectory = $ProjectRoot
        }
        Write-Host 'Choose your keystore in the file browser...'
        if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {
            $keystore = $dialog.FileName
        } else {
            throw 'Keystore selection canceled.'
        }
    } catch {
        if ($_.Exception.Message -eq 'Keystore selection canceled.') { throw }
        Write-Warning "File picker unavailable: $($_.Exception.Message)"
        $keystore = Read-Host "Enter keystore path (.jks/.keystore) [default: $defaultKeystore]"
        if ([string]::IsNullOrWhiteSpace($keystore)) { $keystore = $defaultKeystore }
    } finally {
        if ($null -ne $dialog) { $dialog.Dispose() }
    }
    $keystore = $keystore.Trim().Trim('"').Trim()
    if ([string]::IsNullOrWhiteSpace($keystore) -or $keystore.Contains('"')) {
        throw 'Invalid keystore path. Select a valid .jks or .keystore file.'
    }
    try { $keystore = [IO.Path]::GetFullPath($keystore) }
    catch { throw "Invalid keystore path: $($_.Exception.Message)" }
    if (!(Test-Path -LiteralPath $keystore -PathType Leaf)) {
        throw "Keystore not found: $keystore. Create it first using keytool (see SIGNING.md)."
    }
    $alias = Read-Host 'Key alias'
    if ([string]::IsNullOrWhiteSpace($alias)) { throw 'Key alias is required.' }

    $storeSecure = Read-Host 'Keystore password' -AsSecureString
    $keySecure = Read-Host 'Key password (press Enter to use keystore password)' -AsSecureString
    $ptr1 = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($storeSecure)
    $ptr2 = [IntPtr]::Zero
    try {
        $env:YT_SIGN_STORE_PASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr1)
        if ($keySecure.Length -eq 0) {
            $env:YT_SIGN_KEY_PASSWORD = $env:YT_SIGN_STORE_PASSWORD
        } else {
            $ptr2 = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($keySecure)
            $env:YT_SIGN_KEY_PASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr2)
        }
        if ([string]::IsNullOrEmpty($env:YT_SIGN_STORE_PASSWORD)) { throw 'Keystore password cannot be blank.' }
        if (Test-Path -LiteralPath $signedApk) { Remove-Item -LiteralPath $signedApk -Force }
        & $signer sign --ks $keystore --ks-key-alias $alias --ks-pass env:YT_SIGN_STORE_PASSWORD --key-pass env:YT_SIGN_KEY_PASSWORD --out $signedApk $unsignedApk
        if ($LASTEXITCODE -ne 0) { throw "APK signing failed (code $LASTEXITCODE)." }
        & $signer verify --verbose $signedApk
        if ($LASTEXITCODE -ne 0) { throw 'APK signature verification failed.' }
        Write-Host "Signed and verified: $signedApk"
    } finally {
        Remove-Item Env:YT_SIGN_STORE_PASSWORD -ErrorAction SilentlyContinue
        Remove-Item Env:YT_SIGN_KEY_PASSWORD -ErrorAction SilentlyContinue
        if ($ptr1 -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr1) }
        if ($ptr2 -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr2) }
    }
} catch {
    Write-Error $_.Exception.Message
    exit 1
}

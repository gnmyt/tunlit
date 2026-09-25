$ErrorActionPreference = "Stop"
$Releases = "https://github.com/gnmyt/tunlit/releases/latest/download"

$arch = switch ($env:PROCESSOR_ARCHITECTURE) {
    "AMD64" { "x64" }
    "ARM64" { "arm64" }
    default { Write-Error "unsupported architecture: $($env:PROCESSOR_ARCHITECTURE). tunlit for Windows ships for x86-64 and ARM64."; exit 1 }
}

Write-Host ""
Write-Host "  tunlit installer (windows $arch)"
Write-Host ""

$msi = Join-Path $env:TEMP "tunlit-$arch.msi"
Write-Host "  Downloading tunlit-$arch.msi"
Invoke-WebRequest -Uri "$Releases/tunlit-$arch.msi" -OutFile $msi -UseBasicParsing

$setup = Start-Process msiexec.exe -ArgumentList "/i", "`"$msi`"", "/passive", "/norestart" -Wait -PassThru
Remove-Item $msi -ErrorAction SilentlyContinue

if ($setup.ExitCode -ne 0) {
    Write-Host "  The installer did not finish (exit code $($setup.ExitCode)), installing the plain binary instead"
    $dir = Join-Path $env:LOCALAPPDATA "Programs\tunlit"
    New-Item -ItemType Directory -Force -Path $dir | Out-Null
    Invoke-WebRequest -Uri "$Releases/tunlit-windows-$arch.exe" -OutFile (Join-Path $dir "tunlit.exe") -UseBasicParsing
    $path = [Environment]::GetEnvironmentVariable("Path", "User")
    if (($path -split ";") -notcontains $dir) {
        [Environment]::SetEnvironmentVariable("Path", "$path;$dir", "User")
    }
    Write-Host "  Installed $dir\tunlit.exe"
}

Write-Host ""
Write-Host "  Installed. Open a new terminal and run: tunlit login"
Write-Host ""

<#
.SYNOPSIS
    Creates a deployment package (ZIP) of the platform configuration.
.DESCRIPTION
    Zips the 'enginedge-core/platform' directory into 'enginedge-deploy.zip'.
    This file can be easily copied to your Hyper-V server via Remote Desktop.
#>

$ErrorActionPreference = "Stop"

# Get the absolute path to the platform directory
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$PlatformDir = Split-Path -Parent $ScriptDir
# Save zip one level up to avoid locking/recursion issues
$ZipPath = Join-Path (Split-Path -Parent $PlatformDir) "enginedge-deploy.zip"

Write-Host "Creating deployment package..." -ForegroundColor Cyan
Write-Host "Source: $PlatformDir" -ForegroundColor Gray
Write-Host "Destination: $ZipPath" -ForegroundColor Gray

# Remove existing zip if it exists
if (Test-Path $ZipPath) {
    try {
        Remove-Item $ZipPath -Force -ErrorAction Stop
    } catch {
        Write-Warning "Could not delete existing zip file. It might be in use."
        $ZipPath = Join-Path (Split-Path -Parent $PlatformDir) "enginedge-deploy-$(Get-Date -Format 'yyyyMMdd-HHmmss').zip"
        Write-Host "Using new filename: $ZipPath" -ForegroundColor Yellow
    }
}

# Create the zip file
Compress-Archive -Path "$PlatformDir" -DestinationPath $ZipPath -Force

if (Test-Path $ZipPath) {
    Write-Host "`n✅ Package created successfully!" -ForegroundColor Green
    Write-Host "File: $ZipPath" -ForegroundColor White
    Write-Host "`nNext Steps:" -ForegroundColor Yellow
    Write-Host "1. Copy this zip file." -ForegroundColor White
    Write-Host "2. Paste it onto your Hyper-V Server (via Remote Desktop)." -ForegroundColor White
    Write-Host "3. Unzip it on the server." -ForegroundColor White
    Write-Host "4. Run 'scripts/copy-to-vm.ps1' from the server." -ForegroundColor White
} else {
    Write-Error "Failed to create zip file."
}

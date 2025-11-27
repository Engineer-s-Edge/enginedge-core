<#
.SYNOPSIS
    Copies the platform setup files to a remote Linux VM.
.DESCRIPTION
    This script uses SCP (Secure Copy) to transfer the 'platform' directory 
    to a specified Linux VM. This is required before running setup scripts.
.PARAMETER IpAddress
    The IP address of the target VM (e.g., 192.168.100.10).
.PARAMETER Username
    The username on the target VM (e.g., ubuntu, chris).
#>

param(
    [Parameter(Mandatory=$true)]
    [string]$IpAddress,

    [Parameter(Mandatory=$true)]
    [string]$Username
)

$ErrorActionPreference = "Stop"

# Get the absolute path to the platform directory
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$PlatformDir = Split-Path -Parent $ScriptDir
$SourcePath = $PlatformDir

Write-Host "Preparing to copy files to $Username@$IpAddress..." -ForegroundColor Cyan
Write-Host "Source: $SourcePath" -ForegroundColor Gray
Write-Host "Destination: /home/$Username/enginedge-platform" -ForegroundColor Gray

# Check if we can reach the VM
if (-not (Test-Connection -ComputerName $IpAddress -Count 1 -Quiet)) {
    Write-Error "Cannot reach IP address $IpAddress. Please check your network settings."
    exit 1
}

Write-Host "`nStarting transfer... (You may be asked for your VM password)" -ForegroundColor Yellow

# Create directory first to ensure clean state
ssh "$Username@$IpAddress" "mkdir -p ~/enginedge-platform"

# Copy files using SCP
# -r = recursive
# Use curly braces for variable to avoid parsing error with colon
scp -r "$SourcePath/*" "${Username}@${IpAddress}:~/enginedge-platform/"

if ($LASTEXITCODE -eq 0) {
    Write-Host "`n✅ Success! Files copied." -ForegroundColor Green
    Write-Host "Next steps:" -ForegroundColor White
    Write-Host "1. SSH into the VM: ssh $Username@$IpAddress" -ForegroundColor White
    Write-Host "2. Go to the folder: cd ~/enginedge-platform/onprem-setup" -ForegroundColor White
    Write-Host "3. Run the setup: sudo ./scripts/setup-kubeadm.sh" -ForegroundColor White
} else {
    Write-Error "Transfer failed. Please check your SSH credentials and try again."
}

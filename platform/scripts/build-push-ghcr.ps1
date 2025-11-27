<#
.SYNOPSIS
    Builds and pushes Docker images to GitHub Container Registry.
.PARAMETER GithubUser
    Your GitHub username (e.g., chris-alexander-pop).
#>

param(
    [Parameter(Mandatory=$true)]
    [string]$GithubUser,

    [Parameter(Mandatory=$false)]
    [switch]$BuildOnly
)

$ErrorActionPreference = "Stop"
$Registry = "ghcr.io/$GithubUser"

# Get the root of the repository (assuming script is in enginedge-core/platform/scripts)
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$WorkspaceRoot = Resolve-Path "$ScriptDir\..\..\.."

Write-Host "Workspace Root: $WorkspaceRoot" -ForegroundColor Gray

# List of components and their paths relative to workspace root
$Components = @{
    # "api-gateway"            = "enginedge-core/api-gateway"
    # "hexagon"                = "enginedge-core/hexagon"
    # "scheduling-model"       = "enginedge-scheduling-model"
    "wolfram-kernel"         = "enginedge-local-kernel"
    "datalake"               = "enginedge-datalake"
    # "spacy-service"          = "enginedge-workers/spacy-service"
    # "resume-worker"          = "enginedge-workers/resume-worker"
    # "interview-worker"       = "enginedge-workers/interview-worker"
    # "news-worker"            = "enginedge-workers/news-worker"
    # "agent-tool-worker"      = "enginedge-workers/agent-tool-worker"
    # "assistant-worker"       = "enginedge-workers/assistant-worker"
    # "data-processing-worker" = "enginedge-workers/data-processing-worker"
    # "identity-worker"        = "enginedge-workers/identity-worker"
    # "latex-worker"           = "enginedge-workers/latex-worker"
    # "scheduling-worker"      = "enginedge-workers/scheduling-worker"
    # "news-ingestion-job"     = "_enginedge-monorepo/scripts/jobs"
}

if ($BuildOnly) {
    Write-Host "Building images locally (skipping push)..." -ForegroundColor Cyan
} else {
    Write-Host "Building and pushing images to $Registry..." -ForegroundColor Cyan
}

foreach ($name in $Components.Keys) {
    $relativePath = $Components[$name]
    $fullPath = Join-Path $WorkspaceRoot $relativePath
    $image = "$Registry/$name`:latest"
    
    if (Test-Path $fullPath) {
        Write-Host "`nProcessing $name..." -ForegroundColor Green
        
        # Build
        docker build -t $image $fullPath
        
        # Push
        if (-not $BuildOnly) {
            docker push $image
        }
    } else {
        Write-Warning "Path not found: $fullPath"
    }
}

if ($BuildOnly) {
    Write-Host "`n✅ All images built successfully!" -ForegroundColor Green
} else {
    Write-Host "`n✅ All images pushed!" -ForegroundColor Green
}

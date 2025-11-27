<#
.SYNOPSIS
    Builds and pushes Docker images to GitHub Container Registry.
.PARAMETER GithubUser
    Your GitHub username (e.g., chris-alexander-pop).
#>

param(
    [Parameter(Mandatory=$true)]
    [string]$GithubUser
)

$ErrorActionPreference = "Stop"
$Registry = "ghcr.io/$GithubUser"

# List of components and their paths relative to workspace root
$Components = @{
    "main-node"        = "_enginedge-monorepo/main-node"
    "worker-node"      = "_enginedge-monorepo/worker-node"
    "api-gateway"      = "enginedge-core/api-gateway"
    "hexagon"          = "enginedge-core/hexagon"
    "scheduling-model" = "enginedge-scheduling-model"
    "spacy-service"    = "enginedge-workers/spacy-service"
    "resume-worker"    = "enginedge-workers/resume-worker"
    "interview-worker" = "enginedge-workers/interview-worker"
    "news-worker"      = "enginedge-workers/news-worker"
    "datalake"         = "enginedge-datalake"
}

Write-Host "Building and pushing images to $Registry..." -ForegroundColor Cyan

foreach ($name in $Components.Keys) {
    $path = $Components[$name]
    $image = "$Registry/$name`:latest"
    
    if (Test-Path $path) {
        Write-Host "`nProcessing $name..." -ForegroundColor Green
        
        # Build
        docker build -t $image $path
        
        # Push
        docker push $image
    } else {
        Write-Warning "Path not found: $path"
    }
}

Write-Host "`n✅ All images pushed!" -ForegroundColor Green

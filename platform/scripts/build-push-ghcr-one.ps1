<#
.SYNOPSIS
    Builds and pushes a single Docker image to GitHub Container Registry based on a target path or component name.
.PARAMETER GithubUser
    Your GitHub username (e.g., chris-alexander-pop).
.PARAMETER Target
    Component name (e.g. 'api-gateway') or path (e.g. 'enginedge-core/api-gateway' or '.\enginedge-core\api-gateway').
.PARAMETER BuildOnly
    If set, builds the image locally but does not push.
#>

param(
    [Parameter(Mandatory = $true)]
    [string]$GithubUser,

    [Parameter(Mandatory = $true)]
    [string]$Target,

    [Parameter(Mandatory = $false)]
    [switch]$BuildOnly
)

$ErrorActionPreference = "Stop"
$Registry = "ghcr.io/$GithubUser"

# Get the root of the repository (assuming script is in enginedge-core/platform/scripts)
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$WorkspaceRoot = Resolve-Path "$ScriptDir\..\..\.."

Write-Host "Workspace Root: $WorkspaceRoot" -ForegroundColor Gray

# Same component map as the multi-build script
$Components = @{
    "api-gateway"            = "enginedge-core/api-gateway"
    "hexagon"                = "enginedge-core/hexagon"
    "scheduling-model"       = "enginedge-scheduling-model"
    "wolfram-kernel"         = "enginedge-local-kernel"
    "datalake"               = "enginedge-datalake"
    "spacy-service"          = "enginedge-workers/spacy-service"
    "resume-worker"          = "enginedge-workers/resume-worker"
    "interview-worker"       = "enginedge-workers/interview-worker"
    "news-worker"            = "enginedge-workers/news-worker"
    "agent-tool-worker"      = "enginedge-workers/agent-tool-worker"
    "assistant-worker"       = "enginedge-workers/assistant-worker"
    "data-processing-worker" = "enginedge-workers/data-processing-worker"
    "identity-worker"        = "enginedge-workers/identity-worker"
    "latex-worker"           = "enginedge-workers/latex-worker"
    "scheduling-worker"      = "enginedge-workers/scheduling-worker"
}

function Resolve-Component {
    param(
        [string]$TargetValue
    )

    # Normalize slashes and trim trailing separators
    $normalized = $TargetValue.Trim().TrimEnd('\', '/')
    $normalizedPathStyle = ($normalized -replace '\\','/')

    # If it looks like a path, grab the leaf folder name
    if ($normalizedPathStyle -match '/') {
        $leaf = Split-Path $normalized -Leaf
    } else {
        $leaf = $normalized
    }

    # 1) Exact component name match (by key)
    if ($Components.ContainsKey($normalized)) {
        return @{ Name = $normalized; Path = $Components[$normalized] }
    }
    if ($Components.ContainsKey($leaf)) {
        return @{ Name = $leaf; Path = $Components[$leaf] }
    }

    # 2) Match by configured path or its leaf
    foreach ($kv in $Components.GetEnumerator()) {
        $compPathNorm = ($kv.Value -replace '\\','/')
        $compLeaf = Split-Path $kv.Value -Leaf

        if ($compPathNorm -eq $normalizedPathStyle -or $compLeaf -eq $leaf) {
            return @{ Name = $kv.Key; Path = $kv.Value }
        }
    }

    return $null
}

$component = Resolve-Component -TargetValue $Target

if (-not $component) {
    Write-Host "Could not resolve target '$Target' to a known component." -ForegroundColor Red
    Write-Host "Known components:" -ForegroundColor Yellow
    $Components.Keys | Sort-Object | ForEach-Object { Write-Host "  $_" }
    exit 1
}

$name = $component.Name
$relativePath = $component.Path
$fullPath = Join-Path $WorkspaceRoot $relativePath
$image = "$Registry/$name`:latest"

if (-not (Test-Path $fullPath)) {
    Write-Host "Resolved path does not exist: $fullPath" -ForegroundColor Red
    exit 1
}

if ($BuildOnly) {
    Write-Host "Building image (no push): $image" -ForegroundColor Cyan
} else {
    Write-Host "Building and pushing image: $image" -ForegroundColor Cyan
}

docker build -t $image $fullPath

if (-not $BuildOnly) {
    docker push $image
}

Write-Host "`n✅ Done for component '$name' at path '$relativePath'." -ForegroundColor Green



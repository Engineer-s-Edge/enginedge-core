<#
.SYNOPSIS
    Updates Kubernetes manifests in the 'prod' folder to use GHCR images.
.PARAMETER GithubUser
    Your GitHub username (e.g., Chris-Alexander-Pop).
#>

param(
    [Parameter(Mandatory=$true)]
    [string]$GithubUser
)

$ProdDir = "c:\Users\chris\Engineering\EnginEdge\enginedge-core\platform\k8s\prod"
$Registry = "ghcr.io/$GithubUser"

Write-Host "Updating manifests in $ProdDir to use $Registry..." -ForegroundColor Cyan

# Function to update a single file
function Update-Manifest {
    param ($Path)
    
    $content = Get-Content $Path -Raw
    $originalContent = $content
    
    # 1. Update Image Names (e.g., image: main-node:latest -> image: ghcr.io/user/main-node:latest)
    # Regex looks for 'image: name:tag' where name doesn't already have a slash
    $content = $content -replace "image: ([a-zA-Z0-9-]+):latest", "image: $Registry/`$1:latest"
    
    # 2. Update ImagePullPolicy
    $content = $content -replace "imagePullPolicy: Never", "imagePullPolicy: Always"
    $content = $content -replace "pullPolicy: Never", "pullPolicy: Always"
    
    # 3. Add ImagePullSecrets if missing (simple check)
    if ($content -notmatch "imagePullSecrets") {
        # Try to insert after serviceAccountName or spec:
        if ($content -match "serviceAccountName:.*") {
            $content = $content -replace "(serviceAccountName:.*)", "`$1`n      imagePullSecrets:`n      - name: ghcr-pull-secret"
        } elseif ($content -match "spec:\s*containers:") {
             # Fallback for simple pods
             # This is tricky with regex, manual check might be better for complex files
        }
    }

    if ($content -ne $originalContent) {
        Set-Content -Path $Path -Value $content
        Write-Host "Updated: $(Split-Path $Path -Leaf)" -ForegroundColor Green
    }
}

# Process all YAML files in prod/apps and prod/observability
$FoldersToUpdate = @("apps", "observability")
foreach ($folder in $FoldersToUpdate) {
    if (Test-Path "$ProdDir\$folder") {
        Get-ChildItem -Path "$ProdDir\$folder" -Recurse -Filter "*.yaml" | ForEach-Object {
            Update-Manifest $_.FullName
        }
    }
}

# Process Helm values in prod/charts
Get-ChildItem -Path "$ProdDir\charts" -Recurse -Filter "values.yaml" | ForEach-Object {
    $content = Get-Content $_.FullName -Raw
    # Helm values are structured differently: repository: name -> repository: ghcr.io/user/name
    $content = $content -replace "repository: ([a-zA-Z0-9-]+)", "repository: $Registry/`$1"
    $content = $content -replace "pullPolicy: Never", "pullPolicy: Always"
    Set-Content -Path $_.FullName -Value $content
    Write-Host "Updated Chart: $(Split-Path $_.FullName -Parent | Split-Path -Leaf)" -ForegroundColor Green
}

Write-Host "`n✅ Production manifests updated." -ForegroundColor Cyan

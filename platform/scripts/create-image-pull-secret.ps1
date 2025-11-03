Param(
  [Parameter(Mandatory=$true)][string]$Registry,
  [Parameter(Mandatory=$true)][string]$Username,
  [Parameter(Mandatory=$true)][string]$Token,
  [string]$SecretName = 'ghcr-pull-secret',
  [string]$Namespace = 'default'
)

Write-Host "Creating imagePullSecret $SecretName in namespace $Namespace for $Registry..."
$secretYaml = kubectl create secret docker-registry $SecretName `
  --docker-server=$Registry `
  --docker-username=$Username `
  --docker-password=$Token `
  --namespace $Namespace `
  --dry-run=client -o yaml

$secretYaml | kubectl apply -f -
Write-Host "Done. Set Helm value: --set imagePullSecrets[0].name=$SecretName"

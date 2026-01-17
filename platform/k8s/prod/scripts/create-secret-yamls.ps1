# Create secret YAML files from generated certificates and keyfiles
# This script creates the actual secret YAML files that can be applied to Kubernetes

$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$SecretsDir = Join-Path (Split-Path -Parent $ScriptDir) "secrets"
$CertsDir = Join-Path $SecretsDir "kafka-tls-certs"

Write-Host "=== Creating Secret YAML Files ===" -ForegroundColor Cyan
Write-Host ""

# Function to base64 encode
function Encode-Base64 {
    param([string]$FilePath)
    if (Test-Path $FilePath) {
        $bytes = [System.IO.File]::ReadAllBytes($FilePath)
        return [Convert]::ToBase64String($bytes)
    } else {
        Write-Host "⚠ File not found: $FilePath" -ForegroundColor Yellow
        return ""
    }
}

# Create Kafka TLS Secret YAML
Write-Host "Creating kafka-tls-secret.yaml..." -ForegroundColor Yellow

$kafkaKeystore0 = Join-Path $CertsDir "kafka-0-keystore.p12"
$kafkaKeystore1 = Join-Path $CertsDir "kafka-1-keystore.p12"
$kafkaTruststore0 = Join-Path $CertsDir "kafka-0-truststore.jks"
$kafkaTruststore1 = Join-Path $CertsDir "kafka-1-truststore.jks"
$caCert = Join-Path $CertsDir "ca-cert.pem"

if (-not (Test-Path $kafkaKeystore0) -or -not (Test-Path $kafkaKeystore1)) {
    Write-Host "✗ Kafka keystores not found. Run create-secrets.ps1 first." -ForegroundColor Red
    exit 1
}

$kafkaSecretYaml = @"
apiVersion: v1
kind: Secret
metadata:
  name: kafka-tls-secret
  namespace: default
type: Opaque
data:
  kafka-0-keystore.p12: $(Encode-Base64 $kafkaKeystore0)
  kafka-1-keystore.p12: $(Encode-Base64 $kafkaKeystore1)
  ca-cert: $(Encode-Base64 $caCert)
  keystore-password: $([Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes("changeit")))
  truststore-password: $([Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes("changeit")))
"@

# Add truststores if they exist
if (Test-Path $kafkaTruststore0) {
    $kafkaSecretYaml = $kafkaSecretYaml -replace "truststore-password:", "kafka-0-truststore.jks: $(Encode-Base64 $kafkaTruststore0)`n  truststore-password:"
}
if (Test-Path $kafkaTruststore1) {
    $kafkaSecretYaml = $kafkaSecretYaml -replace "truststore-password:", "kafka-1-truststore.jks: $(Encode-Base64 $kafkaTruststore1)`n  truststore-password:"
}

$kafkaSecretFile = Join-Path $SecretsDir "kafka-tls-secret.yaml"
Set-Content -Path $kafkaSecretFile -Value $kafkaSecretYaml
Write-Host "✓ Created: $kafkaSecretFile" -ForegroundColor Green

# Create MongoDB Keyfile Secret YAML
Write-Host "Creating mongodb-keyfile-secret.yaml..." -ForegroundColor Yellow

$mongoKeyfile = Join-Path $SecretsDir "mongodb-keyfile"
if (-not (Test-Path $mongoKeyfile)) {
    Write-Host "✗ MongoDB keyfile not found. Run create-secrets.ps1 first." -ForegroundColor Red
    exit 1
}

$mongoSecretYaml = @"
apiVersion: v1
kind: Secret
metadata:
  name: mongodb-keyfile-secret
  namespace: default
type: Opaque
data:
  keyfile: $(Encode-Base64 $mongoKeyfile)
"@

$mongoSecretFile = Join-Path $SecretsDir "mongodb-keyfile-secret.yaml"
Set-Content -Path $mongoSecretFile -Value $mongoSecretYaml
Write-Host "✓ Created: $mongoSecretFile" -ForegroundColor Green

Write-Host ""
Write-Host "=== Summary ===" -ForegroundColor Cyan
Write-Host "Secret YAML files created:" -ForegroundColor White
Write-Host "  - $kafkaSecretFile" -ForegroundColor White
Write-Host "  - $mongoSecretFile" -ForegroundColor White
Write-Host ""
Write-Host "Apply these secrets when your cluster is ready:" -ForegroundColor Yellow
Write-Host "  kubectl apply -f $kafkaSecretFile" -ForegroundColor White
Write-Host "  kubectl apply -f $mongoSecretFile" -ForegroundColor White
Write-Host ""


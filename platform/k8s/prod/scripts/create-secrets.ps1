# PowerShell script to create all Kubernetes secrets for EnginEdge
# This script generates Kafka TLS certificates and MongoDB keyfile, then creates Kubernetes secrets

param(
    [switch]$SkipKafka,
    [switch]$SkipMongoDB,
    [switch]$DryRun
)

$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$SecretsDir = Join-Path (Split-Path -Parent $ScriptDir) "secrets"
$CertsDir = Join-Path $SecretsDir "kafka-tls-certs"

Write-Host "=== EnginEdge Kubernetes Secrets Generator ===" -ForegroundColor Cyan
Write-Host ""

# Check prerequisites
Write-Host "Checking prerequisites..." -ForegroundColor Yellow

# Check for kubectl
try {
    $kubectlVersion = kubectl version --client --short 2>&1
    Write-Host "✓ kubectl found" -ForegroundColor Green
} catch {
    Write-Host "✗ kubectl not found. Please install kubectl." -ForegroundColor Red
    exit 1
}

# Check for OpenSSL (for Kafka TLS)
$opensslAvailable = $false
try {
    $null = openssl version 2>&1
    $opensslAvailable = $true
    Write-Host "✓ OpenSSL found" -ForegroundColor Green
} catch {
    Write-Host "⚠ OpenSSL not found. Kafka TLS certificates cannot be generated." -ForegroundColor Yellow
    Write-Host "  Install OpenSSL for Windows or use WSL to generate certificates." -ForegroundColor Yellow
}

# Check for keytool (for Java keystores)
$keytoolAvailable = $false
try {
    $null = keytool -help 2>&1 | Out-Null
    $keytoolAvailable = $true
    Write-Host "✓ keytool found" -ForegroundColor Green
} catch {
    Write-Host "⚠ keytool not found. Java keystores cannot be created." -ForegroundColor Yellow
    Write-Host "  Install Java JDK to create JKS truststores." -ForegroundColor Yellow
}

Write-Host ""

# Create directories
if (-not (Test-Path $SecretsDir)) {
    New-Item -ItemType Directory -Path $SecretsDir -Force | Out-Null
}
if (-not (Test-Path $CertsDir)) {
    New-Item -ItemType Directory -Path $CertsDir -Force | Out-Null
}

# Function to base64 encode
function Encode-Base64 {
    param([string]$FilePath)
    $bytes = [System.IO.File]::ReadAllBytes($FilePath)
    return [Convert]::ToBase64String($bytes)
}

# Function to create Kubernetes secret from file
function Create-K8sSecret {
    param(
        [string]$SecretName,
        [hashtable]$Data,
        [string]$Namespace = "default"
    )
    
    if ($DryRun) {
        Write-Host "[DRY RUN] Would create secret: $SecretName" -ForegroundColor Cyan
        return
    }
    
    # Create temporary YAML file
    $tempYaml = Join-Path $env:TEMP "secret-$SecretName-$(Get-Random).yaml"
    
    $yaml = @"
apiVersion: v1
kind: Secret
metadata:
  name: $SecretName
  namespace: $Namespace
type: Opaque
data:
"@
    
    foreach ($key in $Data.Keys) {
        $base64Value = $Data[$key]
        $yaml += "`n  $key`: $base64Value"
    }
    
    Set-Content -Path $tempYaml -Value $yaml
    
    try {
        kubectl apply -f $tempYaml --validate=false 2>&1 | Out-Null
        if ($LASTEXITCODE -eq 0) {
            Write-Host "✓ Created secret: $SecretName" -ForegroundColor Green
            Remove-Item $tempYaml -Force
            return $true
        } else {
            # If kubectl fails, save the YAML file for manual application
            $savedYaml = Join-Path $SecretsDir "$SecretName.yaml"
            Copy-Item $tempYaml $savedYaml -Force
            Write-Host "⚠ kubectl not connected. Secret YAML saved to: $savedYaml" -ForegroundColor Yellow
            Write-Host "  Apply manually when cluster is ready: kubectl apply -f $savedYaml" -ForegroundColor Yellow
            Remove-Item $tempYaml -Force
            return $false
        }
    } catch {
        Write-Host "✗ Failed to create secret: $SecretName" -ForegroundColor Red
        Write-Host "  Error: $_" -ForegroundColor Red
        Remove-Item $tempYaml -Force -ErrorAction SilentlyContinue
        return $false
    }
}

# Generate Kafka TLS certificates
if (-not $SkipKafka) {
    Write-Host "=== Generating Kafka TLS Certificates ===" -ForegroundColor Cyan
    
    if (-not $opensslAvailable) {
        Write-Host "⚠ Skipping Kafka TLS - OpenSSL not available" -ForegroundColor Yellow
        Write-Host "  You can generate certificates manually using WSL or install OpenSSL for Windows" -ForegroundColor Yellow
    } else {
        try {
            $CertsDirAbs = Resolve-Path $CertsDir
            
            # Generate CA key and certificate
            Write-Host "Generating CA certificate..." -ForegroundColor Yellow
            openssl req -new -x509 -keyout "$CertsDirAbs\ca-key.pem" -out "$CertsDirAbs\ca-cert.pem" -days 365 -subj "/CN=Kafka-CA" -nodes 2>&1 | Out-Null
            
            # Generate certificates for each broker
            foreach ($i in 0..1) {
                $brokerName = "kafka-$i"
                $brokerFQDN = "$brokerName.kafka.default.svc.cluster.local"
                
                Write-Host "Generating certificate for $brokerName..." -ForegroundColor Yellow
                
                # Generate key and certificate request
                openssl req -new -keyout "$CertsDirAbs\$brokerName-key.pem" -out "$CertsDirAbs\$brokerName.csr" -subj "/CN=$brokerFQDN" -nodes 2>&1 | Out-Null
                
                # Sign certificate with CA
                openssl x509 -req -CA "$CertsDirAbs\ca-cert.pem" -CAkey "$CertsDirAbs\ca-key.pem" -in "$CertsDirAbs\$brokerName.csr" -out "$CertsDirAbs\$brokerName-cert.pem" -days 365 -CAcreateserial 2>&1 | Out-Null
                
                # Create PKCS12 keystore
                openssl pkcs12 -export -in "$CertsDirAbs\$brokerName-cert.pem" -inkey "$CertsDirAbs\$brokerName-key.pem" -out "$CertsDirAbs\$brokerName-keystore.p12" -name kafka-server -passout pass:changeit -CAfile "$CertsDirAbs\ca-cert.pem" -caname ca 2>&1 | Out-Null
                
                # Create JKS truststore if keytool is available
                if ($keytoolAvailable) {
                    keytool -import -trustcacerts -alias ca -file "$CertsDirAbs\ca-cert.pem" -keystore "$CertsDirAbs\$brokerName-truststore.jks" -storepass changeit -noprompt 2>&1 | Out-Null
                } else {
                    Write-Host "  ⚠ Skipping JKS truststore for $brokerName (keytool not available)" -ForegroundColor Yellow
                }
            }
            
            Write-Host "✓ Kafka TLS certificates generated" -ForegroundColor Green
            
            # Create Kubernetes secret
            Write-Host "Creating Kafka TLS secret..." -ForegroundColor Yellow
            
            $kafkaSecretData = @{
                "kafka-0-keystore.p12" = Encode-Base64 "$CertsDirAbs\kafka-0-keystore.p12"
                "kafka-1-keystore.p12" = Encode-Base64 "$CertsDirAbs\kafka-1-keystore.p12"
                "ca-cert" = Encode-Base64 "$CertsDirAbs\ca-cert.pem"
                "keystore-password" = [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes("changeit"))
                "truststore-password" = [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes("changeit"))
            }
            
            # Add truststores if available
            if ($keytoolAvailable) {
                $kafkaSecretData["kafka-0-truststore.jks"] = Encode-Base64 "$CertsDirAbs\kafka-0-truststore.jks"
                $kafkaSecretData["kafka-1-truststore.jks"] = Encode-Base64 "$CertsDirAbs\kafka-1-truststore.jks"
            }
            
            Create-K8sSecret -SecretName "kafka-tls-secret" -Data $kafkaSecretData | Out-Null
            
        } catch {
            Write-Host "✗ Failed to generate Kafka TLS certificates" -ForegroundColor Red
            Write-Host "  Error: $_" -ForegroundColor Red
        }
    }
    Write-Host ""
}

# Generate MongoDB keyfile
if (-not $SkipMongoDB) {
    Write-Host "=== Generating MongoDB Keyfile ===" -ForegroundColor Cyan
    
    try {
        $keyfilePath = Join-Path $SecretsDir "mongodb-keyfile"
        
        # Generate 1024 bytes of random data (MongoDB requirement)
        $randomBytes = New-Object byte[] 1024
        $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
        $rng.GetBytes($randomBytes)
        [System.IO.File]::WriteAllBytes($keyfilePath, $randomBytes)
        
        Write-Host "✓ MongoDB keyfile generated" -ForegroundColor Green
        
        # Create Kubernetes secret
        Write-Host "Creating MongoDB keyfile secret..." -ForegroundColor Yellow
        
        $mongoSecretData = @{
            "keyfile" = Encode-Base64 $keyfilePath
        }
        
        Create-K8sSecret -SecretName "mongodb-keyfile-secret" -Data $mongoSecretData | Out-Null
        
    } catch {
        Write-Host "✗ Failed to generate MongoDB keyfile" -ForegroundColor Red
        Write-Host "  Error: $_" -ForegroundColor Red
    }
    Write-Host ""
}

# Verify secrets
Write-Host "=== Verifying Secrets ===" -ForegroundColor Cyan

$secretsToCheck = @()
if (-not $SkipKafka) {
    $secretsToCheck += "kafka-tls-secret"
}
if (-not $SkipMongoDB) {
    $secretsToCheck += "mongodb-keyfile-secret"
}

foreach ($secretName in $secretsToCheck) {
    if ($DryRun) {
        Write-Host "[DRY RUN] Would verify secret: $secretName" -ForegroundColor Cyan
    } else {
        try {
            $secret = kubectl get secret $secretName -n default -o json 2>&1 | ConvertFrom-Json
            if ($secret) {
                Write-Host "✓ Secret '$secretName' exists with $($secret.data.PSObject.Properties.Count) keys" -ForegroundColor Green
            } else {
                Write-Host "✗ Secret '$secretName' not found" -ForegroundColor Red
            }
        } catch {
            Write-Host "✗ Failed to verify secret: $secretName" -ForegroundColor Red
            Write-Host "  Error: $_" -ForegroundColor Red
        }
    }
}

Write-Host ""
Write-Host "=== Summary ===" -ForegroundColor Cyan
Write-Host "Secrets directory: $SecretsDir" -ForegroundColor White
Write-Host "Certificates directory: $CertsDir" -ForegroundColor White
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "1. Verify secrets: kubectl get secrets -n default" -ForegroundColor White
Write-Host "2. Deploy your applications: kubectl apply -f k8s/apps/" -ForegroundColor White
Write-Host ""


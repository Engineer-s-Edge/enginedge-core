# GitHub Actions Runner Setup for On-Prem Control Plane

This guide walks you through setting up a self-hosted GitHub Actions runner on your on-prem Kubernetes control plane (`enginedge-k8s-control-plane`) so that pushing service-specific git tags automatically builds, pushes images to GHCR, and rolls out deployments to your cluster.

## Prerequisites

- SSH access to `enginedge-admin@enginedge-k8s-control-plane` (or whatever your control plane user is)
- `docker` installed and working on the control plane
- `kubectl` installed and configured (you already have this working)
- A GitHub Personal Access Token (PAT) with `write:packages` and `repo` scopes for pushing to GHCR

## Step 1: Install GitHub Actions Runner

**You do NOT need a GitHub organization** - personal GitHub accounts work perfectly fine. You'll register runners at the repository level (one runner per repo).

### Option A: Per-Repo Runners (Recommended - Works with Personal Accounts)

This is the standard approach for personal GitHub accounts. You'll set up one runner per repository.

For each repo (`enginedge-core`, `enginedge-workers`, `enginedge-scheduling-model`, `enginedge-datalake`):

1. **In GitHub UI:**
   - Go to the repo (e.g., `https://github.com/chris-alexander-pop/enginedge-core`)
   - Navigate to: `Settings` → `Actions` → `Runners` → `New self-hosted runner`
   - Select `Linux` and `x64`
   - Copy the registration token shown (you'll use it in the next step)

   

2. **On your control plane VM, run:**

```bash
# Create a directory for this repo's runner
mkdir -p ~/actions-runner-enginedge-scheduling-model && cd ~/actions-runner-enginedge-scheduling-model

# Download the latest runner package
curl -o actions-runner-linux-x64-2.311.0.tar.gz -L https://github.com/actions/runner/releases/download/v2.311.0/actions-runner-linux-x64-2.311.0.tar.gz

# Extract
tar xzf ./actions-runner-linux-x64-2.311.0.tar.gz

# Configure (replace YOUR_USERNAME with your GitHub username and YOUR_TOKEN with the token from GitHub)
./config.sh --url https://github.com/chris-alexander-pop/enginedge-scheduling-model --token BCQKYOWGEU34O5EQAT4P7Q3JFXXI2 --name control-plane-enginedge-scheduling-model --work _work

# Install and start as a service
sudo ./svc.sh install
sudo ./svc.sh start

# Verify it's running
sudo ./svc.sh status
```

**Repeat for each repo** (`enginedge-workers`, `enginedge-scheduling-model`, `enginedge-datalake`) with a separate directory for each (e.g., `~/actions-runner-enginedge-workers`, `~/actions-runner-enginedge-scheduling-model`, etc.).

### Option B: Organization-Level Runner (Only if you have a GitHub org)

**Note:** This option requires a GitHub organization. If you're using a personal account, use Option A above.

If you're using a GitHub organization and want to share one runner across all repos:

1. **In GitHub UI:**
   - Go to your GitHub organization settings
   - Navigate to: `Settings` → `Actions` → `Runners` → `New self-hosted runner`
   - Select `Linux` and `x64`
   - Copy the registration token shown

2. **On your control plane VM, run:**

```bash
# Create a directory for the runner
mkdir -p ~/actions-runner && cd ~/actions-runner

# Download the latest runner package
curl -o actions-runner-linux-x64-2.311.0.tar.gz -L https://github.com/actions/runner/releases/download/v2.311.0/actions-runner-linux-x64-2.311.0.tar.gz

# Extract the installer
tar xzf ./actions-runner-linux-x64-2.311.0.tar.gz

# Configure the runner (replace YOUR_ORG_NAME and YOUR_TOKEN with actual values)
./config.sh --url https://github.com/YOUR_ORG_NAME --token YOUR_TOKEN --name control-plane-runner --labels control-plane --work _work

# Install and start as a service
sudo ./svc.sh install
sudo ./svc.sh start

# Verify it's running
sudo ./svc.sh status
```

**Note:** If using org-level runners, update all workflow files to use `runs-on: [self-hosted, control-plane]` instead of just `runs-on: self-hosted`.

## Step 2: Install Docker (if not already installed)

Your Kubernetes cluster uses containerd, but you need Docker installed separately for building images. Check if Docker is installed:

```bash
docker --version
```

If Docker is not installed, install it:

```bash
# Update package index
sudo apt-get update

# Install prerequisites
sudo apt-get install -y \
    ca-certificates \
    curl \
    gnupg \
    lsb-release

# Add Docker's official GPG key
sudo mkdir -p /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg

# Set up the repository
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

# Install Docker Engine
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# Add your user to the docker group (so you can run docker without sudo)
sudo usermod -aG docker $USER

# Start and enable Docker
sudo systemctl start docker
sudo systemctl enable docker

# Verify Docker is running
sudo systemctl status docker
docker --version
```

**Important:** After adding yourself to the docker group, you may need to log out and back in (or run `newgrp docker`) for the group change to take effect.

**Note:** Docker and containerd can coexist - Docker will use containerd as its runtime, which is fine. Your Kubernetes cluster will continue using containerd directly.

## Step 3: Configure Docker Login for GHCR

On your control plane, log Docker into GHCR so the runner can push images:

```bash
# Create a GitHub Personal Access Token (PAT) with 'write:packages' and 'repo' scopes
# Then log in:
echo "YOUR_PERSONAL_ACCESS_TOKEN" | docker login ghcr.io -u chris-alexander-pop --password-stdin

# Verify it worked:
docker pull ghcr.io/chris-alexander-pop/api-gateway:latest
```

**Note:** If you're using a service account or different GitHub user, replace `chris-alexander-pop` with your actual username.

## Step 4: Verify kubectl Access

Make sure `kubectl` is configured and can access your cluster:

```bash
# Test kubectl access
kubectl get pods

# Should show your running pods (api-gateway, hexagon, workers, etc.)
```

If this doesn't work, ensure your kubeconfig is in `~/.kube/config` and points to the correct cluster.

## Step 5: Test the Runner

1. **In GitHub UI:**
   - Go to one of your repos (e.g., `enginedge-core`)
   - Navigate to: `Actions` tab
   - You should see the runner listed as "Idle" or "Online"

2. **Trigger a test workflow:**
   - Push a test tag to the `dev` branch:
     ```bash
     git checkout dev
     git tag api-gateway-v0.0.1-test
     git push origin api-gateway-v0.0.1-test
     ```
   - Go to the `Actions` tab in GitHub and watch the workflow run
   - On your control plane, you can watch logs:
     ```bash
     # For org-level runner:
     cd ~/actions-runner
     tail -f _diag/Runner_*.log
     
     # For per-repo runners:
     cd ~/actions-runner-enginedge-core
     tail -f _diag/Runner_*.log
     ```

## Step 6: Verify Deployment

After a workflow completes, check that the deployment rolled out:

```bash
# Check the deployment status
kubectl get deployment api-gateway

# Check pods
kubectl get pods -l app=enginedge,component=api-gateway

# Check rollout history
kubectl rollout history deployment/api-gateway
```

## Troubleshooting

### Runner Not Showing Up in GitHub

- Check that the runner service is running: `sudo ./svc.sh status`
- Check logs: `tail -f _diag/Runner_*.log`
- Verify network connectivity from control plane to `github.com`

### Docker Build Fails

- Ensure Docker is installed: `docker --version`
- Ensure Docker is running: `sudo systemctl status docker`
- If Docker isn't running, start it: `sudo systemctl start docker`
- Check Docker permissions: `sudo usermod -aG docker $USER` (then log out and back in, or run `newgrp docker`)
- Verify GHCR login: `docker login ghcr.io`
- Test a simple build: `docker build -t test:latest .` (in a directory with a Dockerfile)

### kubectl Commands Fail in Workflow

- Ensure the runner user has access to `~/.kube/config`
- If using `sudo` for the runner service, you may need to copy kubeconfig to `/root/.kube/config` or set `KUBECONFIG` env var in the workflow

### Image Pull Fails After Deployment

- Verify `imagePullPolicy: Always` is set in your K8s manifests (already done for api-gateway)
- Check that `ghcr-pull-secret` exists: `kubectl get secret ghcr-pull-secret`
- If missing, create it: `kubectl create secret docker-registry ghcr-pull-secret --docker-server=ghcr.io --docker-username=chris-alexander-pop --docker-password=YOUR_PAT`

## Tag Naming Convention

To trigger a deployment, push a tag with the format:

- `api-gateway-v0.1.0` → builds and deploys api-gateway
- `hexagon-v0.2.3` → builds and deploys hexagon
- `assistant-worker-v0.1.5` → builds and deploys assistant-worker
- `identity-worker-v0.3.0` → builds and deploys identity-worker
- `scheduling-model-v1.0.0` → builds and deploys scheduling-model
- `datalake-v0.5.0` → builds and deploys datalake

**Pattern:** `<service-name>-v<semver>`

## Workflow Behavior

- **Triggers:** Only on tag pushes matching the service pattern (e.g., `api-gateway-v*`)
- **Builds:** Docker image with both versioned tag (`:vX.Y.Z`) and `:latest`
- **Pushes:** Both tags to `ghcr.io/chris-alexander-pop/<service-name>`
- **Deploys:** Runs `kubectl rollout restart` to trigger a new pod pull
- **Verifies:** Waits for pods to be ready before completing

## Next Steps

Once the runner is set up and tested:

1. Push your code changes to the `dev` branch
2. Create and push a service-specific tag (e.g., `api-gateway-v0.1.0`)
3. Watch the workflow run in GitHub Actions
4. Verify the new image is deployed in your cluster

For production deployments, you can later add workflows that trigger on tags from the `main` branch or use different tag patterns (e.g., `api-gateway-v1.*` for prod, `api-gateway-v0.*` for dev).


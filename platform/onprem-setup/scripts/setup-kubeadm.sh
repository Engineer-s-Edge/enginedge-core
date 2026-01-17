#!/bin/bash
# EnginEdge Kubernetes Cluster Setup Script (kubeadm)
# This script automates the installation of kubeadm, kubelet, kubectl, and cluster initialization
# Run this script on your Ubuntu 22.04 LTS VM

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
POD_CIDR="${POD_CIDR:-10.244.0.0/16}"
KUBERNETES_VERSION="${KUBERNETES_VERSION:-1.28}"

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

check_root() {
    if [ "$EUID" -eq 0 ]; then
        log_error "This script should not be run as root. Run as a regular user with sudo privileges."
        exit 1
    fi
}

check_ubuntu() {
    if [ ! -f /etc/os-release ]; then
        log_error "Cannot detect OS. This script is designed for Ubuntu 22.04 LTS."
        exit 1
    fi
    
    . /etc/os-release
    if [ "$ID" != "ubuntu" ]; then
        log_error "This script is designed for Ubuntu. Detected: $ID"
        exit 1
    fi
    
    log_info "Detected Ubuntu $VERSION_ID"
}

# Step 1: Update system
update_system() {
    log_info "Updating system packages..."
    sudo apt update && sudo apt upgrade -y
    sudo apt install -y curl wget git vim net-tools apt-transport-https ca-certificates gnupg lsb-release
}

# Step 2: Install containerd
install_containerd() {
    log_info "Installing containerd..."
    
    # Install containerd
    sudo apt install -y containerd
    
    # Configure containerd
    sudo mkdir -p /etc/containerd
    containerd config default | sudo tee /etc/containerd/config.toml > /dev/null
    
    # Enable systemd cgroup driver
    sudo sed -i 's/SystemdCgroup = false/SystemdCgroup = true/' /etc/containerd/config.toml
    
    # Restart containerd
    sudo systemctl restart containerd
    sudo systemctl enable containerd
    
    log_info "Containerd installed and configured"
}

# Step 3: Configure kernel parameters
configure_kernel() {
    log_info "Configuring kernel parameters..."
    
    # Load required modules
    cat <<EOF | sudo tee /etc/modules-load.d/k8s.conf
overlay
br_netfilter
EOF
    
    sudo modprobe overlay
    sudo modprobe br_netfilter
    
    # Configure sysctl
    cat <<EOF | sudo tee /etc/sysctl.d/k8s.conf
net.bridge.bridge-nf-call-iptables  = 1
net.bridge.bridge-nf-call-ip6tables = 1
net.ipv4.ip_forward                 = 1
EOF
    
    sudo sysctl --system > /dev/null
    
    log_info "Kernel parameters configured"
}

# Step 4: Disable swap
disable_swap() {
    log_info "Disabling swap..."
    
    sudo swapoff -a
    sudo sed -i '/ swap / s/^\(.*\)$/#\1/g' /etc/fstab
    
    log_info "Swap disabled"
}

# Step 5: Install kubeadm, kubelet, kubectl
install_kubernetes() {
    log_info "Installing Kubernetes components (kubeadm, kubelet, kubectl)..."
    
    # Add Kubernetes repository
    curl -fsSL https://pkgs.k8s.io/core:/stable:/v${KUBERNETES_VERSION}/deb/Release.key | sudo gpg --dearmor -o /etc/apt/keyrings/kubernetes-apt-keyring.gpg
    echo "deb [signed-by=/etc/apt/keyrings/kubernetes-apt-keyring.gpg] https://pkgs.k8s.io/core:/stable:/v${KUBERNETES_VERSION}/deb/ /" | sudo tee /etc/apt/sources.list.d/kubernetes.list
    
    # Update and install
    sudo apt update
    sudo apt install -y kubelet kubeadm kubectl
    
    # Hold packages
    sudo apt-mark hold kubelet kubeadm kubectl
    
    # Enable kubelet
    sudo systemctl enable kubelet
    
    log_info "Kubernetes components installed"
}

# Step 6: Initialize cluster
init_cluster() {
    log_info "Initializing Kubernetes cluster with pod CIDR: $POD_CIDR"
    
    # Check if cluster already exists
    if [ -f /etc/kubernetes/admin.conf ]; then
        log_warn "Cluster already initialized. Skipping initialization."
        log_warn "If you want to reinitialize, run: sudo kubeadm reset"
        return
    fi
    
    # Initialize cluster
    sudo kubeadm init --pod-network-cidr=$POD_CIDR
    
    # Set up kubeconfig
    mkdir -p $HOME/.kube
    sudo cp -i /etc/kubernetes/admin.conf $HOME/.kube/config
    sudo chown $(id -u):$(id -g) $HOME/.kube/config
    
    log_info "Cluster initialized successfully!"
    log_info "kubeconfig configured at $HOME/.kube/config"
}

# Main execution
main() {
    log_info "Starting EnginEdge Kubernetes cluster setup..."
    log_info "This script will install kubeadm, kubelet, kubectl, and initialize a cluster"
    
    check_root
    check_ubuntu
    
    read -p "Continue with installation? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        log_info "Installation cancelled"
        exit 0
    fi
    
    update_system
    install_containerd
    configure_kernel
    disable_swap
    install_kubernetes
    init_cluster
    
    log_info "Setup complete!"
    log_warn "Next steps:"
    log_warn "1. Install CNI plugin (Calico): ./scripts/install-cni.sh"
    log_warn "2. Remove taint for single-node: kubectl taint nodes --all node-role.kubernetes.io/control-plane-"
    log_warn "3. Install metrics-server: ./scripts/install-metrics-server.sh"
    log_warn "4. Install Helm: curl https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3 | bash"
}

main "$@"


#!/bin/bash
# EnginEdge Kubernetes Worker Node Setup Script
# Run this on worker nodes to join them to the cluster
# The master node must be set up first using setup-kubeadm.sh

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

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
    
    sudo apt install -y containerd
    
    sudo mkdir -p /etc/containerd
    containerd config default | sudo tee /etc/containerd/config.toml > /dev/null
    
    sudo sed -i 's/SystemdCgroup = false/SystemdCgroup = true/' /etc/containerd/config.toml
    
    sudo systemctl restart containerd
    sudo systemctl enable containerd
    
    log_info "Containerd installed and configured"
}

# Step 3: Configure kernel parameters
configure_kernel() {
    log_info "Configuring kernel parameters..."
    
    cat <<EOF | sudo tee /etc/modules-load.d/k8s.conf
overlay
br_netfilter
EOF
    
    sudo modprobe overlay
    sudo modprobe br_netfilter
    
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
    log_info "Installing Kubernetes components..."
    
    KUBERNETES_VERSION="${KUBERNETES_VERSION:-1.28}"
    
    curl -fsSL https://pkgs.k8s.io/core:/stable:/v${KUBERNETES_VERSION}/deb/Release.key | sudo gpg --dearmor -o /etc/apt/keyrings/kubernetes-apt-keyring.gpg
    echo "deb [signed-by=/etc/apt/keyrings/kubernetes-apt-keyring.gpg] https://pkgs.k8s.io/core:/stable:/v${KUBERNETES_VERSION}/deb/ /" | sudo tee /etc/apt/sources.list.d/kubernetes.list
    
    sudo apt update
    sudo apt install -y kubelet kubeadm kubectl
    
    sudo apt-mark hold kubelet kubeadm kubectl
    
    sudo systemctl enable kubelet
    
    log_info "Kubernetes components installed"
}

# Step 6: Join cluster
join_cluster() {
    log_info "Ready to join the cluster!"
    log_warn "You need the join command from the master node."
    log_warn "On the master node, run: kubeadm token create --print-join-command"
    echo ""
    read -p "Enter the kubeadm join command from master: " JOIN_COMMAND
    
    if [ -z "$JOIN_COMMAND" ]; then
        log_error "Join command is required!"
        exit 1
    fi
    
    log_info "Joining cluster..."
    sudo $JOIN_COMMAND
    
    log_info "Worker node joined successfully!"
}

main() {
    log_info "Starting EnginEdge Kubernetes Worker Node setup..."
    
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
    
    log_info "Prerequisites installed. Ready to join cluster."
    echo ""
    log_warn "Next steps:"
    log_warn "1. On the master node, get the join command:"
    log_warn "   kubeadm token create --print-join-command"
    log_warn "2. Run this script again with the join command, or run join_cluster()"
    echo ""
    read -p "Do you have the join command ready? (y/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        join_cluster
    else
        log_info "Run this script again when you have the join command, or manually run:"
        log_info "sudo kubeadm join <master-ip>:6443 --token <token> --discovery-token-ca-cert-hash <hash>"
    fi
}

main "$@"


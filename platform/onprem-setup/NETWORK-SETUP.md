# Hyper-V Network Setup Guide

## Step 1: Create Virtual Switch in Hyper-V

1. **Open Hyper-V Manager**
2. **Click "Virtual Switch Manager"** in the right panel (or Actions menu)
3. **Click "Create Virtual Switch"**
4. **Select switch type:**
   - **Internal**: VMs can talk to each other and host, but no internet (good for isolated cluster)
   - **External**: VMs can talk to each other, host, AND internet (recommended if you need internet)
5. **Name it**: `EnginEdge-K8s-Network`
6. **Click "OK"**

## Step 2: Assign Virtual Switch to VMs

For each VM (Master, Worker1, Worker2, DataLake):

1. **Right-click VM** → **Settings**
2. **Click "Network Adapter"** in left panel
3. **Under "Virtual switch"**, select `EnginEdge-K8s-Network`
4. **Click "OK"**

## Step 3: Configure Static IPs in Ubuntu VMs

### Find Your Network Interface Name

First, identify the network interface:

```bash
ip addr show
# or
ip link show
```

Look for something like `eth0`, `ens33`, `enp0s3`, etc.

### Configure Static IP

Edit the netplan configuration:

```bash
sudo nano /etc/netplan/00-installer-config.yaml
```

**For Master Node (192.168.100.10):**
```yaml
network:
  version: 2
  ethernets:
    eth0:  # Replace with your actual interface name
      dhcp4: false
      addresses:
        - 192.168.100.10/24
      gateway4: 192.168.100.1
      nameservers:
        addresses: [8.8.8.8, 8.8.4.4]
```

**For Worker Node 1 (192.168.100.11):**
```yaml
network:
  version: 2
  ethernets:
    eth0:  # Replace with your actual interface name
      dhcp4: false
      addresses:
        - 192.168.100.11/24
      gateway4: 192.168.100.1
      nameservers:
        addresses: [8.8.8.8, 8.8.4.4]
```

**For Worker Node 2 (192.168.100.12):**
```yaml
network:
  version: 2
  ethernets:
    eth0:  # Replace with your actual interface name
      dhcp4: false
      addresses:
        - 192.168.100.12/24
      gateway4: 192.168.100.1
      nameservers:
        addresses: [8.8.8.8, 8.8.4.4]
```

**For Data Lake Node (192.168.100.13):**
```yaml
network:
  version: 2
  ethernets:
    eth0:  # Replace with your actual interface name
      dhcp4: false
      addresses:
        - 192.168.100.13/24
      gateway4: 192.168.100.1
      nameservers:
        addresses: [8.8.8.8, 8.8.4.4]
```

### Apply Configuration

```bash
sudo netplan apply
```

### Verify Configuration

```bash
# Check IP address
ip addr show

# Test connectivity
ping 192.168.100.10  # From worker, ping master
ping 192.168.100.11  # From master, ping worker
```

## Troubleshooting

### Can't Find Network Interface

If `ip addr show` shows no interface or it's down:

```bash
# List all interfaces
ls /sys/class/net/

# Bring interface up
sudo ip link set eth0 up  # Replace eth0 with your interface
```

### Gateway Not Working

If you used **Internal** switch, you might not have internet. Options:

1. **Use External switch** (recommended) - gives internet access
2. **Keep Internal switch** - VMs can still communicate with each other (no internet needed for cluster)

### IP Already in Use

If you get an error about IP conflict:

1. Check what IPs are already assigned: `ip addr show` on other VMs
2. Use a different IP range (e.g., 192.168.200.x)
3. Or use DHCP first to see what IPs are assigned, then switch to static

### Can't Ping Between VMs

1. **Verify all VMs use same virtual switch**: Check VM settings
2. **Check firewall**: 
   ```bash
   sudo ufw status
   # If enabled, allow ping:
   sudo ufw allow in on eth0
   ```
3. **Verify IPs are correct**: `ip addr show` on both VMs
4. **Test from Hyper-V host**: Try pinging VM IPs from Windows

## Alternative: Use DHCP (Not Recommended)

If you prefer DHCP instead of static IPs:

1. Leave `dhcp4: true` in netplan config
2. Note the assigned IPs (they may change on reboot)
3. Update `/etc/hosts` on each VM with hostnames:
   ```bash
   sudo nano /etc/hosts
   # Add:
   192.168.100.10 enginedge-k8s-master
   192.168.100.11 enginedge-k8s-worker1
   192.168.100.12 enginedge-k8s-worker2
   192.168.100.13 enginedge-k8s-datalake
   ```

**Note**: Static IPs are recommended for Kubernetes clusters to avoid connection issues if IPs change.


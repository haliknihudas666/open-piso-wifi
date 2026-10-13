#!/bin/bash
# ==============================================================================
# OpenPisoWifi - SSH Key Pair Generator & Deployer to OpenWrt Router
# ==============================================================================
# Run this script on your Raspberry Pi to generate an SSH key and copy it
# to the Ruijie RG-EW1200G Pro OpenWrt router (192.168.1.1).
# ==============================================================================

set -e

ROUTER_IP="${1:-192.168.1.1}"
ROUTER_USER="${2:-root}"
KEY_PATH="$HOME/.ssh/id_rsa"

echo "=========================================================="
echo "🔑 OpenPisoWifi - SSH Key Setup for OpenWrt (${ROUTER_IP})"
echo "=========================================================="

# 1. Generate SSH key pair if it doesn't exist
if [ ! -f "$KEY_PATH" ]; then
    echo "--> Generating new 2048-bit RSA SSH key at $KEY_PATH..."
    mkdir -p "$HOME/.ssh"
    chmod 700 "$HOME/.ssh"
    ssh-keygen -t rsa -b 2048 -f "$KEY_PATH" -N "" -C "hudas-pisowifi-rpi"
    echo "✅ SSH Key generated successfully."
else
    echo "✅ SSH Key already exists at $KEY_PATH."
fi

# 2. Display public key
PUB_KEY=$(cat "${KEY_PATH}.pub")
echo ""
echo "Public Key to deploy:"
echo "----------------------------------------------------------"
echo "$PUB_KEY"
echo "----------------------------------------------------------"
echo ""

# 3. Attempt automated copy using ssh / dropbear
echo "--> Attempting to copy public key to OpenWrt router ($ROUTER_USER@$ROUTER_IP)..."
echo "(You may be prompted for the OpenWrt root password once)"
echo ""

if command -v ssh-copy-id >/dev/null 2>&1; then
    ssh-copy-id -i "${KEY_PATH}.pub" "$ROUTER_USER@$ROUTER_IP" || true
else
    cat "${KEY_PATH}.pub" | ssh "$ROUTER_USER@$ROUTER_IP" "mkdir -p /etc/dropbear && cat >> /etc/dropbear/authorized_keys && chmod 600 /etc/dropbear/authorized_keys" || true
fi

# 4. Test connection
echo ""
echo "--> Testing passwordless SSH connection to OpenWrt..."
if ssh -i "$KEY_PATH" -o BatchMode=yes -o ConnectTimeout=5 "$ROUTER_USER@$ROUTER_IP" "echo 'SSH connection verified! OpenWrt version:' && cat /etc/openwrt_release | head -n 2"; then
    echo ""
    echo "=========================================================="
    echo "🎉 SUCCESS! Passwordless SSH to OpenWrt is fully working."
    echo "The Raspberry Pi daemon can now control the router paywall."
    echo "=========================================================="
else
    echo ""
    echo "⚠️ Automatic SSH copy did not succeed. Manual step:"
    echo "1. SSH into your OpenWrt router: ssh root@${ROUTER_IP}"
    echo "2. Paste the public key into /etc/dropbear/authorized_keys"
    echo "3. Run: chmod 600 /etc/dropbear/authorized_keys"
fi

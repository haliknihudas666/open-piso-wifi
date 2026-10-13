#!/bin/bash
# ==============================================================================
# 🚀 OpenPisoWiFi - Raspberry Pi Standalone Gateway Setup (Profile 2)
# ==============================================================================
# Turns a Raspberry Pi into a universal router & captive portal gateway.
# - Pi eth0 = WAN (Connected to ISP modem/ONT via DHCP)
# - Pi eth1 = LAN 10.0.0.1/22 (Connected to ANY Access Point in AP/bridge mode)
# - nftables: Kernel-level hardware-speed NAT, authorization sets, and captive redirect
# - dnsmasq: DHCP server (10.0.0.10 - 10.0.3.250) + captive DNS responder
#
# Usage:
#   sudo ./scripts/setup-pi-gateway.sh               # Run standard installation
#   sudo ./scripts/setup-pi-gateway.sh --dry-run     # Preview actions without changes
#   sudo ./scripts/setup-pi-gateway.sh --rollback    # Remove gateway configuration
#   sudo ./scripts/setup-pi-gateway.sh --status      # Check current gateway status
# ==============================================================================

set -eo pipefail

# ANSI Color Codes
GREEN='\033[0;32m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

# Default Configuration Parameters
WAN_IFACE="${WAN_IFACE:-eth0}"
LAN_IFACE="${LAN_IFACE:-eth1}"
LAN_IP="${LAN_IP:-10.0.0.1}"
LAN_PREFIX="${LAN_PREFIX:-22}"
LAN_NETMASK="${LAN_NETMASK:-255.255.252.0}"
DHCP_RANGE="${DHCP_RANGE:-10.0.0.10,10.0.3.250,255.255.252.0,12h}"
PORTAL_PORT="${PORTAL_PORT:-3000}"

DRY_RUN=false
ROLLBACK=false
STATUS_CHECK=false

# Parse command line flags
while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run)
      DRY_RUN=true
      shift
      ;;
    --rollback)
      ROLLBACK=true
      shift
      ;;
    --status)
      STATUS_CHECK=true
      shift
      ;;
    --wan-iface)
      WAN_IFACE="$2"
      shift 2
      ;;
    --lan-iface)
      LAN_IFACE="$2"
      shift 2
      ;;
    *)
      echo -e "${RED}Unknown option: $1${NC}"
      exit 1
      ;;
  esac
done

# ------------------------------------------------------------------------------
# STATUS CHECK
# ------------------------------------------------------------------------------
if [ "$STATUS_CHECK" = true ]; then
  echo -e "${CYAN}==============================================================${NC}"
  echo -e "${GREEN}🔍 OpenPisoWiFi - Gateway Status${NC}"
  echo -e "${CYAN}==============================================================${NC}"
  echo -e "• WAN Interface ($WAN_IFACE): $(ip -br addr show "$WAN_IFACE" 2>/dev/null || echo "NOT FOUND")"
  echo -e "• LAN Interface ($LAN_IFACE): $(ip -br addr show "$LAN_IFACE" 2>/dev/null || echo "NOT FOUND")"
  echo -e "• IP Forwarding: $(sysctl -n net.ipv4.ip_forward 2>/dev/null || echo "0")"
  echo -e "• dnsmasq Service: $(systemctl is-active dnsmasq 2>/dev/null || echo "inactive")"
  echo -e "• nftables Service: $(systemctl is-active nftables 2>/dev/null || echo "inactive")"
  if command -v nft >/dev/null 2>&1; then
    echo -e "• Active Authorized Clients: $(nft list set inet piso piso_auth 2>/dev/null | grep -c 'elements = {' || echo "0")"
  fi
  exit 0
fi

# ------------------------------------------------------------------------------
# ROOT PERMISSION CHECK
# ------------------------------------------------------------------------------
if [ "$EUID" -ne 0 ] && [ "$DRY_RUN" = false ]; then
  echo -e "${RED}❌ Please run as root (sudo ./scripts/setup-pi-gateway.sh)${NC}"
  exit 1
fi

# ------------------------------------------------------------------------------
# ROLLBACK HANDLER
# ------------------------------------------------------------------------------
if [ "$ROLLBACK" = true ]; then
  echo -e "${YELLOW}==============================================================${NC}"
  echo -e "${YELLOW}⏪ Rolling back OpenPisoWiFi Gateway configuration...${NC}"
  echo -e "${YELLOW}==============================================================${NC}"

  # Remove dnsmasq config
  rm -f /etc/dnsmasq.d/openpiso-gateway.conf
  systemctl restart dnsmasq 2>/dev/null || true

  # Remove nftables table
  if command -v nft >/dev/null 2>&1; then
    nft delete table inet piso 2>/dev/null || true
  fi
  rm -f /etc/nftables.d/openpiso-gateway.nft

  # Remove sysctl
  rm -f /etc/sysctl.d/99-openpiso-gateway.conf
  sysctl -w net.ipv4.ip_forward=0 2>/dev/null || true

  echo -e "${GREEN}✅ Rollback completed. Gateway settings removed.${NC}"
  exit 0
fi

echo -e "${CYAN}==============================================================${NC}"
echo -e "${GREEN}🚀 Configuring Raspberry Pi Gateway (Profile 2 - Universal AP)${NC}"
echo -e "${CYAN}==============================================================${NC}"
echo -e "• WAN Interface (ISP)  : ${YELLOW}${WAN_IFACE}${NC}"
echo -e "• LAN Interface (AP)   : ${YELLOW}${LAN_IFACE}${NC}"
echo -e "• Gateway Subnet       : ${YELLOW}${LAN_IP}/${LAN_PREFIX}${NC}"
echo -e "• Captive Portal Port  : ${YELLOW}:${PORTAL_PORT}${NC}"
echo -e "• Dry Run Mode         : ${YELLOW}${DRY_RUN}${NC}"
echo ""

# ------------------------------------------------------------------------------
# 1. DEPENDENCY CHECKS & INSTALLATION
# ------------------------------------------------------------------------------
REQUIRED_PACKAGES=(dnsmasq nftables conntrack ethtool)
MISSING_PACKAGES=()

for pkg in "${REQUIRED_PACKAGES[@]}"; do
  if ! dpkg -s "$pkg" >/dev/null 2>&1; then
    MISSING_PACKAGES+=("$pkg")
  fi
done

if [ ${#MISSING_PACKAGES[@]} -gt 0 ]; then
  echo -e "${YELLOW}📦 Installing required gateway packages: ${MISSING_PACKAGES[*]}...${NC}"
  if [ "$DRY_RUN" = false ]; then
    apt-get update -y
    apt-get install -y "${MISSING_PACKAGES[@]}"
  fi
fi

# ------------------------------------------------------------------------------
# 2. SYSCTL KERNEL CONFIGURATION (IP FORWARDING)
# ------------------------------------------------------------------------------
echo -e "${CYAN}⚙️ Configuring Linux Kernel IP Routing & Sysctl...${NC}"
SYSCTL_CONF="/etc/sysctl.d/99-openpiso-gateway.conf"

if [ "$DRY_RUN" = false ]; then
  cat <<EOF > "$SYSCTL_CONF"
# OpenPisoWiFi Gateway Kernel Routing
net.ipv4.ip_forward = 1
net.ipv4.conf.all.route_localnet = 1
net.ipv4.conf.default.rp_filter = 2
net.ipv4.conf.all.rp_filter = 2
net.netfilter.nf_conntrack_tcp_timeout_established = 7440
net.netfilter.nf_conntrack_tcp_timeout_close_wait = 60
net.netfilter.nf_conntrack_tcp_timeout_fin_wait = 120
EOF
  sysctl -p "$SYSCTL_CONF" >/dev/null
fi
echo -e "${GREEN}✅ IP Forwarding enabled.${NC}"

# ------------------------------------------------------------------------------
# 3. LAN INTERFACE STATIC IP CONFIGURATION
# ------------------------------------------------------------------------------
echo -e "${CYAN}🌐 Configuring LAN Interface (${LAN_IFACE} -> ${LAN_IP}/${LAN_PREFIX})...${NC}"

if [ "$DRY_RUN" = false ]; then
  # If NetworkManager is running, configure via nmcli
  if systemctl is-active --quiet NetworkManager; then
    nmcli connection delete "openpiso-lan" 2>/dev/null || true
    nmcli connection add type ethernet con-name "openpiso-lan" ifname "$LAN_IFACE" ip4 "$LAN_IP/$LAN_PREFIX"
    nmcli connection up "openpiso-lan" || true
  else
    # Fallback to ip link / ip addr
    ip addr add "$LAN_IP/$LAN_PREFIX" dev "$LAN_IFACE" 2>/dev/null || true
    ip link set "$LAN_IFACE" up
  fi
fi
echo -e "${GREEN}✅ LAN interface configured.${NC}"

# ------------------------------------------------------------------------------
# 4. DNSMASQ DHCP & CAPTIVE PROBE DNS CONFIGURATION
# ------------------------------------------------------------------------------
echo -e "${CYAN}📡 Configuring dnsmasq (DHCP & Captive Portal DNS Hijacking)...${NC}"
DNSMASQ_CONF="/etc/dnsmasq.d/openpiso-gateway.conf"

if [ "$DRY_RUN" = false ]; then
  mkdir -p /etc/dnsmasq.d
  cat <<EOF > "$DNSMASQ_CONF"
# ==============================================================================
# OpenPisoWiFi Standalone Gateway DHCP & DNS
# ==============================================================================
interface=${LAN_IFACE}
bind-dynamic
domain-needed
bogus-priv

# DHCP IP Pool (10.0.0.10 -> 10.0.3.250)
dhcp-range=${DHCP_RANGE}
dhcp-option=option:router,${LAN_IP}
dhcp-option=option:dns-server,${LAN_IP}

# Piso-WiFi Local Shortcut & Captive Probes
address=/wifi.local/${LAN_IP}
address=/piso.wifi/${LAN_IP}

# Android / Google Captive Portal Detection
address=/connectivitycheck.gstatic.com/${LAN_IP}
address=/connectivitycheck.android.com/${LAN_IP}
address=/clients3.google.com/${LAN_IP}

# Apple iOS / macOS Captive Portal Detection
address=/captive.apple.com/${LAN_IP}
address=/www.airport.us/${LAN_IP}

# Windows / Microsoft Captive Portal Detection
address=/www.msftconnecttest.com/${LAN_IP}
address=/ipv6.msftconnecttest.com/${LAN_IP}

# Upstream Public DNS Fallback
server=1.1.1.1
server=8.8.8.8
EOF

  systemctl restart dnsmasq
  systemctl enable dnsmasq
fi
echo -e "${GREEN}✅ dnsmasq active on ${LAN_IFACE}.${NC}"

# ------------------------------------------------------------------------------
# 5. NFTABLES FIREWALL & CAPTIVE REDIRECT RULES
# ------------------------------------------------------------------------------
echo -e "${CYAN}🛡️ Applying nftables NAT & Authorization Sets...${NC}"
NFT_FILE="/etc/nftables.d/openpiso-gateway.nft"

if [ "$DRY_RUN" = false ]; then
  mkdir -p /etc/nftables.d

  cat <<EOF > "$NFT_FILE"
#!/usr/sbin/nft -f
# ==============================================================================
# OpenPisoWiFi inet piso firewall table
# ==============================================================================

table inet piso {
  # Authorized Client MAC Addresses with dynamic kernel timeouts
  set piso_auth {
    type ether_addr
    flags timeout
  }

  # Whitelisted Devices (Always allowed, e.g. Owner phone or admin devices)
  set piso_whitelist {
    type ether_addr
  }

  # Blacklisted Devices (Permanently blocked)
  set piso_blacklist {
    type ether_addr
  }

  # Inbound packet filtering (Services hosted on the Pi)
  chain input {
    type filter hook input priority filter; policy drop;

    # Allow established and related traffic
    ct state established,related accept

    # Allow localhost traffic
    iif "lo" accept

    # Drop blacklisted clients immediately
    ether saddr @piso_blacklist drop

    # Allow essential network services from LAN
    iif "${LAN_IFACE}" udp dport { 53, 67 } accept
    iif "${LAN_IFACE}" tcp dport 53 accept

    # Allow captive portal web traffic
    iif "${LAN_IFACE}" tcp dport { 80, ${PORTAL_PORT}, 4000 } accept

    # Allow SSH on management (or restrict as needed)
    tcp dport 22 accept
  }

  # Forwarded traffic filtering (Client internet access)
  chain forward {
    type filter hook forward priority filter; policy drop;

    # Allow established and related traffic
    ct state established,related accept

    # Drop blacklisted devices
    ether saddr @piso_blacklist drop

    # Allow whitelisted devices without payment
    ether saddr @piso_whitelist accept

    # Allow paid authorized customers
    iif "${LAN_IFACE}" oif "${WAN_IFACE}" ether saddr @piso_auth accept
  }

  # Network Address Translation (NAT) & Captive Redirection
  chain prerouting {
    type nat hook prerouting priority dstnat; policy accept;

    # Skip redirection for authorized or whitelisted users
    ether saddr @piso_whitelist return
    ether saddr @piso_auth return

    # Intercept HTTP Port 80 from unauthorized clients and redirect to captive portal
    iif "${LAN_IFACE}" tcp dport 80 redirect to :${PORTAL_PORT}
  }

  # Masquerade outbound traffic to ISP WAN
  chain postrouting {
    type nat hook postrouting priority srcnat; policy accept;
    oif "${WAN_IFACE}" masquerade
  }
}
EOF

  nft -f "$NFT_FILE"

  # Ensure nftables starts on system boot
  systemctl enable nftables
  systemctl restart nftables
fi
echo -e "${GREEN}✅ nftables active (Kernel sets: piso_auth, piso_whitelist, piso_blacklist).${NC}"

# ------------------------------------------------------------------------------
# 6. SUMMARY & NEXT STEPS
# ------------------------------------------------------------------------------
echo ""
echo -e "${CYAN}==============================================================${NC}"
echo -e "${GREEN}🎉 OpenPisoWiFi Standalone Gateway Setup Complete!${NC}"
echo -e "${CYAN}==============================================================${NC}"
echo -e "• WAN Interface : ${YELLOW}${WAN_IFACE}${NC} (DHCP client to ISP modem)"
echo -e "• LAN Interface : ${YELLOW}${LAN_IFACE}${NC} (Static ${LAN_IP}/${LAN_PREFIX})"
echo -e "• Next Steps:"
echo -e "  1. Plug Ethernet from LAN (${LAN_IFACE}) into ANY Wi-Fi Access Point (set in AP/Bridge mode)."
echo -e "  2. Set GATEWAY_MODE=local_linux in your daemon/.env configuration."
echo -e "  3. Start the OpenPisoWiFi daemon & portal (systemctl restart pisowifi-daemon)."
echo -e "${CYAN}==============================================================${NC}"

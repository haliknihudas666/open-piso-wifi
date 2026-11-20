#!/bin/sh
# ==============================================================================
# 🧹 OpenPisoWiFi - Automated OpenWrt Router Cleanup & Revert Tool
# ==============================================================================
# Target: OpenWrt 23.05+ / 24.x / 25.12.5+ (e.g. Ruijie RG-EW1200G Pro)
# Features:
#   - Stops and removes custom init services (piso-firewall, piso-qos)
#   - Deletes nftables captive portal table (inet piso_portal)
#   - Removes captive DNS / domain bindings and DHCP hooks
#   - Removes 10.0.0.1 mobile shortcut IP alias
#   - Restores standard OpenWrt firewall, dnsmasq, and network routing
#   - Preserves core OpenWrt system stability and LAN IP
# ==============================================================================

set -e

echo "=========================================================="
echo "🧹 Starting OpenPisoWiFi OpenWrt Router Cleanup..."
echo "=========================================================="

# 1. Stop, disable, and remove piso init services
echo "--> [1/6] Stopping and disabling custom OpenPiso services..."
if [ -f /etc/init.d/piso-firewall ]; then
    /etc/init.d/piso-firewall stop 2>/dev/null || true
    /etc/init.d/piso-firewall disable 2>/dev/null || true
    rm -f /etc/init.d/piso-firewall
    echo "  ✓ piso-firewall service removed."
fi

if [ -f /etc/init.d/piso-qos ]; then
    /etc/init.d/piso-qos stop 2>/dev/null || true
    /etc/init.d/piso-qos disable 2>/dev/null || true
    rm -f /etc/init.d/piso-qos
    echo "  ✓ piso-qos service removed."
fi

if [ -f /etc/init.d/piso-wids ]; then
    /etc/init.d/piso-wids stop 2>/dev/null || true
    /etc/init.d/piso-wids disable 2>/dev/null || true
    rm -f /etc/init.d/piso-wids
    echo "  ✓ piso-wids service removed."
fi
rm -f /usr/sbin/piso-wids.sh /etc/piso-wids.conf /tmp/piso-wids.seen /tmp/piso-wids.eviltwin 2>/dev/null || true

# 2. Delete nftables table and custom ruleset
echo "--> [2/6] Deleting nftables captive portal tables..."
if command -v nft >/dev/null 2>&1; then
    nft delete table inet piso_portal 2>/dev/null || true
    nft delete table inet piso_shield 2>/dev/null || true
    echo "  ✓ inet piso_portal nftables table deleted."
fi

rm -f /etc/nftables.piso.nft /etc/nftables.d/*piso* /etc/nftables.d/10-pisowifi.nft 2>/dev/null || true

# Remove firewall include from UCI
if uci -q get firewall.piso_portal >/dev/null; then
    uci -q delete firewall.piso_portal
    uci commit firewall
    echo "  ✓ firewall.piso_portal include removed."
fi

# 3. Clean up DHCP hook and DNS domain mappings
echo "--> [3/6] Reverting dnsmasq DHCP hooks & captive domain mappings..."
rm -f /etc/pisowifi-dhcp-hook.sh

if uci -q get dhcp.@dnsmasq[0].dhcpscript >/dev/null; then
    uci -q delete dhcp.@dnsmasq[0].dhcpscript
fi

if uci -q get dhcp.piso_domain >/dev/null; then
    uci -q delete dhcp.piso_domain
fi

# Remove wifi.local and piso.wifi from dnsmasq address lists
uci -q del_list dhcp.@dnsmasq[0].address="/wifi.local/" 2>/dev/null || true
uci -q del_list dhcp.@dnsmasq[0].rebind_domain="wifi.local" 2>/dev/null || true

# Remove from /etc/hosts
if [ -f /etc/hosts ]; then
    sed -i '/wifi\.local/d' /etc/hosts 2>/dev/null || true
fi

uci commit dhcp
echo "  ✓ dnsmasq hooks & domains cleaned."

# 4. Remove 10.0.0.1 Shortcut Alias from LAN
echo "--> [4/6] Removing 10.0.0.1 shortcut IP alias..."
if uci -q get network.lan_alias10 >/dev/null; then
    uci -q delete network.lan_alias10
    uci commit network
fi
ip addr del 10.0.0.1/32 dev br-lan 2>/dev/null || true
echo "  ✓ 10.0.0.1 IP alias removed."

# 5. Clean custom sysctl and UCI config files
echo "--> [5/6] Cleaning Piso-WiFi performance configs & device tables..."
rm -f /etc/sysctl.d/99-piso-performance.conf
rm -f /etc/config/piso_devices /etc/config/piso_qos

# Clear any remaining QoS qdiscs
tc qdisc del dev br-lan root 2>/dev/null || true

# 6. Reload OpenWrt services
echo "--> [6/6] Reloading firewall and network services..."
/etc/init.d/firewall restart 2>/dev/null || true
/etc/init.d/dnsmasq restart 2>/dev/null || true

echo "=========================================================="
echo "✅ OpenPisoWiFi OpenWrt Router Cleanup Completed!"
echo "• Captive paywall rules and redirection have been removed."
echo "• Router is operating on standard OpenWrt networking."
echo "=========================================================="

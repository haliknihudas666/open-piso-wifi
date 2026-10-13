#!/bin/sh
# ==============================================================================
# OpenPisoWifi - Automated OpenWrt Setup Script for Ruijie RG-EW1200G Pro
# ==============================================================================
# Modes:
#   --fresh   : Complete first-time deployment (configures Wi-Fi SSIDs, DHCP, network)
#   --update  : Differential update (preserves Wi-Fi config, active sessions & MAC tables)
# ==============================================================================

ROUTER_IP="${ROUTER_IP:-}"
RPI_IP="${RPI_IP:-}"
PORTAL_PORT="${PORTAL_PORT:-3000}"
PORTAL_DOMAIN="${PORTAL_DOMAIN:-wifi.local}"
SSID_2G="${SSID_2G:-OpenPisoWifi}"
SSID_5G="${SSID_5G:-}"
UNIFIED_SSID="${UNIFIED_SSID:-}"

# Determine execution mode and parse parameters
MODE="fresh"
for arg in "$@"; do
    case "$arg" in
        --update|--preserve)
            MODE="update"
            ;;
        --fresh)
            MODE="fresh"
            ;;
        --unified|--unified-ssid)
            UNIFIED_SSID="true"
            ;;
        --separate|--separate-ssid)
            UNIFIED_SSID="false"
            ;;
        --router-ip=*)
            ROUTER_IP="${arg#*=}"
            ;;
        --portal-ip=*|--rpi-ip=*)
            RPI_IP="${arg#*=}"
            ;;
        --portal-domain=*|--domain=*)
            PORTAL_DOMAIN="${arg#*=}"
            ;;
        --portal-port=*)
            PORTAL_PORT="${arg#*=}"
            ;;
        --ssid-2g=*)
            SSID_2G="${arg#*=}"
            ;;
        --ssid-5g=*)
            SSID_5G="${arg#*=}"
            ;;
    esac
done

# Resolve SSID naming:
# If --unified is set, broadcast identical SSID on 2.4G & 5G (band steering).
# Otherwise, default to Separate SSIDs (${SSID_2G} and ${SSID_2G}_5G).
# Admins can also toggle this at any time in the Web Admin Dashboard.
if [ "$UNIFIED_SSID" = "true" ]; then
    SSID_5G="$SSID_2G"
elif [ -z "$SSID_5G" ]; then
    SSID_5G="${SSID_2G}_5G"
fi

# Detect existing router LAN IP from UCI to ensure router address is NOT touched
CURRENT_LAN_IP=$(uci -q get network.lan.ipaddr || echo "")
if [ -z "$ROUTER_IP" ]; then
    if [ -n "$CURRENT_LAN_IP" ]; then
        ROUTER_IP="$CURRENT_LAN_IP"
    else
        ROUTER_IP="192.168.1.1"
    fi
fi

# Subnet base (e.g. 10.0.0 or 192.168.1)
ROUTER_NET_BASE=$(echo "$ROUTER_IP" | cut -d'.' -f1-3)

# Default RPI_IP based on subnet if not set
if [ -z "$RPI_IP" ]; then
    if [ "$ROUTER_NET_BASE" = "10.0.0" ]; then
        RPI_IP="10.0.0.2"
    else
        RPI_IP="${ROUTER_NET_BASE}.240"
    fi
fi

echo "=========================================================="
if [ "$MODE" = "update" ]; then
    echo "🔄 Starting OpenPisoWifi Smart OpenWrt Update (Preserving State)..."
else
    echo "⚡ Starting OpenPisoWifi OpenWrt First-Time Setup..."
fi
echo "=========================================================="
echo "• Mode: ${MODE}"
echo "• Router Gateway IP: ${ROUTER_IP}"
echo "• Paywall IP: ${RPI_IP}:${PORTAL_PORT}"
echo "• Local Portal Domain: http://${PORTAL_DOMAIN}"
echo "• Direct Mobile Shortcut: http://10.0.0.1"

BACKUP_DIR="/tmp/piso_router_backup"

# ------------------------------------------------------------------------------
# STEP 0: BACKUP ACTIVE STATE (If updating)
# ------------------------------------------------------------------------------
if [ "$MODE" = "update" ]; then
    echo "--> [1/6] Taking snapshot of active nftables sets & router configs..."
    rm -rf "$BACKUP_DIR"
    mkdir -p "$BACKUP_DIR"

    # Export active nftables sets (whitelist, blacklist, active authorized sessions with remaining timeouts)
    if nft list table inet piso_portal >/dev/null 2>&1; then
        echo "  • Snapshotting active nftables table (inet piso_portal)..."
        nft list set inet piso_portal piso_auth > "$BACKUP_DIR/piso_auth.nft" 2>/dev/null || true
        nft list set inet piso_portal piso_whitelist > "$BACKUP_DIR/piso_whitelist.nft" 2>/dev/null || true
        nft list set inet piso_portal piso_blacklist > "$BACKUP_DIR/piso_blacklist.nft" 2>/dev/null || true
    fi

    # Backup UCI configurations
    [ -f /etc/config/piso_devices ] && cp -f /etc/config/piso_devices "$BACKUP_DIR/"
    [ -f /etc/config/wireless ] && cp -f /etc/config/wireless "$BACKUP_DIR/"
    [ -f /etc/config/piso_qos ] && cp -f /etc/config/piso_qos "$BACKUP_DIR/"
    echo "  ✓ Active state backed up to ${BACKUP_DIR}."
fi

# ------------------------------------------------------------------------------
# STEP 1: INSTALL REQUIRED PACKAGES (Supports opkg & apk)
# ------------------------------------------------------------------------------
echo "--> Checking and installing OpenWrt packages (tc, iwinfo, schedulers)..."
if command -v apk >/dev/null 2>&1; then
    apk update 2>/dev/null || true
    for pkg in tc-tiny tc-full kmod-sched-cake kmod-sched-core kmod-sched-fq-codel iwinfo; do
        apk add "$pkg" 2>/dev/null || true
    done
elif command -v opkg >/dev/null 2>&1; then
    opkg update 2>/dev/null || true
    for pkg in tc-tiny tc-full kmod-sched-cake kmod-sched-core kmod-sched-fq-codel iwinfo; do
        opkg install "$pkg" 2>/dev/null || true
    done
fi

# ------------------------------------------------------------------------------
# STEP 2: VERIFY LAN NETWORK & CONFIGURE 10.0.0.1 MOBILE SHORTCUT ALIAS
# ------------------------------------------------------------------------------
echo "--> Verifying LAN Interface (Preserving Router IP: ${ROUTER_IP})..."
# Never modify existing router LAN IP
if [ -z "$CURRENT_LAN_IP" ]; then
    uci set network.lan.ipaddr="${ROUTER_IP}"
    uci set network.lan.netmask="255.255.255.0"
fi

# If router primary IP is not 10.0.0.1, add 10.0.0.1 alias so mobile shortcut works natively
if [ "${ROUTER_IP}" != "10.0.0.1" ]; then
    uci -q delete network.lan_alias10
    uci set network.lan_alias10=alias
    uci set network.lan_alias10.interface='lan'
    uci set network.lan_alias10.proto='static'
    uci set network.lan_alias10.ipaddr='10.0.0.1'
    uci set network.lan_alias10.netmask='255.255.255.255'
fi
uci commit network
ifup lan_alias10 2>/dev/null || true
ip addr add 10.0.0.1/32 dev br-lan 2>/dev/null || true

# ------------------------------------------------------------------------------
# STEP 3: CONFIGURE DHCP, CAPTIVE PORTAL RFC 8908/7710 & LOCAL DNS DOMAIN
# ------------------------------------------------------------------------------
echo "--> Configuring DHCP Pool, dnsmasq & Local Domain (${PORTAL_DOMAIN} -> ${RPI_IP})..."
uci set dhcp.lan.start="10"
uci set dhcp.lan.limit="220"
uci set dhcp.lan.leasetime="24h"
uci set dhcp.@dnsmasq[0].dhcpleasemax='4096'
# Clear DHCP options 114/160 so mobile devices use standard HTTP probe detection
# (option 114 expects RFC 8908 JSON API, causing CNA failures when HTML is served)
uci -q delete dhcp.lan.dhcp_option

# Disable IPv6 RA / DHCPv6 on LAN completely and disable odhcpd
# to prevent Windows and mobile captive detection hanging on unroutable IPv6 probes (e.g. google.com)
uci set dhcp.lan.dhcpv6='disabled'
uci set dhcp.lan.ra='disabled'
uci -q delete dhcp.lan.ra_slaac
uci -q delete network.lan.ip6assign
uci -q delete network.lan.ip6hint
uci commit network 2>/dev/null || true
uci set dhcp.@dnsmasq[0].filter_aaaa='1'
/etc/init.d/odhcpd disable 2>/dev/null || true
/etc/init.d/odhcpd stop 2>/dev/null || true

# Install real-time DHCP event hook to pin kernel ARP entries (nud permanent)
# Prevents 30-60s connection freezes when mobile devices rotate randomized MACs or roam between 2.4G & 5G
echo "--> Installing real-time DHCP event hook (/etc/pisowifi-dhcp-hook.sh)..."
cat << 'EOF' > /etc/pisowifi-dhcp-hook.sh
#!/bin/sh
# Real-time DHCP Event Hook for Piso-WiFi
# Pins kernel ARP entries as 'nud permanent' on IP assign/renew to eliminate
# packet drop freezes during MAC randomization or Wi-Fi band switching.
ACTION="$1"
MAC="$2"
IP="$3"
HOST="$4"
IFACE="${DNSMASQ_INTERFACE:-br-lan}"

case "$ACTION" in
    add|old)
        if [ -n "$IP" ] && [ -n "$MAC" ]; then
            ip neigh replace "$IP" lladdr "$MAC" dev "$IFACE" nud permanent 2>/dev/null || true
        fi
        ;;
    del)
        if [ -n "$IP" ]; then
            ip neigh delete "$IP" dev "$IFACE" 2>/dev/null || true
        fi
        ;;
esac
EOF
chmod +x /etc/pisowifi-dhcp-hook.sh
uci set dhcp.@dnsmasq[0].dhcpscript='/etc/pisowifi-dhcp-hook.sh'

# Configure Local Portal Domain in dnsmasq & /etc/hosts
if [ -n "$PORTAL_DOMAIN" ]; then
    uci -q delete dhcp.piso_domain
    uci set dhcp.piso_domain=domain
    uci set dhcp.piso_domain.name="${PORTAL_DOMAIN}"
    uci set dhcp.piso_domain.ip="${RPI_IP}"
    uci -q del_list dhcp.@dnsmasq[0].address="/${PORTAL_DOMAIN}/${RPI_IP}"
    uci add_list dhcp.@dnsmasq[0].address="/${PORTAL_DOMAIN}/${RPI_IP}"
    uci -q del_list dhcp.@dnsmasq[0].rebind_domain="${PORTAL_DOMAIN}"
    uci add_list dhcp.@dnsmasq[0].rebind_domain="${PORTAL_DOMAIN}"
    grep -q "${PORTAL_DOMAIN}" /etc/hosts 2>/dev/null || echo "${RPI_IP} ${PORTAL_DOMAIN}" >> /etc/hosts
    sed -i "s/.*${PORTAL_DOMAIN}.*/${RPI_IP} ${PORTAL_DOMAIN}/" /etc/hosts 2>/dev/null || true
fi
uci commit dhcp
/etc/init.d/dnsmasq restart 2>/dev/null || true

# Disable firewall flow offloading (required for tc QoS and nftables rate limiting)
uci set firewall.@defaults[0].flow_offloading='0'
uci set firewall.@defaults[0].flow_offloading_hw='0'
# Enable Full-Cone NAT (STUN support) for open multiplayer gaming & voice chat
uci set firewall.@defaults[0].fullcone='1' 2>/dev/null || true
uci commit firewall

# Multi-core Receive Packet Steering (RPS/RFS) & network backlog tuning
# Offloads network interrupts across all CPU cores, eliminating CPU0 softirq bottlenecks
uci set network.@globals[0].packet_steering='1' 2>/dev/null || true
uci commit network
cat << 'EOF' > /etc/sysctl.d/99-piso-performance.conf
net.core.netdev_max_backlog = 8192
net.core.rps_sock_flow_entries = 32768
EOF
sysctl -p /etc/sysctl.d/99-piso-performance.conf 2>/dev/null || true

# Apply RPS multi-core mask to all network queues
for q in /sys/class/net/*/queues/rx-*; do
    [ -d "$q" ] && echo f > "$q/rps_cpus" 2>/dev/null || true
    [ -d "$q" ] && echo 32768 > "$q/rps_flow_cnt" 2>/dev/null || true
done

# ------------------------------------------------------------------------------
# STEP 4: WI-FI CONFIGURATION
# ------------------------------------------------------------------------------
if [ "$MODE" = "fresh" ]; then
    echo "--> [Fresh Mode] Configuring Dual-Band Wi-Fi SSIDs..."
    [ -f /etc/config/wireless ] || wifi config

    # Configure physical radio0 (2.4GHz)
    if uci -q get wireless.radio0 >/dev/null; then
        uci set wireless.radio0.disabled='0'
        uci set wireless.radio0.country='PH'
        uci set wireless.radio0.channel='6'
        uci set wireless.radio0.band='2g'
        uci set wireless.radio0.htmode='HT20'
        uci -q delete wireless.radio0.cell_density
    fi

    # Configure physical radio1 (5GHz)
    if uci -q get wireless.radio1 >/dev/null; then
        uci set wireless.radio1.disabled='0'
        uci set wireless.radio1.country='PH'
        uci set wireless.radio1.channel='36'
        uci set wireless.radio1.band='5g'
        uci set wireless.radio1.htmode='VHT80'
        uci -q delete wireless.radio1.cell_density
    fi

    # Reset wifi interfaces only on fresh install
    while uci -q delete wireless.@wifi-iface[0]; do :; done

    # 2.4GHz SSID
    if uci -q get wireless.radio0 >/dev/null; then
        uci set wireless.wifinet0=wifi-iface
        uci set wireless.wifinet0.device='radio0'
        uci set wireless.wifinet0.network='lan'
        uci set wireless.wifinet0.mode='ap'
        uci set wireless.wifinet0.ssid="${SSID_2G}"
        uci set wireless.wifinet0.encryption='none'
        uci set wireless.wifinet0.disabled='0'
        uci set wireless.wifinet0.isolate='0'
    fi

    # 5GHz SSID
    if uci -q get wireless.radio1 >/dev/null; then
        uci set wireless.wifinet1=wifi-iface
        uci set wireless.wifinet1.device='radio1'
        uci set wireless.wifinet1.network='lan'
        uci set wireless.wifinet1.mode='ap'
        uci set wireless.wifinet1.ssid="${SSID_5G}"
        uci set wireless.wifinet1.encryption='none'
        uci set wireless.wifinet1.disabled='0'
        uci set wireless.wifinet1.isolate='0'
    fi

    for entry in $(uci show wireless 2>/dev/null | grep -E '\.disabled=' | cut -d'.' -f2 | cut -d'=' -f1 | sort -u); do
        uci set wireless.${entry}.disabled='0'
    done
    uci commit wireless
else
    echo "--> [Update Mode] Preserving existing Wi-Fi SSIDs, channels, and passwords without interruption."
fi

# ------------------------------------------------------------------------------
# STEP 5: CONFIGURE DEDICATED CAPTIVE FIREWALL TABLE (piso_portal)
# ------------------------------------------------------------------------------
echo "--> Deploying updated nftables Captive Portal Ruleset..."

rm -f /etc/nftables.d/*piso* /etc/nftables.d/10-pisowifi.nft 2>/dev/null || true

cat << EOF > /etc/nftables.piso.nft
# Ensure clean table recreation without duplicates
table inet piso_portal
delete table inet piso_portal

table inet piso_portal {
    # Set of MAC addresses authorized to access the internet
    set piso_auth {
        type ether_addr
        flags timeout
    }

    # Set of VIP Whitelisted MAC addresses (permanent access)
    set piso_whitelist {
        type ether_addr
    }

    # Set of Blacklisted MAC addresses (blocked completely)
    set piso_blacklist {
        type ether_addr
    }

    # NAT Prerouting: Intercept port 80 HTTP requests from unauthorized & banned devices
    chain prerouting {
        type nat hook prerouting priority -150; policy accept;

        # Allow Raspberry Pi (Paywall Server) outbound traffic without redirect
        ip saddr ${RPI_IP} accept

        # Intercept HTTP requests directly addressed to 10.0.0.1 shortcut
        # and forward to Raspberry Pi portal! This ensures that ANY connected customer
        # who types 10.0.0.1 in their mobile browser will immediately land on the portal!
        ip daddr 10.0.0.1 tcp dport { 80, 3000 } dnat ip to ${RPI_IP}:${PORTAL_PORT}

        # Whitelisted VIP MACs bypass redirect
        ether saddr @piso_whitelist accept

        # Authorized MACs bypass redirect
        ether saddr @piso_auth accept

        # Allow Router Gateway management (HTTP LuCI, HTTPS & SSH) for administration
        ip daddr ${ROUTER_IP} tcp dport { 22, 80, 443 } accept

        # Redirect unauthenticated and blacklisted client HTTP (port 80) to Raspberry Pi Portal :${PORTAL_PORT}
        # Intercept external port 80 HTTP requests across all interfaces/SSIDs (br-lan, phy0-ap0, phy1-ap0, wlan0, wlan1)
        ip daddr != { ${ROUTER_IP}, ${RPI_IP}, 10.0.0.1 } tcp dport 80 dnat ip to ${RPI_IP}:${PORTAL_PORT}

        # Allow Raspberry Pi other services (SSH, 3000, 4000)
        ip daddr ${RPI_IP} accept

        # Allow Router Gateway other services
        ip daddr ${ROUTER_IP} accept
    }

    # NAT Postrouting: Hairpin Masquerade so redirected packets return through router
    chain postrouting {
        type nat hook postrouting priority 100; policy accept;

        # Masquerade traffic redirected to RPi so RPi replies back via OpenWrt
        ip daddr ${RPI_IP} tcp dport ${PORTAL_PORT} masquerade
    }

    # Filter Input: Allow DHCP/DNS, prevent blacklisted devices from accessing router management
    chain input {
        type filter hook input priority -5; policy accept;

        # Allow DHCP
        udp dport 67-68 accept

        # Allow ICMP ping to router & 10.0.0.1
        icmp type echo-request accept

        # Allow DNS queries (port 53) so captive portal detection domains resolve for all clients
        udp dport 53 accept
        tcp dport 53 accept

        # Drop blacklisted devices from accessing router management services (SSH/HTTP/HTTPS)
        ip daddr ${ROUTER_IP} ether saddr @piso_blacklist tcp dport { 22, 80, 443 } drop
    }

    # Filter Forward: Block all internet access for unauthorized & blacklisted devices
    chain forward {
        type filter hook forward priority -5; policy accept;

        # Allow established / return traffic
        ct state established,related accept

        # Allow Raspberry Pi (${RPI_IP}) full access to WAN/Internet
        ip saddr ${RPI_IP} accept
        ip daddr ${RPI_IP} accept

        # Allow all LAN clients (including banned) to reach Raspberry Pi Paywall Portal
        ip daddr ${RPI_IP} accept

        # Allow traffic within the local LAN (${ROUTER_NET_BASE}.0/24)
        ip saddr ${ROUTER_NET_BASE}.0/24 ip daddr ${ROUTER_NET_BASE}.0/24 accept

        # Allow DNS queries (port 53)
        udp dport 53 accept
        tcp dport 53 accept

        # Allow DHCP
        udp dport 67-68 accept

        # Drop blacklisted devices completely from ANY external internet / WAN forwarding
        ether saddr @piso_blacklist drop

        # Allow VIP Whitelisted MACs full internet access
        ether saddr @piso_whitelist accept

        # Allow authorized client MACs to access the internet
        ether saddr @piso_auth accept

        # FAST REJECT: Immediately reject unauthorized TCP connection attempts (e.g. HTTPS port 443)
        # with TCP RST across all interfaces/SSIDs so phone browsers fail fast
        meta l4proto tcp reject with tcp reset

        # BLOCK ALL OTHER INTERNET ACCESS FOR UNAUTHORIZED CLIENTS ACROSS ALL INTERFACES & SSIDS!
        drop
    }
}
EOF

# Reload ruleset
nft delete table inet piso_portal 2>/dev/null || true
nft -f /etc/nftables.piso.nft

# ------------------------------------------------------------------------------
# STEP 6: RESTORE ACTIVE TABLES & MAC WHITELIST/BLACKLIST
# ------------------------------------------------------------------------------
echo "--> Restoring MAC tables (Whitelist, Blacklist, and active sessions)..."

# 1. Restore from snapshot files if update mode
if [ "$MODE" = "update" ] && [ -d "$BACKUP_DIR" ]; then
    # Restore Whitelist
    if [ -f "$BACKUP_DIR/piso_whitelist.nft" ]; then
        grep -oE '([0-9a-fA-F]{2}:){5}[0-9a-fA-F]{2}' "$BACKUP_DIR/piso_whitelist.nft" | while read -r mac; do
            [ -n "$mac" ] && nft add element inet piso_portal piso_whitelist "{ $mac }" 2>/dev/null || true
        done
    fi

    # Restore Blacklist
    if [ -f "$BACKUP_DIR/piso_blacklist.nft" ]; then
        grep -oE '([0-9a-fA-F]{2}:){5}[0-9a-fA-F]{2}' "$BACKUP_DIR/piso_blacklist.nft" | while read -r mac; do
            [ -n "$mac" ] && nft add element inet piso_portal piso_blacklist "{ $mac }" 2>/dev/null || true
        done
    fi

    # Restore Active Authorized Sessions (preserving remaining timeout!)
    if [ -f "$BACKUP_DIR/piso_auth.nft" ]; then
        grep -oE '([0-9a-fA-F]{2}:){5}[0-9a-fA-F]{2}(\s+timeout\s+[0-9a-z]+)?' "$BACKUP_DIR/piso_auth.nft" | while read -r elem; do
            [ -n "$elem" ] && nft add element inet piso_portal piso_auth "{ $elem }" 2>/dev/null || true
        done
    fi

    # Cleanup temporary snapshot
    rm -rf "$BACKUP_DIR"
fi

# 2. Re-sync persistent UCI device rules from /etc/config/piso_devices
if [ -f /etc/config/piso_devices ]; then
    for mac in $(uci -q get piso_devices.whitelist.mac); do
        nft add element inet piso_portal piso_whitelist "{ $mac }" 2>/dev/null || true
    done
    for mac in $(uci -q get piso_devices.blacklist.mac); do
        nft add element inet piso_portal piso_blacklist "{ $mac }" 2>/dev/null || true
    done
fi

# Include in OpenWrt fw4 configuration for automatic boot & reload persistence
uci -q delete firewall.piso_portal
uci set firewall.piso_portal=include
uci set firewall.piso_portal.type='nftables'
uci set firewall.piso_portal.path='/etc/nftables.piso.nft'
uci set firewall.piso_portal.position='ruleset-post'
uci commit firewall

# Create/update OpenWrt init service to persist piso_portal across reboots and firewall reloads
cat << 'EOF' > /etc/init.d/piso-firewall
#!/bin/sh /etc/rc.common
START=99
USE_PROCD=0

start() {
    ip addr add 10.0.0.1/32 dev br-lan 2>/dev/null || true
    nft -f /etc/nftables.piso.nft 2>/dev/null || true
    if [ -f /etc/config/piso_devices ]; then
        for mac in $(uci -q get piso_devices.whitelist.mac); do
            nft add element inet piso_portal piso_whitelist "{ $mac }" 2>/dev/null || true
        done
        for mac in $(uci -q get piso_devices.blacklist.mac); do
            nft add element inet piso_portal piso_blacklist "{ $mac }" 2>/dev/null || true
        done
    fi
}

stop() {
    nft delete table inet piso_portal 2>/dev/null || true
}

restart() {
    stop
    start
}
EOF
chmod +x /etc/init.d/piso-firewall
/etc/init.d/piso-firewall enable

# Create/update OpenWrt init service for QoS
cat << 'EOF' > /etc/init.d/piso-qos
#!/bin/sh /etc/rc.common
START=98
USE_PROCD=0

start() {
    if [ -f /etc/config/piso_qos ]; then
        DOWN=$(uci -q get piso_qos.settings.download_mbps || echo 0)
        UP=$(uci -q get piso_qos.settings.upload_mbps || echo 0)
        WAN_IF=$(uci -q get piso_qos.settings.wan_if || uci -q get network.wan.device || uci -q get network.wan.ifname || echo "wan")

        if [ "$DOWN" -gt 0 ]; then
            tc qdisc del dev br-lan root 2>/dev/null || true
            tc qdisc add dev br-lan root cake bandwidth ${DOWN}mbit 2>/dev/null || \
            tc qdisc add dev br-lan root handle 1: tbf rate ${DOWN}mbit burst 64kb latency 50ms 2>/dev/null || true
        fi

        if [ "$UP" -gt 0 ] && [ -n "$WAN_IF" ]; then
            tc qdisc del dev "$WAN_IF" root 2>/dev/null || true
            tc qdisc add dev "$WAN_IF" root cake bandwidth ${UP}mbit 2>/dev/null || \
            tc qdisc add dev "$WAN_IF" root handle 1: tbf rate ${UP}mbit burst 64kb latency 50ms 2>/dev/null || true
        fi
    fi
}

stop() {
    WAN_IF=$(uci -q get piso_qos.settings.wan_if || uci -q get network.wan.device || uci -q get network.wan.ifname || echo "wan")
    tc qdisc del dev br-lan root 2>/dev/null || true
    [ -n "$WAN_IF" ] && tc qdisc del dev "$WAN_IF" root 2>/dev/null || true
}

restart() {
    stop
    start
}
EOF
chmod +x /etc/init.d/piso-qos
/etc/init.d/piso-qos enable

# Configure Dropbear SSH
uci set dropbear.@dropbear[0].Port='22'
uci set dropbear.@dropbear[0].PasswordAuth='on'
uci set dropbear.@dropbear[0].RootPasswordAuth='on'
uci commit dropbear
mkdir -p /etc/dropbear
touch /etc/dropbear/authorized_keys
chmod 700 /etc/dropbear
chmod 600 /etc/dropbear/authorized_keys

# ------------------------------------------------------------------------------
# STEP 7: RESTART RELEVANT SERVICES
# ------------------------------------------------------------------------------
echo "--> Applying changes to services..."

if [ "$MODE" = "update" ]; then
    # In update mode, only reload firewall and custom daemons to avoid dropping Wi-Fi clients
    /etc/init.d/firewall reload 2>/dev/null || /etc/init.d/firewall restart 2>/dev/null || true
    /etc/init.d/piso-firewall restart 2>/dev/null || true
    /etc/init.d/piso-qos restart 2>/dev/null || true
    /etc/init.d/dropbear restart 2>/dev/null || true
    echo "  ✓ Firewall reloaded seamlessly without bouncing Wi-Fi radios."
else
    # In fresh mode, perform full network and radio initialization
    /etc/init.d/network restart 2>/dev/null || true
    wifi reload 2>/dev/null || true
    wifi up 2>/dev/null || true
    /etc/init.d/dnsmasq restart 2>/dev/null || true
    /etc/init.d/firewall restart 2>/dev/null || true
    /etc/init.d/piso-firewall restart 2>/dev/null || true
    /etc/init.d/piso-qos restart 2>/dev/null || true
    /etc/init.d/dropbear restart 2>/dev/null || true
fi

echo "=========================================================="
if [ "$MODE" = "update" ]; then
    echo "✅ OpenWrt Router Update Completed Successfully!"
    echo "• All active sessions, VIP whitelist & settings were preserved."
else
    echo "✅ Ruijie RG-EW1200G Pro OpenWrt Setup Completed!"
    echo "• 2.4GHz Wi-Fi SSID: ${SSID_2G}"
    echo "• 5GHz Wi-Fi SSID: ${SSID_5G}"
fi
echo "• Router Gateway IP: http://${ROUTER_IP}"
echo "• Paywall Address: http://${RPI_IP}:${PORTAL_PORT}"
echo "• Portal Local Domain: http://${PORTAL_DOMAIN}"
echo "• Customer Mobile Shortcut: http://10.0.0.1"
echo "=========================================================="

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
OWE_MODE="${OWE_MODE:-owe_5g}"
ISOLATE="${ISOLATE:-1}"
ANTI_TETHERING="${ANTI_TETHERING:-}"
IOT_SSID="${IOT_SSID:-}"
IOT_PASS="${IOT_PASS:-}"
SHIELD_SECRET="${SHIELD_SECRET:-}"

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
        --owe-mode=*)
            OWE_MODE="${arg#*=}"
            ;;
        --isolate=*)
            ISOLATE="${arg#*=}"
            ;;
        --anti-tethering=*)
            ANTI_TETHERING="${arg#*=}"
            ;;
        --iot-ssid=*)
            IOT_SSID="${arg#*=}"
            ;;
        --iot-pass=*)
            IOT_PASS="${arg#*=}"
            ;;
        --shield-secret=*)
            SHIELD_SECRET="${arg#*=}"
            ;;
    esac
done

case "$OWE_MODE" in
    off|transition|owe_5g|owe_all) ;;
    *) OWE_MODE="owe_5g" ;;
esac

case "$ISOLATE" in
    0|false|no) ISOLATE="0" ;;
    *) ISOLATE="1" ;;
esac

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

# Preserve existing WIDS secret / anti-tethering state when not explicitly passed on CLI
if [ -f /etc/piso-wids.conf ]; then
    OLD_WIDS_SECRET=$(grep -E '^SHIELD_SECRET=' /etc/piso-wids.conf 2>/dev/null | head -n1 | cut -d'=' -f2- | tr -d '"'\''')
    OLD_ANTI_TETHER=$(grep -E '^ANTI_TETHERING=' /etc/piso-wids.conf 2>/dev/null | head -n1 | cut -d'=' -f2- | tr -d '"'\''')
    [ -z "$SHIELD_SECRET" ] && [ -n "$OLD_WIDS_SECRET" ] && SHIELD_SECRET="$OLD_WIDS_SECRET"
    [ -z "$ANTI_TETHERING" ] && [ -n "$OLD_ANTI_TETHER" ] && ANTI_TETHERING="$OLD_ANTI_TETHER"
fi
if [ -z "$ANTI_TETHERING" ]; then
    if nft list chain inet piso_portal mangle_postrouting 2>/dev/null | grep -q 'ip ttl set 1'; then
        ANTI_TETHERING="1"
    else
        ANTI_TETHERING="0"
    fi
fi
case "$ANTI_TETHERING" in
    1|true|yes) ANTI_TETHERING="1" ;;
    *) ANTI_TETHERING="0" ;;
esac
SHIELD_SECRET=$(printf '%s' "$SHIELD_SECRET" | tr -d '\r\n"'\''$`\\')

echo "=========================================================="
if [ "$MODE" = "update" ]; then
    echo "🔄 Starting OpenPisoWifi Smart OpenWrt Update (Preserving State)..."
else
    echo "⚡ Starting OpenPisoWifi OpenWrt First-Time Setup..."
fi
echo "=========================================================="
echo "• Mode:             ${MODE}"
echo "• Router Gateway:   ${ROUTER_IP}"
echo "• Paywall Host:     ${RPI_IP}:80 (Daemon Reverse Proxy)"
echo "• Local Domain:     http://${PORTAL_DOMAIN}"
echo "• Mobile Shortcut:  http://10.0.0.1"
echo "• Shield Policy:    OWE=${OWE_MODE} | Isolate=${ISOLATE} | AntiTether=${ANTI_TETHERING}"

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
echo "--> Checking and installing OpenWrt packages (tc, iwinfo, schedulers, speedtestcpp, conntrack)..."
if command -v apk >/dev/null 2>&1; then
    apk update 2>/dev/null || true
    for pkg in tc-tiny tc-full kmod-sched-cake kmod-sched-core kmod-sched-fq-codel iwinfo speedtestcpp conntrack; do
        apk add "$pkg" 2>/dev/null || true
    done
elif command -v opkg >/dev/null 2>&1; then
    opkg update 2>/dev/null || true
    for pkg in tc-tiny tc-full kmod-sched-cake kmod-sched-core kmod-sched-fq-codel iwinfo speedtestcpp conntrack; do
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

# If neither router nor RPi owns 10.0.0.1, add 10.0.0.1/32 alias on OpenWrt so the mobile shortcut works natively.
# Otherwise remove any stale lan_alias10 to prevent an IP conflict when RPi itself is 10.0.0.1.
if [ "${ROUTER_IP}" != "10.0.0.1" ] && [ "${RPI_IP}" != "10.0.0.1" ]; then
    uci -q delete network.lan_alias10
    uci set network.lan_alias10=alias
    uci set network.lan_alias10.interface='lan'
    uci set network.lan_alias10.proto='static'
    uci set network.lan_alias10.ipaddr='10.0.0.1'
    uci set network.lan_alias10.netmask='255.255.255.255'
    uci commit network
    ifup lan_alias10 2>/dev/null || true
    ip addr add 10.0.0.1/32 dev br-lan 2>/dev/null || true
else
    uci -q delete network.lan_alias10
    uci commit network
    if [ "${ROUTER_IP}" != "10.0.0.1" ]; then
        ip addr del 10.0.0.1/32 dev br-lan 2>/dev/null || true
    fi
fi

# ------------------------------------------------------------------------------
# STEP 3: CONFIGURE DHCP, CAPTIVE PORTAL & LOCAL DNS DOMAIN
# ------------------------------------------------------------------------------
echo "--> Configuring DHCP Pool, dnsmasq & Local Domain (${PORTAL_DOMAIN} -> ${RPI_IP})..."
uci set dhcp.lan.start="10"
uci set dhcp.lan.limit="220"
uci set dhcp.lan.leasetime="2h"
uci set dhcp.@dnsmasq[0].dhcpleasemax='4096'
uci set dhcp.@dnsmasq[0].authoritative='1'
# Clear DHCP options 114/160 so mobile devices use standard HTTP probe detection
# (option 114 expects RFC 8908 JSON API, causing CNA failures when HTML is served)
uci -q delete dhcp.lan.dhcp_option
# When 10.0.0.1 is an off-subnet shortcut alias, push RFC 3442 Classless Static Routes
# (Option 121 + MS Option 249) so mobile devices with Wi-Fi Assist / Mobile Data ON
# route 10.0.0.1 over Wi-Fi instead of cellular data.
if [ "${ROUTER_NET_BASE}" != "10.0.0" ] && [ "${RPI_IP}" != "10.0.0.1" ]; then
    uci add_list dhcp.lan.dhcp_option="121,10.0.0.1/32,${ROUTER_IP},0.0.0.0/0,${ROUTER_IP}"
    uci add_list dhcp.lan.dhcp_option="249,10.0.0.1/32,${ROUTER_IP},0.0.0.0/0,${ROUTER_IP}"
fi

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
# STEP 4: WI-FI CONFIGURATION (OWE / 802.11w PMF / Isolation / Optional IoT SSID)
# ------------------------------------------------------------------------------
if [ "$MODE" = "fresh" ]; then
    echo "--> [Fresh Mode] Configuring Dual-Band Wi-Fi SSIDs & Anti-Deauth Shield..."
    [ -f /etc/config/wireless ] || wifi config

    # Detect whether hostapd/wpad supports OWE before applying so older wpad-basic builds never lose Wi-Fi
    OWE_SUPPORTED=0
    if grep -q "owe_transition_ssid" /usr/sbin/hostapd /usr/sbin/wpad 2>/dev/null || \
       grep -q "owe_groups" /usr/sbin/hostapd /usr/sbin/wpad 2>/dev/null; then
        OWE_SUPPORTED=1
    elif command -v opkg >/dev/null 2>&1 && opkg list-installed 2>/dev/null | grep -Eq '^wpad-(openssl|wolfssl|mbedtls|full|mesh)'; then
        OWE_SUPPORTED=1
    elif command -v apk >/dev/null 2>&1 && apk info 2>/dev/null | grep -Eq '^wpad-(openssl|wolfssl|mbedtls|full|mesh)'; then
        OWE_SUPPORTED=1
    fi

    EFFECTIVE_OWE="$OWE_MODE"
    if [ "$OWE_SUPPORTED" -eq 0 ] && [ "$OWE_MODE" != "off" ]; then
        echo "  ⚠️ Warning: hostapd/wpad does not advertise OWE support (likely wpad-basic)."
        echo "     Falling back to encryption='none' so Wi-Fi stays online. Install wpad-mbedtls/openssl for OWE+PMF."
        EFFECTIVE_OWE="off"
    fi

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

    ENC_2G="none"
    PMF_2G=""
    ENC_5G="none"
    PMF_5G=""

    case "$EFFECTIVE_OWE" in
        owe_all)
            ENC_2G="owe"
            PMF_2G="2"
            ENC_5G="owe"
            PMF_5G="2"
            ;;
        owe_5g)
            ENC_2G="none"
            ENC_5G="owe"
            PMF_5G="2"
            ;;
        transition)
            if grep -q "owe_transition_ifname" /lib/netifd/hostapd.sh 2>/dev/null; then
                ENC_2G="none"
                ENC_5G="none"
            else
                echo "  ⚠️ OWE transition helper unavailable in hostapd.sh; applying OWE+PMF on 5GHz."
                ENC_2G="none"
                ENC_5G="owe"
                PMF_5G="2"
            fi
            ;;
        off)
            ENC_2G="none"
            ENC_5G="none"
            ;;
    esac

    # 2.4GHz Primary Guest SSID (wifinet0)
    if uci -q get wireless.radio0 >/dev/null; then
        uci set wireless.wifinet0=wifi-iface
        uci set wireless.wifinet0.device='radio0'
        uci set wireless.wifinet0.network='lan'
        uci set wireless.wifinet0.mode='ap'
        uci set wireless.wifinet0.ssid="${SSID_2G}"
        uci set wireless.wifinet0.encryption="${ENC_2G}"
        [ -n "$PMF_2G" ] && uci set wireless.wifinet0.ieee80211w="${PMF_2G}"
        uci set wireless.wifinet0.disabled='0'
        uci set wireless.wifinet0.isolate="${ISOLATE}"
        if [ "$EFFECTIVE_OWE" = "transition" ] && grep -q "owe_transition_ifname" /lib/netifd/hostapd.sh 2>/dev/null; then
            uci set wireless.wifinet0.ifname='piso2g'
            uci set wireless.wifinet0.owe_transition_ifname='piso2g-owe'
        fi
    fi

    # 5GHz Primary Guest SSID (wifinet1)
    if uci -q get wireless.radio1 >/dev/null; then
        uci set wireless.wifinet1=wifi-iface
        uci set wireless.wifinet1.device='radio1'
        uci set wireless.wifinet1.network='lan'
        uci set wireless.wifinet1.mode='ap'
        uci set wireless.wifinet1.ssid="${SSID_5G}"
        uci set wireless.wifinet1.encryption="${ENC_5G}"
        [ -n "$PMF_5G" ] && uci set wireless.wifinet1.ieee80211w="${PMF_5G}"
        uci set wireless.wifinet1.disabled='0'
        uci set wireless.wifinet1.isolate="${ISOLATE}"
        if [ "$EFFECTIVE_OWE" = "transition" ] && grep -q "owe_transition_ifname" /lib/netifd/hostapd.sh 2>/dev/null; then
            uci set wireless.wifinet1.ifname='piso5g'
            uci set wireless.wifinet1.owe_transition_ifname='piso5g-owe'
        fi
    fi

    # OWE Transition hidden companion VAPs (created after wifinet0/wifinet1 to preserve indices)
    if [ "$EFFECTIVE_OWE" = "transition" ] && grep -q "owe_transition_ifname" /lib/netifd/hostapd.sh 2>/dev/null; then
        if uci -q get wireless.radio0 >/dev/null; then
            uci set wireless.wifinet0_owe=wifi-iface
            uci set wireless.wifinet0_owe.device='radio0'
            uci set wireless.wifinet0_owe.network='lan'
            uci set wireless.wifinet0_owe.mode='ap'
            uci set wireless.wifinet0_owe.ifname='piso2g-owe'
            uci set wireless.wifinet0_owe.ssid="${SSID_2G}-OWE"
            uci set wireless.wifinet0_owe.encryption='owe'
            uci set wireless.wifinet0_owe.ieee80211w='2'
            uci set wireless.wifinet0_owe.hidden='1'
            uci set wireless.wifinet0_owe.disabled='0'
            uci set wireless.wifinet0_owe.isolate="${ISOLATE}"
            uci set wireless.wifinet0_owe.owe_transition_ifname='piso2g'
        fi
        if uci -q get wireless.radio1 >/dev/null; then
            uci set wireless.wifinet1_owe=wifi-iface
            uci set wireless.wifinet1_owe.device='radio1'
            uci set wireless.wifinet1_owe.network='lan'
            uci set wireless.wifinet1_owe.mode='ap'
            uci set wireless.wifinet1_owe.ifname='piso5g-owe'
            uci set wireless.wifinet1_owe.ssid="${SSID_5G}-OWE"
            uci set wireless.wifinet1_owe.encryption='owe'
            uci set wireless.wifinet1_owe.ieee80211w='2'
            uci set wireless.wifinet1_owe.hidden='1'
            uci set wireless.wifinet1_owe.disabled='0'
            uci set wireless.wifinet1_owe.isolate="${ISOLATE}"
            uci set wireless.wifinet1_owe.owe_transition_ifname='piso5g'
        fi
    fi

    # Optional Hidden WPA2/WPA3-PMF IoT & Admin SSID (e.g., ESP32 satellites & admin laptop)
    if [ -n "$IOT_SSID" ] && [ -n "$IOT_PASS" ]; then
        PASS_LEN=$(printf '%s' "$IOT_PASS" | wc -c | tr -dc '0-9')
        if [ "$PASS_LEN" -ge 8 ] 2>/dev/null; then
            IOT_RADIO=""
            if uci -q get wireless.radio0 >/dev/null; then
                IOT_RADIO="radio0"
            elif uci -q get wireless.radio1 >/dev/null; then
                IOT_RADIO="radio1"
            fi
            if [ -n "$IOT_RADIO" ]; then
                uci set wireless.wifinet_iot=wifi-iface
                uci set wireless.wifinet_iot.device="${IOT_RADIO}"
                uci set wireless.wifinet_iot.network='lan'
                uci set wireless.wifinet_iot.mode='ap'
                uci set wireless.wifinet_iot.ssid="${IOT_SSID}"
                uci set wireless.wifinet_iot.key="${IOT_PASS}"
                uci set wireless.wifinet_iot.encryption='sae-mixed'
                uci set wireless.wifinet_iot.ieee80211w='2'
                uci set wireless.wifinet_iot.hidden='1'
                uci set wireless.wifinet_iot.isolate='0'
                uci set wireless.wifinet_iot.disabled='0'
                echo "  ✓ Hidden WPA2/3-PMF IoT/Admin SSID configured (${IOT_SSID} on ${IOT_RADIO})."
            fi
        else
            echo "  ⚠️ Skipping --iot-ssid: passphrase must be at least 8 characters."
        fi
    fi

    for entry in $(uci show wireless 2>/dev/null | grep -E '\.disabled=' | cut -d'.' -f2 | cut -d'=' -f1 | sort -u); do
        uci set wireless.${entry}.disabled='0'
    done
    uci commit wireless
else
    echo "--> [Update Mode] Preserving existing Wi-Fi SSIDs, channels, and passwords without interruption."
fi

# ------------------------------------------------------------------------------
# STEP 5: CONFIGURE DEDICATED HARDENED CAPTIVE FIREWALL TABLE (piso_portal)
# ------------------------------------------------------------------------------
echo "--> Deploying hardened nftables Captive Portal Ruleset (inet piso_portal)..."

rm -f /etc/nftables.d/*piso* /etc/nftables.d/10-pisowifi.nft 2>/dev/null || true

# Build non-duplicate exempt IP set and conditional 10.0.0.1 shortcut rules.
# When RPi itself is 10.0.0.1 on a 10.0.0.0/24 LAN, clients reach 10.0.0.1 directly at Layer 2
# (no DNAT or alias needed). Otherwise, DNAT 10.0.0.1:80 to RPi's port-80 daemon proxy
# and reject 10.0.0.1:443 with TCP RST / ICMP unreachable so HTTPS-First browsers fall back to HTTP.
if [ "${RPI_IP}" = "10.0.0.1" ] || [ "${ROUTER_IP}" = "10.0.0.1" ]; then
    EXEMPT_IPS="${ROUTER_IP}, ${RPI_IP}"
else
    EXEMPT_IPS="${ROUTER_IP}, ${RPI_IP}, 10.0.0.1"
fi

if [ "${RPI_IP}" != "10.0.0.1" ]; then
    SHORTCUT_PREROUTING="        # Intercept HTTP requests directly addressed to 10.0.0.1 shortcut -> RPi :80 daemon proxy (NOT :${PORTAL_PORT})
        ip daddr 10.0.0.1 tcp dport 80 dnat ip to ${RPI_IP}:80"
    SHORTCUT_INPUT="        # Fast-reject HTTPS/QUIC to 10.0.0.1 so modern HTTPS-First browsers immediately fall back to HTTP
        ip daddr 10.0.0.1 tcp dport 443 reject with tcp reset
        ip daddr 10.0.0.1 udp dport 443 reject"
else
    SHORTCUT_PREROUTING="        # RPi owns 10.0.0.1 directly on LAN — no 10.0.0.1 DNAT needed"
    SHORTCUT_INPUT="        # RPi owns 10.0.0.1 directly on LAN — no 10.0.0.1 input reject needed"
fi

if [ "$ANTI_TETHERING" = "1" ]; then
    ANTI_TETHER_CHAIN="
    # Anti-Tethering Postrouting: Clamp downstream LAN IP TTL=1 to prevent unauthorized hotspot sharing
    chain mangle_postrouting {
        type filter hook postrouting priority mangle; policy accept;
        oifname \"br-lan\" ip ttl set 1
    }"
else
    ANTI_TETHER_CHAIN=""
fi

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

    # NAT Prerouting: Intercept port 80 HTTP & unauthorized DNS from unauthenticated devices
    chain prerouting {
        type nat hook prerouting priority -150; policy accept;

        # Allow Raspberry Pi (Paywall Server) outbound traffic without redirect
        ip saddr ${RPI_IP} accept

${SHORTCUT_PREROUTING}

        # Whitelisted VIP MACs bypass redirect
        ether saddr @piso_whitelist accept

        # Authorized MACs bypass redirect
        ether saddr @piso_auth accept

        # Allow Router Gateway management ports (restricted to RPi/VIP in input chain)
        ip daddr ${ROUTER_IP} tcp dport { 22, 80, 443 } accept

        # Force unauthorized client DNS queries to local dnsmasq (blocks external DNS tunneling)
        ip daddr != ${ROUTER_IP} udp dport 53 dnat ip to ${ROUTER_IP}:53
        ip daddr != ${ROUTER_IP} tcp dport 53 dnat ip to ${ROUTER_IP}:53

        # Redirect unauthenticated and blacklisted client HTTP (port 80) to RPi :80 daemon proxy
        ip daddr != { ${EXEMPT_IPS} } tcp dport 80 dnat ip to ${RPI_IP}:80

        # Allow client HTTP traffic addressed to RPi port 80 (daemon reverse proxy)
        ip daddr ${RPI_IP} tcp dport 80 accept

        # Allow Router Gateway other services
        ip daddr ${ROUTER_IP} accept
    }

    # NAT Postrouting: Hairpin Masquerade so redirected packets return through router
    chain postrouting {
        type nat hook postrouting priority 100; policy accept;

        # Masquerade DNAT-redirected port 80 traffic to RPi so RPi replies back via OpenWrt
        ct status dnat ip daddr ${RPI_IP} tcp dport 80 masquerade
    }${ANTI_TETHER_CHAIN}

    # Filter Input: Rate-limit DNS, restrict router management (:22, :80, :443) to RPi or @piso_whitelist
    chain input {
        type filter hook input priority -5; policy accept;

        iifname "lo" accept

        # Allow Raspberry Pi full management/DNS access to router
        iifname "br-lan" ip saddr ${RPI_IP} accept

        # Allow DHCP
        iifname "br-lan" udp dport 67-68 accept

        # Allow rate-limited ICMP echo
        iifname "br-lan" icmp type echo-request limit rate 10/second burst 20 packets accept
        iifname "br-lan" icmp type echo-request drop

        # Rate-limit DNS queries to local dnsmasq (20/s burst 40)
        iifname "br-lan" udp dport 53 limit rate 20/second burst 40 packets accept
        iifname "br-lan" udp dport 53 drop
        iifname "br-lan" tcp dport 53 limit rate 20/second burst 40 packets accept
        iifname "br-lan" tcp dport 53 drop

${SHORTCUT_INPUT}

        # Restrict router management (:22, :80, :443) strictly to RPi or VIP Whitelist (drop all guests)
        iifname "br-lan" ether saddr @piso_whitelist tcp dport { 22, 80, 443 } accept
        iifname "br-lan" tcp dport { 22, 80, 443 } drop
    }

    # Filter Forward: Enforce blacklist, block DNS tunneling & unauthorized RPi ports, require MAC auth
    chain forward {
        type filter hook forward priority -5; policy accept;

        # 1. Drop blacklisted devices FIRST (before ct state established,related!)
        ether saddr @piso_blacklist drop

        # 2. Allow RPi outbound & controlled inbound access (:80 for all, :4000 for @piso_whitelist only)
        ip saddr ${RPI_IP} accept
        ip daddr ${RPI_IP} tcp dport 80 accept
        ip daddr ${RPI_IP} tcp dport 4000 ether saddr @piso_whitelist accept
        ip daddr ${RPI_IP} tcp dport { 22, 3000, 4000 } drop
        ip daddr ${RPI_IP} ct state established,related accept

        # 3. Allow WAN return traffic only (LAN outbound must re-match @piso_whitelist or @piso_auth)
        iifname != "br-lan" ct state established,related accept

        # 4. Allow DHCP
        udp dport 67-68 accept

        # 5. Allow VIP Whitelisted and Authenticated client MACs
        ether saddr @piso_whitelist accept
        ether saddr @piso_auth accept

        # 6. Fast TCP RST for unauthorized connections, then drop everything else (incl. external port 53)
        meta l4proto tcp reject with tcp reset
        drop
    }
}
EOF

# Reload ruleset
nft delete table inet piso_portal 2>/dev/null || true
nft -f /etc/nftables.piso.nft

# ------------------------------------------------------------------------------
# STEP 6: RESTORE ACTIVE TABLES, INSTALL SERVICES & HARDEN DROPBEAR
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
    if [ "$(uci -q get network.lan_alias10.ipaddr)" = "10.0.0.1" ]; then
        ip addr add 10.0.0.1/32 dev br-lan 2>/dev/null || true
    fi
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

# Create/update OpenWrt init service for QoS (CAKE dual-dsthost/dual-srchost NAT)
cat << 'EOF' > /etc/init.d/piso-qos
#!/bin/sh /etc/rc.common
START=98
USE_PROCD=0

start() {
    if [ -f /etc/config/piso_qos ]; then
        DOWN=$(uci -q get piso_qos.settings.download_mbps || echo 0)
        UP=$(uci -q get piso_qos.settings.upload_mbps || echo 0)
        WAN_IF=$(uci -q get piso_qos.settings.wan_if || uci -q get network.wan.device || uci -q get network.wan.ifname || ip route show default 2>/dev/null | awk '{print $5}' || echo "wan")

        if [ -n "$DOWN" ] && [ "$DOWN" -gt 0 ] 2>/dev/null; then
            tc qdisc del dev br-lan root 2>/dev/null || true
            tc qdisc add dev br-lan root cake bandwidth ${DOWN}mbit besteffort dual-dsthost nat 2>/dev/null || \
            tc qdisc add dev br-lan root cake bandwidth ${DOWN}mbit 2>/dev/null || \
            tc qdisc add dev br-lan root handle 1: tbf rate ${DOWN}mbit burst 64kb latency 50ms 2>/dev/null || true
        fi

        if [ -n "$UP" ] && [ "$UP" -gt 0 ] 2>/dev/null && [ -n "$WAN_IF" ]; then
            tc qdisc del dev "$WAN_IF" root 2>/dev/null || true
            tc qdisc add dev "$WAN_IF" root cake bandwidth ${UP}mbit besteffort dual-srchost nat 2>/dev/null || \
            tc qdisc add dev "$WAN_IF" root cake bandwidth ${UP}mbit 2>/dev/null || \
            tc qdisc add dev "$WAN_IF" root handle 1: tbf rate ${UP}mbit burst 64kb latency 50ms 2>/dev/null || true
        fi
    fi
}

stop() {
    WAN_IF=$(uci -q get piso_qos.settings.wan_if || uci -q get network.wan.device || uci -q get network.wan.ifname || ip route show default 2>/dev/null | awk '{print $5}' || echo "wan")
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

# Install OpenPisoWiFi Wireless Intrusion Detection System (piso-wids)
echo "--> Installing OpenPisoWiFi WIDS (/usr/sbin/piso-wids.sh & /etc/init.d/piso-wids)..."
cat << EOF > /etc/piso-wids.conf
RPI_IP="${RPI_IP}"
DAEMON_PORT="4000"
SHIELD_SECRET="${SHIELD_SECRET}"
ANTI_TETHERING="${ANTI_TETHERING}"
SCAN_INTERVAL="45"
DEAUTH_COOLDOWN="30"
EVIL_TWIN_COOLDOWN="60"
EOF
chmod 600 /etc/piso-wids.conf

cat << 'EOF' > /usr/sbin/piso-wids.sh
#!/bin/sh
# ==============================================================================
# OpenPisoWiFi - OpenWrt Wireless Intrusion Detection System (piso-wids)
# ==============================================================================

CONF_FILE="/etc/piso-wids.conf"
SEEN_FILE="/tmp/piso-wids.seen"
ET_CACHE_FILE="/tmp/piso-wids.eviltwin"

RPI_IP="192.168.1.240"
DAEMON_PORT="4000"
SHIELD_SECRET=""
SCAN_INTERVAL="45"
DEAUTH_COOLDOWN="30"
EVIL_TWIN_COOLDOWN="60"

if [ -f "$CONF_FILE" ]; then
    . "$CONF_FILE"
fi

[ -z "$SCAN_INTERVAL" ] && SCAN_INTERVAL=45
[ -z "$DEAUTH_COOLDOWN" ] && DEAUTH_COOLDOWN=30
[ -z "$EVIL_TWIN_COOLDOWN" ] && EVIL_TWIN_COOLDOWN=60
[ -z "$DAEMON_PORT" ] && DAEMON_PORT=4000

json_escape() {
    printf '%s' "$1" | tr -d '\r\n' | sed 's/\\/\\\\/g; s/"/\\"/g'
}

post_wids_event() {
    payload="$1"
    url="http://${RPI_IP}:${DAEMON_PORT}/api/shield/wids-event"

    if command -v curl >/dev/null 2>&1; then
        curl -sS -m 3 -X POST \
            -H "Content-Type: application/json" \
            -H "X-Shield-Secret: ${SHIELD_SECRET}" \
            -d "$payload" \
            "$url" >/dev/null 2>&1 && return 0
    fi

    if command -v nc >/dev/null 2>&1; then
        len=$(printf '%s' "$payload" | wc -c | tr -dc '0-9')
        printf 'POST /api/shield/wids-event HTTP/1.0\r\nHost: %s:%s\r\nContent-Type: application/json\r\nX-Shield-Secret: %s\r\nContent-Length: %s\r\nConnection: close\r\n\r\n%s' \
            "$RPI_IP" "$DAEMON_PORT" "$SHIELD_SECRET" "$len" "$payload" | nc -w 3 "$RPI_IP" "$DAEMON_PORT" >/dev/null 2>&1 || true
    fi
}

get_ap_ifaces() {
    if command -v iw >/dev/null 2>&1; then
        iw dev 2>/dev/null | awk '
            $1 == "Interface" { iface = $2 }
            $1 == "type" && $2 == "AP" && iface != "" { print iface; iface = "" }
        '
    fi
}

get_iface_band() {
    iface="$1"
    chan=$(iw dev "$iface" info 2>/dev/null | awk '/channel / {print $2; exit}')
    if [ -n "$chan" ] && [ "$chan" -ge 36 ] 2>/dev/null; then
        echo "5GHz"
    elif [ -n "$chan" ]; then
        echo "2.4GHz"
    elif echo "$iface" | grep -Eq 'phy1|radio1|wlan1|5g'; then
        echo "5GHz"
    else
        echo "2.4GHz"
    fi
}

count_stations_total() {
    total=0
    for iface in $(get_ap_ifaces); do
        c=0
        if command -v iw >/dev/null 2>&1; then
            c=$(iw dev "$iface" station dump 2>/dev/null | grep -c '^Station ' || true)
        elif command -v iwinfo >/dev/null 2>&1; then
            c=$(iwinfo "$iface" assoclist 2>/dev/null | grep -c 'dBm' || true)
        fi
        c=$(printf '%s' "$c" | tr -dc '0-9')
        [ -z "$c" ] && c=0
        total=$((total + c))
    done
    echo "$total"
}

read_deauth_logs() {
    if command -v logread >/dev/null 2>&1; then
        logread -l 60 2>/dev/null | grep -v 'piso-wids' | grep -iE 'deauth|disassoc' | tail -n 50 || true
    fi
}

scan_evil_twins() {
    now="$1"
    our_bssids=""
    our_ssids=""
    scan_2g=""
    scan_5g=""

    for iface in $(get_ap_ifaces); do
        info=$(iw dev "$iface" info 2>/dev/null || true)
        bssid=$(printf '%s\n' "$info" | awk '/addr / {print tolower($2); exit}')
        ssid=$(printf '%s\n' "$info" | sed -n 's/^[[:space:]]*ssid //p' | head -n 1)
        [ -n "$bssid" ] && our_bssids="${our_bssids} ${bssid} "
        if [ -n "$ssid" ]; then
            case "
$our_ssids
" in
                *"
$ssid
"*) ;;
                *) our_ssids="${our_ssids}${ssid}
" ;;
            esac
        fi

        band=$(get_iface_band "$iface")
        if [ "$band" = "5GHz" ] && [ -z "$scan_5g" ]; then
            scan_5g="$iface"
        elif [ "$band" = "2.4GHz" ] && [ -z "$scan_2g" ]; then
            scan_2g="$iface"
        fi
    done

    [ -z "$our_ssids" ] && return 0

    for scan_iface in $scan_2g $scan_5g; do
        [ -z "$scan_iface" ] && continue
        band=$(get_iface_band "$scan_iface")
        scan_out=$(iw dev "$scan_iface" scan ap-force 2>/dev/null || true)
        if [ -z "$scan_out" ] && command -v iwinfo >/dev/null 2>&1; then
            scan_out=$(iwinfo "$scan_iface" scan 2>/dev/null || true)
        fi
        [ -z "$scan_out" ] && continue

        parsed=$(printf '%s\n' "$scan_out" | awk '
            /^BSS / {
                if (bssid != "" && ssid != "") print tolower(bssid) "|" ssid
                bssid = $2
                sub(/\(.*$/, "", bssid)
                ssid = ""
                next
            }
            /Cell [0-9]+ - Address:/ {
                if (bssid != "" && ssid != "") print tolower(bssid) "|" ssid
                bssid = $NF
                ssid = ""
                next
            }
            /^[[:space:]]*SSID:/ {
                sub(/^[[:space:]]*SSID:[[:space:]]*/, "", $0)
                ssid = $0
                next
            }
            /^[[:space:]]*ESSID:/ {
                sub(/^[[:space:]]*ESSID:[[:space:]]*"/, "", $0)
                sub(/"[[:space:]]*$/, "", $0)
                ssid = $0
                next
            }
            END {
                if (bssid != "" && ssid != "") print tolower(bssid) "|" ssid
            }
        ')

        printf '%s\n' "$parsed" | while IFS='|' read -r found_bssid found_ssid; do
            [ -z "$found_bssid" ] || [ -z "$found_ssid" ] && continue
            printf '%s' "$our_ssids" | grep -Fxq -- "$found_ssid" || continue

            case "$our_bssids" in
                *" ${found_bssid} "*)
                    continue
                    ;;
            esac

            last_et=0
            if [ -f "$ET_CACHE_FILE" ]; then
                last_et=$(awk -F'|' -v b="$found_bssid" '$1 == b {print $2; exit}' "$ET_CACHE_FILE" 2>/dev/null || echo 0)
            fi
            [ -z "$last_et" ] && last_et=0
            if [ $((now - last_et)) -lt "$EVIL_TWIN_COOLDOWN" ]; then
                continue
            fi

            if [ -f "$ET_CACHE_FILE" ]; then
                awk -F'|' -v b="$found_bssid" '$1 != b {print $0}' "$ET_CACHE_FILE" > "${ET_CACHE_FILE}.tmp" 2>/dev/null || true
                mv -f "${ET_CACHE_FILE}.tmp" "$ET_CACHE_FILE" 2>/dev/null || true
            fi
            printf '%s|%s\n' "$found_bssid" "$now" >> "$ET_CACHE_FILE"

            esc_ssid=$(json_escape "$found_ssid")
            esc_bssid=$(json_escape "$found_bssid")
            esc_band=$(json_escape "$band")
            msg="Evil Twin AP detected on ${esc_band}: foreign BSSID ${esc_bssid} broadcasting SSID '${esc_ssid}'"
            logger -t piso-wids -p daemon.warn "$msg" 2>/dev/null || true

            payload=$(printf '{"type":"evil_twin","severity":"high","band":"%s","ssid":"%s","bssid":"%s","message":"%s"}' \
                "$esc_band" "$esc_ssid" "$esc_bssid" "$(json_escape "$msg")")
            post_wids_event "$payload"
        done
    done
}

read_deauth_logs > "$SEEN_FILE"
rm -f "$ET_CACHE_FILE"

S1_T=0; S1_C=0
S2_T=0; S2_C=0
S3_T=0; S3_C=0
D0=0; D1=0; D2=0
LAST_DEAUTH_ALERT=0
LAST_SCAN_TIME=0

logger -t piso-wids "OpenPisoWiFi WIDS started (target=${RPI_IP}:${DAEMON_PORT}, scan_interval=${SCAN_INTERVAL}s)" 2>/dev/null || true

while true; do
    NOW=$(date +%s)

    CURR_COUNT=$(count_stations_total)
    MAX_RECENT="$CURR_COUNT"
    if [ $((NOW - S1_T)) -le 6 ] && [ "$S1_C" -gt "$MAX_RECENT" ]; then MAX_RECENT="$S1_C"; fi
    if [ $((NOW - S2_T)) -le 6 ] && [ "$S2_C" -gt "$MAX_RECENT" ]; then MAX_RECENT="$S2_C"; fi
    if [ $((NOW - S3_T)) -le 6 ] && [ "$S3_C" -gt "$MAX_RECENT" ]; then MAX_RECENT="$S3_C"; fi
    STATION_DROP=$((MAX_RECENT - CURR_COUNT))

    S3_T="$S2_T"; S3_C="$S2_C"
    S2_T="$S1_T"; S2_C="$S1_C"
    S1_T="$NOW";  S1_C="$CURR_COUNT"

    CURR_LOGS=$(read_deauth_logs)
    NEW_DEAUTH=$(printf '%s\n' "$CURR_LOGS" | awk '
        NR==FNR { if ($0 != "") seen[$0]++; next }
        { if ($0 != "") { if (seen[$0] > 0) seen[$0]--; else cnt++ } }
        END { print cnt + 0 }
    ' "$SEEN_FILE" -)
    printf '%s\n' "$CURR_LOGS" > "$SEEN_FILE"
    [ -z "$NEW_DEAUTH" ] && NEW_DEAUTH=0

    D2="$D1"
    D1="$D0"
    D0="$NEW_DEAUTH"
    DEAUTH_5S=$((D0 + D1 + D2))

    if [ "$STATION_DROP" -ge 3 ] || [ "$DEAUTH_5S" -ge 5 ]; then
        if [ $((NOW - LAST_DEAUTH_ALERT)) -ge "$DEAUTH_COOLDOWN" ]; then
            LAST_DEAUTH_ALERT="$NOW"
            EVENT_COUNT="$DEAUTH_5S"
            [ "$STATION_DROP" -gt "$EVENT_COUNT" ] && EVENT_COUNT="$STATION_DROP"
            MSG="Deauth storm detected (${STATION_DROP} station drop(s), ${DEAUTH_5S} deauth/disassoc events in 5s)"
            logger -t piso-wids -p daemon.warn "$MSG" 2>/dev/null || true
            PAYLOAD=$(printf '{"type":"deauth_storm","severity":"high","band":"2.4GHz/5GHz","count":%s,"message":"%s"}' \
                "$EVENT_COUNT" "$(json_escape "$MSG")")
            post_wids_event "$PAYLOAD"
        fi
    fi

    if [ $((NOW - LAST_SCAN_TIME)) -ge "$SCAN_INTERVAL" ]; then
        LAST_SCAN_TIME="$NOW"
        scan_evil_twins "$NOW"
    fi

    sleep 2
done
EOF
chmod +x /usr/sbin/piso-wids.sh

cat << 'EOF' > /etc/init.d/piso-wids
#!/bin/sh /etc/rc.common
START=99
USE_PROCD=1

start_service() {
    procd_open_instance
    procd_set_param command /usr/sbin/piso-wids.sh
    procd_set_param respawn 3600 5 5
    procd_set_param file /etc/piso-wids.conf
    procd_close_instance
}
EOF
chmod +x /etc/init.d/piso-wids
/etc/init.d/piso-wids enable

# Configure & Harden Dropbear SSH
mkdir -p /etc/dropbear
touch /etc/dropbear/authorized_keys
chmod 700 /etc/dropbear
chmod 600 /etc/dropbear/authorized_keys
uci set dropbear.@dropbear[0].Port='22'
if [ -s /etc/dropbear/authorized_keys ]; then
    uci set dropbear.@dropbear[0].PasswordAuth='off'
    uci set dropbear.@dropbear[0].RootPasswordAuth='off'
    echo "  ✓ Dropbear SSH hardened: key-only auth enabled (password auth disabled)."
else
    uci set dropbear.@dropbear[0].PasswordAuth='on'
    uci set dropbear.@dropbear[0].RootPasswordAuth='on'
    echo "  • Dropbear password auth temporarily active (authorized_keys empty)."
fi
uci commit dropbear

# ------------------------------------------------------------------------------
# STEP 7: RESTART RELEVANT SERVICES
# ------------------------------------------------------------------------------
echo "--> Applying changes to services..."

if [ "$MODE" = "update" ]; then
    # In update mode, only reload firewall and custom daemons to avoid dropping Wi-Fi clients
    /etc/init.d/firewall reload 2>/dev/null || /etc/init.d/firewall restart 2>/dev/null || true
    /etc/init.d/piso-firewall restart 2>/dev/null || true
    /etc/init.d/piso-qos restart 2>/dev/null || true
    /etc/init.d/piso-wids restart 2>/dev/null || true
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
    /etc/init.d/piso-wids restart 2>/dev/null || true
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
echo "• Paywall Address: http://${RPI_IP} (Daemon Proxy :80 -> :${PORTAL_PORT})"
echo "• Portal Local Domain: http://${PORTAL_DOMAIN}"
echo "• Customer Mobile Shortcut: http://10.0.0.1"
echo "=========================================================="

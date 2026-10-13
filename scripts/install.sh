#!/bin/bash
# ==============================================================================
# 📶 OpenPisoWiFi - Automated Pre-Built Installation Script
# ==============================================================================
# Target: Raspberry Pi 3B+ / 4B / 5 / Linux SBC (Raspberry Pi OS / Debian / Ubuntu)
# Features:
#   - High-Speed Pre-Built Release Installation (Zero client-side Next.js builds)
#   - Fast ~30-second setup without RAM spikes or OOM crashes
#   - Automated OpenWrt static networking & Dropbear key deployment
# ==============================================================================

set -e

# ANSI Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
PURPLE='\033[0;35m'
NC='\033[0m'

CURRENT_USER="${SUDO_USER:-$(logname 2>/dev/null || whoami)}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"

# GitHub Repository Details
GITHUB_REPO="haliknihudas666/open-piso-wifi"
RELEASE_TARBALL="piso-wifi-release.tar.gz"

CLI_TOKEN=""
CLI_PORTAL_IP=""
CLI_ROUTER_IP=""
CLI_ADMIN_PIN=""
NON_INTERACTIVE=false

while [[ $# -gt 0 ]]; do
    case "$1" in
        --token|-t)
            CLI_TOKEN="$2"
            shift 2
            ;;
        --token=*)
            CLI_TOKEN="${1#*=}"
            shift
            ;;
        --ip)
            CLI_PORTAL_IP="$2"
            shift 2
            ;;
        --router-ip)
            CLI_ROUTER_IP="$2"
            shift 2
            ;;
        --admin-pin)
            CLI_ADMIN_PIN="$2"
            shift 2
            ;;
        --non-interactive|--yes|-y)
            NON_INTERACTIVE=true
            shift
            ;;
        *)
            shift
            ;;
    esac
done

GITHUB_TOKEN="${CLI_TOKEN:-${GITHUB_TOKEN:-}}"
if [ -z "$GITHUB_TOKEN" ] && [ -f "$HOME/.github_token" ]; then
    GITHUB_TOKEN=$(cat "$HOME/.github_token" | tr -d '\r\n ')
fi

# ------------------------------------------------------------------------------
# DISCOVER EXISTING SETTINGS / DEFAULTS
# ------------------------------------------------------------------------------
DEFAULT_PORTAL_IP="192.168.1.240"
DEFAULT_ROUTER_IP="192.168.1.1"
DEFAULT_PORTAL_DOMAIN="wifi.local"
DEFAULT_PORTAL_PORT="3000"
DEFAULT_ADMIN_PIN="1234"
DEFAULT_DAEMON_PORT="4000"
DEFAULT_SSH_USER="root"
DEFAULT_SSH_PORT="22"
DEFAULT_ROUTER_MODE="fw4_nftables"
DEFAULT_COIN_PIN="4"

PORTAL_DIR="$ROOT_DIR/portal"
[ ! -d "$PORTAL_DIR" ] && [ -d "$ROOT_DIR/pisowifi-portal" ] && PORTAL_DIR="$ROOT_DIR/pisowifi-portal"
DAEMON_DIR="$ROOT_DIR/daemon"
[ ! -d "$DAEMON_DIR" ] && [ -d "$ROOT_DIR/pisowifi-daemon" ] && DAEMON_DIR="$ROOT_DIR/pisowifi-daemon"

if [ -f "$PORTAL_DIR/.env" ]; then
    VAL=$(grep -E '^PORTAL_IP=' "$PORTAL_DIR/.env" | cut -d'=' -f2- | tr -d '"' | tr -d "'" || true)
    [ -n "$VAL" ] && DEFAULT_PORTAL_IP="$VAL"
    VAL=$(grep -E '^ROUTER_IP=' "$PORTAL_DIR/.env" | cut -d'=' -f2- | tr -d '"' | tr -d "'" || true)
    [ -n "$VAL" ] && DEFAULT_ROUTER_IP="$VAL"
    VAL=$(grep -E '^PORTAL_DOMAIN=' "$PORTAL_DIR/.env" | cut -d'=' -f2- | tr -d '"' | tr -d "'" || true)
    [ -n "$VAL" ] && DEFAULT_PORTAL_DOMAIN="$VAL"
    VAL=$(grep -E '^PORTAL_PORT=' "$PORTAL_DIR/.env" | cut -d'=' -f2- | tr -d '"' | tr -d "'" || true)
    [ -n "$VAL" ] && DEFAULT_PORTAL_PORT="$VAL"
    VAL=$(grep -E '^ADMIN_PIN=' "$PORTAL_DIR/.env" | cut -d'=' -f2- | tr -d '"' | tr -d "'" || true)
    [ -n "$VAL" ] && DEFAULT_ADMIN_PIN="$VAL"
    VAL=$(grep -E '^GITHUB_TOKEN=' "$PORTAL_DIR/.env" | cut -d'=' -f2- | tr -d '"' | tr -d "'" || true)
    [ -n "$VAL" ] && [ -z "$GITHUB_TOKEN" ] && GITHUB_TOKEN="$VAL"
elif [ -f "$ROOT_DIR/pisowifi-portal/.env" ]; then
    VAL=$(grep -E '^PORTAL_IP=' "$ROOT_DIR/pisowifi-portal/.env" | cut -d'=' -f2- | tr -d '"' | tr -d "'" || true)
    [ -n "$VAL" ] && DEFAULT_PORTAL_IP="$VAL"
    VAL=$(grep -E '^ROUTER_IP=' "$ROOT_DIR/pisowifi-portal/.env" | cut -d'=' -f2- | tr -d '"' | tr -d "'" || true)
    [ -n "$VAL" ] && DEFAULT_ROUTER_IP="$VAL"
    VAL=$(grep -E '^PORTAL_DOMAIN=' "$ROOT_DIR/pisowifi-portal/.env" | cut -d'=' -f2- | tr -d '"' | tr -d "'" || true)
    [ -n "$VAL" ] && DEFAULT_PORTAL_DOMAIN="$VAL"
    VAL=$(grep -E '^PORTAL_PORT=' "$ROOT_DIR/pisowifi-portal/.env" | cut -d'=' -f2- | tr -d '"' | tr -d "'" || true)
    [ -n "$VAL" ] && DEFAULT_PORTAL_PORT="$VAL"
    VAL=$(grep -E '^ADMIN_PIN=' "$ROOT_DIR/pisowifi-portal/.env" | cut -d'=' -f2- | tr -d '"' | tr -d "'" || true)
    [ -n "$VAL" ] && DEFAULT_ADMIN_PIN="$VAL"
    VAL=$(grep -E '^GITHUB_TOKEN=' "$ROOT_DIR/pisowifi-portal/.env" | cut -d'=' -f2- | tr -d '"' | tr -d "'" || true)
    [ -n "$VAL" ] && [ -z "$GITHUB_TOKEN" ] && GITHUB_TOKEN="$VAL"
fi

if [ -f "$DAEMON_DIR/.env" ]; then
    VAL=$(grep -E '^PORT=' "$DAEMON_DIR/.env" | cut -d'=' -f2- | tr -d '"' | tr -d "'" || true)
    [ -n "$VAL" ] && DEFAULT_DAEMON_PORT="$VAL"
    VAL=$(grep -E '^ROUTER_SSH_USER=' "$DAEMON_DIR/.env" | cut -d'=' -f2- | tr -d '"' | tr -d "'" || true)
    [ -n "$VAL" ] && DEFAULT_SSH_USER="$VAL"
    VAL=$(grep -E '^ROUTER_SSH_PORT=' "$DAEMON_DIR/.env" | cut -d'=' -f2- | tr -d '"' | tr -d "'" || true)
    [ -n "$VAL" ] && DEFAULT_SSH_PORT="$VAL"
    VAL=$(grep -E '^ROUTER_MODE=' "$DAEMON_DIR/.env" | cut -d'=' -f2- | tr -d '"' | tr -d "'" || true)
    [ -n "$VAL" ] && DEFAULT_ROUTER_MODE="$VAL"
    VAL=$(grep -E '^COIN_GPIO_PIN=' "$DAEMON_DIR/.env" | cut -d'=' -f2- | tr -d '"' | tr -d "'" || true)
    [ -n "$VAL" ] && DEFAULT_COIN_PIN="$VAL"
elif [ -f "$ROOT_DIR/pisowifi-daemon/.env" ]; then
    VAL=$(grep -E '^PORT=' "$ROOT_DIR/pisowifi-daemon/.env" | cut -d'=' -f2- | tr -d '"' | tr -d "'" || true)
    [ -n "$VAL" ] && DEFAULT_DAEMON_PORT="$VAL"
    VAL=$(grep -E '^ROUTER_SSH_USER=' "$ROOT_DIR/pisowifi-daemon/.env" | cut -d'=' -f2- | tr -d '"' | tr -d "'" || true)
    [ -n "$VAL" ] && DEFAULT_SSH_USER="$VAL"
    VAL=$(grep -E '^ROUTER_SSH_PORT=' "$ROOT_DIR/pisowifi-daemon/.env" | cut -d'=' -f2- | tr -d '"' | tr -d "'" || true)
    [ -n "$VAL" ] && DEFAULT_SSH_PORT="$VAL"
    VAL=$(grep -E '^ROUTER_MODE=' "$ROOT_DIR/pisowifi-daemon/.env" | cut -d'=' -f2- | tr -d '"' | tr -d "'" || true)
    [ -n "$VAL" ] && DEFAULT_ROUTER_MODE="$VAL"
    VAL=$(grep -E '^COIN_GPIO_PIN=' "$ROOT_DIR/pisowifi-daemon/.env" | cut -d'=' -f2- | tr -d '"' | tr -d "'" || true)
    [ -n "$VAL" ] && DEFAULT_COIN_PIN="$VAL"
fi

[ -n "$CLI_PORTAL_IP" ] && DEFAULT_PORTAL_IP="$CLI_PORTAL_IP"
[ -n "$CLI_ROUTER_IP" ] && DEFAULT_ROUTER_IP="$CLI_ROUTER_IP"
[ -n "$CLI_ADMIN_PIN" ] && DEFAULT_ADMIN_PIN="$CLI_ADMIN_PIN"

echo -e "${CYAN}==============================================================${NC}"
echo -e "${GREEN}🚀 Starting OpenPisoWiFi Fast Automated Installation...${NC}"
echo -e "${CYAN}==============================================================${NC}"
echo -e "• User:              ${YELLOW}${CURRENT_USER}${NC}"
echo -e "• Install Directory: ${YELLOW}${ROOT_DIR}${NC}"
echo ""

PORTAL_IP="$DEFAULT_PORTAL_IP"
ROUTER_IP="$DEFAULT_ROUTER_IP"
PORTAL_DOMAIN="$DEFAULT_PORTAL_DOMAIN"
PORTAL_PORT="$DEFAULT_PORTAL_PORT"
ADMIN_PIN="$DEFAULT_ADMIN_PIN"
DAEMON_PORT="$DEFAULT_DAEMON_PORT"
ROUTER_SSH_USER="$DEFAULT_SSH_USER"
ROUTER_SSH_PORT="$DEFAULT_SSH_PORT"
ROUTER_MODE="$DEFAULT_ROUTER_MODE"
COIN_GPIO_PIN="$DEFAULT_COIN_PIN"

# ------------------------------------------------------------------------------
# INTERACTIVE QUESTIONNAIRE (ENV SETUP)
# ------------------------------------------------------------------------------
if [ -t 0 ] && [ "$NON_INTERACTIVE" != true ]; then
    echo -e "${CYAN}--------------------------------------------------------------${NC}"
    echo -e "${GREEN}⚙️  First-Time Setup: Environment & Hardware Configuration${NC}"
    echo -e "${CYAN}--------------------------------------------------------------${NC}"
    echo -e "Please configure your system parameters."
    echo -e "Press [Enter] on any prompt to accept the default in brackets.\n"

    # Section A: Network & Router
    echo -e "${PURPLE}[A] Network & Router Settings${NC}"
    echo -e "  💡 Tip: Router IP remains untouched (192.168.1.1). Portal address is 192.168.1.240 (accessible via wifi.local or 10.0.0.1)."
    read -r -p "  • OpenWrt Router Gateway IP  [$DEFAULT_ROUTER_IP]: " INPUT_ROUTER_IP
    ROUTER_IP="${INPUT_ROUTER_IP:-$DEFAULT_ROUTER_IP}"

    read -r -p "  • Raspberry Pi Static LAN IP [$DEFAULT_PORTAL_IP]: " INPUT_PORTAL_IP
    PORTAL_IP="${INPUT_PORTAL_IP:-$DEFAULT_PORTAL_IP}"

    read -r -p "  • Local Portal Domain Name   [$DEFAULT_PORTAL_DOMAIN]: " INPUT_PORTAL_DOMAIN
    PORTAL_DOMAIN="${INPUT_PORTAL_DOMAIN:-$DEFAULT_PORTAL_DOMAIN}"

    # Section B: Web Portal & Admin
    echo ""
    echo -e "${PURPLE}[B] Web Portal & Captive Paywall Settings${NC}"
    read -r -p "  • Captive Portal HTTP Port   [$DEFAULT_PORTAL_PORT]: " INPUT_PORTAL_PORT
    PORTAL_PORT="${INPUT_PORTAL_PORT:-$DEFAULT_PORTAL_PORT}"

    read -r -p "  • Admin Dashboard PIN        [$DEFAULT_ADMIN_PIN]: " INPUT_ADMIN_PIN
    ADMIN_PIN="${INPUT_ADMIN_PIN:-$DEFAULT_ADMIN_PIN}"

    if [ -z "$GITHUB_TOKEN" ]; then
        echo -e "  • GitHub Personal Access Token (for OTA updates on private repo):"
        read -r -s -p "    Enter Token (press Enter to skip): " INPUT_TOKEN
        echo ""
        GITHUB_TOKEN="${INPUT_TOKEN:-}"
    else
        echo -e "  • GitHub Token:              ${GREEN}Detected (${GITHUB_TOKEN:0:6}...)${NC}"
    fi

    # Section C: Hardware Daemon & Coin Acceptor
    echo ""
    echo -e "${PURPLE}[C] Hardware Daemon & Coin Acceptor Settings${NC}"
    read -r -p "  • Daemon Internal Port       [$DEFAULT_DAEMON_PORT]: " INPUT_DAEMON_PORT
    DAEMON_PORT="${INPUT_DAEMON_PORT:-$DEFAULT_DAEMON_PORT}"

    read -r -p "  • Coin Slot Physical GPIO    [$DEFAULT_COIN_PIN]: " INPUT_COIN_PIN
    COIN_GPIO_PIN="${INPUT_COIN_PIN:-$DEFAULT_COIN_PIN}"

    read -r -p "  • OpenWrt SSH User           [$DEFAULT_SSH_USER]: " INPUT_SSH_USER
    ROUTER_SSH_USER="${INPUT_SSH_USER:-$DEFAULT_SSH_USER}"

    read -r -p "  • OpenWrt SSH Port           [$DEFAULT_SSH_PORT]: " INPUT_SSH_PORT
    ROUTER_SSH_PORT="${INPUT_SSH_PORT:-$DEFAULT_SSH_PORT}"

    read -r -p "  • Router Firewall Mode (fw4_nftables/fw3_iptables) [$DEFAULT_ROUTER_MODE]: " INPUT_ROUTER_MODE
    ROUTER_MODE="${INPUT_ROUTER_MODE:-$DEFAULT_ROUTER_MODE}"

    echo ""
    echo -e "${CYAN}--------------------------------------------------------------${NC}"
    echo -e "${GREEN}✓ Configuration saved for installation.${NC}"
    echo -e "${CYAN}--------------------------------------------------------------${NC}"
    echo ""
fi

echo -e "• Raspberry Pi LAN IP: ${YELLOW}${PORTAL_IP}:${PORTAL_PORT}${NC}"
echo -e "• OpenWrt Router:      ${YELLOW}${ROUTER_SSH_USER}@${ROUTER_IP}:${ROUTER_SSH_PORT} (${ROUTER_MODE})${NC}"
echo -e "• Admin Security PIN:  ${YELLOW}${ADMIN_PIN}${NC}"
echo -e "• Coin Slot GPIO:      ${YELLOW}GPIO ${COIN_GPIO_PIN}${NC}"
echo -e "• Daemon Port:         ${YELLOW}${DAEMON_PORT}${NC}"
echo ""

# ------------------------------------------------------------------------------
# STEP 1: SYSTEM PACKAGES & RUNTIME DEPENDENCIES
# ------------------------------------------------------------------------------
echo -e "${PURPLE}[1/6] Installing minimal system runtime packages...${NC}"
sudo apt-get update -y
sudo DEBIAN_FRONTEND=noninteractive apt-get install -y curl tar sqlite3 openssh-client iptables-persistent netfilter-persistent build-essential python3 python3-gpiozero python3-lgpio gpiod

# Check Node.js version (Requires Node.js 20+)
NEED_NODE_INSTALL=false
if ! command -v node >/dev/null 2>&1; then
    NEED_NODE_INSTALL=true
else
    NODE_MAJOR=$(node -v | cut -d'.' -f1 | sed 's/v//')
    if [ "$NODE_MAJOR" -lt 20 ]; then
        echo -e "${YELLOW}Existing Node.js ($NODE_MAJOR) is older than recommended Node 20 LTS.${NC}"
        NEED_NODE_INSTALL=true
    fi
fi

if [ "$NEED_NODE_INSTALL" = true ]; then
    echo -e "${CYAN}--> Installing Node.js 20 LTS (NodeSource)...${NC}"
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    sudo apt-get install -y nodejs
fi

echo -e "${GREEN}✓ Node.js $(node -v) & npm $(npm -v) verified.${NC}"

# ------------------------------------------------------------------------------
# STEP 2: CONFIGURE STATIC IP ($PORTAL_IP)
# ------------------------------------------------------------------------------
echo ""
echo -e "${PURPLE}[2/6] Configuring Static LAN IP (${PORTAL_IP})...${NC}"

if command -v nmcli >/dev/null 2>&1 && systemctl is-active --quiet NetworkManager; then
    ETH_CONN=$(nmcli -t -f NAME,TYPE connection show | grep ':802-3-ethernet' | head -n1 | cut -d':' -f1 || echo "")
    if [ -n "$ETH_CONN" ]; then
        echo -e "--> Setting static IP on NetworkManager connection: ${ETH_CONN}"
        sudo nmcli connection modify "$ETH_CONN" \
            ipv4.addresses ${PORTAL_IP}/24 \
            ipv4.gateway ${ROUTER_IP} \
            ipv4.dns "1.1.1.1 8.8.8.8" \
            ipv4.method manual || true
        sudo nmcli connection up "$ETH_CONN" || true
    fi
elif [ -f /etc/dhcpcd.conf ]; then
    echo -e "--> Adding static IP configuration to /etc/dhcpcd.conf"
    if ! grep -q "${PORTAL_IP}" /etc/dhcpcd.conf; then
        sudo tee -a /etc/dhcpcd.conf > /dev/null << EOF

# OpenPisoWifi Static IP Configuration
interface eth0
static ip_address=${PORTAL_IP}/24
static routers=${ROUTER_IP}
static domain_name_servers=1.1.1.1 8.8.8.8
EOF
        sudo systemctl restart dhcpcd || true
    fi
fi
echo -e "${GREEN}✓ Static IP verified: ${PORTAL_IP}/24 (Gateway: ${ROUTER_IP}).${NC}"

# ------------------------------------------------------------------------------
# STEP 3: FETCH PRE-BUILT RELEASE BUNDLE (Zero Client-Side Build)
# ------------------------------------------------------------------------------
echo ""
echo -e "${PURPLE}[3/6] Fetching pre-built software bundle...${NC}"

# Check if standalone portal and daemon dist already exist (e.g. offline build or cloned release)
ALREADY_EXTRACTED=false
if [ -f "$ROOT_DIR/pisowifi-portal/server.js" ] && [ -f "$ROOT_DIR/pisowifi-daemon/dist/index.js" ]; then
    ALREADY_EXTRACTED=true
    echo -e "${GREEN}✓ Pre-built portal and daemon already present in install directory.${NC}"
fi

if [ "$ALREADY_EXTRACTED" = false ]; then
    TEMP_TARBALL="/tmp/${RELEASE_TARBALL}"
    rm -f "$TEMP_TARBALL"

    # Check for local tarball in dist/ first
    if [ -f "$ROOT_DIR/dist/${RELEASE_TARBALL}" ]; then
        echo -e "--> Using local release package: $ROOT_DIR/dist/${RELEASE_TARBALL}"
        cp "$ROOT_DIR/dist/${RELEASE_TARBALL}" "$TEMP_TARBALL"
    else
        DOWNLOAD_SUCCESS=false
        API_URL="https://api.github.com/repos/${GITHUB_REPO}/releases/latest"
        ASSET_ID=""

        fetch_api() {
            local token="$1"
            local auth_header=()
            [ -n "$token" ] && auth_header=(-H "Authorization: Bearer $token")
            curl -sSL -w "\n%{http_code}" -m 10 "${auth_header[@]}" \
                 -H "Accept: application/vnd.github.v3+json" \
                 "$API_URL" 2>/dev/null || echo ""
        }

        RES=$(fetch_api "$GITHUB_TOKEN")
        HTTP_CODE=$(echo "$RES" | tail -n1)
        JSON=$(echo "$RES" | sed '$d')

        if [ "$HTTP_CODE" = "404" ] || [ "$HTTP_CODE" = "401" ]; then
            if [ -t 0 ] && [ -z "$GITHUB_TOKEN" ]; then
                echo -e "${YELLOW}🔒 Repository appears private or requires authentication.${NC}"
                echo -e "${CYAN}Please enter your GitHub Personal Access Token (PAT) with 'repo' scope:${NC}"
                read -r -s -p "GitHub Token: " GITHUB_TOKEN
                echo ""
                if [ -n "$GITHUB_TOKEN" ]; then
                    RES=$(fetch_api "$GITHUB_TOKEN")
                    HTTP_CODE=$(echo "$RES" | tail -n1)
                    JSON=$(echo "$RES" | sed '$d')
                fi
            fi
        fi

        if [ -n "$JSON" ]; then
            if command -v node >/dev/null 2>&1; then
                ASSET_ID=$(echo "$JSON" | node -e '
                    let d=""; process.stdin.on("data", c=>d+=c); process.stdin.on("end", ()=>{
                        try {
                            const j=JSON.parse(d);
                            const a=j.assets?.find(x=>x.name===process.argv[1]);
                            if(a?.id) console.log(a.id);
                        } catch(e){}
                    });
                ' "$RELEASE_TARBALL" 2>/dev/null || echo "")
            fi
            if [ -z "$ASSET_ID" ]; then
                ASSET_ID=$(echo "$JSON" | awk -v name="$RELEASE_TARBALL" '
                    /"id":/ { id=$2; gsub(/[^0-9]/, "", id) }
                    $0 ~ name { if (id != "") { print id; exit } }
                ')
            fi
        fi

        # Authenticated asset download
        if [ -n "$ASSET_ID" ] && [ -n "$GITHUB_TOKEN" ]; then
            echo -e "--> Downloading pre-compiled bundle (${ASSET_ID}) via GitHub API..."
            if curl -fSL --progress-bar \
                 -H "Authorization: Bearer $GITHUB_TOKEN" \
                 -H "Accept: application/octet-stream" \
                 "https://api.github.com/repos/${GITHUB_REPO}/releases/assets/${ASSET_ID}" \
                 -o "$TEMP_TARBALL"; then
                DOWNLOAD_SUCCESS=true
            fi
        fi

        # Public direct fallback
        if [ "$DOWNLOAD_SUCCESS" = false ]; then
            echo -e "--> Attempting direct download from GitHub Releases..."
            if curl -fSL --progress-bar "https://github.com/${GITHUB_REPO}/releases/latest/download/${RELEASE_TARBALL}" -o "$TEMP_TARBALL" 2>/dev/null; then
                DOWNLOAD_SUCCESS=true
            fi
        fi

        if [ "$DOWNLOAD_SUCCESS" = false ]; then
            echo -e "${RED}Error: Could not download ${RELEASE_TARBALL}.${NC}"
            echo -e "${RED}If this repository is private, please re-run installer with --token <YOUR_GITHUB_PAT>${NC}"
            exit 1
        fi
    fi

    echo -e "--> Extracting release files into ${ROOT_DIR}..."
    tar -xzf "$TEMP_TARBALL" -C "$ROOT_DIR"
    rm -f "$TEMP_TARBALL"
    echo -e "${GREEN}✓ Pre-built software bundle extracted successfully.${NC}"
fi

# ------------------------------------------------------------------------------
# STEP 4: ENVIRONMENT & DATABASE INITIALIZATION
# ------------------------------------------------------------------------------
echo ""
echo -e "${PURPLE}[4/6] Configuring environment & initializing SQLite database...${NC}"

# Write Portal .env
mkdir -p "$PORTAL_DIR"
echo -e "--> Writing portal/.env configuration..."
cat << EOF > "$PORTAL_DIR/.env"
# OpenPisoWiFi - Web Portal Environment Configuration
DATABASE_URL="file:./dev.db"
PORTAL_DOMAIN="${PORTAL_DOMAIN}"
PORTAL_IP="${PORTAL_IP}"
PORTAL_PORT="${PORTAL_PORT}"
ROUTER_IP="${ROUTER_IP}"
DAEMON_URL="http://127.0.0.1:${DAEMON_PORT}"
ADMIN_PIN="${ADMIN_PIN}"
GITHUB_TOKEN="${GITHUB_TOKEN}"
EOF

# Write Daemon .env
mkdir -p "$DAEMON_DIR"
echo -e "--> Writing daemon/.env configuration..."
cat << EOF > "$DAEMON_DIR/.env"
# OpenPisoWiFi - Hardware Daemon Environment Configuration
PORT=${DAEMON_PORT}
PORTAL_PORT=${PORTAL_PORT}
PORTAL_DOMAIN="${PORTAL_DOMAIN}"
PORTAL_IP="${PORTAL_IP}"
ROUTER_IP=${ROUTER_IP}
ROUTER_SSH_PORT=${ROUTER_SSH_PORT}
ROUTER_SSH_USER=${ROUTER_SSH_USER}
ROUTER_SSH_KEY_PATH=/root/.ssh/id_rsa
ROUTER_MODE=${ROUTER_MODE}
COIN_GPIO_PIN=${COIN_GPIO_PIN}
EOF

if [ -n "$GITHUB_TOKEN" ]; then
    echo "$GITHUB_TOKEN" > "$HOME/.github_token" 2>/dev/null || true
fi

# Initialize database from pre-seeded template if dev.db doesn't exist
mkdir -p "$PORTAL_DIR/prisma"
if [ ! -f "$PORTAL_DIR/prisma/dev.db" ]; then
    if [ -f "$PORTAL_DIR/prisma/dev.db.template" ]; then
        echo -e "--> Initializing database from clean pre-seeded template..."
        cp "$PORTAL_DIR/prisma/dev.db.template" "$PORTAL_DIR/prisma/dev.db"
    elif [ -f "$PORTAL_DIR/dev.db.template" ]; then
        cp "$PORTAL_DIR/dev.db.template" "$PORTAL_DIR/prisma/dev.db"
    else
        echo -e "--> Initializing SQLite schema..."
        touch "$PORTAL_DIR/prisma/dev.db"
    fi
fi

# Ensure correct ownership and read/write permissions for web portal and SQLite
sudo chown -R ${CURRENT_USER}:${CURRENT_USER} "$PORTAL_DIR"
sudo chmod 777 "$PORTAL_DIR/prisma" 2>/dev/null || true
sudo chmod 666 "$PORTAL_DIR/prisma/dev.db"* 2>/dev/null || true

# Install minimal production daemon dependencies (only 3 packages for hardware GPIO & SSH)
echo -e "--> Verifying Hardware Daemon production dependencies..."
npm install --omit=dev --loglevel=error
npm rebuild epoll --build-from-source 2>/dev/null || true

echo -e "${GREEN}✓ Environment & SQLite database configured.${NC}"

# ------------------------------------------------------------------------------
# STEP 5: SETUP SSH KEYS FOR OPENWRT ROUTER
# ------------------------------------------------------------------------------
echo ""
echo -e "${PURPLE}[5/6] Ensuring SSH keys for OpenWrt Router control...${NC}"

sudo mkdir -p /root/.ssh
sudo chmod 700 /root/.ssh
if sudo test -f /root/.ssh/id_rsa; then
    echo -e "${GREEN}✓ Root SSH Key already present at /root/.ssh/id_rsa.${NC}"
else
    echo -e "--> Generating Root SSH Key for OpenWrt communication..."
    sudo ssh-keygen -t rsa -b 2048 -f /root/.ssh/id_rsa -N "" -C "hudas-pisowifi-daemon" || true
    echo -e "${GREEN}✓ Root SSH Key verified at /root/.ssh/id_rsa.${NC}"
fi

if [ "$CURRENT_USER" != "root" ]; then
    mkdir -p "$HOME/.ssh"
    chmod 700 "$HOME/.ssh"
    if [ -f "$HOME/.ssh/id_rsa" ]; then
        echo -e "${GREEN}✓ User SSH Key already present at $HOME/.ssh/id_rsa.${NC}"
    else
        echo -e "--> Generating User SSH Key..."
        ssh-keygen -t rsa -b 2048 -f "$HOME/.ssh/id_rsa" -N "" -C "hudas-pisowifi-user" || true
        echo -e "${GREEN}✓ User SSH Key verified at $HOME/.ssh/id_rsa.${NC}"
    fi
fi

# ------------------------------------------------------------------------------
# STEP 6: CONFIGURE SUDOERS & BACKGROUND SYSTEMD SERVICES
# ------------------------------------------------------------------------------
echo ""
echo -e "${PURPLE}[6/6] Configuring background systemd services & permissions...${NC}"

# Passwordless sudo for service manager and updater
sudo mkdir -p /etc/sudoers.d
sudo tee /etc/sudoers.d/hudas-pisowifi > /dev/null << EOF
# OpenPisoWifi permissions for service management & OTA updates
${CURRENT_USER} ALL=(ALL) NOPASSWD: /bin/systemctl, /usr/bin/systemctl, /bin/systemd-run, /usr/bin/systemd-run, /sbin/iptables, /usr/sbin/iptables, /bin/chown, /usr/bin/chown, /bin/chmod, /usr/bin/chmod, /bin/true, /usr/bin/true, /bin/sed, /usr/bin/sed, /sbin/reboot, /usr/sbin/reboot, /bin/reboot, /usr/bin/reboot, ${ROOT_DIR}/scripts/update.sh, /bin/bash ${ROOT_DIR}/scripts/update.sh, /usr/bin/bash ${ROOT_DIR}/scripts/update.sh
EOF
sudo chmod 0440 /etc/sudoers.d/hudas-pisowifi

# 1. Daemon Service (Runs bundled JavaScript directly with Node.js and EnvironmentFile)
sudo tee /etc/systemd/system/pisowifi-daemon.service > /dev/null << EOF
[Unit]
Description=OpenPisoWiFi Hardware Daemon & Router Controller
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=${DAEMON_DIR}
EnvironmentFile=-${DAEMON_DIR}/.env
ExecStartPre=-/sbin/iptables -t nat -C PREROUTING -p tcp --dport 80 -j REDIRECT --to-port ${PORTAL_PORT}
ExecStartPre=-/sbin/iptables -t nat -A PREROUTING -p tcp --dport 80 -j REDIRECT --to-port ${PORTAL_PORT}
ExecStartPre=-/sbin/iptables -t nat -C OUTPUT -p tcp -o lo --dport 80 -j REDIRECT --to-port ${PORTAL_PORT}
ExecStartPre=-/sbin/iptables -t nat -A OUTPUT -p tcp -o lo --dport 80 -j REDIRECT --to-port ${PORTAL_PORT}
ExecStart=/usr/bin/node dist/index.js
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF

# 2. Portal Service (Runs Next.js Standalone server.js directly with Node.js and EnvironmentFile)
sudo tee /etc/systemd/system/pisowifi-portal.service > /dev/null << EOF
[Unit]
Description=OpenPisoWiFi Next.js Captive Portal
After=network.target

[Service]
Type=simple
User=${CURRENT_USER}
WorkingDirectory=${PORTAL_DIR}
EnvironmentFile=-${PORTAL_DIR}/.env
ExecStart=/usr/bin/node server.js
Restart=always
RestartSec=3
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
EOF

# Port 80 to Portal Port redirection on Raspberry Pi
sudo iptables -t nat -C PREROUTING -p tcp --dport 80 -j REDIRECT --to-port ${PORTAL_PORT} 2>/dev/null || sudo iptables -t nat -A PREROUTING -p tcp --dport 80 -j REDIRECT --to-port ${PORTAL_PORT} || true
sudo iptables -t nat -C OUTPUT -p tcp -o lo --dport 80 -j REDIRECT --to-port ${PORTAL_PORT} 2>/dev/null || sudo iptables -t nat -A OUTPUT -p tcp -o lo --dport 80 -j REDIRECT --to-port ${PORTAL_PORT} || true

if command -v netfilter-persistent >/dev/null 2>&1; then
    sudo netfilter-persistent save 2>/dev/null || true
    sudo systemctl enable netfilter-persistent 2>/dev/null || true
fi

# Reload and enable services
sudo systemctl daemon-reload
sudo systemctl enable --now pisowifi-daemon.service
sudo systemctl enable --now pisowifi-portal.service

sleep 2
DAEMON_STATUS=$(systemctl is-active pisowifi-daemon.service 2>/dev/null || echo "inactive")
PORTAL_STATUS=$(systemctl is-active pisowifi-portal.service 2>/dev/null || echo "inactive")

echo ""
echo -e "${CYAN}==============================================================${NC}"
echo -e "${GREEN}🎉 OpenPisoWifi Installation Completed Successfully!${NC}"
echo -e "${CYAN}==============================================================${NC}"
echo -e "• Hardware Daemon Service: [ ${GREEN}${DAEMON_STATUS}${NC} ] (Port ${DAEMON_PORT})"
echo -e "• Web Portal Service:      [ ${GREEN}${PORTAL_STATUS}${NC} ] (Port ${PORTAL_PORT})"
echo ""
echo -e "🌐 Access URLs:"
echo -e "  • Local Domain:     ${CYAN}http://${PORTAL_DOMAIN}/${NC}"
echo -e "  • Mobile Shortcut:  ${CYAN}http://10.0.0.1/${NC} (Fast mobile typing)"
echo -e "  • Direct IP Portal: ${CYAN}http://${PORTAL_IP}:${PORTAL_PORT}/${NC}"
echo -e "  • Admin Dashboard:  ${CYAN}http://${PORTAL_DOMAIN}/admin${NC} (PIN: ${YELLOW}${ADMIN_PIN}${NC})"
echo ""
echo -e "📡 Router Deployment Next Step:"
echo -e "  Run the following command to deploy and configure your OpenWrt router:"
echo -e "  ${YELLOW}bash ${ROOT_DIR}/scripts/deploy-router.sh --fresh${NC}"
echo -e "${CYAN}==============================================================${NC}"

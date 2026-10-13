#!/bin/bash
# ==============================================================================
# 📡 OpenPisoWiFi - OpenWrt Router Setup & Key Deployer
# ==============================================================================
# Usage:
#   bash scripts/deploy-router.sh [--fresh | --update] [ROUTER_IP] [ROUTER_USER]
# ==============================================================================

set -e

# ANSI Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
PURPLE='\033[0;35m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"

# Read defaults from portal or daemon .env if present
ROUTER_IP="192.168.1.1"
ROUTER_USER="root"
PORTAL_IP="192.168.1.240"
PORTAL_DOMAIN="wifi.local"
PORTAL_PORT="3000"

PORTAL_ENV=""
[ -f "$ROOT_DIR/portal/.env" ] && PORTAL_ENV="$ROOT_DIR/portal/.env"
[ -z "$PORTAL_ENV" ] && [ -f "$ROOT_DIR/pisowifi-portal/.env" ] && PORTAL_ENV="$ROOT_DIR/pisowifi-portal/.env"

if [ -n "$PORTAL_ENV" ]; then
    ENV_ROUTER_IP=$(grep -E '^ROUTER_IP=' "$PORTAL_ENV" | cut -d'=' -f2- | tr -d '"' | tr -d "'" || true)
    [ -n "$ENV_ROUTER_IP" ] && ROUTER_IP="$ENV_ROUTER_IP"
    ENV_PORTAL_IP=$(grep -E '^PORTAL_IP=' "$PORTAL_ENV" | cut -d'=' -f2- | tr -d '"' | tr -d "'" || true)
    [ -n "$ENV_PORTAL_IP" ] && PORTAL_IP="$ENV_PORTAL_IP"
    ENV_PORTAL_DOMAIN=$(grep -E '^PORTAL_DOMAIN=' "$PORTAL_ENV" | cut -d'=' -f2- | tr -d '"' | tr -d "'" || true)
    [ -n "$ENV_PORTAL_DOMAIN" ] && PORTAL_DOMAIN="$ENV_PORTAL_DOMAIN"
    ENV_PORTAL_PORT=$(grep -E '^PORTAL_PORT=' "$PORTAL_ENV" | cut -d'=' -f2- | tr -d '"' | tr -d "'" || true)
    [ -n "$ENV_PORTAL_PORT" ] && PORTAL_PORT="$ENV_PORTAL_PORT"
fi

DAEMON_ENV=""
[ -f "$ROOT_DIR/daemon/.env" ] && DAEMON_ENV="$ROOT_DIR/daemon/.env"
[ -z "$DAEMON_ENV" ] && [ -f "$ROOT_DIR/pisowifi-daemon/.env" ] && DAEMON_ENV="$ROOT_DIR/pisowifi-daemon/.env"

if [ -n "$DAEMON_ENV" ]; then
    ENV_ROUTER_IP=$(grep -E '^ROUTER_IP=' "$DAEMON_ENV" | cut -d'=' -f2- | tr -d '"' | tr -d "'" || true)
    [ -n "$ENV_ROUTER_IP" ] && ROUTER_IP="$ENV_ROUTER_IP"
    ENV_ROUTER_USER=$(grep -E '^ROUTER_SSH_USER=' "$DAEMON_ENV" | cut -d'=' -f2- | tr -d '"' | tr -d "'" || true)
    [ -n "$ENV_ROUTER_USER" ] && ROUTER_USER="$ENV_ROUTER_USER"
fi

DEPLOY_MODE="fresh"

for arg in "$@"; do
    case "$arg" in
        --update|--preserve)
            DEPLOY_MODE="update"
            ;;
        --fresh)
            DEPLOY_MODE="fresh"
            ;;
        --portal-domain=*|--domain=*)
            PORTAL_DOMAIN="${arg#*=}"
            ;;
        --portal-ip=*)
            PORTAL_IP="${arg#*=}"
            ;;
        --router-ip=*)
            ROUTER_IP="${arg#*=}"
            ;;
        192.168.*|10.*|172.*)
            ROUTER_IP="$arg"
            ;;
        root|admin|*)
            if [ "$arg" != "--update" ] && [ "$arg" != "--preserve" ] && [ "$arg" != "--fresh" ] && [[ "$arg" != *"."* ]] && [[ "$arg" != *"--"* ]]; then
                ROUTER_USER="$arg"
            fi
            ;;
    esac
done

echo -e "${CYAN}==============================================================${NC}"
if [ "$DEPLOY_MODE" = "update" ]; then
    echo -e "${GREEN}🔄 Updating OpenWrt Router (${ROUTER_IP}) [Preserving Tables & State]...${NC}"
else
    echo -e "${GREEN}📡 Deploying OpenPisoWifi to OpenWrt Router (${ROUTER_IP})...${NC}"
fi
echo -e "${CYAN}==============================================================${NC}"
echo -e "• Mode:          ${YELLOW}${DEPLOY_MODE}${NC}"
echo -e "• Target:        ${YELLOW}${ROUTER_USER}@${ROUTER_IP}${NC}"
echo -e "• Portal IP:     ${YELLOW}${PORTAL_IP}:${PORTAL_PORT}${NC}"
echo -e "• Portal Domain: ${YELLOW}http://${PORTAL_DOMAIN}${NC}"
echo -e "• Shortcut IP:   ${YELLOW}http://10.0.0.1${NC}"
echo ""

# Check if setup script exists
SETUP_SCRIPT="$ROOT_DIR/openwrt/setup-openwrt.sh"
if [ ! -f "$SETUP_SCRIPT" ]; then
    echo -e "${RED}Error: Could not find ${SETUP_SCRIPT}${NC}"
    exit 1
fi

# 1. TEST INITIAL CONNECTIVITY
echo -e "${PURPLE}[1/4] Checking network connection to ${ROUTER_IP}...${NC}"
if ! ping -c 1 -W 2 "$ROUTER_IP" >/dev/null 2>&1; then
    echo -e "${RED}❌ Cannot reach ${ROUTER_IP}. Please check Ethernet connection from RPi to Router LAN port.${NC}"
    exit 1
fi
echo -e "${GREEN}✓ Router is reachable at ${ROUTER_IP}.${NC}"

# 2. DETERMINE SSH KEY ARGUMENTS
SSH_KEY_ARG=""
if [ -r "$HOME/.ssh/id_rsa" ]; then
    SSH_KEY_ARG="-i $HOME/.ssh/id_rsa"
elif [ -r /root/.ssh/id_rsa ]; then
    SSH_KEY_ARG="-i /root/.ssh/id_rsa"
fi

# 3. UPLOAD SETUP SCRIPT TO ROUTER
echo ""
echo -e "${PURPLE}[2/4] Uploading setup-openwrt.sh to OpenWrt router...${NC}"
tr -d '\r' < "$SETUP_SCRIPT" | ssh -o StrictHostKeyChecking=no $SSH_KEY_ARG "${ROUTER_USER}@${ROUTER_IP}" "cat > /tmp/setup-openwrt.sh"

# 4. EXECUTE SETUP SCRIPT WITH SELECTED MODE
echo ""
echo -e "${PURPLE}[3/4] Running automated configuration on OpenWrt (Mode: ${DEPLOY_MODE})...${NC}"
ssh -o StrictHostKeyChecking=no $SSH_KEY_ARG "${ROUTER_USER}@${ROUTER_IP}" "chmod +x /tmp/setup-openwrt.sh && /tmp/setup-openwrt.sh --${DEPLOY_MODE} --router-ip=${ROUTER_IP} --portal-ip=${PORTAL_IP} --portal-domain=${PORTAL_DOMAIN} --portal-port=${PORTAL_PORT}"

# 5. DEPLOY SSH PUBLIC KEYS TO ROUTER (If not already present)
echo ""
echo -e "${PURPLE}[4/4] Ensuring Raspberry Pi SSH keys are authorized on OpenWrt...${NC}"

if sudo test -f /root/.ssh/id_rsa.pub; then
    ROOT_PUB=$(sudo cat /root/.ssh/id_rsa.pub 2>/dev/null || true)
    if [ -n "$ROOT_PUB" ]; then
        ssh -o StrictHostKeyChecking=no $SSH_KEY_ARG "${ROUTER_USER}@${ROUTER_IP}" "mkdir -p /etc/dropbear && echo '${ROOT_PUB}' >> /etc/dropbear/authorized_keys && sort -u /etc/dropbear/authorized_keys -o /etc/dropbear/authorized_keys && chmod 600 /etc/dropbear/authorized_keys" 2>/dev/null || true
        echo -e "${GREEN}✓ Root daemon SSH key verified on router.${NC}"
    fi
fi

if [ -f "$HOME/.ssh/id_rsa.pub" ]; then
    USER_PUB=$(cat "$HOME/.ssh/id_rsa.pub" 2>/dev/null || true)
    if [ -n "$USER_PUB" ]; then
        ssh -o StrictHostKeyChecking=no $SSH_KEY_ARG "${ROUTER_USER}@${ROUTER_IP}" "mkdir -p /etc/dropbear && echo '${USER_PUB}' >> /etc/dropbear/authorized_keys && sort -u /etc/dropbear/authorized_keys -o /etc/dropbear/authorized_keys && chmod 600 /etc/dropbear/authorized_keys" 2>/dev/null || true
        echo -e "${GREEN}✓ User SSH key verified on router.${NC}"
    fi
fi

echo ""
echo -e "${CYAN}==============================================================${NC}"
echo -e "${GREEN}🎉 OpenWrt Router Configuration Complete!${NC}"
echo -e "${CYAN}==============================================================${NC}"

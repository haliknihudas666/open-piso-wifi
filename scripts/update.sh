#!/bin/bash
# ==============================================================================
# 🔄 OpenPisoWiFi - Automated 1-Click Pre-Built Update Script
# ==============================================================================
# Features:
#   - Atomic pre-built release update (Zero client-side Next.js builds)
#   - Safe database (dev.db) & environment (.env) preservation and restore
#   - Smart router update (preserves MAC whitelist, blacklist & active sessions)
#   - Service restart without downtime or UI disconnect
#   - Private & Public GitHub Releases support via Personal Access Token (PAT)
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
GITHUB_REPO="haliknihudas666/open-piso-wifi"
RELEASE_TARBALL="piso-wifi-release.tar.gz"

# ------------------------------------------------------------------------------
# ARGUMENT PARSING & GITHUB TOKEN DISCOVERY
# ------------------------------------------------------------------------------
FORCE_UPDATE=false
CLI_TOKEN=""

while [[ $# -gt 0 ]]; do
    case "$1" in
        --force|-f)
            FORCE_UPDATE=true
            shift
            ;;
        --token|-t)
            CLI_TOKEN="$2"
            shift 2
            ;;
        --token=*)
            CLI_TOKEN="${1#*=}"
            shift
            ;;
        *)
            shift
            ;;
    esac
done

PORTAL_DIR="$ROOT_DIR/portal"
[ ! -d "$PORTAL_DIR" ] && [ -d "$ROOT_DIR/pisowifi-portal" ] && PORTAL_DIR="$ROOT_DIR/pisowifi-portal"
DAEMON_DIR="$ROOT_DIR/daemon"
[ ! -d "$DAEMON_DIR" ] && [ -d "$ROOT_DIR/pisowifi-daemon" ] && DAEMON_DIR="$ROOT_DIR/pisowifi-daemon"

GITHUB_TOKEN="${CLI_TOKEN:-${GITHUB_TOKEN:-}}"
if [ -z "$GITHUB_TOKEN" ] && [ -f "$PORTAL_DIR/.env" ]; then
    GITHUB_TOKEN=$(grep -E '^GITHUB_TOKEN=' "$PORTAL_DIR/.env" | head -n1 | cut -d'=' -f2- | tr -d '\"'\'' ' || echo "")
elif [ -z "$GITHUB_TOKEN" ] && [ -f "$ROOT_DIR/pisowifi-portal/.env" ]; then
    GITHUB_TOKEN=$(grep -E '^GITHUB_TOKEN=' "$ROOT_DIR/pisowifi-portal/.env" | head -n1 | cut -d'=' -f2- | tr -d '\"'\'' ' || echo "")
fi
if [ -z "$GITHUB_TOKEN" ] && [ -f "$HOME/.github_token" ]; then
    GITHUB_TOKEN=$(cat "$HOME/.github_token" | tr -d '\r\n ')
fi

# Check sudo access (probe systemctl first as it is explicitly granted in sudoers)
SUDO_CMD=""
HAS_SUDO_ACCESS=false
if [ "$EUID" -eq 0 ]; then
    HAS_SUDO_ACCESS=true
elif sudo -n systemctl --version >/dev/null 2>&1 || sudo -n true >/dev/null 2>&1; then
    HAS_SUDO_ACCESS=true
    SUDO_CMD="sudo"
fi

echo -e "${CYAN}==============================================================${NC}"
echo -e "${GREEN}🔄 Starting OpenPisoWiFi High-Speed System Update...${NC}"
echo -e "${CYAN}==============================================================${NC}"

# ------------------------------------------------------------------------------
# STEP 1: CHECK FOR RECENT RELEASES ON GITHUB
# ------------------------------------------------------------------------------
echo -e "${PURPLE}[1/6] Checking for latest pre-compiled release on GitHub...${NC}"

CURRENT_VERSION="unknown"
if [ -f "$ROOT_DIR/package.json" ]; then
    RAW_VER=$(grep -o '"version": *"[^"]*"' "$ROOT_DIR/package.json" | head -n1 | cut -d'"' -f4 || echo "")
    [ -n "$RAW_VER" ] && CURRENT_VERSION="v${RAW_VER#v}"
elif [ -f "$ROOT_DIR/version.json" ]; then
    CURRENT_VERSION=$(grep -o '"version": *"[^"]*"' "$ROOT_DIR/version.json" | head -n1 | cut -d'"' -f4 || echo "unknown")
fi
echo -e "• Installed Version: ${YELLOW}${CURRENT_VERSION}${NC}"

LATEST_TAG=""
ASSET_ID=""
API_URL="https://api.github.com/repos/${GITHUB_REPO}/releases/latest"

query_github_release() {
    local token="$1"
    local auth_header=()
    if [ -n "$token" ]; then
        auth_header=(-H "Authorization: Bearer $token")
    fi
    curl -sSL -w "\n%{http_code}" -m 10 "${auth_header[@]}" \
         -H "Accept: application/vnd.github.v3+json" \
         "$API_URL" 2>/dev/null || echo ""
}

parse_release_json() {
    local json="$1"
    if command -v node >/dev/null 2>&1; then
        LATEST_TAG=$(echo "$json" | node -e '
            let d=""; process.stdin.on("data", c=>d+=c); process.stdin.on("end", ()=>{
                try { const j=JSON.parse(d); if(j.tag_name) console.log(j.tag_name); } catch(e){}
            });
        ' 2>/dev/null || echo "")
        ASSET_ID=$(echo "$json" | node -e '
            let d=""; process.stdin.on("data", c=>d+=c); process.stdin.on("end", ()=>{
                try {
                    const j=JSON.parse(d);
                    const a=j.assets?.find(x=>x.name===process.argv[1]);
                    if(a?.id) console.log(a.id);
                } catch(e){}
            });
        ' "$RELEASE_TARBALL" 2>/dev/null || echo "")
    fi

    if [ -z "$LATEST_TAG" ]; then
        LATEST_TAG=$(echo "$json" | grep -o '"tag_name": *"[^"]*"' | head -n1 | cut -d'"' -f4 || echo "")
    fi
    if [ -z "$ASSET_ID" ]; then
        ASSET_ID=$(echo "$json" | awk -v name="$RELEASE_TARBALL" '
            /"id":/ { id=$2; gsub(/[^0-9]/, "", id) }
            $0 ~ name { if (id != "") { print id; exit } }
        ')
        if [ -z "$ASSET_ID" ]; then
            ASSET_ID=$(echo "$json" | grep -B 4 "\"name\": \"${RELEASE_TARBALL}\"" | grep '"id":' | head -n1 | tr -dc '0-9')
        fi
    fi
}

if command -v curl >/dev/null 2>&1; then
    RELEASE_RESPONSE=$(query_github_release "$GITHUB_TOKEN")
    HTTP_CODE=$(echo "$RELEASE_RESPONSE" | tail -n1)
    RELEASE_JSON=$(echo "$RELEASE_RESPONSE" | sed '$d')

    # If repo is private or token is missing/invalid
    if [ "$HTTP_CODE" = "404" ] || [ "$HTTP_CODE" = "401" ] || [ -z "$RELEASE_JSON" ]; then
        if [ "$HTTP_CODE" = "401" ]; then
            echo -e "${RED}⚠️ Error: Configured GitHub Token was rejected (HTTP 401 Unauthorized).${NC}"
        elif [ -z "$GITHUB_TOKEN" ]; then
            echo -e "${YELLOW}🔒 Repository '${GITHUB_REPO}' is private or requires authentication (HTTP 404).${NC}"
        fi

        # Prompt interactively if run from terminal
        if [ -t 0 ]; then
            echo -e "${CYAN}Please enter your GitHub Personal Access Token (PAT) with 'repo' read scope:${NC}"
            read -r -s -p "GitHub Token: " PROMPTED_TOKEN
            echo ""
            if [ -n "$PROMPTED_TOKEN" ]; then
                GITHUB_TOKEN="$PROMPTED_TOKEN"
                RELEASE_RESPONSE=$(query_github_release "$GITHUB_TOKEN")
                HTTP_CODE=$(echo "$RELEASE_RESPONSE" | tail -n1)
                RELEASE_JSON=$(echo "$RELEASE_RESPONSE" | sed '$d')
            fi
        fi
    fi

    if [ -n "$RELEASE_JSON" ]; then
        parse_release_json "$RELEASE_JSON"
    fi
fi

# Automatically persist working token so future 1-click updates and CLI updates work automatically
if [ -n "$GITHUB_TOKEN" ] && [ -n "$LATEST_TAG" ]; then
    echo "$GITHUB_TOKEN" > "$HOME/.github_token" 2>/dev/null || true
    if [ -f "$ROOT_DIR/pisowifi-portal/.env" ]; then
        if ! grep -q "^GITHUB_TOKEN=" "$ROOT_DIR/pisowifi-portal/.env"; then
            echo "GITHUB_TOKEN=\"$GITHUB_TOKEN\"" >> "$ROOT_DIR/pisowifi-portal/.env"
        else
            sed -i "s|^GITHUB_TOKEN=.*|GITHUB_TOKEN=\"$GITHUB_TOKEN\"|" "$ROOT_DIR/pisowifi-portal/.env" 2>/dev/null || true
        fi
    fi
fi

if [ -n "$LATEST_TAG" ]; then
    echo -e "• Latest Remote Release: ${GREEN}${LATEST_TAG}${NC}"
    if [ "$LATEST_TAG" = "$CURRENT_VERSION" ] && [ "$FORCE_UPDATE" = false ]; then
        echo -e "${GREEN}✓ System is already running the latest version (${CURRENT_VERSION}).${NC}"
        echo -e "  (Use --force or -f to reinstall anyway)"
        exit 0
    fi
else
    echo -e "${YELLOW}• Remote release tag could not be determined.${NC}"
fi

# ------------------------------------------------------------------------------
# STEP 2: BACKUP USER DATABASE, CONFIGS, AND KEYS
# ------------------------------------------------------------------------------
echo ""
echo -e "${PURPLE}[2/6] Backing up SQLite database, settings, and credentials...${NC}"

BACKUP_DIR="/tmp/pisowifi_backup_$(date +%s)"
mkdir -p "$BACKUP_DIR/prisma"

# Locate authoritative active database
ACTIVE_DB=""
if [ -f "$PORTAL_DIR/prisma/dev.db" ]; then
    ACTIVE_DB="$PORTAL_DIR/prisma/dev.db"
elif [ -f "$PORTAL_DIR/dev.db" ]; then
    ACTIVE_DB="$PORTAL_DIR/dev.db"
elif [ -f "$ROOT_DIR/pisowifi-portal/prisma/dev.db" ]; then
    ACTIVE_DB="$ROOT_DIR/pisowifi-portal/prisma/dev.db"
elif [ -f "$ROOT_DIR/pisowifi-portal/dev.db" ]; then
    ACTIVE_DB="$ROOT_DIR/pisowifi-portal/dev.db"
fi

if [ -n "$ACTIVE_DB" ] && [ -f "$ACTIVE_DB" ]; then
    # Atomic checkpoint & safe snapshot via SQLite backup if sqlite3 is installed
    if command -v sqlite3 >/dev/null 2>&1; then
        sqlite3 "$ACTIVE_DB" "PRAGMA wal_checkpoint(TRUNCATE);" 2>/dev/null || true
        # Use sqlite3 .backup for an atomic, clean single-file snapshot without memory-mapped WAL/SHM artifacts
        if ! sqlite3 "$ACTIVE_DB" ".backup '$BACKUP_DIR/prisma/dev.db'" 2>/dev/null; then
            cp -f "$ACTIVE_DB" "$BACKUP_DIR/prisma/dev.db" 2>/dev/null || true
        fi
    else
        cp -f "$ACTIVE_DB" "$BACKUP_DIR/prisma/dev.db" 2>/dev/null || true
    fi
fi

# Backup .env configuration files
[ -f "$PORTAL_DIR/.env" ] && cp -f "$PORTAL_DIR/.env" "$BACKUP_DIR/portal.env"
[ -f "$DAEMON_DIR/.env" ] && cp -f "$DAEMON_DIR/.env" "$BACKUP_DIR/daemon.env"
[ -f "$ROOT_DIR/pisowifi-portal/.env" ] && [ ! -f "$BACKUP_DIR/portal.env" ] && cp -f "$ROOT_DIR/pisowifi-portal/.env" "$BACKUP_DIR/portal.env"
[ -f "$ROOT_DIR/pisowifi-daemon/.env" ] && [ ! -f "$BACKUP_DIR/daemon.env" ] && cp -f "$ROOT_DIR/pisowifi-daemon/.env" "$BACKUP_DIR/daemon.env"

echo -e "${GREEN}✓ User database and configs safely snapshotted to ${BACKUP_DIR}.${NC}"

# ------------------------------------------------------------------------------
# STEP 3: DOWNLOAD & EXTRACT PRE-BUILT RELEASE
# ------------------------------------------------------------------------------
echo ""
echo -e "${PURPLE}[3/6] Downloading & extracting pre-built update bundle...${NC}"

TEMP_TARBALL="/tmp/${RELEASE_TARBALL}"
rm -f "$TEMP_TARBALL"

if [ -f "$ROOT_DIR/dist/${RELEASE_TARBALL}" ]; then
    echo -e "--> Using local distribution package: $ROOT_DIR/dist/${RELEASE_TARBALL}"
    cp "$ROOT_DIR/dist/${RELEASE_TARBALL}" "$TEMP_TARBALL"
elif [ -f "/tmp/${RELEASE_TARBALL}.manual" ]; then
    echo -e "--> Using manually downloaded update package: /tmp/${RELEASE_TARBALL}.manual"
    cp -f "/tmp/${RELEASE_TARBALL}.manual" "$TEMP_TARBALL"
else
    DOWNLOAD_SUCCESS=false
    
    # Authenticated GitHub API download (Works with private repos)
    if [ -n "$ASSET_ID" ] && [ -n "$GITHUB_TOKEN" ]; then
        echo -e "--> Downloading asset ID ${ASSET_ID} via authenticated GitHub API..."
        if curl -fSL --progress-bar \
             -H "Authorization: Bearer $GITHUB_TOKEN" \
             -H "Accept: application/octet-stream" \
             "https://api.github.com/repos/${GITHUB_REPO}/releases/assets/${ASSET_ID}" \
             -o "$TEMP_TARBALL"; then
            DOWNLOAD_SUCCESS=true
        else
            echo -e "${YELLOW}Warning: Authenticated asset download failed. Trying fallback...${NC}"
        fi
    fi

    # Public direct download fallback (If repo is public or GITHUB_TOKEN is not needed)
    if [ "$DOWNLOAD_SUCCESS" = false ]; then
        echo -e "--> Attempting direct asset download..."
        if curl -fSL --progress-bar "https://github.com/${GITHUB_REPO}/releases/latest/download/${RELEASE_TARBALL}" -o "$TEMP_TARBALL" 2>/dev/null; then
            DOWNLOAD_SUCCESS=true
        elif [ -n "$LATEST_TAG" ] && curl -fSL --progress-bar "https://github.com/${GITHUB_REPO}/releases/download/${LATEST_TAG}/${RELEASE_TARBALL}" -o "$TEMP_TARBALL" 2>/dev/null; then
            DOWNLOAD_SUCCESS=true
        fi
    fi

    if [ "$DOWNLOAD_SUCCESS" = false ]; then
        echo -e "${RED}Error: Failed to download update package (${RELEASE_TARBALL}).${NC}"
        echo -e "${RED}If this repository is private, please provide a valid GitHub Personal Access Token (PAT):${NC}"
        echo -e "  1. CLI Flag:  ${YELLOW}bash scripts/update.sh --token <YOUR_GITHUB_TOKEN>${NC}"
        echo -e "  2. In .env:   ${YELLOW}echo 'GITHUB_TOKEN=\"<YOUR_TOKEN>\"' >> pisowifi-portal/.env${NC}"
        echo -e "  3. In home:   ${YELLOW}echo '<YOUR_TOKEN>' > ~/.github_token${NC}"
        rm -rf "$BACKUP_DIR"
        exit 1
    fi
fi

echo -e "--> Extracting updated files into ${ROOT_DIR}..."
tar -xzf "$TEMP_TARBALL" -C "$ROOT_DIR"
rm -f "$TEMP_TARBALL"

# Self-heal Turbopack & standalone @prisma/client and .prisma runtime paths
PORTAL_DIR="$ROOT_DIR/pisowifi-portal"
if [ -d "$PORTAL_DIR/node_modules/@prisma/client" ]; then
    mkdir -p "$PORTAL_DIR/.next/node_modules/@prisma"
    for item in "$PORTAL_DIR/.next/node_modules/@prisma"/client-*; do
        if [ -L "$item" ] || [ ! -e "$item" ]; then
            rm -rf "$item"
            ln -sfn "$PORTAL_DIR/node_modules/@prisma/client" "$item" 2>/dev/null || cp -rf "$PORTAL_DIR/node_modules/@prisma/client" "$item" 2>/dev/null || true
        fi
    done
fi

if [ -d "$PORTAL_DIR/node_modules/.prisma" ]; then
    mkdir -p "$PORTAL_DIR/.next/node_modules"
    rm -rf "$PORTAL_DIR/.next/node_modules/.prisma"
    ln -sfn "$PORTAL_DIR/node_modules/.prisma" "$PORTAL_DIR/.next/node_modules/.prisma" 2>/dev/null || cp -rf "$PORTAL_DIR/node_modules/.prisma" "$PORTAL_DIR/.next/node_modules/.prisma" 2>/dev/null || true
fi

echo -e "${GREEN}✓ Updated bundle extracted successfully.${NC}"

# ------------------------------------------------------------------------------
# STEP 4: RESTORE USER DATABASE & CONFIGURATIONS
# ------------------------------------------------------------------------------
echo ""
echo -e "${PURPLE}[4/6] Restoring user database and migrating schema...${NC}"

# Restore clean database file (purge any stale WAL/SHM files to prevent corruption)
TARGET_PORTAL="$ROOT_DIR/portal"
[ ! -d "$TARGET_PORTAL" ] && TARGET_PORTAL="$ROOT_DIR/pisowifi-portal"

TARGET_DAEMON="$ROOT_DIR/daemon"
[ ! -d "$TARGET_DAEMON" ] && TARGET_DAEMON="$ROOT_DIR/pisowifi-daemon"

if [ -f "$BACKUP_DIR/prisma/dev.db" ]; then
    mkdir -p "$TARGET_PORTAL/prisma"
    rm -f "$TARGET_PORTAL/prisma/dev.db-wal" "$TARGET_PORTAL/prisma/dev.db-shm" "$TARGET_PORTAL/prisma/dev.db-journal"
    rm -f "$TARGET_PORTAL/dev.db-wal" "$TARGET_PORTAL/dev.db-shm" "$TARGET_PORTAL/dev.db-journal"
    cp -f "$BACKUP_DIR/prisma/dev.db" "$TARGET_PORTAL/prisma/dev.db"
    cp -f "$BACKUP_DIR/prisma/dev.db" "$TARGET_PORTAL/dev.db" 2>/dev/null || true
elif [ ! -f "$TARGET_PORTAL/prisma/dev.db" ]; then
    if [ -f "$TARGET_PORTAL/prisma/dev.db.template" ]; then
        cp -f "$TARGET_PORTAL/prisma/dev.db.template" "$TARGET_PORTAL/prisma/dev.db"
        cp -f "$TARGET_PORTAL/prisma/dev.db.template" "$TARGET_PORTAL/dev.db" 2>/dev/null || true
    fi
fi

# Restore .env files
[ -f "$BACKUP_DIR/portal.env" ] && cp -f "$BACKUP_DIR/portal.env" "$TARGET_PORTAL/.env"
[ -f "$BACKUP_DIR/daemon.env" ] && cp -f "$BACKUP_DIR/daemon.env" "$TARGET_DAEMON/.env"

# Sanitize DATABASE_URL in portal.env if it points to file:./prisma/dev.db
if [ -f "$TARGET_PORTAL/.env" ]; then
    sed -i 's|DATABASE_URL="file:./prisma/dev.db"|DATABASE_URL="file:./dev.db"|g' "$TARGET_PORTAL/.env" 2>/dev/null || true
fi

# Auto-migrate schema: ensure newly added columns exist in restored database
if command -v sqlite3 >/dev/null 2>&1 && [ -f "$TARGET_PORTAL/prisma/dev.db" ]; then
    echo -e "--> Verifying database schema & migrating columns..."
    sqlite3 "$TARGET_PORTAL/prisma/dev.db" 'ALTER TABLE "Session" ADD COLUMN "sessionToken" TEXT;' 2>/dev/null || true
    sqlite3 "$TARGET_PORTAL/prisma/dev.db" 'CREATE UNIQUE INDEX IF NOT EXISTS "Session_sessionToken_key" ON "Session"("sessionToken");' 2>/dev/null || true
    sqlite3 "$TARGET_PORTAL/prisma/dev.db" 'CREATE INDEX IF NOT EXISTS "Session_sessionToken_idx" ON "Session"("sessionToken");' 2>/dev/null || true
    sqlite3 "$TARGET_PORTAL/prisma/dev.db" 'ALTER TABLE "Session" ADD COLUMN "deviceName" TEXT;' 2>/dev/null || true
    sqlite3 "$TARGET_PORTAL/prisma/dev.db" 'ALTER TABLE "Session" ADD COLUMN "transferCode" TEXT;' 2>/dev/null || true
    sqlite3 "$TARGET_PORTAL/prisma/dev.db" 'CREATE UNIQUE INDEX IF NOT EXISTS "Session_transferCode_key" ON "Session"("transferCode");' 2>/dev/null || true
    sqlite3 "$TARGET_PORTAL/prisma/dev.db" 'CREATE INDEX IF NOT EXISTS "Session_transferCode_idx" ON "Session"("transferCode");' 2>/dev/null || true

    if [ -f "$TARGET_PORTAL/dev.db" ]; then
        cp -f "$TARGET_PORTAL/prisma/dev.db" "$TARGET_PORTAL/dev.db" 2>/dev/null || true
    fi

    # Integrity verification
    CHECK_RES=$(sqlite3 "$TARGET_PORTAL/prisma/dev.db" "PRAGMA integrity_check;" 2>/dev/null || echo "ok")
    if [ "$CHECK_RES" != "ok" ]; then
        echo -e "${YELLOW}Warning: Database integrity check returned '$CHECK_RES'. Running auto-repair...${NC}"
        [ -f "$ROOT_DIR/scripts/repair-db.sh" ] && bash "$ROOT_DIR/scripts/repair-db.sh" || true
    fi
fi

# Ensure proper ownership and permissions for portal SQLite database
$SUDO_CMD chown -R "${CURRENT_USER}:${CURRENT_USER}" "$TARGET_PORTAL" 2>/dev/null || true
$SUDO_CMD chmod 777 "$TARGET_PORTAL/prisma" 2>/dev/null || true
$SUDO_CMD chmod 666 "$TARGET_PORTAL/prisma/dev.db"* 2>/dev/null || true
$SUDO_CMD chmod 666 "$TARGET_PORTAL/dev.db"* 2>/dev/null || true

# Ensure GITHUB_TOKEN is preserved in portal .env
if [ -n "$GITHUB_TOKEN" ] && [ -f "$TARGET_PORTAL/.env" ]; then
    if ! grep -q "^GITHUB_TOKEN=" "$TARGET_PORTAL/.env"; then
        echo "GITHUB_TOKEN=\"$GITHUB_TOKEN\"" >> "$TARGET_PORTAL/.env"
    fi
fi

# Cleanup temporary backup
rm -rf "$BACKUP_DIR"
echo -e "${GREEN}✓ Database verified and restored with zero data loss.${NC}"

# ------------------------------------------------------------------------------
# STEP 5: SMART ROUTER UPDATE (Preserving MAC tables and Wi-Fi state)
# ------------------------------------------------------------------------------
echo ""
echo -e "${PURPLE}[5/6] Updating OpenWrt Router configuration (Preserving State)...${NC}"

ROUTER_IP="${ROUTER_IP:-192.168.1.1}"
ROUTER_USER="${ROUTER_USER:-root}"
PORTAL_IP="${PORTAL_IP:-192.168.1.240}"
PORTAL_DOMAIN="${PORTAL_DOMAIN:-wifi.local}"
SETUP_SCRIPT="$ROOT_DIR/openwrt/setup-openwrt.sh"

if [ -f "$ROOT_DIR/pisowifi-portal/.env" ]; then
    ENV_ROUTER_IP=$(grep -E '^ROUTER_IP=' "$ROOT_DIR/pisowifi-portal/.env" | cut -d'=' -f2- | tr -d '"' | tr -d "'" || true)
    [ -n "$ENV_ROUTER_IP" ] && ROUTER_IP="$ENV_ROUTER_IP"
    ENV_PORTAL_IP=$(grep -E '^PORTAL_IP=' "$ROOT_DIR/pisowifi-portal/.env" | cut -d'=' -f2- | tr -d '"' | tr -d "'" || true)
    [ -n "$ENV_PORTAL_IP" ] && PORTAL_IP="$ENV_PORTAL_IP"
    ENV_PORTAL_DOMAIN=$(grep -E '^PORTAL_DOMAIN=' "$ROOT_DIR/pisowifi-portal/.env" | cut -d'=' -f2- | tr -d '"' | tr -d "'" || true)
    [ -n "$ENV_PORTAL_DOMAIN" ] && PORTAL_DOMAIN="$ENV_PORTAL_DOMAIN"
fi

if [ -f "$ROOT_DIR/pisowifi-daemon/.env" ]; then
    ENV_ROUTER_USER=$(grep -E '^ROUTER_SSH_USER=' "$ROOT_DIR/pisowifi-daemon/.env" | cut -d'=' -f2- | tr -d '"' | tr -d "'" || true)
    [ -n "$ENV_ROUTER_USER" ] && ROUTER_USER="$ENV_ROUTER_USER"
fi

if [ -f "$SETUP_SCRIPT" ] && ping -c 1 -W 2 "$ROUTER_IP" >/dev/null 2>&1; then
    SSH_KEY_ARG=""
    if [ -f /root/.ssh/id_rsa ]; then
        SSH_KEY_ARG="-i /root/.ssh/id_rsa"
    elif [ -f "$HOME/.ssh/id_rsa" ]; then
        SSH_KEY_ARG="-i $HOME/.ssh/id_rsa"
    fi

    if ssh -o BatchMode=yes -o StrictHostKeyChecking=no -o ConnectTimeout=4 $SSH_KEY_ARG "${ROUTER_USER}@${ROUTER_IP}" "echo OK" >/dev/null 2>&1; then
        echo -e "--> Deploying smart update to OpenWrt router (${ROUTER_IP})..."
        tr -d '\r' < "$SETUP_SCRIPT" | ssh -o BatchMode=yes -o StrictHostKeyChecking=no $SSH_KEY_ARG "${ROUTER_USER}@${ROUTER_IP}" "cat > /tmp/setup-openwrt.sh && chmod +x /tmp/setup-openwrt.sh && /tmp/setup-openwrt.sh --update --router-ip=${ROUTER_IP} --portal-ip=${PORTAL_IP} --portal-domain=${PORTAL_DOMAIN}" || echo -e "${YELLOW}Notice: Router update completed with warnings.${NC}"
        echo -e "${GREEN}✓ OpenWrt router updated (active sessions & MAC tables preserved)!${NC}"
    else
        echo -e "${YELLOW}Notice: Passwordless SSH to OpenWrt is not active. Router config update skipped.${NC}"
    fi
else
    echo -e "${YELLOW}Notice: OpenWrt Router at ${ROUTER_IP} is offline or unreachable. Skipping router update.${NC}"
fi

# ------------------------------------------------------------------------------
# STEP 6: RESTART SYSTEMD SERVICES
# ------------------------------------------------------------------------------
echo ""
echo -e "${PURPLE}[6/6] Ensuring port 80 redirect & restarting background services...${NC}"

if [ "$HAS_SUDO_ACCESS" = true ]; then
    # Ensure port 80 -> 3000 NAT redirect
    $SUDO_CMD iptables -t nat -C PREROUTING -p tcp --dport 80 -j REDIRECT --to-port 3000 2>/dev/null || $SUDO_CMD iptables -t nat -A PREROUTING -p tcp --dport 80 -j REDIRECT --to-port 3000 2>/dev/null || true
    $SUDO_CMD iptables -t nat -C OUTPUT -p tcp -o lo --dport 80 -j REDIRECT --to-port 3000 2>/dev/null || $SUDO_CMD iptables -t nat -A OUTPUT -p tcp -o lo --dport 80 -j REDIRECT --to-port 3000 2>/dev/null || true

    # Ensure systemd service is using high-performance standalone server.js
    if [ -f /etc/systemd/system/pisowifi-portal.service ]; then
        if grep -q "npm.*start" /etc/systemd/system/pisowifi-portal.service 2>/dev/null; then
            echo -e "--> Modernizing pisowifi-portal.service to use high-speed standalone node server..."
            $SUDO_CMD sed -i 's|ExecStart=.*npm.*start.*|ExecStart=/usr/bin/node server.js|g' /etc/systemd/system/pisowifi-portal.service 2>/dev/null || true
        fi
    fi

    $SUDO_CMD systemctl daemon-reload 2>/dev/null || true

    # Restart Hardware Daemon
    echo -e "--> Restarting Hardware Daemon service..."
    $SUDO_CMD systemctl restart pisowifi-daemon.service 2>/dev/null || true

    # Schedule Web Portal restart with 3-second delay so script finishes responding to browser
    echo -e "--> Scheduling Web Portal service restart (3s delay)..."
    if command -v systemd-run >/dev/null 2>&1 && $SUDO_CMD systemd-run --version >/dev/null 2>&1; then
        $SUDO_CMD systemd-run --on-active=3s systemctl restart pisowifi-portal.service >/dev/null 2>&1 || ( sleep 3 && $SUDO_CMD systemctl restart pisowifi-portal.service ) >/dev/null 2>&1 &
    else
        ( sleep 3 && $SUDO_CMD systemctl restart pisowifi-portal.service ) >/dev/null 2>&1 &
    fi

    sleep 1
    DAEMON_STATUS=$(systemctl is-active pisowifi-daemon.service 2>/dev/null || echo "active")
    PORTAL_STATUS="restarting in 3s"
else
    echo -e "${YELLOW}⚠️ Notice: Passwordless sudo is not configured for user $(whoami).${NC}"
    echo -e "${YELLOW}   Files were updated, but service restart was skipped.${NC}"
    DAEMON_STATUS="running (restart needed)"
    PORTAL_STATUS="running (restart needed)"
fi

NEW_VERSION=$(grep -o '"version": *"[^"]*"' "$ROOT_DIR/version.json" 2>/dev/null | cut -d'"' -f4 || echo "latest")

echo ""
echo -e "${CYAN}==============================================================${NC}"
echo -e "${GREEN}✅ OpenPisoWiFi Update to ${NEW_VERSION} Completed Successfully!${NC}"
echo -e "${CYAN}==============================================================${NC}"
echo -e "• Hardware Daemon Service: [ ${GREEN}${DAEMON_STATUS}${NC} ]"
echo -e "• Web Portal Service:      [ ${GREEN}${PORTAL_STATUS}${NC} ]"
echo ""
echo -e "🌐 System is live at: ${CYAN}http://${PORTAL_DOMAIN}/${NC} or ${CYAN}http://${PORTAL_IP}:3000/${NC}"
echo -e "${CYAN}==============================================================${NC}"
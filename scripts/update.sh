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
if [ -n "${BASH_SOURCE[0]}" ] && [ -f "${BASH_SOURCE[0]}" ]; then
    SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
    if [ "$(basename "$SCRIPT_DIR")" = "scripts" ]; then
        ROOT_DIR="$(dirname "$SCRIPT_DIR")"
    else
        ROOT_DIR="$SCRIPT_DIR"
    fi
else
    if [ -f "$PWD/package.json" ] && grep -q '"open-piso-wifi"' "$PWD/package.json" 2>/dev/null; then
        ROOT_DIR="$PWD"
    elif [ -d "$PWD/open-piso-wifi" ]; then
        ROOT_DIR="$PWD/open-piso-wifi"
    elif [ -n "$SUDO_USER" ] && [ -d "/home/$SUDO_USER/open-piso-wifi" ]; then
        ROOT_DIR="/home/$SUDO_USER/open-piso-wifi"
    elif [ -n "$SUDO_USER" ] && [ -d "/home/$SUDO_USER/daemon" ]; then
        ROOT_DIR="/home/$SUDO_USER"
    elif [ -n "$SUDO_USER" ] && [ -d "/home/$SUDO_USER" ]; then
        ROOT_DIR="/home/$SUDO_USER/open-piso-wifi"
    else
        ROOT_DIR="/opt/open-piso-wifi"
    fi
fi
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

# Check sudo access (probe an exact permitted NOPASSWD command)
SUDO_CMD=""
HAS_SUDO_ACCESS=false
if [ "$EUID" -eq 0 ]; then
    HAS_SUDO_ACCESS=true
elif sudo -n systemctl daemon-reload >/dev/null 2>&1; then
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
SHA_ASSET_ID=""
SHA_FILENAME="${RELEASE_TARBALL}.sha256"
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
        SHA_ASSET_ID=$(echo "$json" | node -e '
            let d=""; process.stdin.on("data", c=>d+=c); process.stdin.on("end", ()=>{
                try {
                    const j=JSON.parse(d);
                    const a=j.assets?.find(x=>x.name===process.argv[1]);
                    if(a?.id) console.log(a.id);
                } catch(e){}
            });
        ' "$SHA_FILENAME" 2>/dev/null || echo "")
    fi

    if [ -z "$LATEST_TAG" ]; then
        LATEST_TAG=$(echo "$json" | grep -o '"tag_name": *"[^"]*"' | head -n1 | cut -d'"' -f4 || echo "")
    fi
    if [ -z "$ASSET_ID" ]; then
        ASSET_ID=$(echo "$json" | awk -v name="$RELEASE_TARBALL" '
            /"id":/ { id=$2; gsub(/[^0-9]/, "", id) }
            $0 ~ ("\"name\":[[:space:]]*\"" name "\"") { if (id != "") { print id; exit } }
        ')
        if [ -z "$ASSET_ID" ]; then
            ASSET_ID=$(echo "$json" | grep -B 4 "\"name\": \"${RELEASE_TARBALL}\"" | grep '"id":' | head -n1 | tr -dc '0-9')
        fi
    fi
    if [ -z "$SHA_ASSET_ID" ]; then
        SHA_ASSET_ID=$(echo "$json" | awk -v name="$SHA_FILENAME" '
            /"id":/ { id=$2; gsub(/[^0-9]/, "", id) }
            $0 ~ ("\"name\":[[:space:]]*\"" name "\"") { if (id != "") { print id; exit } }
        ')
    fi
}

if command -v curl >/dev/null 2>&1; then
    RELEASE_RESPONSE=$(query_github_release "$GITHUB_TOKEN")
    HTTP_CODE=$(echo "$RELEASE_RESPONSE" | tail -n1)
    RELEASE_JSON=$(echo "$RELEASE_RESPONSE" | sed '$d')

    # If configured token was rejected with 401, automatically fallback to public access
    if [ "$HTTP_CODE" = "401" ] && [ -n "$GITHUB_TOKEN" ]; then
        echo -e "${YELLOW}⚠️ Notice: Configured GitHub Token was rejected (HTTP 401). Retrying with public access...${NC}"
        RETRY_RESPONSE=$(query_github_release "")
        RETRY_HTTP_CODE=$(echo "$RETRY_RESPONSE" | tail -n1)
        if [ "$RETRY_HTTP_CODE" = "200" ]; then
            echo -e "${GREEN}✓ Successfully connected to public repository (no token required).${NC}"
            # Clean up stale/invalid token so it doesn't cause future 401 errors
            rm -f "$HOME/.github_token" 2>/dev/null || true
            [ -f "$PORTAL_DIR/.env" ] && sed -i '/^GITHUB_TOKEN=/d' "$PORTAL_DIR/.env" 2>/dev/null || true
            [ -f "$ROOT_DIR/pisowifi-portal/.env" ] && sed -i '/^GITHUB_TOKEN=/d' "$ROOT_DIR/pisowifi-portal/.env" 2>/dev/null || true
            GITHUB_TOKEN=""
            RELEASE_RESPONSE="$RETRY_RESPONSE"
            HTTP_CODE="$RETRY_HTTP_CODE"
            RELEASE_JSON=$(echo "$RELEASE_RESPONSE" | sed '$d')
        fi
    fi

    # If repo is private or token is missing/invalid
    if [ "$HTTP_CODE" = "404" ] || [ "$HTTP_CODE" = "401" ] || [ -z "$RELEASE_JSON" ]; then
        if [ "$HTTP_CODE" = "401" ]; then
            echo -e "${RED}⚠️ Error: Configured GitHub Token was rejected (HTTP 401 Unauthorized).${NC}"
        elif [ -z "$GITHUB_TOKEN" ]; then
            echo -e "${YELLOW}🔒 Repository '${GITHUB_REPO}' is private or requires authentication (HTTP 404).${NC}"
        fi

        # Determine interactive terminal capability (handles curl ... | sudo bash)
        IS_INTERACTIVE=false
        if [ -t 0 ]; then
            if exec 3<&0 2>/dev/null; then
                IS_INTERACTIVE=true
            fi
        elif [ -c /dev/tty ] && { exec 3</dev/tty; } 2>/dev/null; then
            IS_INTERACTIVE=true
        fi

        # Prompt interactively if run from terminal
        if [ "$IS_INTERACTIVE" = true ]; then
            echo -e "${CYAN}Please enter your GitHub Personal Access Token (PAT) with 'repo' read scope:${NC}"
            read -r -s -u 3 -p "GitHub Token: " PROMPTED_TOKEN
            echo ""
            exec 3<&- 2>/dev/null || true
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
TEMP_SHA="/tmp/${SHA_FILENAME}"
rm -f "$TEMP_TARBALL" "$TEMP_SHA"

if [ -f "$ROOT_DIR/dist/${RELEASE_TARBALL}" ]; then
    echo -e "--> Using local distribution package: $ROOT_DIR/dist/${RELEASE_TARBALL}"
    cp "$ROOT_DIR/dist/${RELEASE_TARBALL}" "$TEMP_TARBALL"
    [ -f "$ROOT_DIR/dist/${SHA_FILENAME}" ] && cp "$ROOT_DIR/dist/${SHA_FILENAME}" "$TEMP_SHA"
elif [ -f "/tmp/${RELEASE_TARBALL}.manual" ]; then
    echo -e "--> Using manually downloaded update package: /tmp/${RELEASE_TARBALL}.manual"
    cp -f "/tmp/${RELEASE_TARBALL}.manual" "$TEMP_TARBALL"
    [ -f "/tmp/${SHA_FILENAME}.manual" ] && cp -f "/tmp/${SHA_FILENAME}.manual" "$TEMP_SHA"
    [ -f "/tmp/${SHA_FILENAME}" ] && [ ! -f "$TEMP_SHA" ] && cp -f "/tmp/${SHA_FILENAME}" "$TEMP_SHA"
else
    DOWNLOAD_SUCCESS=false

    # 1. Direct public release download (Primary for public repositories; prefer pinned LATEST_TAG)
    echo -e "--> Attempting direct download from GitHub Releases..."
    if [ -n "$LATEST_TAG" ] && curl -fSL --progress-bar "https://github.com/${GITHUB_REPO}/releases/download/${LATEST_TAG}/${RELEASE_TARBALL}" -o "$TEMP_TARBALL" 2>/dev/null; then
        DOWNLOAD_SUCCESS=true
        curl -fsSL "https://github.com/${GITHUB_REPO}/releases/download/${LATEST_TAG}/${SHA_FILENAME}" -o "$TEMP_SHA" 2>/dev/null || rm -f "$TEMP_SHA"
    elif curl -fSL --progress-bar "https://github.com/${GITHUB_REPO}/releases/latest/download/${RELEASE_TARBALL}" -o "$TEMP_TARBALL" 2>/dev/null; then
        DOWNLOAD_SUCCESS=true
        curl -fsSL "https://github.com/${GITHUB_REPO}/releases/latest/download/${SHA_FILENAME}" -o "$TEMP_SHA" 2>/dev/null || rm -f "$TEMP_SHA"
    fi

    # 2. Authenticated GitHub API download fallback (For private repositories or forks)
    if [ "$DOWNLOAD_SUCCESS" = false ] && [ -n "$ASSET_ID" ] && [ -n "$GITHUB_TOKEN" ]; then
        echo -e "--> Downloading asset ID ${ASSET_ID} via authenticated GitHub API..."
        if curl -fSL --progress-bar \
             -H "Authorization: Bearer $GITHUB_TOKEN" \
             -H "Accept: application/octet-stream" \
             "https://api.github.com/repos/${GITHUB_REPO}/releases/assets/${ASSET_ID}" \
             -o "$TEMP_TARBALL"; then
            DOWNLOAD_SUCCESS=true
            if [ -n "$SHA_ASSET_ID" ]; then
                curl -fsSL \
                    -H "Authorization: Bearer $GITHUB_TOKEN" \
                    -H "Accept: application/octet-stream" \
                    "https://api.github.com/repos/${GITHUB_REPO}/releases/assets/${SHA_ASSET_ID}" \
                    -o "$TEMP_SHA" 2>/dev/null || rm -f "$TEMP_SHA"
            fi
        fi
    fi

    if [ "$DOWNLOAD_SUCCESS" = false ]; then
        echo -e "${RED}Error: Failed to download update package (${RELEASE_TARBALL}).${NC}"
        echo -e "${RED}If this repository is private, please provide a valid GitHub Personal Access Token (PAT):${NC}"
        echo -e "  1. CLI Flag:  ${YELLOW}bash scripts/update.sh --token <YOUR_GITHUB_TOKEN>${NC}"
        echo -e "  2. In .env:   ${YELLOW}echo 'GITHUB_TOKEN=\"<YOUR_TOKEN>\"' >> pisowifi-portal/.env${NC}"
        echo -e "  3. In home:   ${YELLOW}echo '<YOUR_TOKEN>' > ~/.github_token${NC}"
        rm -f "$TEMP_TARBALL" "$TEMP_SHA"
        rm -rf "$BACKUP_DIR"
        exit 1
    fi
fi

# Verify SHA-256 checksum via sha256sum before extracting if checksum file is available
if [ -s "$TEMP_SHA" ]; then
    echo -e "--> Verifying SHA-256 checksum of ${RELEASE_TARBALL}..."
    EXPECTED_SHA=$(awk '{print $1}' "$TEMP_SHA" | head -n1 | tr -d '\r\n ')
    if ! echo "$EXPECTED_SHA" | grep -Eq '^[a-fA-F0-9]{64}$'; then
        echo -e "${RED}❌ SECURITY ERROR: Invalid SHA-256 checksum format in ${SHA_FILENAME}. Aborting update.${NC}"
        rm -f "$TEMP_TARBALL" "$TEMP_SHA"
        rm -rf "$BACKUP_DIR"
        exit 1
    fi
    if command -v sha256sum >/dev/null 2>&1; then
        if ! (cd "$(dirname "$TEMP_TARBALL")" && printf '%s  %s\n' "$EXPECTED_SHA" "$(basename "$TEMP_TARBALL")" | sha256sum -c - >/dev/null 2>&1); then
            ACTUAL_SHA=$(sha256sum "$TEMP_TARBALL" | awk '{print $1}')
            echo -e "${RED}❌ SECURITY ERROR: SHA-256 checksum mismatch for ${RELEASE_TARBALL}!${NC}"
            echo -e "${RED}   Expected: ${EXPECTED_SHA}${NC}"
            echo -e "${RED}   Actual:   ${ACTUAL_SHA}${NC}"
            rm -f "$TEMP_TARBALL" "$TEMP_SHA"
            rm -rf "$BACKUP_DIR"
            exit 1
        fi
        echo -e "${GREEN}✓ SHA-256 checksum verified (${EXPECTED_SHA:0:12}...).${NC}"
    else
        echo -e "${YELLOW}Notice: sha256sum not available; skipping checksum verification.${NC}"
    fi
else
    echo -e "${YELLOW}Notice: ${SHA_FILENAME} not present on release; skipping checksum verification.${NC}"
fi
rm -f "$TEMP_SHA"

echo -e "--> Extracting updated files into ${ROOT_DIR}..."
tar -xzf "$TEMP_TARBALL" -C "$ROOT_DIR"
rm -f "$TEMP_TARBALL"

# Self-heal Turbopack & standalone @prisma/client and .prisma runtime paths
for PDIR in "$ROOT_DIR/portal" "$ROOT_DIR/pisowifi-portal"; do
    [ -d "$PDIR" ] || continue
    if [ -d "$PDIR/node_modules/@prisma/client" ]; then
        mkdir -p "$PDIR/.next/node_modules/@prisma"
        for item in "$PDIR/.next/node_modules/@prisma"/client-*; do
            if [ -L "$item" ] || [ ! -e "$item" ]; then
                rm -rf "$item"
                ln -sfn "$PDIR/node_modules/@prisma/client" "$item" 2>/dev/null || cp -rf "$PDIR/node_modules/@prisma/client" "$item" 2>/dev/null || true
            fi
        done
    fi

    if [ -d "$PDIR/node_modules/.prisma" ]; then
        mkdir -p "$PDIR/.next/node_modules"
        rm -rf "$PDIR/.next/node_modules/.prisma"
        ln -sfn "$PDIR/node_modules/.prisma" "$PDIR/.next/node_modules/.prisma" 2>/dev/null || cp -rf "$PDIR/node_modules/.prisma" "$PDIR/.next/node_modules/.prisma" 2>/dev/null || true
    fi
done

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

# Ensure portal/.env and daemon/.env exist and share strong 32-byte random hex secrets
mkdir -p "$TARGET_PORTAL" "$TARGET_DAEMON"
touch "$TARGET_PORTAL/.env" "$TARGET_DAEMON/.env"

is_placeholder_secret() {
    local val="$1"
    [ -z "$val" ] && return 0
    case "$val" in
        change-me*|openpiso-satellite-secret-2024|changeme|placeholder|secret|your-*)
            return 0
            ;;
    esac
    return 1
}

generate_hex_secret() {
    if command -v openssl >/dev/null 2>&1; then
        openssl rand -hex 32
    elif command -v node >/dev/null 2>&1; then
        node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
    else
        od -An -tx1 -N32 /dev/urandom | tr -d ' \n'
    fi
}

read_env_val() {
    local file="$1"
    local key="$2"
    [ -f "$file" ] || return 0
    grep -E "^${key}=" "$file" 2>/dev/null | head -n1 | cut -d'=' -f2- | tr -d '"' | tr -d "'" | tr -d '\r' || true
}

upsert_env_val() {
    local file="$1"
    local key="$2"
    local val="$3"
    local quoted="$4"
    local line="${key}=${val}"
    [ "$quoted" = "true" ] && line="${key}=\"${val}\""
    if grep -qE "^${key}=" "$file" 2>/dev/null; then
        sed -i "s|^${key}=.*|${line}|" "$file" 2>/dev/null || true
    else
        echo "$line" >> "$file"
    fi
}

DAEMON_API_SECRET=$(read_env_val "$TARGET_PORTAL/.env" "DAEMON_API_SECRET")
if is_placeholder_secret "$DAEMON_API_SECRET"; then
    DAEMON_API_SECRET=$(read_env_val "$TARGET_DAEMON/.env" "DAEMON_API_SECRET")
fi
if is_placeholder_secret "$DAEMON_API_SECRET"; then
    DAEMON_API_SECRET=$(generate_hex_secret)
fi
upsert_env_val "$TARGET_PORTAL/.env" "DAEMON_API_SECRET" "$DAEMON_API_SECRET" "true"
upsert_env_val "$TARGET_DAEMON/.env" "DAEMON_API_SECRET" "$DAEMON_API_SECRET" "false"

SATELLITE_SECRET=$(read_env_val "$TARGET_DAEMON/.env" "SATELLITE_SECRET")
[ -z "$SATELLITE_SECRET" ] && SATELLITE_SECRET=$(read_env_val "$TARGET_DAEMON/.env" "SLOT_SECRET")
if is_placeholder_secret "$SATELLITE_SECRET"; then
    SATELLITE_SECRET=$(generate_hex_secret)
fi
upsert_env_val "$TARGET_DAEMON/.env" "SATELLITE_SECRET" "$SATELLITE_SECRET" "false"

SHIELD_SECRET=$(read_env_val "$TARGET_DAEMON/.env" "SHIELD_SECRET")
if is_placeholder_secret "$SHIELD_SECRET"; then
    SHIELD_SECRET=$(generate_hex_secret)
fi
upsert_env_val "$TARGET_DAEMON/.env" "SHIELD_SECRET" "$SHIELD_SECRET" "false"

if [ -z "$(read_env_val "$TARGET_DAEMON/.env" "COIN_GPIO_PIN")" ]; then
    upsert_env_val "$TARGET_DAEMON/.env" "COIN_GPIO_PIN" "4" "false"
fi
if [ -z "$(read_env_val "$TARGET_DAEMON/.env" "INHIBIT_GPIO_PIN")" ]; then
    upsert_env_val "$TARGET_DAEMON/.env" "INHIBIT_GPIO_PIN" "17" "false"
fi

# Sanitize DATABASE_URL in portal.env if it points to file:./prisma/dev.db
if [ -f "$TARGET_PORTAL/.env" ]; then
    sed -i 's|DATABASE_URL="file:./prisma/dev.db"|DATABASE_URL="file:./dev.db"|g' "$TARGET_PORTAL/.env" 2>/dev/null || true
fi

# Auto-migrate schema: ensure newly added tables, columns & indexes exist in restored database
if command -v sqlite3 >/dev/null 2>&1 && [ -f "$TARGET_PORTAL/prisma/dev.db" ]; then
    echo -e "--> Verifying database schema & migrating tables/columns..."
    DB_PATH="$TARGET_PORTAL/prisma/dev.db"
    sqlite3 "$DB_PATH" 'ALTER TABLE "Session" ADD COLUMN "sessionToken" TEXT;' 2>/dev/null || true
    sqlite3 "$DB_PATH" 'CREATE UNIQUE INDEX IF NOT EXISTS "Session_sessionToken_key" ON "Session"("sessionToken");' 2>/dev/null || true
    sqlite3 "$DB_PATH" 'CREATE INDEX IF NOT EXISTS "Session_sessionToken_idx" ON "Session"("sessionToken");' 2>/dev/null || true
    sqlite3 "$DB_PATH" 'ALTER TABLE "Session" ADD COLUMN "deviceName" TEXT;' 2>/dev/null || true
    sqlite3 "$DB_PATH" 'ALTER TABLE "Session" ADD COLUMN "transferCode" TEXT;' 2>/dev/null || true
    sqlite3 "$DB_PATH" 'CREATE UNIQUE INDEX IF NOT EXISTS "Session_transferCode_key" ON "Session"("transferCode");' 2>/dev/null || true
    sqlite3 "$DB_PATH" 'CREATE INDEX IF NOT EXISTS "Session_transferCode_idx" ON "Session"("transferCode");' 2>/dev/null || true

    sqlite3 "$DB_PATH" 'ALTER TABLE "Voucher" ADD COLUMN "isRevoked" BOOLEAN NOT NULL DEFAULT false;' 2>/dev/null || true
    sqlite3 "$DB_PATH" 'ALTER TABLE "Voucher" ADD COLUMN "revokedAt" DATETIME;' 2>/dev/null || true
    sqlite3 "$DB_PATH" 'CREATE INDEX IF NOT EXISTS "Voucher_isRevoked_idx" ON "Voucher"("isRevoked");' 2>/dev/null || true

    sqlite3 "$DB_PATH" 'CREATE TABLE IF NOT EXISTS "CashCollection" ("id" TEXT NOT NULL PRIMARY KEY, "amount" REAL NOT NULL, "collectedBy" TEXT NOT NULL DEFAULT '\''Admin'\'', "notes" TEXT, "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP);' 2>/dev/null || true
    sqlite3 "$DB_PATH" 'CREATE INDEX IF NOT EXISTS "CashCollection_createdAt_idx" ON "CashCollection"("createdAt");' 2>/dev/null || true

    sqlite3 "$DB_PATH" 'CREATE TABLE IF NOT EXISTS "FreeTrialClaim" ("id" TEXT NOT NULL PRIMARY KEY, "macAddress" TEXT NOT NULL, "ipAddress" TEXT, "claimedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP);' 2>/dev/null || true
    sqlite3 "$DB_PATH" 'CREATE INDEX IF NOT EXISTS "FreeTrialClaim_macAddress_idx" ON "FreeTrialClaim"("macAddress");' 2>/dev/null || true
    sqlite3 "$DB_PATH" 'CREATE INDEX IF NOT EXISTS "FreeTrialClaim_claimedAt_idx" ON "FreeTrialClaim"("claimedAt");' 2>/dev/null || true

    sqlite3 "$DB_PATH" 'CREATE TABLE IF NOT EXISTS "DeviceRule" ("id" TEXT NOT NULL PRIMARY KEY, "macAddress" TEXT NOT NULL, "name" TEXT NOT NULL, "type" TEXT NOT NULL, "notes" TEXT, "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" DATETIME NOT NULL);' 2>/dev/null || true
    sqlite3 "$DB_PATH" 'CREATE UNIQUE INDEX IF NOT EXISTS "DeviceRule_macAddress_key" ON "DeviceRule"("macAddress");' 2>/dev/null || true
    sqlite3 "$DB_PATH" 'CREATE INDEX IF NOT EXISTS "DeviceRule_macAddress_idx" ON "DeviceRule"("macAddress");' 2>/dev/null || true
    sqlite3 "$DB_PATH" 'CREATE INDEX IF NOT EXISTS "DeviceRule_type_idx" ON "DeviceRule"("type");' 2>/dev/null || true

    sqlite3 "$DB_PATH" 'CREATE TABLE IF NOT EXISTS "LoyaltyStreak" ("id" TEXT NOT NULL PRIMARY KEY, "sessionCode" TEXT NOT NULL, "macAddress" TEXT, "deviceName" TEXT, "currentStreak" INTEGER NOT NULL DEFAULT 0, "highestStreak" INTEGER NOT NULL DEFAULT 0, "lastCreditDate" TEXT, "lastCreditedAt" DATETIME, "totalCredits" INTEGER NOT NULL DEFAULT 0, "totalAmountSpent" REAL NOT NULL DEFAULT 0, "totalBonusMinutes" INTEGER NOT NULL DEFAULT 0, "lastBonusReward" TEXT, "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" DATETIME NOT NULL);' 2>/dev/null || true
    sqlite3 "$DB_PATH" 'CREATE UNIQUE INDEX IF NOT EXISTS "LoyaltyStreak_sessionCode_key" ON "LoyaltyStreak"("sessionCode");' 2>/dev/null || true
    sqlite3 "$DB_PATH" 'CREATE INDEX IF NOT EXISTS "LoyaltyStreak_sessionCode_idx" ON "LoyaltyStreak"("sessionCode");' 2>/dev/null || true
    sqlite3 "$DB_PATH" 'CREATE INDEX IF NOT EXISTS "LoyaltyStreak_macAddress_idx" ON "LoyaltyStreak"("macAddress");' 2>/dev/null || true
    sqlite3 "$DB_PATH" 'CREATE INDEX IF NOT EXISTS "LoyaltyStreak_currentStreak_idx" ON "LoyaltyStreak"("currentStreak");' 2>/dev/null || true

    sqlite3 "$DB_PATH" 'CREATE TABLE IF NOT EXISTS "LoyaltyClaim" ("id" TEXT NOT NULL PRIMARY KEY, "sessionCode" TEXT NOT NULL, "streakDays" INTEGER NOT NULL, "bonusMinutes" INTEGER NOT NULL, "rewardTitle" TEXT NOT NULL, "macAddress" TEXT, "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP);' 2>/dev/null || true
    sqlite3 "$DB_PATH" 'CREATE INDEX IF NOT EXISTS "LoyaltyClaim_sessionCode_idx" ON "LoyaltyClaim"("sessionCode");' 2>/dev/null || true
    sqlite3 "$DB_PATH" 'CREATE INDEX IF NOT EXISTS "LoyaltyClaim_createdAt_idx" ON "LoyaltyClaim"("createdAt");' 2>/dev/null || true

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

# Ensure proper ownership and permissions for portal SQLite database & .env files
if [ "$EUID" -eq 0 ]; then
    chown -R "${CURRENT_USER}:${CURRENT_USER}" "$TARGET_PORTAL" 2>/dev/null || true
fi
chmod 600 "$TARGET_PORTAL/.env" "$TARGET_DAEMON/.env" 2>/dev/null || true
chmod 775 "$TARGET_PORTAL/prisma" 2>/dev/null || true
chmod 660 "$TARGET_PORTAL/prisma/dev.db"* 2>/dev/null || true
chmod 660 "$TARGET_PORTAL/dev.db"* 2>/dev/null || true

# Verify and install Hardware Daemon production dependencies
if [ -d "$TARGET_DAEMON" ] && [ -f "$TARGET_DAEMON/package.json" ]; then
    if [ ! -d "$TARGET_DAEMON/node_modules/express" ]; then
        echo -e "--> Verifying Hardware Daemon production dependencies in ${TARGET_DAEMON}..."
        (cd "$TARGET_DAEMON" && npm install --omit=dev --loglevel=error)
        (cd "$TARGET_DAEMON" && npm rebuild epoll --build-from-source 2>/dev/null || true)
    fi
    if [ "$EUID" -eq 0 ]; then
        chown -R "${CURRENT_USER}:${CURRENT_USER}" "$TARGET_DAEMON" 2>/dev/null || true
    fi
fi

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
PORTAL_IP="${PORTAL_IP:-}"
PORTAL_DOMAIN="${PORTAL_DOMAIN:-wifi.local}"
PORTAL_PORT="${PORTAL_PORT:-3000}"
SETUP_SCRIPT="$ROOT_DIR/openwrt/setup-openwrt.sh"

for PENV in "$TARGET_PORTAL/.env" "$PORTAL_DIR/.env" "$ROOT_DIR/pisowifi-portal/.env"; do
    if [ -f "$PENV" ]; then
        ENV_ROUTER_IP=$(read_env_val "$PENV" "ROUTER_IP")
        [ -n "$ENV_ROUTER_IP" ] && ROUTER_IP="$ENV_ROUTER_IP"
        ENV_PORTAL_IP=$(read_env_val "$PENV" "PORTAL_IP")
        [ -n "$ENV_PORTAL_IP" ] && PORTAL_IP="$ENV_PORTAL_IP"
        ENV_PORTAL_DOMAIN=$(read_env_val "$PENV" "PORTAL_DOMAIN")
        [ -n "$ENV_PORTAL_DOMAIN" ] && PORTAL_DOMAIN="$ENV_PORTAL_DOMAIN"
        ENV_PORTAL_PORT=$(read_env_val "$PENV" "PORTAL_PORT")
        [ -n "$ENV_PORTAL_PORT" ] && PORTAL_PORT="$ENV_PORTAL_PORT"
        break
    fi
done

if [ -z "$PORTAL_IP" ]; then
    PORTAL_IP=$(ip -4 route get 1.1.1.1 2>/dev/null | awk '{for(i=1;i<=NF;i++) if($i=="src") print $(i+1)}' || hostname -I 2>/dev/null | awk '{print $1}' || echo "")
fi

for DENV in "$TARGET_DAEMON/.env" "$DAEMON_DIR/.env" "$ROOT_DIR/pisowifi-daemon/.env"; do
    if [ -f "$DENV" ]; then
        ENV_ROUTER_USER=$(read_env_val "$DENV" "ROUTER_SSH_USER")
        [ -n "$ENV_ROUTER_USER" ] && ROUTER_USER="$ENV_ROUTER_USER"
        break
    fi
done

if [ -f "$SETUP_SCRIPT" ] && ping -c 1 -W 2 "$ROUTER_IP" >/dev/null 2>&1; then
    SSH_KEY_ARG=""
    if [ -f /root/.ssh/id_rsa ]; then
        SSH_KEY_ARG="-i /root/.ssh/id_rsa"
    elif [ -f "$HOME/.ssh/id_rsa" ]; then
        SSH_KEY_ARG="-i $HOME/.ssh/id_rsa"
    fi

    if ssh -o BatchMode=yes -o StrictHostKeyChecking=no -o ConnectTimeout=4 $SSH_KEY_ARG "${ROUTER_USER}@${ROUTER_IP}" "echo OK" >/dev/null 2>&1; then
        echo -e "--> Deploying smart update to OpenWrt router (${ROUTER_IP})..."
        WIDS_ARG=""
        if [ -n "$SHIELD_SECRET" ]; then
            printf -v ESC_SHIELD_SECRET '%q' "$SHIELD_SECRET"
            WIDS_ARG="--shield-secret=${ESC_SHIELD_SECRET}"
        fi
        tr -d '\r' < "$SETUP_SCRIPT" | ssh -o BatchMode=yes -o StrictHostKeyChecking=no $SSH_KEY_ARG "${ROUTER_USER}@${ROUTER_IP}" "cat > /tmp/setup-openwrt.sh && chmod +x /tmp/setup-openwrt.sh && /tmp/setup-openwrt.sh --update --router-ip=${ROUTER_IP} --portal-ip=${PORTAL_IP} --portal-domain=${PORTAL_DOMAIN} ${WIDS_ARG}" || echo -e "${YELLOW}Notice: Router update completed with warnings.${NC}"
        echo -e "${GREEN}✓ OpenWrt router updated (active sessions & MAC tables preserved)!${NC}"
    else
        echo -e "${YELLOW}Notice: Passwordless SSH to OpenWrt is not active. Router config update skipped.${NC}"
    fi
else
    echo -e "${YELLOW}Notice: OpenWrt Router at ${ROUTER_IP} is offline or unreachable. Skipping router update.${NC}"
fi

# ------------------------------------------------------------------------------
# STEP 6: CLEAN STALE IPTABLES REDIRECT & RESTART SYSTEMD SERVICES
# ------------------------------------------------------------------------------
echo ""
echo -e "${PURPLE}[6/6] Updating systemd services & restarting background daemons...${NC}"

if [ "$EUID" -eq 0 ]; then
    # Ensure least-privilege sudoers rules stay up to date for Web UI updates
    if [ -f "$ROOT_DIR/scripts/setup-sudoers.sh" ]; then
        SUDO_USER="$CURRENT_USER" bash "$ROOT_DIR/scripts/setup-sudoers.sh" >/dev/null 2>&1 || true
    fi

    # Remove legacy iptables port 80 -> 3000 REDIRECT rules so Daemon port80Server handles port 80
    for RPORT in "${PORTAL_PORT}" 3000; do
        while iptables -t nat -C PREROUTING -p tcp --dport 80 -j REDIRECT --to-port "${RPORT}" 2>/dev/null; do
            iptables -t nat -D PREROUTING -p tcp --dport 80 -j REDIRECT --to-port "${RPORT}" 2>/dev/null || break
        done
        while iptables -t nat -C OUTPUT -p tcp -o lo --dport 80 -j REDIRECT --to-port "${RPORT}" 2>/dev/null; do
            iptables -t nat -D OUTPUT -p tcp -o lo --dport 80 -j REDIRECT --to-port "${RPORT}" 2>/dev/null || break
        done
    done
    if command -v netfilter-persistent >/dev/null 2>&1; then
        netfilter-persistent save 2>/dev/null || true
    fi

    # Remove stale ExecStartPre iptables REDIRECT lines from pisowifi-daemon.service
    if [ -f /etc/systemd/system/pisowifi-daemon.service ]; then
        sed -i '/iptables.*--dport 80.*REDIRECT/d' /etc/systemd/system/pisowifi-daemon.service 2>/dev/null || true
    fi

    # Ensure pisowifi-portal.service uses standalone node server.js bound to 127.0.0.1
    if [ -f /etc/systemd/system/pisowifi-portal.service ]; then
        if grep -q "npm.*start" /etc/systemd/system/pisowifi-portal.service 2>/dev/null; then
            echo -e "--> Modernizing pisowifi-portal.service to use high-speed standalone node server..."
            sed -i 's|ExecStart=.*npm.*start.*|ExecStart=/usr/bin/node server.js|g' /etc/systemd/system/pisowifi-portal.service 2>/dev/null || true
        fi
        if ! grep -q "HOSTNAME=127.0.0.1" /etc/systemd/system/pisowifi-portal.service 2>/dev/null; then
            sed -i '/^\[Service\]/a Environment=HOSTNAME=127.0.0.1' /etc/systemd/system/pisowifi-portal.service 2>/dev/null || true
        fi
    fi
fi

if [ "$HAS_SUDO_ACCESS" = true ]; then
    # Ensure cloudflared is installed for Remote Admin Tunnel (with retries)
    if ! command -v cloudflared >/dev/null 2>&1 && command -v curl >/dev/null 2>&1; then
        CF_ARCH=""
        case "$(uname -m)" in
            x86_64|amd64) CF_ARCH="amd64" ;;
            aarch64|arm64) CF_ARCH="arm64" ;;
            armv7l|armv6l|armhf) CF_ARCH="arm" ;;
        esac
        if [ -n "$CF_ARCH" ]; then
            echo -e "--> Installing cloudflared for Remote Admin Tunnel..."
            CF_URL="https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-${CF_ARCH}"
            for attempt in 1 2 3; do
                if curl -fSL --retry 2 --retry-delay 2 --connect-timeout 10 --max-time 120 "$CF_URL" -o /tmp/cloudflared 2>/dev/null; then
                    $SUDO_CMD install -m 0755 /tmp/cloudflared /usr/local/bin/cloudflared 2>/dev/null || true
                    rm -f /tmp/cloudflared
                    if command -v cloudflared >/dev/null 2>&1; then
                        echo -e "${GREEN}✓ cloudflared installed: $(cloudflared --version 2>/dev/null | head -n1)${NC}"
                        break
                    fi
                fi
                rm -f /tmp/cloudflared
                [ "$attempt" -lt 3 ] && echo -e "${YELLOW}⚠️ cloudflared download failed (attempt ${attempt}/3). Retrying in 3s...${NC}" && sleep 3
            done
        fi
    fi

    $SUDO_CMD systemctl daemon-reload 2>/dev/null || true

    # Restart Hardware Daemon
    echo -e "--> Restarting Hardware Daemon service..."
    $SUDO_CMD systemctl restart pisowifi-daemon.service 2>/dev/null || true

    # Schedule Web Portal restart with 3-second delay so script finishes responding to browser
    echo -e "--> Scheduling Web Portal service restart (3s delay)..."
    ( sleep 3 && $SUDO_CMD systemctl restart pisowifi-portal.service ) >/dev/null 2>&1 &

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
echo -e "🌐 System is live at: ${CYAN}http://${PORTAL_DOMAIN}/${NC} or ${CYAN}http://${PORTAL_IP}/${NC}"
echo -e "${CYAN}==============================================================${NC}"
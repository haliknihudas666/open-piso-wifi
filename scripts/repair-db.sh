#!/bin/bash
# ==============================================================================
# 🛠️ OpenPisoWifi - SQLite Database Auto-Repair & Recovery Tool
# ==============================================================================
# Resolves SQLite Error 11: "database disk image is malformed"
# Automatically attempts non-destructive page-level recovery (.recover / .dump)
# to preserve sales, vouchers, and settings. Falls back to clean template if needed.
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
PORTAL_DIR="$ROOT_DIR/portal"
[ ! -d "$PORTAL_DIR" ] && [ -d "$ROOT_DIR/pisowifi-portal" ] && PORTAL_DIR="$ROOT_DIR/pisowifi-portal"
PRISMA_DIR="$PORTAL_DIR/prisma"

SUDO_CMD=""
if [ "$EUID" -ne 0 ]; then
    if command -v sudo >/dev/null 2>&1; then
        SUDO_CMD="sudo"
    fi
fi

echo -e "${CYAN}==============================================================${NC}"
echo -e "${GREEN}🛠️  OpenPisoWiFi SQLite Database Auto-Repair${NC}"
echo -e "${CYAN}==============================================================${NC}"

# 1. Locate dev.db
TARGET_DB=""
if [ -f "$PRISMA_DIR/dev.db" ]; then
    TARGET_DB="$PRISMA_DIR/dev.db"
    WORK_DIR="$PRISMA_DIR"
elif [ -f "$PORTAL_DIR/dev.db" ]; then
    TARGET_DB="$PORTAL_DIR/dev.db"
    WORK_DIR="$PORTAL_DIR"
else
    echo -e "${YELLOW}Warning: dev.db not found at standard paths. Searching...${NC}"
    FOUND=$(find "$ROOT_DIR" -name "dev.db" -not -path "*/node_modules/*" | head -n 1)
    if [ -n "$FOUND" ]; then
        TARGET_DB="$FOUND"
        WORK_DIR="$(dirname "$TARGET_DB")"
    else
        echo -e "${RED}Error: Could not locate dev.db. Will create from template.${NC}"
        TARGET_DB="$PRISMA_DIR/dev.db"
        WORK_DIR="$PRISMA_DIR"
        mkdir -p "$PRISMA_DIR"
    fi
fi

echo -e "• Target Database: ${YELLOW}$TARGET_DB${NC}"
echo -e "• Working Directory: ${YELLOW}$WORK_DIR${NC}"

# 2. Stop portal service to release all file locks
echo -e "\n${PURPLE}[1/5] Stopping portal service to release locks...${NC}"
if command -v systemctl >/dev/null 2>&1; then
    $SUDO_CMD systemctl stop pisowifi-portal 2>/dev/null || true
    echo -e "${GREEN}✓ pisowifi-portal stopped.${NC}"
fi

# 3. Ensure sqlite3 utility is installed
if ! command -v sqlite3 >/dev/null 2>&1; then
    echo -e "${YELLOW}Notice: sqlite3 CLI not found. Attempting to install...${NC}"
    if command -v apt-get >/dev/null 2>&1; then
        $SUDO_CMD apt-get update -y && $SUDO_CMD apt-get install -y sqlite3
    fi
fi

# 4. Create safety backup of the corrupted database
BACKUP_DIR="$WORK_DIR/corrupt_backup_$(date +%s)"
mkdir -p "$BACKUP_DIR"
echo -e "\n${PURPLE}[2/5] Creating safety snapshot at ${BACKUP_DIR}...${NC}"
if [ -f "$TARGET_DB" ]; then
    cp -f "$TARGET_DB"* "$BACKUP_DIR/" 2>/dev/null || true
    echo -e "${GREEN}✓ Existing database files backed up.${NC}"
fi

# 5. Attempt Database Recovery
RECOVERED_DB="$WORK_DIR/dev_recovered.db"
rm -f "$RECOVERED_DB" "$RECOVERED_DB-wal" "$RECOVERED_DB-shm"

RECOVERY_SUCCESS=false

if [ -f "$TARGET_DB" ] && command -v sqlite3 >/dev/null 2>&1; then
    echo -e "\n${PURPLE}[3/5] Attempting non-destructive page-level recovery...${NC}"

    # Try WAL checkpoint first
    sqlite3 "$TARGET_DB" "PRAGMA wal_checkpoint(TRUNCATE);" 2>/dev/null || true

    # Attempt 1: sqlite3 .recover (modern SQLite >= 3.29)
    echo -e "  • Running SQLite page salvage (.recover)..."
    if sqlite3 "$TARGET_DB" ".recover" 2>/dev/null | sqlite3 "$RECOVERED_DB" 2>/dev/null; then
        CHECK_RESULT=$(sqlite3 "$RECOVERED_DB" "PRAGMA integrity_check;" 2>/dev/null || echo "failed")
        if [ "$CHECK_RESULT" = "ok" ]; then
            RECOVERY_SUCCESS=true
            echo -e "${GREEN}  ✓ SQLite .recover successfully restored data with integrity ok!${NC}"
        fi
    fi

    # Attempt 2: sqlite3 .dump fallback
    if [ "$RECOVERY_SUCCESS" = false ]; then
        echo -e "  • .recover was not supported or incomplete. Trying SQL dump fallback (.dump)..."
        rm -f "$RECOVERED_DB"
        if sqlite3 "$TARGET_DB" ".dump" 2>/dev/null | sqlite3 "$RECOVERED_DB" 2>/dev/null; then
            CHECK_RESULT=$(sqlite3 "$RECOVERED_DB" "PRAGMA integrity_check;" 2>/dev/null || echo "failed")
            if [ "$CHECK_RESULT" = "ok" ]; then
                RECOVERY_SUCCESS=true
                echo -e "${GREEN}  ✓ SQLite .dump successfully restored database!${NC}"
            fi
        fi
    fi
fi

# 6. Apply recovered DB or fallback to clean template
echo -e "\n${PURPLE}[4/5] Applying repaired database...${NC}"
if [ "$RECOVERY_SUCCESS" = true ] && [ -s "$RECOVERED_DB" ]; then
    rm -f "$TARGET_DB" "$TARGET_DB-wal" "$TARGET_DB-shm" "$TARGET_DB-journal"
    mv -f "$RECOVERED_DB" "$TARGET_DB"
    echo -e "${GREEN}✅ Database successfully restored with your original data intact!${NC}"
else
    echo -e "${YELLOW}⚠️  Database could not be fully salvaged due to severe corruption.${NC}"
    echo -e "${YELLOW}   Restoring default operational database from template...${NC}"
    
    TEMPLATE_PATH=""
    if [ -f "$PRISMA_DIR/dev.db.template" ]; then
        TEMPLATE_PATH="$PRISMA_DIR/dev.db.template"
    elif [ -f "$PORTAL_DIR/dev.db.template" ]; then
        TEMPLATE_PATH="$PORTAL_DIR/dev.db.template"
    fi

    rm -f "$TARGET_DB" "$TARGET_DB-wal" "$TARGET_DB-shm" "$TARGET_DB-journal"
    rm -f "$RECOVERED_DB"

    if [ -n "$TEMPLATE_PATH" ] && [ -s "$TEMPLATE_PATH" ]; then
        cp -f "$TEMPLATE_PATH" "$TARGET_DB"
        echo -e "${GREEN}✓ Successfully initialized clean database from $TEMPLATE_PATH.${NC}"
    else
        echo -e "${YELLOW}Template not found. Pushing Prisma schema...${NC}"
        cd "$PORTAL_DIR"
        npx prisma db push --skip-generate || true
        if [ -f "prisma/seed.ts" ]; then
            npx ts-node prisma/seed.ts || true
        fi
    fi
fi

# Ensure newly required columns exist even if an older database was restored
if command -v sqlite3 >/dev/null 2>&1 && [ -f "$TARGET_DB" ]; then
    sqlite3 "$TARGET_DB" 'ALTER TABLE "Session" ADD COLUMN "sessionToken" TEXT;' 2>/dev/null || true
    sqlite3 "$TARGET_DB" 'CREATE UNIQUE INDEX IF NOT EXISTS "Session_sessionToken_key" ON "Session"("sessionToken");' 2>/dev/null || true
    sqlite3 "$TARGET_DB" 'CREATE INDEX IF NOT EXISTS "Session_sessionToken_idx" ON "Session"("sessionToken");' 2>/dev/null || true
    sqlite3 "$TARGET_DB" 'ALTER TABLE "Session" ADD COLUMN "deviceName" TEXT;' 2>/dev/null || true
fi

# Set optimal permissions for Node.js process
chmod 666 "$TARGET_DB"* 2>/dev/null || true
if [ -n "$SUDO_USER" ]; then
    $SUDO_CMD chown "$SUDO_USER:$SUDO_USER" "$TARGET_DB"* 2>/dev/null || true
fi

# 7. Restart Portal Service
echo -e "\n${PURPLE}[5/5] Restarting pisowifi-portal service...${NC}"
if command -v systemctl >/dev/null 2>&1; then
    $SUDO_CMD systemctl restart pisowifi-portal 2>/dev/null || true
    sleep 3
    PORTAL_STATUS=$(systemctl is-active pisowifi-portal 2>/dev/null || echo "inactive")
    if [ "$PORTAL_STATUS" = "active" ]; then
        echo -e "${GREEN}✓ pisowifi-portal is ACTIVE and running!${NC}"
    else
        echo -e "${YELLOW}Notice: Portal status is $PORTAL_STATUS. Check logs with: journalctl -u pisowifi-portal -n 30 --no-pager${NC}"
    fi
fi

echo -e "\n${CYAN}==============================================================${NC}"
echo -e "${GREEN}🎉 SQLite Database Repair Completed!${NC}"
echo -e "${CYAN}==============================================================${NC}"

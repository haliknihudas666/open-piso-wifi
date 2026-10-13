#!/bin/bash
# ==============================================================================
# 🔑 OpenPisoWifi - Setup Sudoers Permissions for 1-Click Updates & Services
# ==============================================================================
# Grants passwordless sudo for service restarts, iptables redirect, and reboot.
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

echo -e "${CYAN}==============================================================${NC}"
echo -e "${GREEN}🔑 Configuring Passwordless Sudo for OpenPisoWifi...${NC}"
echo -e "${CYAN}==============================================================${NC}"
echo -e "• User: ${YELLOW}${CURRENT_USER}${NC}"
echo -e "• Target: ${YELLOW}/etc/sudoers.d/hudas-pisowifi${NC}"
echo ""

sudo mkdir -p /etc/sudoers.d

sudo tee /etc/sudoers.d/hudas-pisowifi > /dev/null << EOF
# OpenPisoWifi passwordless sudo permissions for background service management & OTA updates
${CURRENT_USER} ALL=(ALL) NOPASSWD: /bin/systemctl, /usr/bin/systemctl, /bin/systemd-run, /usr/bin/systemd-run, /sbin/iptables, /usr/sbin/iptables, /bin/chown, /usr/bin/chown, /bin/chmod, /usr/bin/chmod, /bin/true, /usr/bin/true, /bin/sed, /usr/bin/sed, /sbin/reboot, /usr/sbin/reboot, /bin/reboot, /usr/bin/reboot, ${ROOT_DIR}/scripts/update.sh, /bin/bash ${ROOT_DIR}/scripts/update.sh, /usr/bin/bash ${ROOT_DIR}/scripts/update.sh
EOF

sudo chmod 0440 /etc/sudoers.d/hudas-pisowifi

echo -e "${GREEN}✅ Sudoers configuration created successfully!${NC}"
echo ""
echo -e "• Permissions verified:"
sudo -l -U "${CURRENT_USER}" | grep -E "systemctl|iptables|reboot|update.sh" || true

echo ""
echo -e "${CYAN}==============================================================${NC}"
echo -e "${GREEN}🎉 Setup Complete! You can now run 1-Click Updates from Admin.${NC}"
echo -e "${CYAN}==============================================================${NC}"

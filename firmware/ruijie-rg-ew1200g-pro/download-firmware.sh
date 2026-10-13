#!/usr/bin/env bash
# ==============================================================================
# 📡 OpenPisoWiFi - Download Official Ruijie RG-EW1200G Pro OpenWrt Firmware
# Target: ramips/mt7621 | Profile: ruijie_rg-ew1200g-pro-v1.1
# Version: OpenWrt 25.12.5 (Stable)
# ==============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BIN_DIR="${SCRIPT_DIR}/bin"
mkdir -p "${BIN_DIR}"

BASE_URL="https://downloads.openwrt.org/releases/25.12.5/targets/ramips/mt7621"
SYSUPGRADE_FILE="openwrt-25.12.5-ramips-mt7621-ruijie_rg-ew1200g-pro-v1.1-squashfs-sysupgrade.bin"
KERNEL_FILE="openwrt-25.12.5-ramips-mt7621-ruijie_rg-ew1200g-pro-v1.1-initramfs-kernel.bin"
SHA256_FILE="${SCRIPT_DIR}/sha256sums"

EXPECTED_SYSUPGRADE_SHA256="d9f17619041b99116253e8b45430d10108c8021e107cc639156f8040ac8fbb3c"
EXPECTED_KERNEL_SHA256="199f42f37c765a14aba4523ba90a2672828a9342bd46c9aa4aeed12f0f57a770"

# Colors
GREEN='\033[0;32m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${CYAN}==================================================================${NC}"
echo -e "${GREEN}📡 Ruijie RG-EW1200G Pro v1.1 - OpenWrt 25.12.5 Firmware Downloader${NC}"
echo -e "${CYAN}==================================================================${NC}"
echo -e "• Target:        ramips/mt7621"
echo -e "• Profile:       ruijie_rg-ew1200g-pro-v1.1"
echo -e "• Version:       25.12.5 (Stable)"
echo -e "• Destination:   ${BIN_DIR}"
echo ""

download_and_verify() {
    local filename="$1"
    local expected_hash="$2"
    local target_path="${BIN_DIR}/${filename}"
    local url="${BASE_URL}/${filename}"

    if [ -f "${target_path}" ]; then
        echo -e "${YELLOW}File already exists: ${filename}${NC}"
        echo -e "Checking checksum..."
    else
        echo -e "${CYAN}Downloading: ${filename}...${NC}"
        if command -v curl >/dev/null 2>&1; then
            curl -fL --progress-bar -o "${target_path}" "${url}"
        elif command -v wget >/dev/null 2>&1; then
            wget -q --show-progress -O "${target_path}" "${url}"
        else
            echo -e "${RED}Error: Neither curl nor wget is available.${NC}"
            exit 1
        fi
    fi

    # Verify SHA256
    local computed_hash=""
    if command -v sha256sum >/dev/null 2>&1; then
        computed_hash=$(sha256sum "${target_path}" | awk '{print $1}')
    elif command -v shasum >/dev/null 2>&1; then
        computed_hash=$(shasum -a 256 "${target_path}" | awk '{print $1}')
    else
        echo -e "${YELLOW}Warning: No sha256sum command found. Skipping hash verification.${NC}"
        return 0
    fi

    if [ "${computed_hash}" = "${expected_hash}" ]; then
        echo -e "${GREEN}✓ Verified SHA256: ${computed_hash}${NC}"
    else
        echo -e "${RED}❌ SHA256 MISMATCH for ${filename}!${NC}"
        echo -e "  Expected: ${expected_hash}"
        echo -e "  Actual:   ${computed_hash}"
        rm -f "${target_path}"
        exit 1
    fi
    echo ""
}

MODE="${1:-all}"

case "${MODE}" in
    sysupgrade)
        download_and_verify "${SYSUPGRADE_FILE}" "${EXPECTED_SYSUPGRADE_SHA256}"
        ;;
    kernel|initramfs|recovery)
        download_and_verify "${KERNEL_FILE}" "${EXPECTED_KERNEL_SHA256}"
        ;;
    all|*)
        download_and_verify "${SYSUPGRADE_FILE}" "${EXPECTED_SYSUPGRADE_SHA256}"
        download_and_verify "${KERNEL_FILE}" "${EXPECTED_KERNEL_SHA256}"
        ;;
esac

echo -e "${GREEN}🎉 Firmware download and verification completed successfully!${NC}"
echo -e "Files available in: ${BIN_DIR}"

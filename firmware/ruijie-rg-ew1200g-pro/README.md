# 📡 Ruijie Reyee RG-EW1200G Pro (v1.1) - OpenWrt 25.12.5 Firmware

Official OpenWrt firmware package for the **Ruijie Reyee RG-EW1200G Pro (v1.1)** Gigabit AC1200 Router running **OpenWrt 25.12.5 (Stable)**.

- **OpenWrt Firmware Selector:** [Ruijie RG-EW1200G Pro v1.1 @ 25.12.5](https://firmware-selector.openwrt.org/?version=25.12.5&target=ramips%2Fmt7621&id=ruijie_rg-ew1200g-pro-v1.1)
- **Target Architecture:** `ramips/mt7621`
- **Device Profile ID:** `ruijie_rg-ew1200g-pro-v1.1`
- **Release Version:** `25.12.5` (Stable Release)

---

## 🛠 Hardware Specifications

| Component | Specification |
| :--- | :--- |
| **Vendor & Model** | Ruijie Networks / Reyee RG-EW1200G PRO (v1.1) |
| **SoC / CPU** | MediaTek MT7621AT (MIPS 1004Kc Dual-Core, 4 Threads @ 880 MHz) |
| **System RAM** | 128 MB DDR3 |
| **Storage / Flash** | 16 MB SPI NOR Flash |
| **Network Interfaces** | 1x Gigabit WAN (10/100/1000 Mbps) + 3x Gigabit LAN (10/100/1000 Mbps) |
| **2.4 GHz Wi-Fi** | MediaTek MT7603EN (2x2 MIMO 802.11b/g/n, up to 300/400 Mbps) |
| **5 GHz Wi-Fi** | MediaTek MT7615N / MT7613BEN (2x2 Wave 2 MU-MIMO 802.11a/n/ac, up to 867 Mbps) |
| **Included Drivers** | `kmod-mt7615-firmware` |

---

## 💾 Official Firmware Images & Checksums

### 1. SquashFS Sysupgrade Image (Recommended for existing OpenWrt or LuCI)
- **Filename:** `openwrt-25.12.5-ramips-mt7621-ruijie_rg-ew1200g-pro-v1.1-squashfs-sysupgrade.bin`
- **Type:** `sysupgrade`
- **Size:** `8,127,051 bytes (~7.75 MB)`
- **SHA256:** `d9f17619041b99116253e8b45430d10108c8021e107cc639156f8040ac8fbb3c`
- **Direct Download:** [Sysupgrade Image](https://downloads.openwrt.org/releases/25.12.5/targets/ramips/mt7621/openwrt-25.12.5-ramips-mt7621-ruijie_rg-ew1200g-pro-v1.1-squashfs-sysupgrade.bin)

### 2. Initramfs Kernel Recovery Image (For TFTP / Initial OEM Recovery)
- **Filename:** `openwrt-25.12.5-ramips-mt7621-ruijie_rg-ew1200g-pro-v1.1-initramfs-kernel.bin`
- **Type:** `kernel (initramfs)`
- **Size:** `7,918,558 bytes (~7.55 MB)`
- **SHA256:** `199f42f37c765a14aba4523ba90a2672828a9342bd46c9aa4aeed12f0f57a770`
- **Direct Download:** [Initramfs Kernel Image](https://downloads.openwrt.org/releases/25.12.5/targets/ramips/mt7621/openwrt-25.12.5-ramips-mt7621-ruijie_rg-ew1200g-pro-v1.1-initramfs-kernel.bin)

---

## ⚡ 1-Click Firmware Downloader

You can download and verify the images automatically using the scripts included in this folder:

### On Linux / Raspberry Pi / macOS:
```bash
# Download and verify both images to ./bin/
bash firmware/ruijie-rg-ew1200g-pro/download-firmware.sh

# Or download only sysupgrade:
bash firmware/ruijie-rg-ew1200g-pro/download-firmware.sh sysupgrade
```

### On Windows (PowerShell):
```powershell
# Download and verify both images to .\bin\
powershell -ExecutionPolicy Bypass -File firmware\ruijie-rg-ew1200g-pro\download-firmware.ps1

# Or download only sysupgrade:
powershell -ExecutionPolicy Bypass -File firmware\ruijie-rg-ew1200g-pro\download-firmware.ps1 -Mode sysupgrade
```

---

## 🚀 Flashing & Installation Guide

### Method A: Upgrading an existing OpenWrt Router (CLI Sysupgrade)
1. Copy the `sysupgrade.bin` file to the router:
   ```bash
   scp firmware/ruijie-rg-ew1200g-pro/bin/openwrt-25.12.5-ramips-mt7621-ruijie_rg-ew1200g-pro-v1.1-squashfs-sysupgrade.bin root@192.168.1.1:/tmp/sysupgrade.bin
   ```
2. Log in via SSH:
   ```bash
   ssh root@192.168.1.1
   ```
3. Execute sysupgrade:
   ```bash
   # Flashing without preserving config (-n for clean Piso Wi-Fi setup):
   sysupgrade -v -n /tmp/sysupgrade.bin
   ```
4. The router will write the flash memory and reboot in approximately 2 minutes.

### Method B: Upgrading via LuCI Web Interface
1. Open your browser and navigate to `http://192.168.1.1`.
2. Go to **System** ➔ **Backup / Flash Firmware**.
3. Under **Flash new firmware image**, click **Upload image...** and select `openwrt-25.12.5-ramips-mt7621-ruijie_rg-ew1200g-pro-v1.1-squashfs-sysupgrade.bin`.
4. Review the SHA256 checksum and click **Continue**.

### Method C: Initial Flash from Stock Ruijie Reyee Firmware
1. Connect your PC directly to **LAN Port 2** of the router with a standard Ethernet cable.
2. In stock Reyee firmware web management (`http://192.168.110.1` or `http://192.168.1.1`), navigate to **System** ➔ **Upgrade**.
3. If using U-Boot TFTP recovery:
   - Configure your PC IP as `192.168.1.2/24`.
   - Start a TFTP server serving the `initramfs-kernel.bin` renamed to the router's expected recovery filename.
   - Power on router while holding the Reset button for 8 seconds.
   - Once booted into initramfs, connect via SSH (`192.168.1.1`), upload `sysupgrade.bin`, and run `sysupgrade -v -n /tmp/sysupgrade.bin`.

---

## 🔗 Next Step: OpenPisoWiFi Auto-Configuration

Once OpenWrt 25.12.5 is running on your Ruijie router:
1. Connect Raspberry Pi **eth0** to **LAN Port 1** on the Ruijie router.
2. Run the deployment script from the Raspberry Pi:
   ```bash
   bash scripts/deploy-router.sh
   ```
3. Full setup guide: See [`openwrt/README-Ruijie-OpenWrt.md`](file:///d:/Hudas/Documents/Repository/piso-wifi/openwrt/README-Ruijie-OpenWrt.md).

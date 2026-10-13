# 📡 Ruijie RG-EW1200G Pro + OpenWrt Piso Wi-Fi Setup Guide

Complete guide for configuring the **Ruijie Reyee RG-EW1200G Pro** Gigabit AC1200 Dual-Band Router with **OpenWrt (23.05+ / 24.x / 25.12.5+)** paired with a **Raspberry Pi Paywall Controller**.

---

## 🛠 Hardware Specifications

- **Model:** Ruijie Reyee RG-EW1200G Pro
- **SoC:** MediaTek MT7621AT (MIPS 1004Kc Dual-Core, 4 Threads @ 880 MHz)
- **RAM:** 128 MB DDR3
- **Flash:** 16 MB SPI NOR
- **Ethernet:** 1x Gigabit WAN + 3x Gigabit LAN (10/100/1000 Mbps)
- **Wi-Fi 2.4 GHz:** MediaTek MT7603EN (2x2 MIMO 802.11b/g/n, up to 300/400 Mbps)
- **Wi-Fi 5 GHz:** MediaTek MT7615N / MT7613BEN (2x2 MIMO 802.11a/n/ac Wave 2, up to 867 Mbps)

---

## 🔌 Physical Cabling Diagram

```
                 [ 🌐 ISP Internet Modem / Fiber ONU ]
                                  │
                          (Ethernet Cable)
                                  │
                                  ▼
                   ┌──────────────────────────────┐
                   │  WAN Port (Yellow / Blue)    │
                   │                              │
                   │   Ruijie RG-EW1200G Pro      │
                   │   (OpenWrt: 192.168.1.1)     │
                   │                              │
                   │  LAN 1      LAN 2      LAN 3 │
                   └───┬──────────────────────────┘
                       │
               (Ethernet Cable)
                       │
                       ▼
            ┌──────────────────────────────┐
            │  Raspberry Pi 3B+ / 4B / 5   │
            │  Static IP: 192.168.1.240    │
            │                              │
            │  • Next.js Portal  (:3000)   │
            │  • Hardware Daemon (:4000)   │
            │  • Coin & Inhibit (PIN 3/5)  │
            └──────────────────────────────┘
```

---

## 🚀 Step 1: Flashing OpenWrt on Ruijie RG-EW1200G Pro

1. **Download OpenWrt 25.12.5 (Stable) for Ruijie RG-EW1200G Pro v1.1 (`ramips/mt7621`)**:
   - **Firmware Selector:** [OpenWrt Firmware Selector (25.12.5)](https://firmware-selector.openwrt.org/?version=25.12.5&target=ramips%2Fmt7621&id=ruijie_rg-ew1200g-pro-v1.1)
   - **Sysupgrade Image:** [openwrt-25.12.5-ramips-mt7621-ruijie_rg-ew1200g-pro-v1.1-squashfs-sysupgrade.bin](https://downloads.openwrt.org/releases/25.12.5/targets/ramips/mt7621/openwrt-25.12.5-ramips-mt7621-ruijie_rg-ew1200g-pro-v1.1-squashfs-sysupgrade.bin)  
     *(SHA256: `d9f17619041b99116253e8b45430d10108c8021e107cc639156f8040ac8fbb3c`)*
   - **Initramfs Kernel Recovery Image:** [openwrt-25.12.5-ramips-mt7621-ruijie_rg-ew1200g-pro-v1.1-initramfs-kernel.bin](https://downloads.openwrt.org/releases/25.12.5/targets/ramips/mt7621/openwrt-25.12.5-ramips-mt7621-ruijie_rg-ew1200g-pro-v1.1-initramfs-kernel.bin)  
     *(SHA256: `199f42f37c765a14aba4523ba90a2672828a9342bd46c9aa4aeed12f0f57a770`)*

   > 💡 **Automated Downloader:** You can run `bash firmware/ruijie-rg-ew1200g-pro/download-firmware.sh` (or `firmware/ruijie-rg-ew1200g-pro/download-firmware.ps1` on Windows) to automatically download and verify these binaries.

2. **Connect your PC via Ethernet cable** to **LAN Port 2** of the router.
3. **Flashing Procedure:**
   - **From Stock Reyee OEM Firmware:** Navigate to router administration (`192.168.110.1` or `192.168.1.1`), go to **System** ➔ **Upgrade**, or boot the router via TFTP recovery with the initramfs kernel image.
   - **From Existing OpenWrt / Sysupgrade:**
     ```bash
     scp firmware/ruijie-rg-ew1200g-pro/bin/openwrt-25.12.5-ramips-mt7621-ruijie_rg-ew1200g-pro-v1.1-squashfs-sysupgrade.bin root@192.168.1.1:/tmp/sysupgrade.bin
     ssh root@192.168.1.1 "sysupgrade -v -n /tmp/sysupgrade.bin"
     ```
4. Once rebooted into OpenWrt 25.12.5, open `http://192.168.1.1` in your browser and verify LuCI or SSH access (`root` with no password initially).


---

## 🍓 Step 2: Configure Static IP on Raspberry Pi (`192.168.1.240`)

On your Raspberry Pi, configure a static IP on `eth0`:

### For Raspberry Pi OS (NetworkManager / Bookworm):
```bash
sudo nmcli connection modify "Wired connection 1" \
    ipv4.addresses 192.168.1.240/24 \
    ipv4.gateway 192.168.1.1 \
    ipv4.dns "1.1.1.1 8.8.8.8" \
    ipv4.method manual

sudo nmcli connection up "Wired connection 1"
```

### For Legacy / dhcpcd:
Edit `/etc/dhcpcd.conf`:
```ini
interface eth0
static ip_address=192.168.1.240/24
static routers=192.168.1.1
static domain_name_servers=1.1.1.1 8.8.8.8
```
Then restart networking: `sudo systemctl restart dhcpcd`.

---

## ⚡ Step 3: Run the 1-Click OpenWrt Automated Setup

From your Raspberry Pi:

```bash
# Recommended: Run the 1-click router deployer script
bash scripts/deploy-router.sh

# Or manually:
cat openwrt/setup-openwrt.sh | ssh root@192.168.1.1 "cat > /tmp/setup-openwrt.sh && chmod +x /tmp/setup-openwrt.sh && /tmp/setup-openwrt.sh"
```

### What This Script Configures Automatically:
- ✅ Router Gateway IP: `192.168.1.1`
- ✅ DHCP Client Pool: `192.168.1.10` – `192.168.1.230`
- ✅ Dual-Band Open Wi-Fi: **`OpenPisoWifi`** (2.4GHz) and **`OpenPisoWifi_5G`** (5GHz)
- ✅ Dedicated `nftables` captive firewall table (`piso_portal`) with `piso_auth` timeout set, `piso_whitelist`, `piso_blacklist`
- ✅ Port 80 HTTP redirection to `192.168.1.240:3000` with hairpin NAT masquerading
- ✅ Traffic Control QoS packages (`tc-tiny`) for global bandwidth speed limiting
- ✅ Dropbear SSH access on port 22 with persistent key authorization

---

## 🔑 Step 4: Authorize Raspberry Pi SSH Key

To allow the Raspberry Pi Daemon to command the OpenWrt router without passwords:

On your Raspberry Pi:
```bash
cd /home/pi/piso-wifi/pisowifi-daemon
bash scripts/setup-ssh-keys.sh
```

This generates `~/.ssh/id_rsa` and appends it to `/etc/dropbear/authorized_keys` on `192.168.1.1`.

---

## 🧪 Step 5: Test the Setup

1. **Test SSH from Raspberry Pi:**
   ```bash
   ssh root@192.168.1.1 "uname -a"
   ```
2. **Test Authorizing a MAC manually:**
   ```bash
   # Add a test MAC to OpenWrt firewall with 60m timeout
   ssh root@192.168.1.1 "nft add element inet piso_portal piso_auth { 00:11:22:33:44:55 timeout 60m }"

   # List authorized MACs
   ssh root@192.168.1.1 "nft list set inet piso_portal piso_auth"

   # Remove MAC
   ssh root@192.168.1.1 "nft delete element inet piso_portal piso_auth { 00:11:22:33:44:55 }"
   ```
3. **Connect a Phone to Wi-Fi:**
   - Connect to `OpenPisoWifi` or `OpenPisoWifi_5G`.
   - The phone captive popup will immediately trigger and open `http://192.168.1.240:3000`.
   - Drop a coin (or click test simulator button) and click **Connect**.
   - Your phone will be instantly granted internet access!

---

## 🛠 Useful OpenWrt Diagnostic Commands

| Purpose | OpenWrt Command |
| :--- | :--- |
| **View Active Authorized MACs** | `nft list set inet piso_portal piso_auth` |
| **View VIP Whitelisted MACs** | `nft list set inet piso_portal piso_whitelist` |
| **View Blacklisted Banned MACs** | `nft list set inet piso_portal piso_blacklist` |
| **View Full Captive Firewall Table** | `nft list table inet piso_portal` |
| **View DHCP Leases** | `cat /tmp/dhcp.leases` |
| **View Connected Wi-Fi Clients** | `iwinfo wlan0 assoclist`<br>`iwinfo wlan1 assoclist` |
| **View Live Firewall Logs** | `logread -f \| grep firewall` |
| **Restart Firewall** | `/etc/init.d/firewall restart && /etc/init.d/piso-firewall restart` |
| **Check Dropbear SSH Status** | `/etc/init.d/dropbear status` |
| **View Traffic Control QoS Queues** | `tc -s qdisc show dev br-lan` |

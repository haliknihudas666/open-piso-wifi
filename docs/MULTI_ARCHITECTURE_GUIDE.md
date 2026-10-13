# OpenPisoWiFi Multi-Architecture & Deployment Guide

This guide details the three supported deployment builds for OpenPisoWiFi, the universal standalone Pi Gateway setup, and cloud admin hosting on Vercel or Cloudflare Pages.

> 🛠️ **Full Step-by-Step Hardware & Wiring Manual:** Looking for pinout charts, 10kΩ resistor wiring schematics, and verified Shopee parts? Check out the [Dedicated Build Guide](file:///docs/build-guide.html).
> ☁️ **Cloud, Bots & Remote Fleet Guide:** Looking for step-by-step setup for Telegram Push Alerts, Supabase Cloud Sync, Vercel Dashboard, or Cloudflare Tunnel (CGNAT bypass)? Check out the [Cloud & Integrations Guide](file:///docs/CLOUD_AND_INTEGRATIONS_GUIDE.md).

---

## 1. Architectural Builds Overview

| Capability | Build 1: Pi + OpenWrt Router | Build 2: Universal Pi Gateway | Build 3: ESP32 + OpenWrt (No Pi) |
|---|---|---|---|
| **Internet Enforcement** | OpenWrt `nftables` / `fw4` over SSH | **Local Linux `nftables` kernel sets** | OpenWrt `nftables` via local agent |
| **Captive Portal Host** | Raspberry Pi (Next.js :3000) | Raspberry Pi (Next.js :3000) | OpenWrt router (`uhttpd` / lightweight) |
| **Coinslot Hardware** | Pi GPIO + ESP32 Satellites | Pi GPIO + ESP32 Satellites | ESP32 Satellites only |
| **Wi-Fi Hardware** | OpenWrt-flashed router (e.g. Ruijie) | **Any AP, Any Brand** (AP/Bridge mode) | OpenWrt-flashed router |
| **Local Admin Console** | Yes (`http://10.0.0.1:3000/admin`) | Yes (`http://10.0.0.1:3000/admin`) | Setup page only (Wi-Fi/Pins) |
| **Cloud Admin** | Optional mirror & remote control | Optional mirror & remote control | **Primary fleet management** |

### Verified Hardware Bill of Materials (BOM):
* **ESP32 DevKit Board:** [Shopee (All Pins / International)](https://s.shopee.ph/3LRZNrLXF6) / [Shopee (Local PH)](https://s.shopee.ph/9zyTKJnBzQ)
* **Ruijie Reyee EW1200G Pro Gigabit Router:** [Shopee](https://s.shopee.ph/gQoE0RlxS)
* **Universal Multi-Coinslot (₱1, ₱5, ₱10, ₱20):** [Allan Coinslot](https://s.shopee.ph/AKbJjpgYbD) / [Weiyu Coinslot](https://s.shopee.ph/2BFc0soeRA)
* **12V Centralized CCTV Switching PSU:** [Shopee](https://s.shopee.ph/4B0gOiQgzp)
* **Quick Lever Terminal Blocks (Solderless):** [Option 1](https://s.shopee.ph/30oj0f9bC4) / [Option 2](https://s.shopee.ph/1BN4pkeSvz)
* **12V to 5V Step-Down Buck Converter (Pi / ESP32 Power):** [USB Output Plug-and-Play](https://s.shopee.ph/8fT5vZTSBc) / [Solder / Screw Terminal Type](https://s.shopee.ph/905wKEhobz)

---

## 2. Build 2: Universal Pi Gateway Setup (Plug-and-Play)

Build 2 turns the Raspberry Pi into the central gateway and router itself. Any consumer Wi-Fi router or access point (TP-Link, Tenda, Asus, Ruijie, Mikrotik) can be plugged in without flashing OpenWrt, provided it is configured in **AP / Bridge Mode**.

### Physical Topology:
```
ISP Modem/ONT ──[Ethernet]──▶ [Pi eth0: WAN, DHCP Client]
                              [Pi Gateway: nftables NAT, dnsmasq DHCP/DNS, Portal :3000, Daemon :4000]
                              [Pi eth1 (USB-to-LAN): Static 10.0.0.1/22] ──[Ethernet]──▶ Any Wi-Fi AP (Bridge Mode)
                                                                                          └── Customer phones & ESP32s
```

### Installation Steps on Raspberry Pi OS:
```bash
# 1. Run the automated gateway setup script
sudo ./scripts/setup-pi-gateway.sh --wan-iface eth0 --lan-iface eth1

# 2. Configure the daemon environment
echo "ROUTER_MODE=local_linux" >> daemon/.env
echo "LAN_IFACE=eth1" >> daemon/.env
echo "WAN_IFACE=eth0" >> daemon/.env

# 3. Restart services
sudo systemctl restart pisowifi-daemon
sudo systemctl restart pisowifi-portal
```

### Gateway Script Capabilities:
* `sudo ./scripts/setup-pi-gateway.sh --status`: Inspect WAN/LAN IP routing, active authorized client count, and services.
* `sudo ./scripts/setup-pi-gateway.sh --dry-run`: Preview all configuration changes without modifying the system.
* `sudo ./scripts/setup-pi-gateway.sh --rollback`: Cleanly tear down nftables tables, remove dnsmasq configs, and restore default networking.

---

## 3. Build 3: Direct ESP32 to OpenWrt Router (LAN-First)

For kiosks operating with an ESP32 coinslot and an OpenWrt router, coin pulses and network authorization **never depend on active internet access**.

### Why Direct LAN Communication is Enforced:
1. **Low Latency (10–25ms):** Direct HTTP/ubus calls between ESP32 and OpenWrt on the local subnet are near-instantaneous. Customers see their session active immediately upon dropping a coin.
2. **Offline Survivability:** If the ISP modem goes down, customers can still insert coins and access internal local network portals, cached services, or offline hotspot menus.
3. **Bandwidth Efficiency:** Zero cellular or broadband quota is consumed for real-time pulse debouncing.
4. **Cloud Separation:** Supabase receives sales and telemetry asynchronously in the background. If internet drops, records are queued in local memory and synced upon recovery.

---

## 4. Cloud Fleet Admin Deployment

The OpenPisoWiFi Cloud Admin can be hosted for free on either **Vercel** or **Cloudflare Pages**.

### Supabase Database Initialization:
1. Open your **Supabase Dashboard** -> **SQL Editor**.
2. Run the SQL schema from [`supabase/schema.sql`](file:///d:/Hudas/Documents/Repository/piso-wifi/supabase/schema.sql).
3. Copy your **Project URL** and **Public Anon Key**.

### Option A: Deploy to Vercel (Recommended)
1. Push your repository to GitHub.
2. Import the project into [Vercel](https://vercel.com):
   * Root Directory: `portal`
   * Framework Preset: **Next.js**
   * Build Command: `prisma generate && next build`
3. Add Environment Variables:
   * `NEXT_PUBLIC_SUPABASE_URL`: `https://your-project.supabase.co`
   * `NEXT_PUBLIC_SUPABASE_KEY`: `your-anon-key`
4. Click **Deploy**.

### Option B: Deploy to Cloudflare Pages
1. Log in to the [Cloudflare Dashboard](https://dash.cloudflare.com) -> **Workers & Pages** -> **Create application** -> **Pages**.
2. Connect your Git repository:
   * Build output directory: `.next`
   * Root directory: `portal`
   * Build command: `npx prisma generate && npx @cloudflare/next-on-pages` (or standard Next.js preset)
3. Set Environment Variables:
   * `NODE_VERSION`: `20`
   * `NEXT_PUBLIC_SUPABASE_URL`: `https://your-project.supabase.co`
   * `NEXT_PUBLIC_SUPABASE_KEY`: `your-anon-key`
4. Deploy site.

---

## 5. Security & Authentication Model

1. **ESP32 Satellite Security:**
   * Satellite coinslots use a pre-shared token `SATELLITE_SECRET` in [`daemon/.env`](file:///d:/Hudas/Documents/Repository/piso-wifi/daemon/.env) and [`esp32-satellite.ino`](file:///d:/Hudas/Documents/Repository/piso-wifi/firmware/esp32-satellite/esp32-satellite.ino).
   * External devices on customer Wi-Fi attempting to call `/api/coinslots/pulse` or `/enable` are blocked with `401 Unauthorized`.
2. **Simulator Guard:**
   * `/api/coins/simulate` is disabled in production and restricted to `localhost`.
3. **Row Level Security (RLS):**
   * PostgreSQL tables in Supabase enforce `owner_id = auth.uid()` so kiosk owners can only view and manage their own fleet machines and customer records.

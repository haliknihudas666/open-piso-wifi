# ☁️ OpenPisoWiFi Cloud & Remote Fleet Integration Guide

A complete step-by-step operational manual for connecting your OpenPisoWiFi kiosk fleet to **Telegram**, **Supabase**, **Vercel**, and **Cloudflare** for 100% free, 24/7 remote monitoring and revenue telemetry — without port forwarding or dynamic DNS.

---

## 📑 Table of Contents
1. [🤖 Telegram Bot Setup (Zero-Code via Admin Dashboard)](#1-telegram-bot-setup-zero-code-via-admin-dashboard)
2. [⚡ Supabase PostgreSQL Cloud Sync](#2-supabase-postgresql-cloud-sync)
3. [▲ Vercel Cloud Admin Hosting](#3-vercel-cloud-admin-hosting)
4. [🟠 Cloudflare Zero-Trust Tunnel (CGNAT Bypass)](#4-cloudflare-zero-trust-tunnel-cgnat-bypass)
5. [🔄 Multi-Machine Fleet Architecture](#5-multi-machine-fleet-architecture)

---

## 1. 🤖 Telegram Bot Setup (Zero-Code via Admin Dashboard)

OpenPisoWiFi features an autonomous, zero-dependency Telegram bot engine that uses **outbound HTTPS long-polling**. This means:
* **Works 100% behind ISP CGNAT, mobile hotspots, and double NAT.**
* **Zero firewall ports to open.**
* **No public IP or Dynamic DNS required.**
* **Setup is done entirely in the Admin UI (`/admin`) — no `.env` files to touch!**

### Step 1: Create your Telegram Bot with @BotFather
1. Open the Telegram app on your phone or desktop.
2. Search for `@BotFather` (verified bot with blue checkmark) or open [t.me/BotFather](https://t.me/BotFather).
3. Tap **Start** or send `/start`.
4. Send the command:
   ```text
   /newbot
   ```
5. Follow the prompts:
   - **Name your bot:** e.g., `My Kiosk Alerts`
   - **Choose a username:** Must end in `bot`, e.g., `my_piso_alerts_bot`
6. BotFather will reply with your **HTTP API Token**:
   ```text
   Use this token to access the HTTP API:
   7123456789:AAH1bCdEfGhIjKlMnOpQrStUvWxYz123456
   ```
   Copy this token.

### Step 2: Get your Numeric Admin Chat ID with @userinfobot
To prevent unauthorized users from running administrative commands on your kiosk, OpenPisoWiFi strictly validates incoming messages against your private Chat ID.

1. Search for `@userinfobot` on Telegram or open [t.me/userinfobot](https://t.me/userinfobot).
2. Tap **Start** or send any message.
3. The bot will instantly reply with your profile info:
   ```text
   Id: 123456789
   First: John
   Last: Doe
   ```
4. Copy the numeric **Id** (e.g., `123456789`).

### Step 3: Connect via OpenPisoWiFi Admin Portal (No `.env` Editing!)
1. Open your kiosk admin dashboard in your browser:
   ```text
   http://10.0.0.1:3000/admin   (or http://192.168.1.240:3000/admin)
   ```
2. Navigate to **Cloud & Satellites** (or **System Settings**).
3. Find the **Telegram Bot Remote Admin** card.
4. Paste your credentials into the fields:
   * **Telegram Bot Token:** `7123456789:AAH1bCdEfGhIjKlMnOpQrStUvWxYz123456`
   * **Admin Chat ID:** `123456789`
5. Click **Save & Connect**.
   - The system immediately saves the configuration into the local SQLite database.
   - The background daemon hot-reloads the credentials and begins long-polling immediately.
6. Click **Send Test Alert**.
   - Your Telegram bot will immediately message your phone: `🧪 OpenPisoWiFi Test Alert: Your Telegram bot is successfully connected!`

### Supported Telegram Remote Commands
Once connected, send these commands anytime to your bot from your phone:

| Command | Description | Example Response |
|---|---|---|
| `/sales` | Live total revenue today and current cash box count | `📊 Today's Sales: ₱450.00 (42 tx) • Cash Box: ₱1,250.00` |
| `/slots` | Health and status of all local & ESP32 wireless coinslots | `🪙 Local Slot: Active (3.3V) • ESP32 Slot 2: Online (-54 dBm)` |
| `/emptybox` | Resets cash box counter after collecting physical coins | `🧹 Cash box audited and reset to ₱0.00` |
| `/wan` | Current internet uplink connection and router latency | `🌐 WAN: Online (Ping 14ms via Ruijie eth0)` |
| `/help` | List all available administrative commands | Complete command directory |

### Automatic Push Alerts
The bot will also push real-time notifications to your phone automatically:
* 🪙 **Coin Dropped:** When a customer inserts coins (`+₱5.00`, settled denominations).
* 🟢 **Machine Online:** When the kiosk boots up or reboots.
* 🔴 **Internet Dropped:** If OpenWrt reports WAN disconnect.
* 📦 **Cash Box Full:** Threshold warning for scheduled collection.

---

## 2. ⚡ Supabase PostgreSQL Cloud Sync

Supabase provides a free, production-grade PostgreSQL cloud database. OpenPisoWiFi automatically synchronizes daily revenue, coin transactions, voucher redemptions, and hardware health to Supabase so you can monitor multiple branches in real time.

### Step 1: Create a Free Supabase Project
1. Go to [supabase.com](https://supabase.com) and click **Sign In** (via GitHub or email).
2. Click **New Project**.
3. Choose:
   - **Name:** `openpiso-telemetry`
   - **Database Password:** Generate a secure password and save it.
   - **Region:** Choose closest to your kiosks (e.g., `Singapore` for the Philippines/SE Asia).
   - **Pricing Plan:** Free Tier ($0/month).
4. Click **Create new project** and wait ~1 minute for provisioning.

### Step 2: Run the OpenPisoWiFi Database Schema
1. In your Supabase project dashboard, click **SQL Editor** on the left menu.
2. Click **New query**.
3. Copy and paste the contents of [`supabase/schema.sql`](file:///d:/Hudas/Documents/Repository/piso-wifi/supabase/schema.sql) into the editor.
4. Click **Run** (Ctrl+Enter).
5. This creates the production tables with Row Level Security:
   - `piso_machines`: Fleet records, daily revenue, active slots, and uptime.
   - `piso_transactions`: Real-time coin drops, payment types, and MAC addresses.
   - `piso_collections`: Historical cash box audits.
   - `piso_commands`: Cloud-to-edge command queue.

### Step 3: Copy your API Credentials
1. In Supabase, go to **Project Settings** (gear icon) ➔ **API**.
2. Copy the following:
   * **Project URL:** `https://your-project-id.supabase.co`
   * **anon public API Key:** `eyJhbGciOi...`
   * **service_role Key (Secret):** `eyJhbGciOi...` (used for server-to-server fleet sync).

### Step 4: Configure via Kiosk Admin Portal
1. Open `/admin` ➔ **Cloud & Satellites** ➔ **Supabase PostgreSQL Sync** (or `/admin/cloud`).
2. Enter your:
   - **Supabase URL:** `https://your-project-id.supabase.co`
   - **Supabase API Key:** (Your `service_role` or `anon` key)
   - **Machine ID:** Unique branch name, e.g. `kiosk-branch-barangay-1`
3. Click **Save Configuration**.
4. The background sync service will start pushing telemetry every 60 seconds and sync every coin transaction live.
5. If internet goes offline, transactions are queued in memory and flushed automatically upon reconnection.

---

## 3. ▲ Vercel Cloud Admin Hosting

Deploying the OpenPisoWiFi admin portal to **Vercel** gives you a free, public web dashboard (`https://my-piso.vercel.app`) to monitor all your machines from anywhere in the world on your smartphone or laptop.

### Step 1: Push Repository to GitHub
1. Make sure your changes are pushed to your personal GitHub repository:
   ```bash
   git add .
   git commit -m "Configure OpenPisoWiFi"
   git push origin main
   ```

### Step 2: Import into Vercel
1. Go to [vercel.com](https://vercel.com) and log in with your GitHub account.
2. Click **Add New...** ➔ **Project**.
3. Select your `piso-wifi` repository.
4. Set the **Root Directory** to `portal`.
5. Under **Build and Output Settings**, Vercel automatically detects Next.js:
   - Build Command: `prisma generate && next build` (configured in [`portal/vercel.json`](file:///d:/Hudas/Documents/Repository/piso-wifi/portal/vercel.json))
   - Framework: `Next.js`

### Step 3: Add Environment Variables in Vercel
Under the **Environment Variables** section in Vercel, add:
* `NEXT_PUBLIC_SUPABASE_URL`: `https://your-project-id.supabase.co`
* `NEXT_PUBLIC_SUPABASE_ANON_KEY`: Your Supabase `anon` public key
* `SUPABASE_SERVICE_ROLE_KEY`: Your Supabase `service_role` secret key

### Step 4: Deploy
1. Click **Deploy**.
2. Once the build completes (~1 minute), Vercel will give you a public URL (e.g., `https://openpiso-admin.vercel.app`).
3. Open `https://your-app.vercel.app/admin/cloud` to view real-time fleet analytics, daily earnings, and remote kiosk health!

---

## 4. 🟠 Cloudflare Zero-Trust Tunnel (CGNAT Bypass)

If you want direct, secure web access to your physical Raspberry Pi's local admin console (`http://10.0.0.1:3000/admin`) from anywhere in the world without exposing ports to hackers, use a **Cloudflare Zero-Trust Tunnel (`cloudflared`)**.

* **100% Free** on Cloudflare's standard plan.
* **Bypasses CGNAT & ISP NAT** with an encrypted outbound tunnel.
* **No open router ports** (no port 80/443 exposed).
* **Enterprise DDoS protection & Zero-Trust Google/Email login authentication.**

### Step 1: Sign up for Cloudflare Zero Trust
1. Create a free account at [dash.cloudflare.com](https://dash.cloudflare.com).
2. In the sidebar, click **Zero Trust**.
3. Go to **Networks** ➔ **Tunnels** ➔ **Add a tunnel**.
4. Choose **Cloudflared**.
5. Name your tunnel: `pisowifi-pi-gateway`.

### Step 2: Install `cloudflared` on Raspberry Pi
Cloudflare will provide a single install command for Debian/ARM64. On your Raspberry Pi terminal, run:
```bash
# Example command provided by Cloudflare dashboard:
curl -L --output cloudflared.deb https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-arm64.deb
sudo dpkg -i cloudflared.deb
sudo cloudflared service install <YOUR_TUNNEL_TOKEN>
```

### Step 3: Route Public Hostname to Local Admin
1. In the Cloudflare Tunnel configuration wizard:
   - **Subdomain:** `kiosk1`
   - **Domain:** `yourdomain.com` (or free Cloudflare worker domain)
   - **Type:** `HTTP`
   - **URL:** `localhost:3000`
2. Save Tunnel.
3. You can now access your kiosk securely at `https://kiosk1.yourdomain.com/admin` from any browser on Earth!

---

## 5. 🔄 Multi-Machine Fleet Architecture

```text
┌────────────────────────────────────────────────────────────────────────┐
│                        ☁️ CLOUD MANAGEMENT LAYER                       │
│                                                                        │
│   [ TELEGRAM BOT API ]        [ SUPABASE POSTGRESQL ]   [ VERCEL ADMIN]│
│   • Instant Push Alerts       • Fleet Transaction Log   • 24/7 Web App │
│   • Direct /sales queries     • Cash Drawer Audits      • Fleet Maps   │
└───────────────▲───────────────────────────▲────────────────────────────┘
                │                           │
         HTTPS Long-Polling         Encrypted REST Sync
         (Outbound Only)            (In-Memory Queue)
                │                           │
┌───────────────┴───────────────────────────┴────────────────────────────┐
│                    🍓 LOCAL KIOSK (RASPBERRY PI / MINI PC)              │
│                                                                        │
│   ┌──────────────────────┐             ┌───────────────────────────┐   │
│   │  Local Admin Portal  │             │   Piso-WiFi Core Daemon   │   │
│   │  (:3000/admin)       │             │   (:4000 Background)      │   │
│   │  • Web UI Config     │────────────►│   • Telegram Service      │   │
│   │  • Hot-reload Pinout │             │   • Supabase Sync Engine  │   │
│   └──────────────────────┘             └─────────────┬─────────────┘   │
└──────────────────────────────────────────────────────┼─────────────────┘
                                                       ▼
                                          [ 🪙 HARDWARE COINSLOT ]
```

### Summary of Best Practices:
1. **Never edit `.env` files directly** on running kiosks unless developing locally — use the `/admin` portal GUI.
2. **Always test your bot** immediately after pasting tokens using the built-in **Send Test Alert** button.
3. **Use unique `machine_id` names** (e.g. `kiosk-luzon-01`, `kiosk-visayas-02`) so your Supabase database cleanly separates revenue per location.

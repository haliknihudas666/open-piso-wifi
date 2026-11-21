# ☁️ OpenPisoWiFi Remote Access & Telegram Guide

A complete step-by-step operational manual for accessing your OpenPisoWiFi Admin Panel from anywhere using **Cloudflare Tunnel (`trycloudflare.com`)** and **Telegram Bot** — 100% free, zero port-forwarding, and CGNAT-friendly.

---

## 📑 Table of Contents
1. [🤖 Telegram Bot Setup (Zero-Code via Admin Dashboard)](#1-telegram-bot-setup-zero-code-via-admin-dashboard)
2. [🟠 Cloudflare Tunnel Remote Admin Access (Built-In)](#2-cloudflare-tunnel-remote-admin-access-built-in)

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

## 2. 🟠 Cloudflare Tunnel Remote Admin Access (Built-In)

OpenPisoWiFi has built-in `cloudflared` supervision in the hardware daemon. You can access your local Admin Panel from anywhere in the world without opening router ports, paying for a static IP, or creating an external database.

### Zero-Setup Quick Tunnel (`trycloudflare.com`)
1. Open `/admin` → **Remote Access & Satellites**.
2. Under **Cloudflare Tunnel Remote Admin**, select **Quick (Free)** mode.
3. Check **Auto-start tunnel on boot & send link to Telegram** and click **Save Tunnel Settings**, or click **Start Tunnel**.
4. When `cloudflared` generates your `https://*.trycloudflare.com` URL:
   - It is displayed live in the Admin Panel with Copy & Open buttons.
   - It is automatically sent to your configured Telegram Admin Chat (`/admin` link ready to tap).
   - You can also run `/tunnel`, `/tunnel start`, `/tunnel stop`, or `/tunnel restart` in Telegram at any time.

### Security Gate (Tunnel-Safe by Design)
When traffic arrives via a Cloudflare Tunnel (`*.trycloudflare.com` or Named Tunnel):
- Visiting `/` redirects straight to `/admin`.
- Only `/admin`, `/api/admin/*`, `/api/telegram/*`, `/api/tunnel/*`, and authenticated admin coin-slot tools are reachable.
- All captive portal, voucher-free-trial, speedtest, and internal daemon routes return `401 Unauthorized`.
- Your Admin Panel remains protected by your scrypt-hashed Admin PIN and login rate limiter.

### Optional: Named Tunnel (Fixed Domain)
If you own a domain on Cloudflare Zero Trust:
1. Create a tunnel in Cloudflare Zero Trust → Networks → Tunnels and copy the Tunnel Token.
2. Switch **Tunnel Mode** to **Named Token**, paste the token, optionally enter your custom hostname (e.g. `https://admin.yourdomain.com`), and click **Save Tunnel Settings**.
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

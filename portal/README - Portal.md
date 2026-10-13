# 🌐 OpenPisoWifi - Web Portal & Admin Dashboard

The web portal and administrative control interface for **OpenPisoWifi**, built with **Next.js 16+ (App Router, Turbopack)**, **React 19**, **TypeScript**, **Tailwind CSS**, and **Prisma ORM** with **SQLite in WAL mode**.

---

## ✨ Features

### 📱 User Captive Portal
- **Mobile-First Glassmorphic Design**: Modern dark mode tailored for smartphones and tablets.
- **🔒 Inhibit Gate & "Insert Coin" Flow**: The coin slot remains physically blocked (Inhibit HIGH) while browsing. Customers click **"Insert Coin"** to activate the slot (Inhibit LOW) for a configurable duration (default: 90 seconds) with an animated countdown timer.
- **🪙 Smart Multi-Coin Polling**: Real-time client-side polling with SWR communicating with the hardware daemon to recognize and aggregate multi-coin drops (₱1, ₱5, ₱10, ₱20) and display estimated internet duration.
- **🧪 Built-in Dev Coin Simulator**: Interactive `+₱1`, `+₱5`, `+₱10`, `+₱20`, and `Reset` buttons for hardware-free testing during development.
- **🎁 5-Minute Free Trial**: One-click free trial support for new clients with cookie and MAC rate-limiting.
- **🎟 Voucher System**: Single-use uppercase alphanumeric code redemption (e.g., `WELCOME60`).
- **⏳ Live Active Session Countdown**: Real-time `HH:MM:SS` timer with automatic extension and pause/resume support.
- **🛡 Universal Captive Portal Auto-Detection**: Intercepts probes from Android (`/generate_204`, `/gen_204`), Apple iOS/macOS (`/hotspot-detect.html`), Windows (`/ncsi.txt`, `/connecttest.txt`), and arbitrary domains via `/[...slug]` to redirect unauthenticated devices.
- **🔍 Multi-Tier MAC Resolution**: Instant client MAC address lookup via `/proc/net/arp`, daemon router cache (`/api/router/arp`), and development simulation fallbacks.

### 📊 Admin Dashboard (`/admin` - Default PIN: `1234`)
- **📈 Revenue Analytics**: Real-time stats on today's revenue, all-time earnings, active sessions, and recent sales logs.
- **💰 Cash Box Management**: Tracks physical coins in the coin vault, logs collection history with notes, and offers a 1-click empty drawer action.
- **🛠️ Interactive 40-Pin GPIO Selector**: Visual Raspberry Pi 40-pin header map in the Settings tab to easily assign COIN and INHIBIT pins, with safety conflict validation and instant hot-reloading.
- **🩺 Hardware & Coin Debugger (`/admin` Hardware Tab)**: Live diagnostic console displaying slot status (Enabled / Blocked), current BCM pin mapping, live pulse log stream, quick Enable/Block/Clear actions, and JSON log export.
- **⚙️ Dynamic Rates & Branding**: Configure minutes-per-peso rates, customizable time preset cards, announcement ticker banner, portal title, Admin PIN, and GPIO pins.
- **🎫 Batch Voucher Generator**: Generate batches of prepaid voucher codes with custom durations and expiry days, search codes, filter by status, and open a clean printable voucher sheet.
- **👥 Active Session Manager**: Monitor connected devices in real time with IP/MAC details, add bonus time (`+15m Bonus`), or instantly kick/disconnect.
- **🛡 Device Access Controller**:
  - **VIP Whitelist**: Permanent internet bypass for admin/family devices.
  - **Blacklist**: Complete firewall blocking for abusive clients.
  - **Live DHCP Leases**: Instant view of all connected devices (Hostname, IP, MAC).
- **📡 Router Wi-Fi & QoS Control**:
  - Manage 2.4GHz & 5GHz Wi-Fi SSIDs, channels, and security directly from the UI.
  - Global bandwidth speed limiter (Upload / Download Mbps) using OpenWrt traffic control (`tc-tiny`).
- **🩺 System Health & Telemetry**: Live CPU load, RAM utilization, storage space, CPU temperature, and systemd service status monitor.
- **⚡ Maintenance & Power Controls**: Remote Raspberry Pi reboot, OpenWrt router reboot, firewall auth table flush, and service restarts.
- **🔄 1-Click System Update**: GitHub version comparison and automated update triggering from the dashboard.

---

## 🛠 Tech Stack

- **Framework**: [Next.js 16+](https://nextjs.org/) (App Router, Turbopack)
- **UI Library**: [React 19](https://react.dev/)
- **Language**: [TypeScript 5](https://www.typescriptlang.org/)
- **Styling**: [Tailwind CSS 4](https://tailwindcss.com/)
- **Database & ORM**: [Prisma 6](https://www.prisma.io/) with **SQLite in WAL mode** (minimizes SD-card wear and maximizes concurrency)
- **State & Polling**: [SWR 2.5](https://swr.vercel.app/)
- **Icons**: [Lucide React](https://lucide.dev/)

---

## ⚙️ Environment Variables (`.env`)

Create or update `.env` in `pisowifi-portal`:

```env
DATABASE_URL="file:./dev.db"
PORTAL_IP="192.168.1.240"
ROUTER_IP="192.168.1.1"
DAEMON_URL="http://127.0.0.1:4000"
ADMIN_PIN="1234"
```

---

## 🚀 Getting Started

### 1. Install Dependencies
```bash
npm install
```

### 2. Initialize Database & Seed Defaults
```bash
# Push Prisma schema to SQLite dev.db
npx prisma db push

# Seed default settings, rates, and test voucher (WELCOME60)
npx tsx prisma/seed.ts
```

### 3. Run Development Server
```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 🔨 Production Build & Deployment

```bash
# Compile and optimize production bundle
npm run build

# Start production server
npm start
```

---

## 📡 API Routes Reference

### User & Captive Endpoints
| Endpoint | Method | Description |
| :--- | :--- | :--- |
| `/api/coins` | `GET` | Returns pending pulses, estimated minutes, rate settings, daemon status, and `coinSlotEnabled` |
| `/api/coins` | `POST` | Simulates coin insertion (`{ action: 'simulate', amount: 5 }`) or resets balance |
| `/api/coins/activate` | `POST` | Activates coin slot (pulls Inhibit LOW) with 90s countdown for customer coin drop |
| `/api/session` | `GET` | Returns client IP, resolved MAC, active session countdown, and rate presets |
| `/api/connect` | `POST` | Processes coin or voucher connection, authorizes MAC on OpenWrt, records sale, and re-blocks slot |
| `/api/free-trial` | `POST` | Grants a one-time 5-minute trial session to eligible client MACs |
| `/generate_204` / `/gen_204` | `GET` | Android captive portal probe handler |
| `/hotspot-detect.html` | `GET` | Apple iOS/macOS captive portal probe handler |
| `/ncsi.txt` / `/connecttest.txt` | `GET` | Windows NCSI probe handler |
| `/[...slug]` | `ALL` | Universal catch-all captive redirector |

### Admin Endpoints (`/api/admin/*`)
| Endpoint | Method | Description |
| :--- | :--- | :--- |
| `/api/admin/auth` | `POST` | Validates Admin PIN |
| `/api/admin/stats` | `GET` | Returns today's sales, all-time revenue, active sessions count, and recent sales |
| `/api/admin/settings` | `GET` / `POST` | Fetches/updates settings (rates, GPIO pins: `coin_gpio_pin`, `inhibit_gpio_pin`, timeout, branding) |
| `/api/admin/hardware/debug` | `GET` / `POST` | Fetches live hardware telemetry, toggles slot inhibit state, or clears event logs |
| `/api/admin/cash-box` | `GET` / `POST` | Retrieves cash box stats, logs physical collections, or empties vault balance |
| `/api/admin/vouchers` | `GET` / `POST` / `DELETE`| Lists vouchers, batch-generates new codes, or deletes codes |
| `/api/admin/sessions` | `GET` / `POST` | Lists active sessions; supports `disconnect` (kick) and `add_time` (+15m) |
| `/api/admin/devices` | `GET` / `POST` / `DELETE`| Manages VIP MAC Whitelist, MAC Blacklist, and retrieves live DHCP leases |
| `/api/admin/router` | `GET` / `POST` | Tests router connection, reboots router, flushes firewall, and applies QoS speed limit |
| `/api/admin/router/wifi` | `GET` / `POST` | Fetches and updates OpenWrt 2.4GHz & 5GHz Wi-Fi SSIDs, channels, and security |
| `/api/admin/system/health` | `GET` | Returns CPU load, RAM usage, storage space, CPU temp, and daemon/portal status |
| `/api/admin/system/power` | `POST` | Triggers system reboot or service restarts on Raspberry Pi |
| `/api/admin/system/update` | `GET` / `POST` | Checks for GitHub updates and triggers 1-click update runner |
| `/api/admin/system/version`| `GET` | Returns current git commit, branch, and latest release information |

---

## 🛡 Database Schema (`prisma/schema.prisma`)

- **`Setting`**: Key-value pairs for system configurations (`minutes_per_peso`, `portal_title`, `admin_pin`, `coin_gpio_pin`, `inhibit_gpio_pin`, `coin_slot_timeout_seconds`, presets, etc.).
- **`Session`**: Tracks client MAC, IP, duration, active status, pause state, and expiration timestamps.
- **`Voucher`**: Single-use prepaid voucher codes with duration, equivalent value, and usage status.
- **`Sale`**: Daily revenue ledger recording coin and voucher transactions.
- **`CashCollection`**: Audit logs for physical cash box empty/collection operations.
- **`FreeTrialClaim`**: Rate-limiting record for free trial claims per MAC address.
- **`DeviceRule`**: Whitelist and Blacklist MAC entries for firewall bypass or blocking.

# ⚡ OpenPisoWifi - Hardware Daemon & Router Controller

A lightweight, high-performance background daemon for **OpenPisoWifi** running on **Node.js (tsx) / Bun**. It directly interfaces with physical multi-coin acceptor slots (CL168, Allan 1239A, HX-616) via **Raspberry Pi GPIO** with active **Inhibit gating** and manages client internet access, Wi-Fi radios, QoS speed limits, and firewall security on a remote **Ruijie RG-EW1200G Pro OpenWrt Router** over SSH.

---

## 🛠 Features

- **🪙 Multi-Coin Pulse Train Aggregation**: Detects falling-edge GPIO pulses for multi-denomination coins (₱1, ₱5, ₱10, ₱20) using a 300ms software collection window. 1 pulse = ₱1, 5 pulses = ₱5, 10 pulses = ₱10, 20 pulses = ₱20.
- **🔒 Active Inhibit Pin Gating**: Starts with the coin slot **physically blocked** (Inhibit pin `HIGH`) on boot to prevent unauthorized coin insertion before the customer requests access. Pulls `LOW` when the customer clicks **"Insert Coin"** on the captive portal, and automatically re-blocks on timeout (default 90s) or balance clear.
- **🛠️ Dynamic GPIO Pinout & Hot-Reload**: Allows changing both COIN and INHIBIT BCM pins at runtime via `/api/gpio/config` or directly from the Admin Web Portal without stopping or restarting the daemon.
- **🩺 Live Hardware Telemetry & Pulse Logging**: Records a rolling window of hardware events (pulses, coin drop detections, inhibit state changes) accessible via `/api/hardware/debug` for real-time monitoring and verification.
- **🛡 Remote OpenWrt `nftables` Firewall Control**: Automatically adds authorized client MAC addresses into the dedicated `piso_portal` table (`piso_auth` timeout set) on OpenWrt via SSH, revoking access immediately when a session expires.
- **📡 Dual-Band Wi-Fi Management**: Reads and updates 2.4GHz & 5GHz SSIDs, channels, and security settings on OpenWrt via UCI commands.
- **🔍 Real-Time ARP & DHCP Cache Resolution**: Resolves client MAC addresses by querying `/proc/net/arp` and OpenWrt's `/tmp/dhcp.leases`.
- **🚫 Device Access Control (Whitelist & Blacklist)**: Manages permanent VIP whitelist bypass (`piso_whitelist`) and abusive device blacklisting (`piso_blacklist`).
- **⚡ Bandwidth Speed Limiter (QoS)**: Applies global or per-network download/upload bandwidth throttles via OpenWrt's `tc-tiny` (Traffic Control Token Bucket Filter).
- **🔄 Session Synchronization & Maintenance**: Bulk-syncs active sessions after reboots, flushes auth tables, and triggers remote router reboots.
- **🧪 Cross-Platform Simulation Mode**: Automatically detects non-Linux environments (Windows/macOS) and switches to simulation mode without crashing, enabling rapid UI and API development without physical hardware.

---

## 🔌 Hardware Wiring Diagram (Raspberry Pi GPIO)

Multi-coin acceptors (e.g., **CL168**, **Allan 1239A**, **HX-616**) require a **12V DC** power supply. The Raspberry Pi controls the slot using an **Inhibit Output** pin and receives pulses via a **Coin Signal Input** pin.

```
  +-------------------------------------+
  |     🪙 Multi-Coin Acceptor (CL168)  |
  |  • 12V DC Power (+)                 | <--- 12V 2A Power Supply (+)
  |  • Ground / DC Power (-)            | <--- 12V Supply GND & RPi GND (Pin 6/9/14/20)
  |  • Inhibit / Block Line             | <--- Raspberry Pi Physical Pin 5 (BCM 3)
  |  • Coin Signal Line                 |
  +------------------+------------------+
                     │
                     │   [ 10kΩ Resistor in series ]
                     └───/\/\/\/\───────┬───────────────────> Raspberry Pi Physical Pin 3
                                        │                     (BCM GPIO 2 / SDA1)
                                 [ 4.7kΩ Resistor ]*
                                        │  *(Optional divider if coin line outputs 12V)
  +-------------------------------------┴-------------------+
  |  Raspberry Pi Ground (Physical Pin 6 / 9 / 14 / 20 / 39)|
  +---------------------------------------------------------+
```

### Pin Mapping Reference:
| Function | Raspberry Pi Physical Pin | BCM Number (Software) | WiringPi Number | Description / Logic |
| :--- | :--- | :--- | :--- | :--- |
| **COIN Input** | **Pin 3** | **BCM 2** (SDA1) | GPIO 8 | Falling-edge pulse train (300ms window) |
| **INHIBIT Output**| **Pin 5** | **BCM 3** (SCL1) | GPIO 9 | `HIGH` = Slot Blocked, `LOW` = Slot Accepts Coins |
| **Ground (GND)** | **Pin 6 / 9 / 14 / 20 / 39**| GND | GND | Common ground reference with 12V PSU |

> [!WARNING]
> **Voltage Protection & Common Ground!**  
> 1. Standard coin acceptors output a signal that must be conditioned before connecting to 3.3V Raspberry Pi inputs. Always install a **10kΩ resistor in series** on the Coin wire before reaching the GPIO pin (no optocoupler required).
> 2. The 12V power supply negative terminal **must** be tied to the Raspberry Pi GND to form a unified ground reference.

---

## ⚙️ Environment Variables (`.env`)

Create or update `.env` in `pisowifi-daemon`:

```env
PORT=4000
ROUTER_IP=192.168.1.1
ROUTER_SSH_PORT=22
ROUTER_SSH_USER=root
ROUTER_SSH_KEY_PATH=/root/.ssh/id_rsa
ROUTER_MODE=fw4_nftables

# Hardware GPIO Configuration (BCM Numbering)
# Default: Coin = BCM 2 (Physical Pin 3), Inhibit = BCM 3 (Physical Pin 5)
COIN_GPIO_PIN=2
INHIBIT_GPIO_PIN=3
INHIBIT_ACTIVE_HIGH=true
```

---

## 🚀 Getting Started

### 1. Install Dependencies
Using [Bun](https://bun.sh/) (recommended):
```bash
bun install
```
Or using npm:
```bash
npm install
```

### 2. Run in Development / Simulation Mode
```bash
npm run dev
# or
bun run dev
```

*Daemon listens on `http://127.0.0.1:4000`.*

---

## 📡 REST API Reference

### 🪙 Coin Acceptor & Hardware Endpoints
| Endpoint | Method | Body / Params | Description |
| :--- | :--- | :--- | :--- |
| `/api/coins` | `GET` | — | Returns `{ pulses: number, gpioAvailable: boolean, coinSlotEnabled: boolean }` |
| `/api/coins/simulate` | `POST` | `{ amount?: number, pulses?: number }` | Injects simulated coin pulses into the counter |
| `/api/coins/clear` | `POST` | — | Resets pending coin pulse counter to 0 and re-locks slot |
| `/api/inhibit` | `POST` | `{ enabled: boolean }` | Unlocks (`enabled: true`) or blocks (`enabled: false`) the physical coin slot |
| `/api/gpio/config` | `POST` | `{ coinPin?: number, inhibitPin?: number }` | Dynamically changes and reinitializes GPIO BCM pins at runtime |
| `/api/hardware/debug` | `GET` | — | Returns live hardware state, slot status, pending coins, active pins, and event log |
| `/api/hardware/debug/clear` | `POST` | — | Clears all recorded hardware event log entries |

### 🛡 Authorization & Firewall Endpoints
| Endpoint | Method | Body / Params | Description |
| :--- | :--- | :--- | :--- |
| `/api/authorize` | `POST` | `{ mac: string, durationMinutes: number, ip?: string }` | Adds MAC to OpenWrt `piso_auth` nftables set with duration timeout |
| `/api/deauthorize` | `POST` | `{ mac: string }` | Immediately removes client MAC from OpenWrt `piso_auth` set |
| `/api/router/flush` | `POST` | — | Flushes all active authorized MACs from the firewall table |
| `/api/router/sync` | `POST` | `{ sessions: Array<{ macAddress, remainingMinutes }> }` | Bulk syncs active sessions into the OpenWrt firewall |

### 📡 Router Control & Wireless Endpoints
| Endpoint | Method | Body / Params | Description |
| :--- | :--- | :--- | :--- |
| `/api/router/status` | `GET` | — | Returns OpenWrt router status (connected, mode, host, system info) |
| `/api/router/test` | `POST` | `{ host, port, username, password, privateKeyPath, mode }` | Tests SSH credentials to OpenWrt router |
| `/api/router/config` | `POST` | Partial router config object | Dynamically updates router controller configuration |
| `/api/router/arp` | `GET` | `?ip=192.168.1.X` | Resolves MAC address from IP via OpenWrt ARP / DHCP table |
| `/api/router/dhcp` | `GET` | — | Returns active DHCP leases array from `/tmp/dhcp.leases` on OpenWrt |
| `/api/router/wifi` | `GET` | — | Fetches 2.4GHz and 5GHz wireless SSIDs, channels, and security settings |
| `/api/router/wifi` | `POST` | Wireless settings object | Applies new SSIDs, channels, and encryption to OpenWrt radios |
| `/api/router/qos` | `POST` | `{ downloadMbps: number, uploadMbps: number }` | Applies bandwidth speed limits on OpenWrt using `tc-tiny` |
| `/api/router/reboot` | `POST` | — | Gracefully reboots the OpenWrt router via SSH |

### 🚫 Device Access Control Endpoints
| Endpoint | Method | Body / Params | Description |
| :--- | :--- | :--- | :--- |
| `/api/router/whitelist` | `POST` | `{ action: 'add' \| 'remove', mac: string }` | Adds/removes MAC from permanent VIP whitelist set (`piso_whitelist`) |
| `/api/router/blacklist` | `POST` | `{ action: 'add' \| 'remove', mac: string }` | Adds/removes MAC from banned blacklist set (`piso_blacklist`) |
| `/api/router/devices/sync` | `POST` | `{ whitelist: string[], blacklist: string[] }` | Bulk synchronizes whitelist and blacklist sets on OpenWrt |

---

## 🔑 SSH Key Setup (Raspberry Pi -> OpenWrt)

To allow the Raspberry Pi daemon to execute commands on the OpenWrt router without password prompts:

```bash
cd scripts
bash setup-ssh-keys.sh
```

Or run the 1-click router deployer:
```bash
bash ../scripts/deploy-router.sh
```

# ⚡ OpenPisoWiFi - Router & Microcontroller Firmware Hub

This directory contains the firmware packages, binaries, and source code powering **OpenPisoWiFi** hardware peripherals and routing gateways.

---

## 📦 Firmware Modules

| Module | Hardware Target | Purpose | Details & Guide |
| :--- | :--- | :--- | :--- |
| **[Ruijie RG-EW1200G Pro (v1.1)](ruijie-rg-ew1200g-pro/)** | Ruijie Reyee RG-EW1200G Pro (MediaTek MT7621AT) | Official **OpenWrt 25.12.5 (Stable)** Gigabit Dual-Band AC1200 router firmware for captive paywall gateway. | [Ruijie Firmware Guide](ruijie-rg-ew1200g-pro/README.md) |
| **[ESP32 Coin Bridge](esp32-coin-bridge/)** | ESP32-WROOM-32 / ESP8266 / RP2040 | Real-time microsecond interrupt coin pulse counter and I2C SSD1306 OLED display driver. | [ESP32 Bridge Guide](#esp32-microcontroller-coin--display-bridge) |

---

## 📡 1. Ruijie RG-EW1200G Pro (v1.1) - OpenWrt 25.12.5

- **OpenWrt Firmware Selector:** [Ruijie RG-EW1200G Pro v1.1 (25.12.5)](https://firmware-selector.openwrt.org/?version=25.12.5&target=ramips%2Fmt7621&id=ruijie_rg-ew1200g-pro-v1.1)
- **Target:** `ramips/mt7621`
- **SoC:** MediaTek MT7621AT (880 MHz Dual-Core, 128MB RAM, 16MB Flash)
- **Wi-Fi:** 2.4GHz MT7603EN (300Mbps) + 5GHz MT7615N (867Mbps Wave 2 AC)

### Quick Download & Checksum Verification:
```bash
# On Linux / Raspberry Pi:
bash firmware/ruijie-rg-ew1200g-pro/download-firmware.sh

# On Windows PowerShell:
powershell -ExecutionPolicy Bypass -File firmware/ruijie-rg-ew1200g-pro/download-firmware.ps1
```

For complete flashing and sysupgrade instructions, see [`firmware/ruijie-rg-ew1200g-pro/README.md`](ruijie-rg-ew1200g-pro/README.md) and [`openwrt/README-Ruijie-OpenWrt.md`](../openwrt/README-Ruijie-OpenWrt.md).

---

## 🔌 2. ESP32 Microcontroller Coin & Display Bridge

This module enables a low-cost **ESP32** to act as a dedicated real-time hardware peripheral controller for **OpenPisoWiFi**.

### 🎯 Why Use an ESP32 as a Coin Bridge?

| Challenge with Direct Linux GPIO | Solution with ESP32 Hardware Bridge |
| :--- | :--- |
| **Linux Kernel Jitter & Missed Pulses**: High CPU load on Raspberry Pi can occasionally drop fast coin pulses (e.g. ₱20 coins emitting 20 pulses in 800ms). | **Microsecond Hardware Timer Interrupts**: Dedicated microsecond interrupts guarantee 100% pulse count accuracy regardless of SBC OS load. |
| **Physical Proximity**: Raspberry Pi may be housed elsewhere in the kiosk cabinet. | **USB-Serial or Wi-Fi**: Plug ESP32 into any USB port of the Raspberry Pi or OpenWrt router. |
| **I2C OLED Screen Drivers**: Direct Linux kernel I2C setup can conflict with pinouts or OS updates. | **Hardware I2C**: ESP32 drives the 0.96" / 1.3" SSD1306 OLED directly with smooth animations. |
| **Cost Reduction**: A Raspberry Pi can be replaced with an ultra-affordable x86 thin client, Orange Pi, or direct OpenWrt router USB port. | **$3 Microcontroller**: Low barrier to entry for budget kiosks. |

### 🔌 Hardware Wiring Diagram

```
[ Multi-Coin Acceptor ]
  • +12V DC  ------> External 12V Power Supply (+)
  • GND      ------> Common Ground (-) (Shared with ESP32 GND)
  • COIN/SIGNAL ---> 10kΩ Series Resistor (Inline) ------------> ESP32 GPIO 4
  • INHIBIT/SET <--- 2N2222 / N-Channel MOSFET Gate <---------- ESP32 GPIO 5

[ 0.96" I2C OLED Display (SSD1306 128x64) ]
  • VCC      ------> ESP32 3.3V
  • GND      ------> ESP32 GND
  • SCL      ------> ESP32 GPIO 22
  • SDA      ------> ESP32 GPIO 21
```

> ⚠️ **IMPORTANT ELECTRICAL NOTE**: Standard coin acceptors output a **+5V or +12V pull-up pulse**. You **MUST** level-shift or use a voltage divider (e.g. 10kΩ and 20kΩ resistors) before connecting to ESP32 GPIO pins (which are **3.3V tolerant only**).

### 📡 Serial Communication Protocol (115200 Baud)

The ESP32 communicates over USB Serial using standard newline-delimited JSON.

#### From ESP32 ➔ Host (Raspberry Pi / Router):
```json
{"event": "pulse", "count": 1, "raw": 1}
{"event": "coin_settled", "amount": 5, "pulses": 5}
{"event": "status", "inhibit": false, "wan": true}
```

#### From Host ➔ ESP32:
```json
{"cmd": "inhibit", "state": true}       // Locks the coin slot physically
{"cmd": "inhibit", "state": false}      // Unlocks coin slot (e.g. 90-sec insert window)
{"cmd": "display", "text": "₱15.00"}    // Updates the OLED screen
```

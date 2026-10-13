# Contributing to OpenPisoWiFi

Thank you for your interest in contributing to **OpenPisoWiFi**! As an open-source, dual-architecture Piso Wi-Fi operating platform, we welcome contributions from the community.

---

## 🛠️ Development Setup

### Prerequisites
- **Node.js**: v20+ or **Bun**: v1.2+
- **Git**
- Optional: Linux environment / Raspberry Pi / OpenWrt router for hardware testing

### Project Structure
- `landing/`: Standalone Next.js 16 showcase & documentation landing page (Tailwind CSS v4, Neo-Brutalism).
- `portal/`: Next.js 16 (App Router) customer captive portal UI and local admin dashboard.
- `daemon/`: Node.js Express background daemon for Raspberry Pi GPIO interrupt pulse handling, inhibit lines, and OpenWrt SSH orchestration.
- `openwrt/`: OpenWrt shell scripts, `uci` and `nftables` captive paywall firewall configurations.
- `firmware/`: ESP32 Arduino C++ firmware for wireless multi-coinslot satellites.
- `scripts/`: Automated installation, OTA update, and database repair tooling.
- `docs/`: Multi-architecture hardware wiring manuals and cloud fleet automation guides.

---

## 🤝 Hardware Testing & Platform Expansion

OpenPisoWiFi is vendor-neutral and actively open for community testing, hardware driver ports, and multi-device expansion!

### 1. Single Board Computers (SBCs) & x86 Mini PCs
- **Verified**: Raspberry Pi 3B+, 4B, 5 (Debian 12 Bookworm, Ubuntu Server, DietPi).
- **Open for Testing**:
  - **Orange Pi**: Zero 2W, Zero 3, 3B, 5 / 5 Plus.
  - **Banana Pi & NanoPi**: BPI-M4, NanoPi R2S / R4S / R5S.
  - **x86_64 Thin Clients / Mini PCs**: Intel N100, HP T630, Dell Wyse.
  - **Radxa Rock**: Rock 3A, 4C+, Zero.
- **How to Help**: Test `scripts/install.sh` on your SBC, verify GPIO sysfs / libgpiod pulse detection, and submit a PR or issue report with your pinout config.

### 2. Alternative Routers & Firmware Targets
- **Verified**: Ruijie Reyee EW1200G Pro (Dual-Band Gigabit with OpenWrt 25.12.5).
- **Open for Testing**:
  - **TP-Link**: Archer C6/A6, WR840N, WR940N, Archer AX series.
  - **GL.iNet**: Flint, Beryl AX, Opal, Slate AX.
  - **Mikrotik**: RouterOS hotspot walled garden & API integrations.
  - **Ubiquiti**: UniFi AP guest portal redirection profiles.
- **How to Help**: Test `openwrt/setup.sh` and `nftables` redirection on your router model.

### 3. Payment & Vending Hardware
- **Verified**: Allan Universal & Weiyu Multi-Coinslot (1, 5, 10, 20 PHP pulses).
- **Open for Testing**:
  - **Paper Bill Acceptors**: ICT P70, L70, TP70, NV9 / NV10 (pulse & serial protocols).
  - **Coin Dispensers**: Motorized coin hoppers for change return.
  - **Displays & Audio**: I2C 16x2 / 20x4 LCDs, TM1637 7-segment displays, DFPlayer Mini voice prompts.
  - **Printers**: POS thermal voucher receipt printers.


### Local Development
```bash
# Install and run web portal
cd portal
bun install
bun run dev

# Run hardware daemon
cd ../daemon
npm install
npm run dev
```

---

## 🔒 Security & Code Standards

1. **No Hardcoded Credentials**: Never commit `.env` files, actual API keys, private tokens, or SQLite databases containing user data.
2. **Generic Descriptions**: Do not hardcode specific third-party copyrighted apps or private machine configurations.
3. **Database Migrations**: Update `portal/prisma/schema.prisma` cleanly and test with `bunx prisma db push`.
4. **Clean Commits**: Format code before submitting pull requests.

---

## 💡 Submitting Changes

1. Fork the repository and create your feature branch (`git checkout -b feature/amazing-feature`).
2. Commit your changes (`git commit -m 'feat: Add amazing feature'`).
3. Push to your branch (`git push origin feature/amazing-feature`).
4. Open a Pull Request detailing the changes and verification steps.

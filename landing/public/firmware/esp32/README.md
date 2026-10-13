# OpenPisoWiFi ESP32 Binaries

To flash ESP32 directly from your browser, compiled binaries are loaded from this directory:
- `bootloader.bin` (offset 0x1000)
- `partitions.bin` (offset 0x8000)
- `boot_app0.bin` (offset 0xe000)
- `esp32-satellite.bin` (offset 0x10000)
- `esp32-coin-bridge.bin` (offset 0x10000)

Source code for these firmwares is located in the root `/firmware/` directory of the OpenPisoWiFi repository.

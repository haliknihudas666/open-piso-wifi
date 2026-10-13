#!/usr/bin/env python3
"""
OpenPisoWifi - Standalone Inhibit / SET Pin Diagnostic Tool
Controls Physical Header Pins directly.

Usage:
    python3 debug-inhibit.py [physical_pin]

Examples:
    python3 debug-inhibit.py 11    # Tests Physical Pin 11
    python3 debug-inhibit.py 13    # Tests Physical Pin 13
"""

import sys
import time

try:
    from gpiozero import DigitalOutputDevice, Device
    from gpiozero.pins.lgpio import LGPIOFactory
    try:
        Device.pin_factory = LGPIOFactory()
    except Exception:
        pass
except ImportError as e:
    print(f"❌ Error: gpiozero not found: {e}")
    sys.exit(1)

# Raspberry Pi 40-pin header: Physical Pin -> BCM GPIO number
PHYSICAL_TO_BCM = {
    3: 2,   5: 3,   7: 4,   8: 14,  10: 15, 11: 17, 12: 18, 13: 27,
    15: 22, 16: 23, 18: 24, 19: 10, 21: 9,  22: 25, 23: 11, 24: 8,
    26: 7,  29: 5,  31: 6,  32: 12, 33: 13, 35: 19, 36: 16, 37: 26,
    38: 20, 40: 21
}

# Reverse lookup for convenience
BCM_TO_PHYSICAL = {v: k for k, v in PHYSICAL_TO_BCM.items()}

arg_input = int(sys.argv[1]) if len(sys.argv) > 1 else 11

# Resolve physical pin and BCM
if arg_input in PHYSICAL_TO_BCM:
    phys_pin = arg_input
    bcm_pin = PHYSICAL_TO_BCM[arg_input]
elif arg_input in BCM_TO_PHYSICAL:
    phys_pin = BCM_TO_PHYSICAL[arg_input]
    bcm_pin = arg_input
else:
    print(f"❌ Error: Pin {arg_input} is not a valid GPIO pin on the 40-pin header.")
    print("Valid physical GPIO pins are: 7, 11, 12, 13, 15, 16, 18, 22, 29, 31, 32, 33, 35, 36, 37, 38, 40")
    sys.exit(1)

print("=" * 65)
print(f"🔒 HUDAS PISOWIFI — INHIBIT / SET-PIN HARDWARE TESTER")
print(f"Testing: Physical Header Pin {phys_pin} (BCM {bcm_pin})")
print("=" * 65)

try:
    pin = DigitalOutputDevice(bcm_pin, active_high=True, initial_value=False)
except Exception as e:
    print(f"❌ Failed to initialize Physical Pin {phys_pin} (BCM {bcm_pin}): {e}")
    sys.exit(1)

print(f"\nInitial State: Physical Pin {phys_pin} is outputting 0V (LOW).")
print("\nDirect Voltage Commands:")
print("  [0] Force Pin to 0V (LOW / Ground)")
print("  [1] Force Pin to 3.3V (HIGH / VCC)")
print("  [t] Toggle between 0V and 3.3V every 4 seconds")
print("  [q] Quit")
print("-" * 65)

try:
    while True:
        cmd = input("\nEnter command [0=0V LOW, 1=3.3V HIGH, t=toggle, q=quit]: ").strip().lower()
        if cmd == '0':
            pin.off()
            print(f"\n[VOLTAGE: 0V LOW] Physical Pin {phys_pin} is now at 0V (GND).")
            print("👉 Drop a coin: Does it REJECT or ACCEPT?")
        elif cmd == '1':
            pin.on()
            print(f"\n[VOLTAGE: 3.3V HIGH] Physical Pin {phys_pin} is now at 3.3V (HIGH).")
            print("👉 Drop a coin: Does it REJECT or ACCEPT?")
        elif cmd == 't':
            print("\nToggling voltage every 4 seconds. Drop coins to test! (Ctrl+C to stop)")
            try:
                while True:
                    pin.off()
                    print(f"[{time.strftime('%H:%M:%S')}] 🔴 Physical Pin {phys_pin} = 0V (LOW)   <--- DROP COIN NOW")
                    time.sleep(4)
                    pin.on()
                    print(f"[{time.strftime('%H:%M:%S')}] 🟢 Physical Pin {phys_pin} = 3.3V (HIGH) <--- DROP COIN NOW")
                    time.sleep(4)
            except KeyboardInterrupt:
                print("\nToggling stopped.")
        elif cmd == 'q':
            break

except KeyboardInterrupt:
    pass

pin.close()
print("\nExiting. Pin released.")

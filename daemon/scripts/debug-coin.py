#!/usr/bin/env python3
"""
OpenPisoWifi - Standalone Coin Acceptor Diagnostic Tool
Run directly on the Raspberry Pi terminal:
    python3 debug-coin.py [bcm_pin]

Default is BCM 4 (Physical Pin 7).
If you test BCM 2 (Physical Pin 3), this script will measure and explain the 1.8kΩ hardware pull-up issue.
"""

import sys
import time
from datetime import datetime

try:
    from gpiozero import Button, Device
    from gpiozero.pins.lgpio import LGPIOFactory
    try:
        Device.pin_factory = LGPIOFactory()
    except Exception:
        pass
except ImportError as e:
    print(f"\n❌ ERROR: gpiozero / lgpio not installed: {e}")
    print("Run: sudo apt install -y python3-gpiozero python3-lgpio\n")
    sys.exit(1)

# Raspberry Pi 40-pin header: Physical Pin -> BCM GPIO number
PHYSICAL_TO_BCM = {
    3: 2,   5: 3,   7: 4,   8: 14,  10: 15, 11: 17, 12: 18, 13: 27,
    15: 22, 16: 23, 18: 24, 19: 10, 21: 9,  22: 25, 23: 11, 24: 8,
    26: 7,  29: 5,  31: 6,  32: 12, 33: 13, 35: 19, 36: 16, 37: 26,
    38: 20, 40: 21
}
BCM_TO_PHYSICAL = {v: k for k, v in PHYSICAL_TO_BCM.items()}

arg_input = int(sys.argv[1]) if len(sys.argv) > 1 else 7

# Resolve physical pin and BCM
if arg_input in PHYSICAL_TO_BCM:
    phys_pin = arg_input
    bcm_pin = PHYSICAL_TO_BCM[arg_input]
elif arg_input in BCM_TO_PHYSICAL:
    phys_pin = BCM_TO_PHYSICAL[arg_input]
    bcm_pin = arg_input
else:
    print(f"❌ Error: Pin {arg_input} is not a valid GPIO pin on the 40-pin header.")
    sys.exit(1)

print("=" * 65)
print(f"🪙  HUDAS PISOWIFI — COIN ACCEPTOR HARDWARE TESTER")
print(f"Testing: Physical Header Pin {phys_pin} (BCM {bcm_pin})")
print("=" * 65)

if bcm_pin in (2, 3):
    print("\n⚠️  CRITICAL HARDWARE NOTICE:")
    print(f"   Physical Pin {phys_pin} (BCM {bcm_pin}) is the I2C bus pin (SDA/SCL).")
    print("   The Raspberry Pi has a hardwired 1.8kΩ resistor to 3.3V on this pin.")
    print("   With a 10kΩ series resistor on your coin wire, the voltage will")
    print("   only drop to 2.80V when a coin passes (Divider: 3.3V * 10 / 11.8 = 2.8V).")
    print("   The Pi requires < 0.8V to detect a pulse!")
    print("   👉 MOVE your wire to Physical Pin 7 (BCM 4) for reliable detection.\n")
    print("-" * 65)

pulse_count = 0
last_pulse_time = 0
pulse_train = []

try:
    # Setup pin with internal pull-up and 15ms debounce
    coin = Button(bcm_pin, pull_up=True, bounce_time=0.015)
except Exception as e:
    print(f"❌ Failed to initialize BCM {bcm_pin}: {e}")
    sys.exit(1)

idle_state = "0V (LOW / GROUNDED / PRESSED)" if coin.is_pressed else "3.3V (HIGH / IDLE)"
print(f"Initial Pin Reading: {idle_state}")
if coin.is_pressed:
    print("⚠️  WARNING: Pin is currently LOW! If CL-168 is connected, check:")
    print("    1. Side switch is on NO (Normally Open), not NC.")
    print("    2. Wire is not shorted to Ground.")
else:
    print("✅ Pin is resting at 3.3V (HIGH). Ready to receive falling-edge pulses!")

print("\nInstructions:")
print("  • Drop a coin into the CL-168 slot now.")
print("  • Watch the real-time events below.")
print("  • Press Ctrl+C to stop.\n")
print("-" * 65)

def on_press():
    global pulse_count, last_pulse_time, pulse_train
    now = time.time()
    pulse_count += 1
    pulse_train.append(now)
    last_pulse_time = now
    ts = datetime.now().strftime("%H:%M:%S.%f")[:-3]
    print(f"[{ts}] ⚡ PULSE #{pulse_count} (Pin went LOW -> Falling Edge Detected!)")

def on_release():
    ts = datetime.now().strftime("%H:%M:%S.%f")[:-3]
    print(f"[{ts}]    └── Release (Pin returned to 3.3V HIGH)")

coin.when_pressed = on_press
coin.when_released = on_release

try:
    while True:
        time.sleep(0.05)
        # Check if a pulse train just finished (no pulses for > 300ms)
        if pulse_train and (time.time() - last_pulse_time > 0.35):
            count = len(pulse_train)
            duration_ms = int((pulse_train[-1] - pulse_train[0]) * 1000) if count > 1 else 0
            ts = datetime.now().strftime("%H:%M:%S.%f")[:-3]
            print(f"\n[{ts}] 💰 COIN DETECTED: ₱{count} ({count} pulses in {duration_ms}ms)")
            print("-" * 65)
            pulse_train = []

except KeyboardInterrupt:
    print(f"\nTest ended. Total pulses recorded: {pulse_count}")
    coin.close()
    sys.exit(0)

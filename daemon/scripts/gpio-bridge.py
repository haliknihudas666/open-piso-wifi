#!/usr/bin/env python3
"""
OpenPisoWifi - Python GPIO Hardware Bridge for Raspberry Pi (Bookworm & Pi 5 compatible)
Interfaces with CL-168 / Allan coin acceptors using gpiozero / lgpio.
Communicates with pisowifi-daemon via stdin/stdout.
"""

import sys
import os
import signal
import json
import time

def log(msg):
    sys.stderr.write(f"[GPIO-BRIDGE] {msg}\n")
    sys.stderr.flush()

try:
    from gpiozero import Button, DigitalOutputDevice
    from gpiozero.pins.lgpio import LGPIOFactory
    from gpiozero import Device
    try:
        Device.pin_factory = LGPIOFactory()
    except Exception:
        pass
except ImportError as e:
    log(f"CRITICAL: gpiozero or lgpio not found: {e}")
    sys.stdout.write(json.dumps({"status": "error", "error": f"ImportError: {e}"}) + "\n")
    sys.stdout.flush()
    sys.exit(1)

# Raspberry Pi 40-pin header: Physical Pin -> BCM GPIO number
PHYSICAL_TO_BCM = {
    3: 2,   5: 3,   7: 4,   8: 14,  10: 15, 11: 17, 12: 18, 13: 27,
    15: 22, 16: 23, 18: 24, 19: 10, 21: 9,  22: 25, 23: 11, 24: 8,
    26: 7,  29: 5,  31: 6,  32: 12, 33: 13, 35: 19, 36: 16, 37: 26,
    38: 20, 40: 21
}
BCM_TO_PHYSICAL = {v: k for k, v in PHYSICAL_TO_BCM.items()}

def resolve_pins(val):
    if val in PHYSICAL_TO_BCM:
        return PHYSICAL_TO_BCM[val], val
    return val, BCM_TO_PHYSICAL.get(val, val)

raw_coin = int(sys.argv[1]) if len(sys.argv) > 1 else 7
raw_inhibit = int(sys.argv[2]) if len(sys.argv) > 2 else 11

coin_pin, coin_phys = resolve_pins(raw_coin)
inhibit_pin, inhibit_phys = resolve_pins(raw_inhibit)

# Inhibit active high (default True = Default HIGH / Built-in Inhibit, False = Default LOW / Relay mode)
inhibit_active_high = sys.argv[3].lower() == "true" if len(sys.argv) > 3 else True

log(f"Starting bridge — Coin: Physical Pin {coin_phys} (BCM {coin_pin}), Inhibit: Physical Pin {inhibit_phys} (BCM {inhibit_pin}), activeHigh: {inhibit_active_high}")

try:
    # Inhibit output pin initialized to blocked state:
    # If activeHigh: blocked is HIGH (1 / 3.3V)
    # If activeLow (relay mode): blocked is LOW (0 / 0V)
    initial_level = 1 if inhibit_active_high else 0
    inhibit = DigitalOutputDevice(inhibit_pin, active_high=True, initial_value=(initial_level == 1))
    inhibit.value = initial_level
    
    # Coin input pin (internal pull-up, falling edge triggers when_pressed)
    # bounce_time=0.015 (15ms debounce) filters out 2-3ms electrical chatter while capturing real 20-100ms coin pulses
    coin = Button(coin_pin, pull_up=True, bounce_time=0.015)
    
    def on_pulse_press():
        log(f"⚡ [EDGE FALLING] Coin pulse START on Physical Pin {coin_phys} (Pin went LOW/0V)!")
        sys.stdout.write("PULSE\n")
        sys.stdout.flush()

    def on_pulse_release():
        log(f"⚡ [EDGE RISING] Coin pulse END on Physical Pin {coin_phys} (Pin returned to HIGH/3.3V).")
        
    coin.when_pressed = on_pulse_press
    coin.when_released = on_pulse_release
    
    # Announce ready
    sys.stdout.write(json.dumps({
        "status": "ready",
        "coinPin": coin_phys,
        "inhibitPin": inhibit_phys,
        "coinBcm": coin_pin,
        "inhibitBcm": inhibit_pin,
        "activeHigh": inhibit_active_high,
        "inhibitLevel": initial_level
    }) + "\n")
    sys.stdout.flush()
    idle_state = "LOW (0V / PRESSED)" if coin.is_pressed else "HIGH (3.3V IDLE)"
    log(f"GPIO hardware initialized: Coin Physical Pin {coin_phys} idle state is {idle_state}.")
    if coin.is_pressed:
        log(f"⚠️ WARNING: Coin Physical Pin {coin_phys} is starting in LOW state! If using CL-168, ensure switch is set to NO (Normally Open), not NC.")
    log(f"Inhibit Physical Pin {inhibit_phys} initialized with initialLevel={initial_level} (activeHigh={inhibit_active_high}).")

except Exception as e:
    log(f"Failed to initialize pins: {e}")
    sys.stdout.write(json.dumps({"status": "error", "error": str(e)}) + "\n")
    sys.stdout.flush()
    sys.exit(1)

def cleanup(*args):
    log("Cleaning up GPIO pins...")
    try:
        inhibit.close()
        coin.close()
    except Exception:
        pass
    sys.exit(0)

signal.signal(signal.SIGTERM, cleanup)
signal.signal(signal.SIGINT, cleanup)

# Read commands from stdin using unbuffered readline
while True:
    line = sys.stdin.readline()
    if not line:
        break
    line = line.strip().lower()
    if not line:
        continue

    parts = line.split()
    cmd = parts[0]

    if cmd == "enable":
        # Target level: 0 for built-in inhibit (pull LOW to accept), 1 for relay mode (pull HIGH to connect)
        target_val = int(parts[1]) if len(parts) > 1 and parts[1].isdigit() else (0 if inhibit_active_high else 1)
        inhibit.value = target_val
        v_label = f"LOW/0V (Physical Pin {inhibit_phys} pulled LOW -> Slot ACCEPTING coins)" if target_val == 0 else f"HIGH/3.3V (Physical Pin {inhibit_phys} pulled HIGH -> Relay ON / Slot ACCEPTING coins)"
        log(f"[INHIBIT] {v_label}")
        sys.stdout.write(json.dumps({"event": "inhibit", "state": "enabled", "level": int(inhibit.value)}) + "\n")
        sys.stdout.flush()
    elif cmd in ("disable", "block"):
        # Target level: 1 for built-in inhibit (pull HIGH to block), 0 for relay mode (pull LOW to cut)
        target_val = int(parts[1]) if len(parts) > 1 and parts[1].isdigit() else (1 if inhibit_active_high else 0)
        inhibit.value = target_val
        v_label = f"HIGH/3.3V (Physical Pin {inhibit_phys} set HIGH -> Slot BLOCKED)" if target_val == 1 else f"LOW/0V (Physical Pin {inhibit_phys} set LOW -> Relay OFF / Signal CUT)"
        log(f"[INHIBIT] {v_label}")
        sys.stdout.write(json.dumps({"event": "inhibit", "state": "blocked", "level": int(inhibit.value)}) + "\n")
        sys.stdout.flush()
    elif cmd == "set_mode":
        if len(parts) > 1:
            inhibit_active_high = parts[1] == "true" or parts[1] == "1"
            log(f"Inhibit mode updated: activeHigh={inhibit_active_high}")
            sys.stdout.write(json.dumps({"event": "mode_updated", "activeHigh": inhibit_active_high}) + "\n")
            sys.stdout.flush()
    elif cmd == "status":
        sys.stdout.write(json.dumps({
            "status": "online",
            "coinLevel": int(coin.is_pressed),
            "inhibitLevel": int(inhibit.value),
            "activeHigh": inhibit_active_high
        }) + "\n")
        sys.stdout.flush()
    elif cmd == "quit":
        break

cleanup()

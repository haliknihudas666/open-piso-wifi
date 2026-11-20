#!/usr/bin/env python3
"""
OpenPisoWiFi - Hardware GPIO Bridge (Raspberry Pi & Linux SBCs)
Supports:
  - gpiozero / lgpio (Raspberry Pi OS Bookworm / Pi 5 / Bullseye)
  - libgpiod python3 bindings v2 & v1 (Orange Pi, NanoPi, Banana Pi, Armbian)

Protocol (stdin -> stdout):
  - Inputs on stdin: enable [0|1], disable|block [0|1], set_mode <true|false|1|0>, status, quit
  - Outputs on stdout:
      PULSE
      BUTTON_PRESSED
      {"status":"ready", ...}
      {"event":"tamper","reason":"esd_spike"|"stuck_low","widthMs":...}
      {"event":"inhibit","state":"enabled"|"blocked","level":0|1}
"""

import glob
import json
import signal
import sys
import threading
import time

# Informational only: BCM GPIO -> Physical 40-pin RPi header pin (never used to remap BCM inputs)
BCM_TO_PHYSICAL = {
    2: 3, 3: 5, 4: 7, 14: 8, 15: 10, 17: 11, 18: 12, 27: 13,
    22: 15, 23: 16, 24: 18, 10: 19, 9: 21, 25: 22, 11: 23, 8: 24,
    7: 26, 5: 29, 6: 31, 12: 32, 13: 33, 19: 35, 16: 36, 26: 37,
    20: 38, 21: 40,
}

MIN_PULSE_WIDTH_MS = 12.0
MAX_PULSE_WIDTH_MS = 400.0
BUTTON_DEBOUNCE_SEC = 1.0

io_lock = threading.Lock()
stop_event = threading.Event()


def log(msg):
    with io_lock:
        sys.stderr.write(f"[GPIO-BRIDGE] {msg}\n")
        sys.stderr.flush()


def emit_line(text):
    with io_lock:
        sys.stdout.write(text + "\n")
        sys.stdout.flush()


def emit_json(payload):
    emit_line(json.dumps(payload))


def parse_bool(val, default=True):
    if val is None:
        return default
    return str(val).strip().lower() in ("true", "1", "yes", "on")


def parse_optional_bcm(raw, default=None):
    if raw is None:
        return default
    s = str(raw).strip().lower()
    if s in ("", "none", "null", "off", "-1"):
        return None
    val = int(s)
    return val if val >= 0 else None


class PulseTracker:
    """Measures LOW pulse widths between falling and rising edges to reject ESD spikes & stuck shorts."""

    def __init__(self, coin_bcm):
        self.coin_bcm = coin_bcm
        self.lock = threading.Lock()
        self.pulse_start = None
        self.stuck_reported = False

    def on_falling(self, now=None):
        ts = now if now is not None else time.monotonic()
        with self.lock:
            if self.pulse_start is None:
                self.pulse_start = ts
                self.stuck_reported = False

    def on_rising(self, now=None):
        ts = now if now is not None else time.monotonic()
        action = None
        width_ms = 0.0
        with self.lock:
            if self.pulse_start is None:
                return
            width_ms = (ts - self.pulse_start) * 1000.0
            was_stuck = self.stuck_reported
            self.pulse_start = None
            self.stuck_reported = False
            if was_stuck:
                return
            if width_ms < MIN_PULSE_WIDTH_MS:
                action = "esd"
            elif width_ms > MAX_PULSE_WIDTH_MS:
                action = "stuck"
            else:
                action = "valid"

        if action == "esd":
            log(f"Rejected ESD/piezo spike on BCM {self.coin_bcm}: {width_ms:.2f}ms (< {MIN_PULSE_WIDTH_MS}ms)")
            emit_json({"event": "tamper", "reason": "esd_spike", "widthMs": round(width_ms, 2)})
        elif action == "stuck":
            log(f"Rejected stuck-LOW pulse on BCM {self.coin_bcm}: {width_ms:.2f}ms (> {MAX_PULSE_WIDTH_MS}ms)")
            emit_json({"event": "tamper", "reason": "stuck_low", "widthMs": round(width_ms, 2)})
        elif action == "valid":
            log(f"Valid coin pulse on BCM {self.coin_bcm} ({width_ms:.1f}ms)")
            emit_line("PULSE")

    def check_watchdog(self, now=None):
        ts = now if now is not None else time.monotonic()
        emit_stuck = False
        width_ms = 0.0
        with self.lock:
            if self.pulse_start is not None and not self.stuck_reported:
                width_ms = (ts - self.pulse_start) * 1000.0
                if width_ms > MAX_PULSE_WIDTH_MS:
                    self.stuck_reported = True
                    emit_stuck = True
        if emit_stuck:
            log(f"Stuck-LOW short detected on BCM {self.coin_bcm} ({width_ms:.1f}ms > {MAX_PULSE_WIDTH_MS}ms)")
            emit_json({"event": "tamper", "reason": "stuck_low", "widthMs": round(width_ms, 2)})


class ButtonDebouncer:
    def __init__(self, button_bcm):
        self.button_bcm = button_bcm
        self.lock = threading.Lock()
        self.last_press = 0.0

    def trigger(self):
        now = time.monotonic()
        with self.lock:
            if now - self.last_press < BUTTON_DEBOUNCE_SEC:
                return
            self.last_press = now
        log(f"Physical button pressed on BCM {self.button_bcm}")
        emit_line("BUTTON_PRESSED")


class GpioZeroDriver:
    name = "gpiozero"

    def __init__(self, coin_bcm, inhibit_bcm, button_bcm, initial_inhibit, tracker, button_debouncer):
        from gpiozero import Button, DigitalOutputDevice, Device
        try:
            from gpiozero.pins.lgpio import LGPIOFactory
            Device.pin_factory = LGPIOFactory()
        except Exception:
            pass

        self.inhibit = DigitalOutputDevice(
            inhibit_bcm,
            active_high=True,
            initial_value=(initial_inhibit == 1),
        )
        self.inhibit.value = initial_inhibit

        # Use bounce_time=None so software pulse tracker measures sub-12ms ESD spikes accurately
        self.coin = Button(coin_bcm, pull_up=True, bounce_time=None)
        self.coin.when_pressed = lambda: tracker.on_falling()
        self.coin.when_released = lambda: tracker.on_rising()

        self.button = None
        if button_bcm is not None and button_bcm not in (coin_bcm, inhibit_bcm):
            try:
                self.button = Button(button_bcm, pull_up=True, bounce_time=0.05)
                self.button.when_pressed = lambda: button_debouncer.trigger()
            except Exception as btn_err:
                log(f"Warning: could not initialize button on BCM {button_bcm}: {btn_err}")
                self.button = None

        self.tracker = tracker
        self.watchdog_thread = threading.Thread(target=self._watchdog_loop, daemon=True)
        self.watchdog_thread.start()

    def _watchdog_loop(self):
        while not stop_event.is_set():
            self.tracker.check_watchdog()
            stop_event.wait(0.05)

    def set_inhibit(self, level):
        self.inhibit.value = 1 if level else 0

    def get_inhibit(self):
        return int(self.inhibit.value)

    def get_coin_pressed(self):
        return 1 if self.coin.is_pressed else 0

    def close(self):
        for dev in (self.button, self.coin, self.inhibit):
            if dev is not None:
                try:
                    dev.close()
                except Exception:
                    pass


class GpiodV2Driver:
    name = "gpiod-v2"

    def __init__(self, coin_bcm, inhibit_bcm, button_bcm, initial_inhibit, tracker, button_debouncer):
        import gpiod
        from gpiod.line import Bias, Direction, Edge, Value

        self.gpiod = gpiod
        self.Value = Value
        self.tracker = tracker
        self.button_debouncer = button_debouncer
        self.coin_bcm = coin_bcm
        self.inhibit_bcm = inhibit_bcm
        self.button_bcm = button_bcm if (button_bcm is not None and button_bcm not in (coin_bcm, inhibit_bcm)) else None
        self.inhibit_level = 1 if initial_inhibit else 0

        chips = self._discover_chips(max(p for p in (coin_bcm, inhibit_bcm, self.button_bcm) if p is not None))
        if not chips:
            raise RuntimeError("No suitable /dev/gpiochip* device found")

        self.request = None
        self.has_button = False
        last_err = None

        for chip_path in chips:
            for use_bias in (True, False):
                for try_button in ((True, False) if self.button_bcm is not None else (False,)):
                    try:
                        config = {
                            coin_bcm: gpiod.LineSettings(
                                direction=Direction.INPUT,
                                edge_detection=Edge.BOTH,
                                bias=Bias.PULL_UP if use_bias else Bias.AS_IS,
                            ),
                            inhibit_bcm: gpiod.LineSettings(
                                direction=Direction.OUTPUT,
                                output_value=Value.ACTIVE if self.inhibit_level else Value.INACTIVE,
                            ),
                        }
                        if try_button and self.button_bcm is not None:
                            config[self.button_bcm] = gpiod.LineSettings(
                                direction=Direction.INPUT,
                                edge_detection=Edge.FALLING,
                                bias=Bias.PULL_UP if use_bias else Bias.AS_IS,
                            )
                        self.request = gpiod.request_lines(
                            chip_path,
                            consumer="openpiso-gpio-bridge",
                            config=config,
                        )
                        self.has_button = try_button and (self.button_bcm is not None)
                        self.chip_path = chip_path
                        log(f"Using gpiod v2 on {chip_path} (pull_up={use_bias}, button={self.has_button})")
                        break
                    except Exception as exc:
                        last_err = exc
                if self.request is not None:
                    break
            if self.request is not None:
                break

        if self.request is None:
            raise RuntimeError(f"Failed to request gpiod v2 lines: {last_err}")

        self.event_thread = threading.Thread(target=self._event_loop, daemon=True)
        self.event_thread.start()

    def _discover_chips(self, min_line_offset):
        candidates = []
        for p in sorted(glob.glob("/dev/gpiochip*")):
            try:
                if not self.gpiod.is_gpiochip_device(p):
                    continue
                with self.gpiod.Chip(p) as chip:
                    info = chip.get_info()
                    if info.num_lines <= min_line_offset:
                        continue
                    label = (info.label or "").lower()
                    priority = 0 if ("pinctrl" in label or "gpio" in label) else 1
                    candidates.append((priority, p))
            except Exception:
                continue
        candidates.sort(key=lambda item: (item[0], item[1]))
        return [p for _, p in candidates]

    def _event_loop(self):
        EdgeEvent = self.gpiod.EdgeEvent
        while not stop_event.is_set():
            try:
                if self.request.wait_edge_events(timeout=0.05):
                    events = self.request.read_edge_events()
                    for ev in events:
                        now = time.monotonic()
                        if ev.line_offset == self.coin_bcm:
                            if ev.event_type == EdgeEvent.Type.FALLING_EDGE:
                                self.tracker.on_falling(now)
                            elif ev.event_type == EdgeEvent.Type.RISING_EDGE:
                                self.tracker.on_rising(now)
                        elif self.has_button and ev.line_offset == self.button_bcm:
                            if ev.event_type == EdgeEvent.Type.FALLING_EDGE:
                                self.button_debouncer.trigger()
                self.tracker.check_watchdog()
            except Exception as exc:
                if not stop_event.is_set():
                    log(f"gpiod v2 event error: {exc}")
                    time.sleep(0.1)

    def set_inhibit(self, level):
        self.inhibit_level = 1 if level else 0
        val = self.Value.ACTIVE if self.inhibit_level else self.Value.INACTIVE
        self.request.set_value(self.inhibit_bcm, val)

    def get_inhibit(self):
        return self.inhibit_level

    def get_coin_pressed(self):
        val = self.request.get_value(self.coin_bcm)
        return 1 if val == self.Value.INACTIVE else 0

    def close(self):
        if self.request is not None:
            try:
                self.request.release()
            except Exception:
                pass


class GpiodV1Driver:
    name = "gpiod-v1"

    def __init__(self, coin_bcm, inhibit_bcm, button_bcm, initial_inhibit, tracker, button_debouncer):
        import gpiod

        self.gpiod = gpiod
        self.tracker = tracker
        self.button_debouncer = button_debouncer
        self.coin_bcm = coin_bcm
        self.inhibit_bcm = inhibit_bcm
        self.button_bcm = button_bcm if (button_bcm is not None and button_bcm not in (coin_bcm, inhibit_bcm)) else None
        self.inhibit_level = 1 if initial_inhibit else 0

        min_line_offset = max(p for p in (coin_bcm, inhibit_bcm, self.button_bcm) if p is not None)
        chip_paths = self._discover_chips(min_line_offset)
        if not chip_paths:
            raise RuntimeError("No suitable /dev/gpiochip* device found for gpiod v1")

        self.chip = None
        self.coin_line = None
        self.inhibit_line = None
        self.button_line = None
        last_err = None

        bias_flag = getattr(gpiod, "LINE_REQ_FLAG_BIAS_PULL_UP", 0)
        for chip_path in chip_paths:
            for flags in ([bias_flag, 0] if bias_flag else [0]):
                chip = None
                coin_line = None
                inhibit_line = None
                try:
                    chip = gpiod.Chip(chip_path)
                    coin_line = chip.get_line(coin_bcm)
                    coin_line.request(
                        consumer="openpiso-coin",
                        type=gpiod.LINE_REQ_EV_BOTH_EDGES,
                        flags=flags,
                    )
                    inhibit_line = chip.get_line(inhibit_bcm)
                    inhibit_line.request(
                        consumer="openpiso-inhibit",
                        type=gpiod.LINE_REQ_DIR_OUT,
                        default_vals=[self.inhibit_level],
                    )
                    self.chip = chip
                    self.coin_line = coin_line
                    self.inhibit_line = inhibit_line
                    if self.button_bcm is not None:
                        try:
                            btn_line = chip.get_line(self.button_bcm)
                            btn_line.request(
                                consumer="openpiso-button",
                                type=gpiod.LINE_REQ_EV_FALLING_EDGE,
                                flags=flags,
                            )
                            self.button_line = btn_line
                        except Exception as btn_err:
                            log(f"Warning: gpiod v1 button BCM {self.button_bcm} unavailable: {btn_err}")
                            self.button_line = None
                    log(f"Using gpiod v1 on {chip_path} (flags={flags}, button={self.button_line is not None})")
                    break
                except Exception as exc:
                    last_err = exc
                    for l in (coin_line, inhibit_line):
                        if l is not None:
                            try:
                                l.release()
                            except Exception:
                                pass
                    if chip is not None:
                        try:
                            chip.close()
                        except Exception:
                            pass
            if self.coin_line is not None:
                break

        if self.coin_line is None:
            raise RuntimeError(f"Failed to request gpiod v1 lines: {last_err}")

        self.coin_thread = threading.Thread(target=self._coin_loop, daemon=True)
        self.coin_thread.start()
        if self.button_line is not None:
            self.btn_thread = threading.Thread(target=self._button_loop, daemon=True)
            self.btn_thread.start()

    def _discover_chips(self, min_line_offset):
        candidates = []
        for p in sorted(glob.glob("/dev/gpiochip*")):
            try:
                chip = self.gpiod.Chip(p)
                num_lines = chip.num_lines()
                label = (chip.label() or "").lower()
                chip.close()
                if num_lines <= min_line_offset:
                    continue
                priority = 0 if ("pinctrl" in label or "gpio" in label) else 1
                candidates.append((priority, p))
            except Exception:
                continue
        candidates.sort(key=lambda item: (item[0], item[1]))
        return [p for _, p in candidates]

    def _coin_loop(self):
        LineEvent = self.gpiod.LineEvent
        while not stop_event.is_set():
            try:
                if self.coin_line.event_wait(sec=0, nsec=50_000_000):
                    ev = self.coin_line.event_read()
                    now = time.monotonic()
                    if ev.type == LineEvent.FALLING_EDGE:
                        self.tracker.on_falling(now)
                    elif ev.type == LineEvent.RISING_EDGE:
                        self.tracker.on_rising(now)
                self.tracker.check_watchdog()
            except Exception as exc:
                if not stop_event.is_set():
                    log(f"gpiod v1 coin event error: {exc}")
                    time.sleep(0.1)

    def _button_loop(self):
        LineEvent = self.gpiod.LineEvent
        while not stop_event.is_set():
            try:
                if self.button_line.event_wait(sec=0, nsec=200_000_000):
                    ev = self.button_line.event_read()
                    if ev.type == LineEvent.FALLING_EDGE:
                        self.button_debouncer.trigger()
            except Exception as exc:
                if not stop_event.is_set():
                    log(f"gpiod v1 button event error: {exc}")
                    time.sleep(0.2)

    def set_inhibit(self, level):
        self.inhibit_level = 1 if level else 0
        self.inhibit_line.set_value(self.inhibit_level)

    def get_inhibit(self):
        return self.inhibit_level

    def get_coin_pressed(self):
        return 1 if self.coin_line.get_value() == 0 else 0

    def close(self):
        for l in (self.button_line, self.coin_line, self.inhibit_line):
            if l is not None:
                try:
                    l.release()
                except Exception:
                    pass
        if self.chip is not None:
            try:
                self.chip.close()
            except Exception:
                pass


def create_driver(backend, coin_bcm, inhibit_bcm, button_bcm, initial_inhibit, tracker, button_debouncer):
    errors = []

    if backend in ("auto", "gpiozero"):
        try:
            return GpioZeroDriver(coin_bcm, inhibit_bcm, button_bcm, initial_inhibit, tracker, button_debouncer)
        except Exception as exc:
            errors.append(f"gpiozero: {exc}")
            if backend == "gpiozero":
                raise RuntimeError(f"gpiozero backend failed: {exc}") from exc

    if backend in ("auto", "gpiod"):
        try:
            import gpiod
        except ImportError as exc:
            errors.append(f"gpiod import: {exc}")
            raise RuntimeError("No GPIO backend available (" + "; ".join(errors) + ")") from exc

        if hasattr(gpiod, "request_lines") and hasattr(gpiod, "LineSettings"):
            try:
                return GpiodV2Driver(coin_bcm, inhibit_bcm, button_bcm, initial_inhibit, tracker, button_debouncer)
            except Exception as exc:
                errors.append(f"gpiod-v2: {exc}")
                raise RuntimeError("No GPIO backend available (" + "; ".join(errors) + ")") from exc
        else:
            try:
                return GpiodV1Driver(coin_bcm, inhibit_bcm, button_bcm, initial_inhibit, tracker, button_debouncer)
            except Exception as exc:
                errors.append(f"gpiod-v1: {exc}")
                raise RuntimeError("No GPIO backend available (" + "; ".join(errors) + ")") from exc

    raise RuntimeError(f"Unsupported GPIO backend '{backend}'. Choose auto, gpiozero, or gpiod.")


def main():
    coin_bcm = int(sys.argv[1]) if len(sys.argv) > 1 else 4
    inhibit_bcm = int(sys.argv[2]) if len(sys.argv) > 2 else 17
    inhibit_active_high = parse_bool(sys.argv[3] if len(sys.argv) > 3 else "true", True)
    button_bcm = parse_optional_bcm(sys.argv[4] if len(sys.argv) > 4 else "27", 27)
    backend = (sys.argv[5] if len(sys.argv) > 5 else "auto").strip().lower()

    coin_phys = BCM_TO_PHYSICAL.get(coin_bcm, coin_bcm)
    inhibit_phys = BCM_TO_PHYSICAL.get(inhibit_bcm, inhibit_bcm)
    button_phys = BCM_TO_PHYSICAL.get(button_bcm, button_bcm) if button_bcm is not None else None

    log(
        f"Starting bridge — Coin: BCM {coin_bcm} (Pin {coin_phys}), "
        f"Inhibit: BCM {inhibit_bcm} (Pin {inhibit_phys}), "
        f"Button: BCM {button_bcm}, activeHigh: {inhibit_active_high}, backend: {backend}"
    )

    initial_level = 1 if inhibit_active_high else 0
    tracker = PulseTracker(coin_bcm)
    button_debouncer = ButtonDebouncer(button_bcm)

    try:
        driver = create_driver(
            backend,
            coin_bcm,
            inhibit_bcm,
            button_bcm,
            initial_level,
            tracker,
            button_debouncer,
        )
    except Exception as exc:
        log(f"Failed to initialize GPIO ({backend}): {exc}")
        emit_json({"status": "error", "error": str(exc)})
        sys.exit(1)

    def cleanup(*_args):
        log("Cleaning up GPIO pins...")
        stop_event.set()
        try:
            driver.close()
        except Exception:
            pass
        sys.exit(0)

    signal.signal(signal.SIGTERM, cleanup)
    signal.signal(signal.SIGINT, cleanup)

    emit_json({
        "status": "ready",
        "coinPin": coin_phys,
        "inhibitPin": inhibit_phys,
        "buttonPin": button_phys,
        "coinBcm": coin_bcm,
        "inhibitBcm": inhibit_bcm,
        "buttonBcm": button_bcm,
        "activeHigh": inhibit_active_high,
        "inhibitLevel": initial_level,
        "backend": driver.name,
    })

    coin_pressed = driver.get_coin_pressed()
    idle_state = "LOW (0V / PRESSED)" if coin_pressed else "HIGH (3.3V IDLE)"
    log(f"GPIO hardware ready via {driver.name}: Coin BCM {coin_bcm} idle state is {idle_state}.")
    if coin_pressed:
        log(f"WARNING: Coin BCM {coin_bcm} is starting in LOW state! Ensure switch is NO (Normally Open), not NC.")

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
            target_val = int(parts[1]) if len(parts) > 1 and parts[1].isdigit() else (0 if inhibit_active_high else 1)
            driver.set_inhibit(target_val)
            emit_json({"event": "inhibit", "state": "enabled", "level": driver.get_inhibit()})
        elif cmd in ("disable", "block"):
            target_val = int(parts[1]) if len(parts) > 1 and parts[1].isdigit() else (1 if inhibit_active_high else 0)
            driver.set_inhibit(target_val)
            emit_json({"event": "inhibit", "state": "blocked", "level": driver.get_inhibit()})
        elif cmd == "set_mode":
            if len(parts) > 1:
                inhibit_active_high = parts[1] in ("true", "1")
                emit_json({"event": "mode_updated", "activeHigh": inhibit_active_high})
        elif cmd == "status":
            emit_json({
                "status": "online",
                "coinLevel": driver.get_coin_pressed(),
                "inhibitLevel": driver.get_inhibit(),
                "activeHigh": inhibit_active_high,
                "backend": driver.name,
            })
        elif cmd == "quit":
            break

    cleanup()


if __name__ == "__main__":
    main()

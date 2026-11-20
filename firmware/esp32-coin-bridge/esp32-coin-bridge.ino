/*
 * ==============================================================================
 * 🪙 OpenPisoWiFi - ESP32 Coin Acceptor & I2C OLED Hardware Bridge
 * ==============================================================================
 * Description:
 *   High-precision hardware timer interrupt pulse counter for multi-coin
 *   acceptors (CL-168, Allan 1239A, HX-616).
 *   Drives an optional SSD1306 128x64 I2C OLED display and bridges coin pulses
 *   to the OpenPisoWiFi Daemon / Raspberry Pi / PC via USB Serial (115200 baud).
 *
 * Security & Reliability Features:
 *   - Coin slot stays physically LOCKED (inhibited) on boot until portal unlock.
 *   - CHANGE interrupt measures exact LOW pulse width (12ms-400ms) to block
 *     piezo/ESD spikes and stuck-LOW tampering, emitting JSON tamper events.
 *   - Hardware watchdog (esp_task_wdt) auto-recovers from lockups.
 *
 * Pinout:
 *   - COIN_PIN:    GPIO 4  (Connect with 10k/20k voltage divider from 12V/5V pulse)
 *   - INHIBIT_PIN: GPIO 5  (Transistor or logic-level gate to coin slot SET line)
 *   - OLED SDA:    GPIO 21 (I2C Data)
 *   - OLED SCL:    GPIO 22 (I2C Clock)
 * ==============================================================================
 */

#include <Arduino.h>
#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include <esp_task_wdt.h>
#include <esp_idf_version.h>

// ------------------------------------------------------------------------------
// PIN DEFINITIONS & HARDWARE CONSTANTS
// ------------------------------------------------------------------------------
#define PIN_COIN            4
#define PIN_INHIBIT         5
#define SCREEN_WIDTH        128
#define SCREEN_HEIGHT       64
#define OLED_RESET          -1
#define OLED_I2C_ADDRESS    0x3C

// Debounce, pulse-width validation, and aggregation windows (in milliseconds)
#define DEBOUNCE_MIN_MS     25
#define PULSE_WIDTH_MIN_MS  12
#define PULSE_WIDTH_MAX_MS  400
#define TRAIN_SETTLE_MS     350
#define WDT_TIMEOUT_SEC     15

Adafruit_SSD1306 display(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, OLED_RESET);

// ------------------------------------------------------------------------------
// VOLATILE INTERRUPT TRACKING
// ------------------------------------------------------------------------------
volatile unsigned long lastPulseTime = 0;
volatile unsigned long pulseFallTime = 0;
volatile bool pulseInProgress = false;
volatile bool stuckLowReported = false;
volatile int volatilePulseCount = 0;
volatile bool isInhibitActive = true; // true = slot physically locked / disabled (LOCKED on boot)

volatile bool tamperShortSpike = false;
volatile bool tamperLongPulse = false;
volatile bool tamperWhileInhibited = false;
volatile unsigned long tamperWidthMs = 0;

portMUX_TYPE mux = portMUX_INITIALIZER_UNLOCKED;

// State management
int settledCoinsTotal = 0;
bool hasOled = false;

// ------------------------------------------------------------------------------
// INTERRUPT SERVICE ROUTINE (ISR)
// ------------------------------------------------------------------------------
void IRAM_ATTR handleCoinPulse() {
  unsigned long now = millis();
  int level = digitalRead(PIN_COIN);

  portENTER_CRITICAL_ISR(&mux);
  if (level == LOW) {
    if (!pulseInProgress) {
      pulseInProgress = true;
      stuckLowReported = false;
      pulseFallTime = now;
    }
  } else {
    if (pulseInProgress) {
      pulseInProgress = false;
      unsigned long width = now - pulseFallTime;

      if (isInhibitActive) {
        tamperWhileInhibited = true;
        tamperWidthMs = width;
      } else if (width < PULSE_WIDTH_MIN_MS) {
        tamperShortSpike = true;
        tamperWidthMs = width;
      } else if (width > PULSE_WIDTH_MAX_MS) {
        if (!stuckLowReported) {
          tamperLongPulse = true;
          tamperWidthMs = width;
        }
      } else if (now - lastPulseTime >= DEBOUNCE_MIN_MS) {
        volatilePulseCount++;
        lastPulseTime = now;
      }
      stuckLowReported = false;
    }
  }
  portEXIT_CRITICAL_ISR(&mux);
}

// ------------------------------------------------------------------------------
// OLED DRAWING UTILITIES
// ------------------------------------------------------------------------------
void updateDisplay(const String &line1, const String &line2, const String &line3) {
  if (!hasOled) return;
  display.clearDisplay();
  display.setTextColor(SSD1306_WHITE);

  // Header Banner
  display.setTextSize(1);
  display.setCursor(0, 0);
  display.println(" OpenPisoWiFi Bridge ");
  display.drawFastHLine(0, 10, SCREEN_WIDTH, SSD1306_WHITE);

  // Primary Line (Large Text, e.g. P5)
  display.setTextSize(2);
  display.setCursor(8, 18);
  display.println(line1);

  // Status Lines
  display.setTextSize(1);
  display.setCursor(0, 42);
  display.println(line2);
  display.setCursor(0, 54);
  display.println(line3);

  display.display();
}

void setInhibitState(bool locked) {
  portENTER_CRITICAL(&mux);
  isInhibitActive = locked;
  if (locked) {
    volatilePulseCount = 0;
  }
  portEXIT_CRITICAL(&mux);

  // Active-High gate: HIGH blocks coin slot, LOW enables slot
  digitalWrite(PIN_INHIBIT, locked ? HIGH : LOW);

  // Emit state event
  Serial.print("{\"event\":\"inhibit_changed\",\"locked\":");
  Serial.print(locked ? "true" : "false");
  Serial.println("}");

  updateDisplay(
    locked ? "LOCKED" : "READY",
    locked ? "Press 'Insert Coin'" : "Insert Coins Now",
    "Total: P" + String(settledCoinsTotal)
  );
}

// ------------------------------------------------------------------------------
// SETUP
// ------------------------------------------------------------------------------
void setup() {
  Serial.begin(115200);
  delay(200);

  pinMode(PIN_COIN, INPUT_PULLUP);
  pinMode(PIN_INHIBIT, OUTPUT);

  // Initialize I2C OLED display
  Wire.begin(21, 22);
  if (display.begin(SSD1306_SWITCHCAPVCC, OLED_I2C_ADDRESS)) {
    hasOled = true;
    display.clearDisplay();
    display.setTextSize(1);
    display.setTextColor(SSD1306_WHITE);
    display.setCursor(15, 20);
    display.println("OpenPisoWiFi");
    display.setCursor(10, 36);
    display.println("Hardware Bridge");
    display.display();
    delay(1200);
  }

  // Keep coin slot LOCKED on boot until host explicitly unlocks it
  setInhibitState(true);

  // Attach hardware CHANGE interrupt for pulse-width anti-tamper validation
  attachInterrupt(digitalPinToInterrupt(PIN_COIN), handleCoinPulse, CHANGE);

  // Enable ESP32 hardware task watchdog
#if defined(ESP_IDF_VERSION) && (ESP_IDF_VERSION >= ESP_IDF_VERSION_VAL(5, 0, 0))
  esp_task_wdt_config_t wdtConfig = {
    .timeout_ms = WDT_TIMEOUT_SEC * 1000,
    .idle_core_mask = 0,
    .trigger_panic = true
  };
  if (esp_task_wdt_init(&wdtConfig) == ESP_ERR_INVALID_STATE) {
    esp_task_wdt_reconfigure(&wdtConfig);
  }
#else
  esp_task_wdt_init(WDT_TIMEOUT_SEC, true);
#endif
  esp_task_wdt_add(NULL);

  // Announce ready status to host controller (slot remains locked)
  Serial.println("{\"event\":\"ready\",\"status\":\"ready\",\"module\":\"OpenPisoWiFi-ESP32-Bridge\",\"version\":\"1.1.0\",\"locked\":true}");
}

// ------------------------------------------------------------------------------
// MAIN LOOP
// ------------------------------------------------------------------------------
void loop() {
  esp_task_wdt_reset();

  unsigned long now = millis();
  int currentPulses = 0;
  unsigned long lastPulseSnapshot = 0;
  bool flagInhibited = false;
  bool flagShort = false;
  bool flagLong = false;
  bool flagStuckLow = false;
  unsigned long reportedWidth = 0;

  // Atomically inspect volatile pulse and tamper flags
  portENTER_CRITICAL(&mux);
  currentPulses = volatilePulseCount;
  lastPulseSnapshot = lastPulseTime;

  if (tamperWhileInhibited) {
    flagInhibited = true;
    tamperWhileInhibited = false;
    reportedWidth = tamperWidthMs;
  }
  if (tamperShortSpike) {
    flagShort = true;
    tamperShortSpike = false;
    reportedWidth = tamperWidthMs;
  }
  if (tamperLongPulse) {
    flagLong = true;
    tamperLongPulse = false;
    reportedWidth = tamperWidthMs;
  }
  if (pulseInProgress && !stuckLowReported && (now - pulseFallTime > PULSE_WIDTH_MAX_MS)) {
    stuckLowReported = true;
    flagStuckLow = true;
    reportedWidth = now - pulseFallTime;
  }
  portEXIT_CRITICAL(&mux);

  if (flagInhibited) {
    Serial.printf("{\"event\":\"tamper\",\"reason\":\"pulse_while_inhibited\",\"widthMs\":%lu}\n", reportedWidth);
    updateDisplay("TAMPER", "Pulse while locked", "Total: P" + String(settledCoinsTotal));
  }
  if (flagShort) {
    Serial.printf("{\"event\":\"tamper\",\"reason\":\"short_spike\",\"widthMs\":%lu}\n", reportedWidth);
  }
  if (flagLong) {
    Serial.printf("{\"event\":\"tamper\",\"reason\":\"long_pulse\",\"widthMs\":%lu}\n", reportedWidth);
    updateDisplay("TAMPER", "Abnormal pulse width", "Total: P" + String(settledCoinsTotal));
  }
  if (flagStuckLow) {
    Serial.printf("{\"event\":\"tamper\",\"reason\":\"stuck_low\",\"widthMs\":%lu}\n", reportedWidth);
    updateDisplay("TAMPER", "Coin line stuck LOW", "Check sensor/wire");
  }

  // Check if pulse train has settled (no pulses received within window)
  if (currentPulses > 0 && (now - lastPulseSnapshot >= TRAIN_SETTLE_MS)) {
    portENTER_CRITICAL(&mux);
    volatilePulseCount = 0;
    portEXIT_CRITICAL(&mux);

    int amountAdded = currentPulses; // Standard 1 pulse = 1 Peso
    settledCoinsTotal += amountAdded;

    // Send structured JSON message over Serial
    Serial.print("{\"event\":\"coin_inserted\",\"amount\":");
    Serial.print(amountAdded);
    Serial.print(",\"pulses\":");
    Serial.print(currentPulses);
    Serial.print(",\"total\":");
    Serial.print(settledCoinsTotal);
    Serial.println("}");

    updateDisplay("P" + String(amountAdded), "Accepted!", "Total: P" + String(settledCoinsTotal));
  }

  // Parse incoming commands from Host (e.g., {"cmd":"inhibit","state":true})
  if (Serial.available()) {
    String input = Serial.readStringUntil('\n');
    input.trim();
    if (input.indexOf("\"inhibit\"") >= 0) {
      if (input.indexOf("false") >= 0 || input.indexOf(":0") >= 0) {
        setInhibitState(false);
      } else {
        setInhibitState(true);
      }
    } else if (input.indexOf("\"reset\"") >= 0) {
      settledCoinsTotal = 0;
      updateDisplay("RESET", "Counter Cleared", "Total: P0");
    } else if (input.indexOf("\"status\"") >= 0) {
      Serial.printf("{\"event\":\"status\",\"locked\":%s,\"total\":%d}\n",
        isInhibitActive ? "true" : "false", settledCoinsTotal);
    }
  }

  delay(10);
}

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

// ------------------------------------------------------------------------------
// PIN DEFINITIONS & HARDWARE CONSTANTS
// ------------------------------------------------------------------------------
#define PIN_COIN            4
#define PIN_INHIBIT         5
#define SCREEN_WIDTH        128
#define SCREEN_HEIGHT       64
#define OLED_RESET          -1
#define OLED_I2C_ADDRESS    0x3C

// Debounce and pulse aggregation windows (in milliseconds)
#define DEBOUNCE_MIN_MS     25
#define TRAIN_SETTLE_MS     350

Adafruit_SSD1306 display(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, OLED_RESET);

// ------------------------------------------------------------------------------
// VOLATILE INTERRUPT TRACKING
// ------------------------------------------------------------------------------
volatile unsigned long lastPulseTime = 0;
volatile int volatilePulseCount = 0;
portMUX_TYPE mux = portMUX_INITIALIZER_UNLOCKED;

// State management
int settledCoinsTotal = 0;
bool isInhibitActive = false; // true = slot physically locked / disabled
bool hasOled = false;

// ------------------------------------------------------------------------------
// INTERRUPT SERVICE ROUTINE (ISR)
// ------------------------------------------------------------------------------
void IRAM_ATTR handleCoinPulse() {
  unsigned long now = millis();
  portENTER_CRITICAL_ISR(&mux);
  if (now - lastPulseTime >= DEBOUNCE_MIN_MS) {
    volatilePulseCount++;
    lastPulseTime = now;
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

  // Primary Line (Large Text, e.g. ₱5.00)
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
  isInhibitActive = locked;
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

  // Lock coin slot on boot by default until portal requests unlock
  setInhibitState(true);

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

  // Attach hardware interrupt
  attachInterrupt(digitalPinToInterrupt(PIN_COIN), handleCoinPulse, FALLING);

  // Announce ready status to host controller
  Serial.println("{\"status\":\"ready\",\"module\":\"OpenPisoWiFi-ESP32-Bridge\",\"version\":\"1.0.0\"}");
  setInhibitState(false);
}

// ------------------------------------------------------------------------------
// MAIN LOOP
// ------------------------------------------------------------------------------
void loop() {
  unsigned long now = millis();
  int currentPulses = 0;
  unsigned long lastPulseSnapshot = 0;

  // Atomically check volatile pulses
  portENTER_CRITICAL(&mux);
  currentPulses = volatilePulseCount;
  lastPulseSnapshot = lastPulseTime;
  portEXIT_CRITICAL(&mux);

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
      if (input.indexOf("false") >= 0 || input.indexOf("0") >= 0) {
        setInhibitState(false);
      } else {
        setInhibitState(true);
      }
    } else if (input.indexOf("\"reset\"") >= 0) {
      settledCoinsTotal = 0;
      updateDisplay("RESET", "Counter Cleared", "Total: P0");
    }
  }

  delay(10);
}

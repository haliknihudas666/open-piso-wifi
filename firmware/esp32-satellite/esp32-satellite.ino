/*
 * ==============================================================================
 * 🪙 OpenPisoWiFi - ESP32 Wireless Satellite Multi-Coinslot Firmware
 * ==============================================================================
 * Description:
 *   Autonomous Wi-Fi satellite controller for multi-coinslot kiosks.
 *   - Auto-connects to OpenPisoWiFi router (tested on Ruijie RG-EW1200G Pro, or any OpenWrt AP).
 *   - Auto-registers with OpenPisoWiFi Daemon at http://10.0.0.1:4000.
 *   - Persistent NVS Flash Configuration via Preferences library.
 *   - Live WebSerial USB configuration via browser flasher (CONFIG:slot_id=...;secret=...).
 *   - Microsecond hardware interrupt pulse counting with 25ms debounce.
 *   - Inhibit relay/gate control (only unlocks when a customer initiates payment).
 *   - Optional physical "Insert Coin" button support.
 *   - Optional I2C Display driver (auto-detects 16x2 / 20x4 LCD or SSD1306 OLED).
 *   - Embedded REST server for remote unlock, lock, and telemetry.
 *
 * Pinout (Standard ESP32 DevKit 30/38 pin):
 *   - COIN_PIN:        GPIO 4  (White coin wire through 10kΩ series resistor to protect 3.3V pin)
 *   - INHIBIT_PIN:     GPIO 5  (Transistor gate or Relay to coin acceptor SET/INHIBIT line)
 *   - BUTTON_PIN:      GPIO 15 (Physical Push Button to GND with internal PULLUP)
 *   - LED_STATUS_PIN:  GPIO 2  (Built-in Blue LED / Status indicator)
 *   - I2C SDA:         GPIO 21 (OLED or LCD I2C Data)
 *   - I2C SCL:         GPIO 22 (OLED or LCD I2C Clock)
 * ==============================================================================
 */

#include <Arduino.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include <WebServer.h>
#include <Wire.h>
#include <Preferences.h>
#include <LiquidCrystal_I2C.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>

// ------------------------------------------------------------------------------
// ⚙️ NON-VOLATILE STORAGE (NVS) & DYNAMIC CONFIGURATION
// ------------------------------------------------------------------------------
Preferences prefs;

String wifiSsid        = "OpenPisoWiFi";
String wifiPass        = "";
String daemonHost      = "http://10.0.0.1:4000";
String satelliteSecret = "change-me-to-a-secure-random-secret";
String slotId          = "slot-1";
String slotName        = "Store Front - Box 1";

// Pin Assignments
#define PIN_COIN            4
#define PIN_INHIBIT         5
#define PIN_BUTTON          15
#define PIN_STATUS_LED      2

// Inhibit Mode:
// true  = Active-High gate (HIGH = Locked/Blocked, LOW = Unlocked/Enabled)
// false = Relay Mode (LOW = Locked/Blocked, HIGH = Unlocked/Enabled)
const bool INHIBIT_ACTIVE_HIGH = true;

// Debounce & Timing constants
#define DEBOUNCE_MIN_MS     25
#define TRAIN_SETTLE_MS     350
#define HEARTBEAT_INTERVAL  10000

// ------------------------------------------------------------------------------
// HARDWARE OBJECTS & VOLATILE STATE
// ------------------------------------------------------------------------------
WebServer server(80);
LiquidCrystal_I2C lcd(0x27, 16, 2);
Adafruit_SSD1306 oled(128, 64, &Wire, -1);

bool hasLcd = false;
bool hasOled = false;

volatile unsigned long lastPulseTime = 0;
volatile int volatilePulseCount = 0;
portMUX_TYPE isrMux = portMUX_INITIALIZER_UNLOCKED;

bool isSlotUnlocked = false;
unsigned long unlockExpiryTime = 0;
int sessionPulses = 0;
unsigned long lastHeartbeatTime = 0;
unsigned long lastTrainCheckTime = 0;
unsigned long lastButtonPressTime = 0;

// ------------------------------------------------------------------------------
// NVS PREFERENCES HELPERS
// ------------------------------------------------------------------------------
void loadPreferences() {
  prefs.begin("openpiso", false);
  wifiSsid        = prefs.getString("ssid", wifiSsid);
  wifiPass        = prefs.getString("pass", wifiPass);
  daemonHost      = prefs.getString("daemon", daemonHost);
  satelliteSecret = prefs.getString("secret", satelliteSecret);
  slotId          = prefs.getString("slot_id", slotId);
  slotName        = prefs.getString("slot_name", slotName);
  prefs.end();
}

void savePreferences(const String& sId, const String& sName, const String& sec, const String& dHost, const String& sSsid, const String& sPass) {
  prefs.begin("openpiso", false);
  if (sId.length() > 0) prefs.putString("slot_id", sId);
  if (sName.length() > 0) prefs.putString("slot_name", sName);
  if (sec.length() > 0) prefs.putString("secret", sec);
  if (dHost.length() > 0) prefs.putString("daemon", dHost);
  if (sSsid.length() > 0) prefs.putString("ssid", sSsid);
  prefs.putString("pass", sPass);
  prefs.end();
}

void printConfigJson() {
  Serial.printf("[CONFIG_JSON] {\"slot_id\":\"%s\",\"slot_name\":\"%s\",\"secret\":\"%s\",\"daemon\":\"%s\",\"ssid\":\"%s\",\"pass\":\"%s\"}\n",
    slotId.c_str(), slotName.c_str(), satelliteSecret.c_str(), daemonHost.c_str(), wifiSsid.c_str(), wifiPass.c_str());
}

// ------------------------------------------------------------------------------
// INTERRUPT SERVICE ROUTINE (ISR)
// ------------------------------------------------------------------------------
void IRAM_ATTR handleCoinInterrupt() {
  unsigned long now = millis();
  portENTER_CRITICAL_ISR(&isrMux);
  if (isSlotUnlocked && (now - lastPulseTime >= DEBOUNCE_MIN_MS)) {
    volatilePulseCount++;
    lastPulseTime = now;
  }
  portEXIT_CRITICAL_ISR(&isrMux);
}

// ------------------------------------------------------------------------------
// HARDWARE INHIBIT CONTROL
// ------------------------------------------------------------------------------
void setInhibitState(bool unlock) {
  isSlotUnlocked = unlock;
  if (INHIBIT_ACTIVE_HIGH) {
    digitalWrite(PIN_INHIBIT, unlock ? LOW : HIGH);
  } else {
    digitalWrite(PIN_INHIBIT, unlock ? HIGH : LOW);
  }
  digitalWrite(PIN_STATUS_LED, unlock ? HIGH : LOW);
}

// ------------------------------------------------------------------------------
// DISPLAY DRIVERS
// ------------------------------------------------------------------------------
void detectDisplays() {
  Wire.begin(21, 22);

  // Check 0x27 (I2C LCD)
  Wire.beginTransmission(0x27);
  if (Wire.endTransmission() == 0) {
    lcd.init();
    lcd.backlight();
    hasLcd = true;
    Serial.println("[DISPLAY] 📺 I2C LCD (0x27) detected!");
    return;
  }

  // Check 0x3C (I2C OLED)
  Wire.beginTransmission(0x3C);
  if (Wire.endTransmission() == 0) {
    if (oled.begin(SSD1306_SWITCHCAPVCC, 0x3C)) {
      hasOled = true;
      oled.clearDisplay();
      oled.display();
      Serial.println("[DISPLAY] 📺 SSD1306 OLED (0x3C) detected!");
      return;
    }
  }

  Serial.println("[DISPLAY] ℹ️ No external I2C display detected. Using Serial only.");
}

void renderDisplay(const String &line1, const String &line2, const String &line3 = "") {
  if (hasLcd) {
    lcd.clear();
    lcd.setCursor(0, 0);
    lcd.print(line1.substring(0, 16));
    lcd.setCursor(0, 1);
    lcd.print(line2.substring(0, 16));
  } else if (hasOled) {
    oled.clearDisplay();
    oled.setTextColor(SSD1306_WHITE);
    oled.setTextSize(1);
    oled.setCursor(0, 0);
    oled.println(slotName);
    oled.drawFastHLine(0, 10, 128, SSD1306_WHITE);

    oled.setTextSize(2);
    oled.setCursor(8, 18);
    oled.println(line1);

    oled.setTextSize(1);
    oled.setCursor(0, 42);
    oled.println(line2);
    if (line3.length() > 0) {
      oled.setCursor(0, 54);
      oled.println(line3);
    }
    oled.display();
  }
}

// ------------------------------------------------------------------------------
// DAEMON API CLIENT
// ------------------------------------------------------------------------------
void registerWithDaemon() {
  if (WiFi.status() != WL_CONNECTED) return;

  HTTPClient http;
  String url = daemonHost + "/api/coinslots/register";
  http.begin(url);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("X-Slot-Secret", satelliteSecret);
  http.addHeader("Authorization", "Bearer " + satelliteSecret);

  String payload = "{";
  payload += "\"slotId\":\"" + slotId + "\",";
  payload += "\"name\":\"" + slotName + "\",";
  payload += "\"ip\":\"" + WiFi.localIP().toString() + "\",";
  payload += "\"mac\":\"" + WiFi.macAddress() + "\",";
  payload += "\"status\":\"ready\",";
  payload += "\"rssi\":" + String(WiFi.RSSI());
  payload += "}";

  int code = http.POST(payload);
  if (code > 0) {
    Serial.printf("[DAEMON] ✅ Registered to daemon (HTTP %d)\n", code);
  } else {
    Serial.printf("[DAEMON] ⚠️ Register failed: %s\n", http.errorToString(code).c_str());
  }
  http.end();
}

void sendHeartbeat() {
  if (WiFi.status() != WL_CONNECTED) return;

  HTTPClient http;
  String url = daemonHost + "/api/coinslots/heartbeat";
  http.begin(url);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("X-Slot-Secret", satelliteSecret);
  http.addHeader("Authorization", "Bearer " + satelliteSecret);

  String payload = "{";
  payload += "\"slotId\":\"" + slotId + "\",";
  payload += "\"status\":\"" + String(isSlotUnlocked ? "unlocked" : "ready") + "\",";
  payload += "\"rssi\":" + String(WiFi.RSSI()) + ",";
  payload += "\"uptime\":" + String(millis() / 1000);
  payload += "}";

  http.POST(payload);
  http.end();
}

void sendPulseToDaemon(int pulses) {
  if (WiFi.status() != WL_CONNECTED) return;

  HTTPClient http;
  String url = daemonHost + "/api/coinslots/pulse";
  http.begin(url);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("X-Slot-Secret", satelliteSecret);
  http.addHeader("Authorization", "Bearer " + satelliteSecret);

  String payload = "{";
  payload += "\"slotId\":\"" + slotId + "\",";
  payload += "\"pulses\":" + String(pulses);
  payload += "}";

  int code = http.POST(payload);
  Serial.printf("[DAEMON] ⚡ Sent %d pulse(s) -> HTTP %d\n", pulses, code);
  http.end();
}

// ------------------------------------------------------------------------------
// LOCAL REST SERVER HANDLERS & SECURITY
// ------------------------------------------------------------------------------
bool isAuthorized() {
  if (satelliteSecret.length() == 0) return true;
  if (server.hasHeader("X-Slot-Secret") && server.header("X-Slot-Secret") == satelliteSecret) {
    return true;
  }
  if (server.hasHeader("Authorization")) {
    String auth = server.header("Authorization");
    if (auth == "Bearer " + satelliteSecret) return true;
  }
  if (server.hasArg("secret") && server.arg("secret") == satelliteSecret) {
    return true;
  }
  return false;
}

void handleEnable() {
  if (!isAuthorized()) {
    server.send(401, "application/json", "{\"error\":\"UNAUTHORIZED\",\"message\":\"Invalid satellite secret\"}");
    Serial.println("[SECURITY] ⛔ Unauthorized /enable attempt blocked!");
    return;
  }

  int timeoutSec = 90;
  if (server.hasArg("timeout")) {
    timeoutSec = server.arg("timeout").toInt();
    if (timeoutSec <= 0) timeoutSec = 90;
  }

  setInhibitState(true);
  unlockExpiryTime = millis() + (timeoutSec * 1000UL);
  sessionPulses = 0;

  renderDisplay("INSERT COIN", "Time: " + String(timeoutSec) + "s", "Drop 1/5/10/20");

  server.send(200, "application/json", "{\"status\":\"unlocked\",\"timeout\":" + String(timeoutSec) + "}");
  Serial.printf("[SLOT] 🔓 Coin slot UNLOCKED for %ds\n", timeoutSec);
}

void handleDisable() {
  if (!isAuthorized()) {
    server.send(401, "application/json", "{\"error\":\"UNAUTHORIZED\",\"message\":\"Invalid satellite secret\"}");
    Serial.println("[SECURITY] ⛔ Unauthorized /disable attempt blocked!");
    return;
  }

  setInhibitState(false);
  unlockExpiryTime = 0;
  renderDisplay("READY", "IP: " + WiFi.localIP().toString(), "OpenPisoWiFi");
  server.send(200, "application/json", "{\"status\":\"locked\"}");
  Serial.println("[SLOT] 🔒 Coin slot LOCKED");
}

void handleStatus() {
  if (!isAuthorized()) {
    server.send(401, "application/json", "{\"error\":\"UNAUTHORIZED\",\"message\":\"Invalid satellite secret\"}");
    return;
  }

  String json = "{";
  json += "\"slotId\":\"" + slotId + "\",";
  json += "\"name\":\"" + slotName + "\",";
  json += "\"unlocked\":" + String(isSlotUnlocked ? "true" : "false") + ",";
  json += "\"sessionPulses\":" + String(sessionPulses) + ",";
  json += "\"ip\":\"" + WiFi.localIP().toString() + "\",";
  json += "\"rssi\":" + String(WiFi.RSSI()) + ",";
  json += "\"uptime\":" + String(millis() / 1000);
  json += "}";
  server.send(200, "application/json", json);
}

// ------------------------------------------------------------------------------
// SERIAL COMMAND PROCESSOR (NVS Flash Configuration & Live Control)
// ------------------------------------------------------------------------------
void processSerialCommands() {
  while (Serial.available()) {
    String line = Serial.readStringUntil('\n');
    line.trim();
    if (line.length() == 0) continue;

    if (line.equalsIgnoreCase("GET_CONFIG") || line.equalsIgnoreCase("CONFIG?")) {
      printConfigJson();
    }
    else if (line.startsWith("CONFIG:") || line.startsWith("SET_CONFIG:")) {
      String payload = line.substring(line.indexOf(':') + 1);
      String nSlotId = slotId;
      String nSlotName = slotName;
      String nSecret = satelliteSecret;
      String nDaemon = daemonHost;
      String nSsid = wifiSsid;
      String nPass = wifiPass;

      int start = 0;
      while (start < payload.length()) {
        int end = payload.indexOf(';', start);
        if (end == -1) end = payload.length();
        String token = payload.substring(start, end);
        int eq = token.indexOf('=');
        if (eq > 0) {
          String key = token.substring(0, eq);
          String val = token.substring(eq + 1);
          key.trim();
          val.trim();
          if (key.equalsIgnoreCase("slot_id")) nSlotId = val;
          else if (key.equalsIgnoreCase("slot_name")) nSlotName = val;
          else if (key.equalsIgnoreCase("secret")) nSecret = val;
          else if (key.equalsIgnoreCase("daemon")) nDaemon = val;
          else if (key.equalsIgnoreCase("ssid")) nSsid = val;
          else if (key.equalsIgnoreCase("pass")) nPass = val;
        }
        start = end + 1;
      }

      savePreferences(nSlotId, nSlotName, nSecret, nDaemon, nSsid, nPass);
      slotId = nSlotId;
      slotName = nSlotName;
      satelliteSecret = nSecret;
      daemonHost = nDaemon;
      wifiSsid = nSsid;
      wifiPass = nPass;

      Serial.println("[CONFIG_OK] ✅ Configuration saved to NVS flash memory! Restarting in 1s...");
      printConfigJson();
      delay(1000);
      ESP.restart();
    }
    else if (line.equalsIgnoreCase("RESET_CONFIG")) {
      prefs.begin("openpiso", false);
      prefs.clear();
      prefs.end();
      Serial.println("[CONFIG_RESET] ⚠️ NVS flash erased. Restarting with factory defaults...");
      delay(500);
      ESP.restart();
    }
    else if (line.equalsIgnoreCase("STATUS")) {
      Serial.printf("[STATUS] Slot: %s (\"%s\") | IP: %s | RSSI: %d dBm | Unlocked: %s | Pulses: %d\n",
        slotId.c_str(), slotName.c_str(), WiFi.localIP().toString().c_str(), WiFi.RSSI(), isSlotUnlocked ? "YES" : "NO", sessionPulses);
    }
    else if (line.equalsIgnoreCase("RESET") || line.equalsIgnoreCase("REBOOT")) {
      Serial.println("[SYSTEM] Rebooting ESP32...");
      delay(200);
      ESP.restart();
    }
    else if (line.equalsIgnoreCase("TEST_COIN")) {
      portENTER_CRITICAL(&isrMux);
      volatilePulseCount++;
      lastPulseTime = millis();
      portEXIT_CRITICAL(&isrMux);
      Serial.println("[DEBUG] Simulated +1 coin pulse via serial command");
    }
  }
}

// ------------------------------------------------------------------------------
// SETUP
// ------------------------------------------------------------------------------
void setup() {
  Serial.begin(115200);
  Serial.println("\n==========================================");
  Serial.println("🪙 OpenPisoWiFi ESP32 Satellite Coinslot");
  Serial.println("==========================================");

  // Load custom parameters from NVS Flash
  loadPreferences();
  Serial.printf("[INIT] Slot ID: '%s' | Name: '%s'\n", slotId.c_str(), slotName.c_str());
  Serial.printf("[INIT] Daemon Host: '%s' | Wi-Fi: '%s'\n", daemonHost.c_str(), wifiSsid.c_str());
  printConfigJson();

  pinMode(PIN_INHIBIT, OUTPUT);
  pinMode(PIN_STATUS_LED, OUTPUT);
  pinMode(PIN_BUTTON, INPUT_PULLUP);
  pinMode(PIN_COIN, INPUT_PULLUP);

  // Lock coin slot on initial boot
  setInhibitState(false);

  detectDisplays();
  renderDisplay("BOOTING...", "Connecting Wi-Fi");

  // Wi-Fi Connection
  Serial.printf("[WIFI] Connecting to '%s'...\n", wifiSsid.c_str());
  WiFi.mode(WIFI_STA);
  WiFi.begin(wifiSsid.c_str(), wifiPass.c_str());

  int tries = 0;
  while (WiFi.status() != WL_CONNECTED && tries < 30) {
    delay(500);
    Serial.print(".");
    tries++;
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.printf("\n[WIFI] Connected! IP: %s (RSSI: %d dBm)\n",
                  WiFi.localIP().toString().c_str(), WiFi.RSSI());
    renderDisplay("CONNECTED", "IP: " + WiFi.localIP().toString(), "Slot: " + slotId);
    registerWithDaemon();
  } else {
    Serial.println("\n[WIFI] ❌ Wi-Fi Connection failed. Retrying in loop...");
    renderDisplay("OFFLINE", "Check Wi-Fi");
  }

  // Collect security headers for incoming HTTP requests
  const char* headerKeys[] = {"X-Slot-Secret", "Authorization"};
  server.collectHeaders(headerKeys, 2);

  // REST endpoints
  server.on("/enable", HTTP_POST, handleEnable);
  server.on("/disable", HTTP_POST, handleDisable);
  server.on("/status", HTTP_GET, handleStatus);
  server.begin();

  // Attach coin pulse interrupt
  attachInterrupt(digitalPinToInterrupt(PIN_COIN), handleCoinInterrupt, FALLING);
  Serial.println("[INIT] ✅ Hardware interrupt active on GPIO 4 (FALLING)");
}

// ------------------------------------------------------------------------------
// MAIN LOOP
// ------------------------------------------------------------------------------
void loop() {
  // Listen for WebSerial / USB configuration commands
  processSerialCommands();

  server.handleClient();
  unsigned long now = millis();

  // 1. Maintain Wi-Fi
  if (WiFi.status() != WL_CONNECTED) {
    static unsigned long lastReconnect = 0;
    if (now - lastReconnect > 5000) {
      lastReconnect = now;
      WiFi.reconnect();
    }
  }

  // 2. Process Coin Pulses from ISR
  int pulsesToProcess = 0;
  portENTER_CRITICAL(&isrMux);
  if (volatilePulseCount > 0 && (now - lastPulseTime >= TRAIN_SETTLE_MS)) {
    pulsesToProcess = volatilePulseCount;
    volatilePulseCount = 0;
  }
  portEXIT_CRITICAL(&isrMux);

  if (pulsesToProcess > 0) {
    sessionPulses += pulsesToProcess;
    Serial.printf("[COIN] 🪙 %d pulse(s) detected! Session Total: ₱%d\n", pulsesToProcess, sessionPulses);

    // Keep slot alive on active coin drops (add 30s)
    unlockExpiryTime = max(unlockExpiryTime, now + 30000UL);

    renderDisplay("₱" + String(sessionPulses) + ".00", "Coins Added!", "Slot: " + slotId);
    sendPulseToDaemon(pulsesToProcess);
  }

  // 3. Inhibit Auto-Lock Timeout
  if (isSlotUnlocked) {
    if (now >= unlockExpiryTime) {
      Serial.println("[SLOT] ⏱️ Inhibit timeout reached. Locking slot.");
      setInhibitState(false);
      renderDisplay("READY", "IP: " + WiFi.localIP().toString(), "OpenPisoWiFi");
    } else {
      // Countdown display update every second
      static unsigned long lastSec = 0;
      if (now - lastSec >= 1000) {
        lastSec = now;
        int remSec = (unlockExpiryTime - now) / 1000;
        if (sessionPulses > 0) {
          renderDisplay("₱" + String(sessionPulses) + ".00", "Time Left: " + String(remSec) + "s");
        } else {
          renderDisplay("INSERT COIN", "Time Left: " + String(remSec) + "s");
        }
      }
    }
  }

  // 4. Physical Push Button Handler (Insert Coin trigger)
  if (digitalRead(PIN_BUTTON) == LOW) {
    if (now - lastButtonPressTime > 1000) { // 1s debounce
      lastButtonPressTime = now;
      Serial.println("[BUTTON] 🕹️ Physical button pressed!");
      if (!isSlotUnlocked) {
        handleEnable();
      }
    }
  }

  // 5. Periodic Heartbeat to Daemon
  if (now - lastHeartbeatTime >= HEARTBEAT_INTERVAL) {
    lastHeartbeatTime = now;
    sendHeartbeat();
  }
}

/*
 * ==============================================================================
 * 🪙 OpenPisoWiFi - ESP32 Wireless Satellite Multi-Coinslot Firmware
 * ==============================================================================
 * Description:
 *   Autonomous Wi-Fi satellite controller for multi-coinslot kiosks.
 *   - Auto-connects to OpenPisoWiFi router (tested on Ruijie RG-EW1200G Pro, or any OpenWrt AP).
 *   - Auto-registers with OpenPisoWiFi Daemon at http://10.0.0.1:4000.
 *   - Persistent NVS Flash Configuration & offline pulse queue ('pending_pulses') via Preferences.
 *   - Live WebSerial USB configuration via browser flasher (CONFIG:slot_id=...;secret=...).
 *   - HMAC-SHA256 request signing (<mbedtls/md.h>) with server-synced timestamp & nonce replay defense.
 *   - Pulse-width anti-tamper validation (12ms-400ms via CHANGE interrupt) & stuck-LOW detection.
 *   - Inhibit relay/gate control (locked on boot; unlocks on portal or physical button).
 *   - Hardware watchdog (esp_task_wdt) & rollover-safe millis() timing.
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
#include <mbedtls/md.h>
#include <esp_system.h>
#include <esp_task_wdt.h>
#include <esp_idf_version.h>

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

// Debounce, Anti-Tamper & Timing constants
#define DEBOUNCE_MIN_MS       25
#define PULSE_WIDTH_MIN_MS    12
#define PULSE_WIDTH_MAX_MS    400
#define TRAIN_SETTLE_MS       350
#define HEARTBEAT_INTERVAL    10000
#define PULSE_RETRY_INTERVAL  5000
#define TAMPER_ALERT_COOLDOWN 10000
#define HTTP_TIMEOUT_MS       3000
#define WDT_TIMEOUT_SEC       20

// ------------------------------------------------------------------------------
// HARDWARE OBJECTS & VOLATILE STATE
// ------------------------------------------------------------------------------
WebServer server(80);
LiquidCrystal_I2C lcd(0x27, 16, 2);
Adafruit_SSD1306 oled(128, 64, &Wire, -1);

bool hasLcd = false;
bool hasOled = false;

volatile unsigned long lastPulseTime = 0;
volatile unsigned long pulseFallTime = 0;
volatile bool pulseInProgress = false;
volatile bool stuckLowReported = false;
volatile int volatilePulseCount = 0;
volatile bool isSlotUnlocked = false;

volatile bool tamperWhileLocked = false;
volatile bool tamperShortSpike = false;
volatile bool tamperLongPulse = false;
volatile unsigned long tamperWidthMs = 0;

portMUX_TYPE isrMux = portMUX_INITIALIZER_UNLOCKED;

unsigned long unlockExpiryTime = 0;
int sessionPulses = 0;
int pendingOfflinePulses = 0;
unsigned long lastHeartbeatTime = 0;
unsigned long lastPulseRetryTime = 0;
unsigned long lastButtonPressTime = 0;
unsigned long lastTamperAlertTime = 0;

// Server epoch synchronization for HMAC-SHA256 replay protection
bool daemonRegistered = false;
bool hasServerTime = false;
unsigned long long serverUnixBaseSec = 0;
unsigned long serverSyncMillis = 0;

// ------------------------------------------------------------------------------
// NVS PREFERENCES HELPERS
// ------------------------------------------------------------------------------
void loadPreferences() {
  prefs.begin("openpiso", false);
  wifiSsid             = prefs.getString("ssid", wifiSsid);
  wifiPass             = prefs.getString("pass", wifiPass);
  daemonHost           = prefs.getString("daemon", daemonHost);
  satelliteSecret      = prefs.getString("secret", satelliteSecret);
  slotId               = prefs.getString("slot_id", slotId);
  slotName             = prefs.getString("slot_name", slotName);
  pendingOfflinePulses = prefs.getInt("pending_pulses", 0);
  if (pendingOfflinePulses < 0) pendingOfflinePulses = 0;
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

void savePendingPulses(int count) {
  if (count < 0) count = 0;
  prefs.begin("openpiso", false);
  prefs.putInt("pending_pulses", count);
  prefs.end();
}

void printConfigJson() {
  Serial.printf("[CONFIG_JSON] {\"slot_id\":\"%s\",\"slot_name\":\"%s\",\"secret\":\"%s\",\"daemon\":\"%s\",\"ssid\":\"%s\",\"pass\":\"%s\",\"pending_pulses\":%d}\n",
    slotId.c_str(), slotName.c_str(), satelliteSecret.c_str(), daemonHost.c_str(), wifiSsid.c_str(), wifiPass.c_str(), pendingOfflinePulses);
}

// ------------------------------------------------------------------------------
// SECURITY & TIME SYNC HELPERS (HMAC-SHA256)
// ------------------------------------------------------------------------------
bool constantTimeEquals(const String& a, const String& b) {
  if (a.length() != b.length()) return false;
  uint8_t diff = 0;
  for (size_t i = 0; i < a.length(); i++) {
    diff |= (uint8_t)a[i] ^ (uint8_t)b[i];
  }
  return diff == 0;
}

String computeHmacSha256(const String& key, const String& message) {
  uint8_t hmacResult[32];
  mbedtls_md_context_t ctx;
  mbedtls_md_init(&ctx);
  if (mbedtls_md_setup(&ctx, mbedtls_md_info_from_type(MBEDTLS_MD_SHA256), 1) != 0) {
    mbedtls_md_free(&ctx);
    return "";
  }
  mbedtls_md_hmac_starts(&ctx, (const unsigned char*)key.c_str(), key.length());
  mbedtls_md_hmac_update(&ctx, (const unsigned char*)message.c_str(), message.length());
  mbedtls_md_hmac_finish(&ctx, hmacResult);
  mbedtls_md_free(&ctx);

  char hexOut[65];
  for (int i = 0; i < 32; i++) {
    sprintf(hexOut + (i * 2), "%02x", hmacResult[i]);
  }
  hexOut[64] = '\0';
  return String(hexOut);
}

int monthFromAbbr(const char* mon) {
  if (strncmp(mon, "Jan", 3) == 0) return 1;
  if (strncmp(mon, "Feb", 3) == 0) return 2;
  if (strncmp(mon, "Mar", 3) == 0) return 3;
  if (strncmp(mon, "Apr", 3) == 0) return 4;
  if (strncmp(mon, "May", 3) == 0) return 5;
  if (strncmp(mon, "Jun", 3) == 0) return 6;
  if (strncmp(mon, "Jul", 3) == 0) return 7;
  if (strncmp(mon, "Aug", 3) == 0) return 8;
  if (strncmp(mon, "Sep", 3) == 0) return 9;
  if (strncmp(mon, "Oct", 3) == 0) return 10;
  if (strncmp(mon, "Nov", 3) == 0) return 11;
  if (strncmp(mon, "Dec", 3) == 0) return 12;
  return 0;
}

unsigned long long parseHttpDateToEpoch(const String& dateStr) {
  // Format: "Thu, 20 Nov 2026 12:25:21 GMT"
  if (dateStr.length() < 25) return 0ULL;
  int day = 0, year = 0, hour = 0, minute = 0, second = 0;
  char monStr[8] = {0};
  int commaIdx = dateStr.indexOf(',');
  const char* p = (commaIdx >= 0) ? dateStr.c_str() + commaIdx + 1 : dateStr.c_str();
  if (sscanf(p, " %d %3s %d %d:%d:%d", &day, monStr, &year, &hour, &minute, &second) != 6) {
    return 0ULL;
  }
  int month = monthFromAbbr(monStr);
  if (month == 0 || year < 2024) return 0ULL;

  // Civil-to-days algorithm (UTC)
  long y = year - (month <= 2 ? 1 : 0);
  long era = (y >= 0 ? y : y - 399) / 400;
  unsigned long yoe = (unsigned long)(y - era * 400);
  unsigned long doy = (153 * (month + (month > 2 ? -3 : 9)) + 2) / 5 + day - 1;
  unsigned long doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
  long long days = (long long)era * 146097LL + (long long)doe - 719468LL;
  if (days < 0) return 0ULL;

  return (unsigned long long)days * 86400ULL + (unsigned long long)hour * 3600ULL +
         (unsigned long long)minute * 60ULL + (unsigned long long)second;
}

void syncServerTimeFromResponse(HTTPClient& http, const String& respBody) {
  unsigned long long parsedSec = 0ULL;

  int idx = respBody.indexOf("\"serverTime\"");
  if (idx >= 0) {
    int colon = respBody.indexOf(':', idx);
    if (colon >= 0) {
      int pos = colon + 1;
      while (pos < (int)respBody.length() && (respBody[pos] == ' ' || respBody[pos] == '"')) pos++;
      unsigned long long rawVal = 0ULL;
      while (pos < (int)respBody.length() && isDigit(respBody[pos])) {
        rawVal = rawVal * 10ULL + (unsigned long long)(respBody[pos] - '0');
        pos++;
      }
      if (rawVal > 1000000000000ULL) rawVal /= 1000ULL;
      if (rawVal >= 1700000000ULL) parsedSec = rawVal;
    }
  }

  if (parsedSec == 0ULL && http.hasHeader("Date")) {
    unsigned long long hdrSec = parseHttpDateToEpoch(http.header("Date"));
    if (hdrSec >= 1700000000ULL) parsedSec = hdrSec;
  }

  if (parsedSec >= 1700000000ULL) {
    serverUnixBaseSec = parsedSec;
    serverSyncMillis = millis();
    hasServerTime = true;
  }
}

void attachAuthHeaders(HTTPClient& http, const String& payload) {
  const char* respHeaders[] = {"Date"};
  http.collectHeaders(respHeaders, 1);
  http.setTimeout(HTTP_TIMEOUT_MS);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("X-Slot-Secret", satelliteSecret);
  http.addHeader("Authorization", "Bearer " + satelliteSecret);

  if (hasServerTime && satelliteSecret.length() > 0) {
    unsigned long long nowSec = serverUnixBaseSec + (unsigned long long)((millis() - serverSyncMillis) / 1000UL);
    char tsBuf[24];
    snprintf(tsBuf, sizeof(tsBuf), "%llu", nowSec);
    char nonceBuf[20];
    snprintf(nonceBuf, sizeof(nonceBuf), "%08lx%08lx", (unsigned long)esp_random(), (unsigned long)esp_random());

    String sigInput = String(tsBuf) + ":" + String(nonceBuf) + ":" + payload;
    String sig = computeHmacSha256(satelliteSecret, sigInput);
    if (sig.length() == 64) {
      http.addHeader("X-Slot-Timestamp", tsBuf);
      http.addHeader("X-Slot-Nonce", nonceBuf);
      http.addHeader("X-Slot-Signature", sig);
    }
  }
}

// ------------------------------------------------------------------------------
// INTERRUPT SERVICE ROUTINE (ISR)
// ------------------------------------------------------------------------------
void IRAM_ATTR handleCoinInterrupt() {
  unsigned long now = millis();
  int level = digitalRead(PIN_COIN);

  portENTER_CRITICAL_ISR(&isrMux);
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

      if (!isSlotUnlocked) {
        tamperWhileLocked = true;
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
  portEXIT_CRITICAL_ISR(&isrMux);
}

// ------------------------------------------------------------------------------
// HARDWARE INHIBIT CONTROL
// ------------------------------------------------------------------------------
void setInhibitState(bool unlock) {
  portENTER_CRITICAL(&isrMux);
  isSlotUnlocked = unlock;
  if (!unlock) {
    volatilePulseCount = 0;
  }
  portEXIT_CRITICAL(&isrMux);

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
// SHARED SLOT UNLOCK HELPER (Used by /enable REST endpoint & Physical Button)
// ------------------------------------------------------------------------------
void unlockSlot(int timeoutSec) {
  if (timeoutSec <= 0) timeoutSec = 90;
  setInhibitState(true);
  unlockExpiryTime = millis() + ((unsigned long)timeoutSec * 1000UL);
  sessionPulses = 0;

  renderDisplay("INSERT COIN", "Time: " + String(timeoutSec) + "s", "Drop 1/5/10/20");
  Serial.printf("[SLOT] 🔓 Coin slot UNLOCKED for %ds\n", timeoutSec);
}

// ------------------------------------------------------------------------------
// DAEMON API CLIENT
// ------------------------------------------------------------------------------
bool registerWithDaemon() {
  if (WiFi.status() != WL_CONNECTED) return false;

  HTTPClient http;
  String url = daemonHost + "/api/coinslots/register";
  http.begin(url);

  String payload = "{";
  payload += "\"slotId\":\"" + slotId + "\",";
  payload += "\"name\":\"" + slotName + "\",";
  payload += "\"ip\":\"" + WiFi.localIP().toString() + "\",";
  payload += "\"mac\":\"" + WiFi.macAddress() + "\",";
  payload += "\"status\":\"" + String(isSlotUnlocked ? "unlocked" : "ready") + "\",";
  payload += "\"rssi\":" + String(WiFi.RSSI());
  payload += "}";

  attachAuthHeaders(http, payload);

  int code = http.POST(payload);
  String body = (code > 0) ? http.getString() : "";
  if (code >= 200 && code < 300) {
    daemonRegistered = true;
    syncServerTimeFromResponse(http, body);
    Serial.printf("[DAEMON] ✅ Registered to daemon (HTTP %d, timeSynced=%s)\n", code, hasServerTime ? "yes" : "no");
    http.end();
    return true;
  }

  Serial.printf("[DAEMON] ⚠️ Register failed (HTTP %d): %s\n", code, http.errorToString(code).c_str());
  http.end();
  return false;
}

void sendHeartbeat() {
  if (WiFi.status() != WL_CONNECTED) return;
  if (!daemonRegistered) {
    registerWithDaemon();
    return;
  }

  HTTPClient http;
  String url = daemonHost + "/api/coinslots/heartbeat";
  http.begin(url);

  String payload = "{";
  payload += "\"slotId\":\"" + slotId + "\",";
  payload += "\"status\":\"" + String(isSlotUnlocked ? "unlocked" : "ready") + "\",";
  payload += "\"rssi\":" + String(WiFi.RSSI()) + ",";
  payload += "\"uptime\":" + String(millis() / 1000);
  payload += "}";

  attachAuthHeaders(http, payload);

  int code = http.POST(payload);
  if (code >= 200 && code < 300) {
    syncServerTimeFromResponse(http, "");
  } else if (code == 404) {
    // Daemon restarted and cleared in-memory satellite registry — re-register
    daemonRegistered = false;
  }
  http.end();
}

bool sendPulseToDaemon(int pulses) {
  if (WiFi.status() != WL_CONNECTED || pulses <= 0) return false;

  HTTPClient http;
  String url = daemonHost + "/api/coinslots/pulse";
  http.begin(url);

  String payload = "{";
  payload += "\"slotId\":\"" + slotId + "\",";
  payload += "\"pulses\":" + String(pulses);
  payload += "}";

  attachAuthHeaders(http, payload);

  int code = http.POST(payload);
  String body = (code > 0) ? http.getString() : "";
  if (code >= 200 && code < 300) {
    syncServerTimeFromResponse(http, body);
    Serial.printf("[DAEMON] ⚡ Sent %d pulse(s) -> HTTP %d\n", pulses, code);
    http.end();
    return true;
  }

  Serial.printf("[DAEMON] ⚠️ Pulse POST failed (%d pulse(s)) -> HTTP %d (%s)\n",
    pulses, code, http.errorToString(code).c_str());
  http.end();
  return false;
}

void flushPendingPulses() {
  if (pendingOfflinePulses <= 0 || WiFi.status() != WL_CONNECTED) return;
  if (!daemonRegistered) {
    registerWithDaemon();
  }

  int batch = pendingOfflinePulses;
  if (sendPulseToDaemon(batch)) {
    pendingOfflinePulses -= batch;
    if (pendingOfflinePulses < 0) pendingOfflinePulses = 0;
    savePendingPulses(pendingOfflinePulses);
    Serial.printf("[QUEUE] ✅ Flushed %d queued pulse(s). Remaining NVS queue: %d\n", batch, pendingOfflinePulses);
  }
}

void sendTamperAlert(const char* reason, unsigned long widthMs) {
  unsigned long now = millis();
  if (now - lastTamperAlertTime < TAMPER_ALERT_COOLDOWN) return;
  lastTamperAlertTime = now;

  Serial.printf("[SECURITY] 🚨 Coin tamper detected: %s (width=%lu ms)\n", reason, widthMs);
  if (WiFi.status() != WL_CONNECTED) return;

  HTTPClient http;
  String url = daemonHost + "/api/shield/wids-event";
  http.begin(url);

  String msg = "Satellite '" + slotId + "' tamper: " + String(reason) + " (" + String(widthMs) + "ms)";
  String payload = "{";
  payload += "\"type\":\"coin_tamper\",";
  payload += "\"severity\":\"high\",";
  payload += "\"mac\":\"" + WiFi.macAddress() + "\",";
  payload += "\"message\":\"" + msg + "\"";
  payload += "}";

  attachAuthHeaders(http, payload);
  http.POST(payload);
  http.end();
}

// ------------------------------------------------------------------------------
// LOCAL REST SERVER HANDLERS & SECURITY
// ------------------------------------------------------------------------------
bool isAuthorized() {
  if (satelliteSecret.length() == 0) return false;
  if (server.hasHeader("X-Slot-Secret") && constantTimeEquals(server.header("X-Slot-Secret"), satelliteSecret)) {
    return true;
  }
  if (server.hasHeader("Authorization")) {
    String auth = server.header("Authorization");
    if (constantTimeEquals(auth, "Bearer " + satelliteSecret)) return true;
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

  unlockSlot(timeoutSec);
  server.send(200, "application/json", "{\"status\":\"unlocked\",\"timeout\":" + String(timeoutSec) + "}");
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
  json += "\"pendingOfflinePulses\":" + String(pendingOfflinePulses) + ",";
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
      while (start < (int)payload.length()) {
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
      Serial.printf("[STATUS] Slot: %s (\"%s\") | IP: %s | RSSI: %d dBm | Unlocked: %s | Pulses: %d | Queued: %d\n",
        slotId.c_str(), slotName.c_str(), WiFi.localIP().toString().c_str(), WiFi.RSSI(),
        isSlotUnlocked ? "YES" : "NO", sessionPulses, pendingOfflinePulses);
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

  // Load custom parameters & any offline queued pulses from NVS Flash
  loadPreferences();
  Serial.printf("[INIT] Slot ID: '%s' | Name: '%s' | Queued Pulses: %d\n",
    slotId.c_str(), slotName.c_str(), pendingOfflinePulses);
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
    if (pendingOfflinePulses > 0) {
      flushPendingPulses();
    }
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

  // Attach coin pulse CHANGE interrupt (12ms-400ms width validation)
  attachInterrupt(digitalPinToInterrupt(PIN_COIN), handleCoinInterrupt, CHANGE);
  Serial.println("[INIT] ✅ Hardware interrupt active on GPIO 4 (CHANGE, 12-400ms validation)");

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
}

// ------------------------------------------------------------------------------
// MAIN LOOP
// ------------------------------------------------------------------------------
void loop() {
  esp_task_wdt_reset();

  // Listen for WebSerial / USB configuration commands
  processSerialCommands();

  server.handleClient();
  unsigned long now = millis();

  // 1. Maintain Wi-Fi & Daemon registration
  if (WiFi.status() != WL_CONNECTED) {
    static unsigned long lastReconnect = 0;
    if (now - lastReconnect > 5000) {
      lastReconnect = now;
      daemonRegistered = false;
      WiFi.reconnect();
    }
  } else if (!daemonRegistered) {
    static unsigned long lastRegRetry = 0;
    if (now - lastRegRetry > 5000) {
      lastRegRetry = now;
      registerWithDaemon();
    }
  }

  // 2. Check Anti-Tamper ISR flags & Stuck-LOW condition
  bool flagLocked = false;
  bool flagShort = false;
  bool flagLong = false;
  bool flagStuck = false;
  unsigned long reportedWidth = 0;

  int pulsesToProcess = 0;
  portENTER_CRITICAL(&isrMux);
  if (tamperWhileLocked) {
    flagLocked = true;
    tamperWhileLocked = false;
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
    flagStuck = true;
    reportedWidth = now - pulseFallTime;
  }
  if (volatilePulseCount > 0 && (now - lastPulseTime >= TRAIN_SETTLE_MS)) {
    pulsesToProcess = volatilePulseCount;
    volatilePulseCount = 0;
  }
  portEXIT_CRITICAL(&isrMux);

  if (flagLocked) {
    sendTamperAlert("pulse_while_locked", reportedWidth);
  } else if (flagShort) {
    sendTamperAlert("short_spike", reportedWidth);
  } else if (flagLong) {
    sendTamperAlert("long_pulse", reportedWidth);
  } else if (flagStuck) {
    sendTamperAlert("stuck_low", reportedWidth);
  }

  // 3. Process Coin Pulses & Persist to NVS Offline Queue
  if (pulsesToProcess > 0) {
    sessionPulses += pulsesToProcess;
    Serial.printf("[COIN] 🪙 %d pulse(s) detected! Session Total: ₱%d\n", pulsesToProcess, sessionPulses);

    // Rollover-safe slot expiry extension (+30s on active coin drop)
    unsigned long candidateExpiry = now + 30000UL;
    if ((long)(candidateExpiry - unlockExpiryTime) > 0) {
      unlockExpiryTime = candidateExpiry;
    }

    renderDisplay("P" + String(sessionPulses) + ".00", "Coins Added!", "Slot: " + slotId);

    // Persist in NVS before POST so coins are never lost on Wi-Fi drop or reboot
    pendingOfflinePulses += pulsesToProcess;
    savePendingPulses(pendingOfflinePulses);
    flushPendingPulses();
  }

  // Retry queued offline pulses every 5s if previous POST failed
  if (pendingOfflinePulses > 0 && (now - lastPulseRetryTime >= PULSE_RETRY_INTERVAL)) {
    lastPulseRetryTime = now;
    flushPendingPulses();
  }

  // 4. Rollover-Safe Inhibit Auto-Lock Timeout
  if (isSlotUnlocked) {
    if ((long)(now - unlockExpiryTime) >= 0) {
      Serial.println("[SLOT] ⏱️ Inhibit timeout reached. Locking slot.");
      setInhibitState(false);
      renderDisplay("READY", "IP: " + WiFi.localIP().toString(), "OpenPisoWiFi");
    } else {
      static unsigned long lastSec = 0;
      if (now - lastSec >= 1000) {
        lastSec = now;
        long diff = (long)(unlockExpiryTime - now);
        int remSec = diff > 0 ? (int)((unsigned long)diff / 1000UL) : 0;
        if (sessionPulses > 0) {
          renderDisplay("P" + String(sessionPulses) + ".00", "Time Left: " + String(remSec) + "s");
        } else {
          renderDisplay("INSERT COIN", "Time Left: " + String(remSec) + "s");
        }
      }
    }
  }

  // 5. Physical Push Button Handler (calls unlockSlot directly — bypasses HTTP auth!)
  if (digitalRead(PIN_BUTTON) == LOW) {
    if (now - lastButtonPressTime > 1000) { // 1s debounce
      lastButtonPressTime = now;
      Serial.println("[BUTTON] 🕹️ Physical button pressed!");
      if (!isSlotUnlocked) {
        unlockSlot(90);
        sendHeartbeat();
      }
    }
  }

  // 6. Periodic Heartbeat to Daemon
  if (now - lastHeartbeatTime >= HEARTBEAT_INTERVAL) {
    lastHeartbeatTime = now;
    sendHeartbeat();
  }
}

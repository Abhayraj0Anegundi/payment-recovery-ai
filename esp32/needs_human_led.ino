/*
 * needs_human_led.ino
 *
 * ESP32 + single LED addon for the AI Revenue Recovery pipeline.
 * Polls GET /api/needs-human-count on the dashboard's Flask API and lights
 * an LED whenever count > 0 — i.e. whenever at least one transaction has
 * exhausted its 3 recovery attempts and needs a human.
 *
 * This is intentionally the simplest possible integration: no MQTT, no
 * websockets, just an HTTP GET on a timer. Treated as a nice-to-have per
 * the project brief — it does not touch the pipeline, the audit log, or
 * any write path. It only ever reads one already-existing endpoint.
 *
 * Wiring:
 *   LED anode   -> GPIO 2 (through a ~220ohm resistor)
 *   LED cathode -> GND
 *   (GPIO 2 is the ESP32 dev board's onboard LED on most boards — if yours
 *   has one, you don't need an external LED/resistor at all.)
 *
 * Setup:
 *   1. Arduino IDE -> Boards Manager -> install "esp32" (by Espressif).
 *   2. Select your board (e.g. "ESP32 Dev Module") and the right port.
 *   3. Fill in WIFI_SSID / WIFI_PASSWORD and API_HOST below.
 *   4. API_HOST must be this machine's LAN IP (not "localhost" -- the
 *      ESP32 is a separate device on the network). Find it with
 *      `ipconfig` (Windows) or `ifconfig`/`ip addr` (Mac/Linux).
 *   5. Start the API bound to all interfaces so the ESP32 can reach it:
 *        py -3 api.py --db recovery.db --host 0.0.0.0 --port 5001
 *   6. Upload this sketch, open Serial Monitor at 115200 baud to watch it
 *      connect and poll.
 */

#include <WiFi.h>
#include <HTTPClient.h>

// ---- fill these in ----
const char* WIFI_SSID     = "YOUR_WIFI_SSID";
const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";
const char* API_HOST      = "192.168.29.126";   // this machine's LAN IP
const int   API_PORT      = 5001;
// ------------------------

const int LED_PIN = 2;                    // onboard LED on most ESP32 dev boards
const unsigned long POLL_INTERVAL_MS = 5000;  // poll every 5s -- read-only, cheap

unsigned long lastPollAt = 0;

void setup() {
  Serial.begin(115200);
  pinMode(LED_PIN, OUTPUT);
  digitalWrite(LED_PIN, LOW);

  Serial.print("Connecting to WiFi");
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  while (WiFi.status() != WL_CONNECTED) {
    delay(400);
    Serial.print(".");
  }
  Serial.println();
  Serial.print("Connected. IP: ");
  Serial.println(WiFi.localIP());
}

void loop() {
  unsigned long now = millis();
  if (now - lastPollAt < POLL_INTERVAL_MS && lastPollAt != 0) {
    return;
  }
  lastPollAt = now;

  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("WiFi not connected, skipping poll");
    return;
  }

  HTTPClient http;
  String url = String("http://") + API_HOST + ":" + API_PORT + "/api/needs-human-count";
  http.begin(url);
  http.setTimeout(3000);

  int httpCode = http.GET();
  if (httpCode == 200) {
    String body = http.getString();
    // Response looks like: {"needs_human_count": 11}
    // No JSON library needed for one integer field -- just find the digits
    // after the colon. Good enough for a single-purpose read-only poll.
    int colonIndex = body.indexOf(':');
    int count = -1;
    if (colonIndex != -1) {
      String numPart = body.substring(colonIndex + 1);
      numPart.trim();
      numPart.replace("}", "");
      count = numPart.toInt();
    }

    Serial.print("needs_human_count = ");
    Serial.println(count);

    digitalWrite(LED_PIN, count > 0 ? HIGH : LOW);
  } else {
    Serial.print("HTTP GET failed, code: ");
    Serial.println(httpCode);
    // Leave the LED in its last known state rather than guessing on a
    // failed poll -- a network blip shouldn't flip the signal.
  }

  http.end();
}

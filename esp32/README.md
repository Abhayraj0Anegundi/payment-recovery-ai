# ESP32 Needs-Human LED (optional)

A single LED that lights up whenever at least one transaction in the pipeline has
exhausted its 3 recovery attempts and needs a human. Purely a read-only demo addon —
it polls an existing endpoint and never touches the pipeline, database, or audit log.

## How it works

`GET /api/needs-human-count` (already part of `backend/api.py`) returns:

```json
{"needs_human_count": 11}
```

The ESP32 polls this every 5 seconds and drives GPIO 2 (the onboard LED on most ESP32
dev boards) HIGH when the count is `> 0`, LOW otherwise.

## Wiring

Most ESP32 dev boards have a built-in LED on GPIO 2 — nothing to wire. If yours doesn't,
or you want an external one for visibility:

```
GPIO 2 --[220ohm resistor]--> LED anode (+)
LED cathode (-) --> GND
```

## Setup

1. **Arduino IDE**: Boards Manager → install "esp32" (by Espressif Systems).
2. Select your board (e.g. "ESP32 Dev Module") and the correct serial port.
3. Open `needs_human_led.ino` and fill in:
   - `WIFI_SSID` / `WIFI_PASSWORD` — your network.
   - `API_HOST` — **this machine's LAN IP**, not `localhost` (the ESP32 is a separate
     device on the network and can't resolve `localhost` to your computer). Find it with:
     - Windows: `ipconfig` → look for "IPv4 Address"
     - Mac/Linux: `ifconfig` or `ip addr`
4. Start the dashboard API bound to all network interfaces, not just `127.0.0.1`, so
   the ESP32 can actually reach it:
   ```bash
   cd backend
   py -3 api.py --db recovery.db --host 0.0.0.0 --port 5001
   ```
5. Upload the sketch. Open Serial Monitor at 115200 baud — you'll see it connect to
   WiFi, print its IP, and then log `needs_human_count = N` every poll.

## Demo

With `recovery.db` (the full 90-transaction batch), `needs_human_count` is 11, so the
LED lights immediately after boot. To see it turn off, point `--db` at a database with
zero `needs_human` transactions, or watch it flip live by re-running the pipeline
against a fresh seed while the ESP32 is polling.

## Why it's this simple

No MQTT broker, no websockets, no JSON library — just an HTTP GET on a timer and a
substring parse of a one-field response. The brief treats this as a nice-to-have that
shouldn't block the core pipeline, so the implementation matches that: minimal, robust
to a dropped WiFi connection (the LED holds its last state rather than flipping on a
failed poll), and entirely decoupled from everything else in the repo.

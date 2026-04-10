# Display Bench Reference

Compiled from session transcripts (2026-04-07 to 2026-04-10).

---

## Network Topology

| Host | IP | SSH | Role |
|---|---|---|---|
| **rpi-displays** (Pi Zero 2W) | 192.168.1.234 | pi / sjahse98 | Camera, solenoid hub, USB hub, serial access to boards |
| **Pi 5** | 192.168.1.210 | pi / sjahse98 | ProtoMQ broker, web UI |
| **Tachyon** (QCM6490) | local | — | OpenClaw agent host, repo checkout at `/tmp/protomq` |

WiFi network: `free4all` / `password`

---

## Camera: Arducam 16MP IMX519 Autofocus

- **Location:** rpi-displays (Pi Zero 2W), connected via CSI
- **Sensor:** Sony IMX519, 16MP
- **dtoverlay:** `imx519` (in `/boot/firmware/config.txt`)
- **Resolutions:** 1280×720@80fps, 1920×1080@30fps, 2328×1748@30fps, 4656×3496@9fps
- **Software:** picamera2 0.3.34, libcamera v0.7.0+rpt20260205, OpenCV 4.10
- **Pipeline:** vc4 (NOT pisp — that's Pi 4/5 only)
- **Video device:** `/dev/video0` (unicam driver)

### Autofocus Status

The stock Raspberry Pi OS tuning file for the IMX519 (`/usr/share/libcamera/ipa/rpi/vc4/imx519.json`) is **missing the `rpi.af` section**, so AF via libcamera controls fails with "Could not set AF_TRIGGER - no AF algorithm or not Auto".

**Fix applied:** Replaced the tuning file with Arducam's version from their GitHub fork (which includes the AF algorithm config). Backup at `imx519.json.bak`.

```bash
sudo cp /usr/share/libcamera/ipa/rpi/vc4/imx519.json /usr/share/libcamera/ipa/rpi/vc4/imx519.json.bak
sudo wget -O /usr/share/libcamera/ipa/rpi/vc4/imx519.json \
  https://raw.githubusercontent.com/ArduCAM/libcamera/arducam/src/ipa/rpi/vc4/data/imx519.json
```

### Fixed Focus Fallback (for bench at ~30–50 cm)

| Method | Value | Notes |
|---|---|---|
| libcamera `LensPosition` | 2.0–3.3 dioptres | Sweet spot ~2.5 for 40 cm |
| v4l2-ctl `focus_absolute` | 546–900 | Sweet spot ~680 for 40 cm |
| rpicam-still | `--lens-position 2.0` | Used for full-res bench photos (4656×3496) |

### Capture Methods

- **picamera2 (Python):** Works. `tools/video_capture.py` uses `cv2.VideoCapture(0)` — confirmed working on rpi-displays.
- **rpicam-still:** `rpicam-still --lens-position 2.0 -o photo.jpg` for stills.
- **rpicam-vid:** Available for video.
- **OpenCV raw V4L2:** Needs time to initialise; don't assume failure from a quick one-frame grab.

### Research Report

Full AF research written to workspace: `cat-tracker/research/imx519-af-pi-zero2w.md`
(Source: session a3ad0df8, 2026-04-07)

---

## USB Hub & Board Connections (on rpi-displays)

Dual-cascaded Genesys Logic hub (05e3:0610).

### Known USB Device Assignments

| /dev | USB Port | USB ID | Board |
|---|---|---|---|
| ttyACM0 | — | — | QT Py ESP32-S3 |
| ttyACM1 | — | — | Feather ESP32-S3 TFT |
| ttyACM2 | 1-1.3 | 239a:80df | **Metro ESP32-S2** (target board) |

The Metro also exposes a USB Mass Storage device (label: `WIPPER`) for firmware secrets at `/dev/sdb` or `/dev/sdc` (check `lsblk -o NAME,LABEL`).

### All 13 Boards on Bench

Each board has a unique QR code label (adafru.it short URL). Bounding box ROIs are in `tools/board_calibration.json`.

| QR URL | Product |
|---|---|
| https://adafru.it/398 | RGB backlight positive LCD 16×2 |
| https://adafru.it/1028 | 2.9" Red/Black/White eInk Display Breakout |
| https://adafru.it/2900 | FeatherWing OLED 128×32 |
| https://adafru.it/3129 | 0.54" Quad Alphanumeric FeatherWing (Green) |
| https://adafru.it/4116 | PyPortal |
| https://adafru.it/4313 | 1.3" 240×240 TFT LCD (ST7789) |
| https://adafru.it/4440 | Monochrome 0.91" 128×32 I2C OLED (STEMMA QT) |
| https://adafru.it/4650 | FeatherWing OLED 128×64 (STEMMA QT) |
| https://adafru.it/4777 | 2.9" Grayscale eInk FeatherWing |
| https://adafru.it/4868 | 1.54" Tri-Color eInk 200×200 (SSD1681 + EYESPI) |
| https://adafru.it/5300 | ESP32-S2 TFT Feather |
| https://adafru.it/5483 | ESP32-S3 TFT Feather |
| https://adafru.it/5691 | ESP32-S3 Reverse TFT Feather |

---

## Solenoid Hub (USB Power Control)

- **Controller:** MCP23017 I2C GPIO expander at address `0x20`
- **Location:** rpi-displays (Pi Zero 2W, 192.168.1.234)
- **Driver:** Adafruit 8-channel solenoid driver board
- **Software:** `tools/solenoid_hub_control.py` using `board`, `busio`, `adafruit_mcp230xx` (Blinka/CircuitPython libs)
- **I2C setup:** Required `sudo raspi-config nonint do_i2c 0` to enable I2C on the Pi Zero 2W
- **Channels:** 0–7 (active high → solenoid energised → USB port power toggled)

### Channel Mapping

| Channel | Board | Notes |
|---|---|---|
| ch6 | Metro ESP32-S2 | Confirmed (session 5f53c087) |
| ch0–5, ch7 | Unknown | Not yet mapped — need to toggle and observe `dmesg` |

### Power Cycle Sequences

The Metro ESP32-S2 uses a specific pulse pattern via solenoid ch6:

**Power OFF:** `200ms ON → 500ms OFF → 1000ms ON → OFF`
**Power ON:** `200ms ON → 500ms OFF → 200ms ON → OFF`

---

## ProtoMQ Broker

- **Host:** Pi 5 at 192.168.1.210
- **MQTT port:** 1884
- **Web UI port:** 5173
- **Install path on Pi 5:** `/home/pi/dev/python/Adafruit_Wippersnapper_Python/tools/protomq/`
- **Local repo (Tachyon):** `/tmp/protomq` — branch `feat/runner-api-v1-routing`
- **Remote:** `tyeth-ai-assisted/protomq` (GitHub)

### Key APIs

| Endpoint | Method | Description |
|---|---|---|
| `/api/scripts` | GET | List loaded play scripts |
| `/api/scripts/:name/activate` | POST | Activate a play script |
| `/api/scripts/deactivate` | POST | Deactivate current script |
| `/api/scripts/:name/reset` | POST | Reset script execution state |
| `/api/runner/run` | POST | Trigger a runner test |
| `/api/runner/status` | GET | Current run status |
| `/api/runner/runs` | GET | List completed runs |

### Play Scripts

| Script | Proto Version | Target | Description |
|---|---|---|---|
| `metro-s2-charlcd-demo` | v2 | Metro ESP32-S2 + LCD 16×2 | CharLCD display test via V2 envelope |
| `metro-s2-charlcd-v1-demo` | v1 | Metro ESP32-S2 + LCD 16×2 | V1 flat-field variant with `checkinRequest` trigger |
| `metro-s2-oled-v1-demo` | v1 | Metro ESP32-S2 + OLED 0.91" | V1 OLED display test |

---

## Metro ESP32-S2 Configuration

- **USB ID:** 239a:80df
- **Firmware:** WipperSnapper 1.0.0-beta.124
- **Protocol:** V1 (flat message keys: `checkinRequest`, `checkinResponse`, etc.)
- **MQTT Client ID:** `io-wipper-metroesp32s2114186218`
- **MQTT Topics (V1):** `{user}/wprsnpr/{deviceid}/signals/broker/{component}` (checkin, display, digitalio, etc.)

### secrets.json (on WIPPER mass storage)

```json
{
  "io_username": "test_user",
  "io_key": "test_key",
  "io_url": "192.168.1.210",
  "io_port": 1884,
  "network_type_wifi": {
    "network_ssid": "free4all",
    "network_password": "password"
  },
  "status_pixel_brightness": 0.08
}
```

### Known Issues

1. **Keepalive timeout:** Metro connects, subscribes to topics, sends checkin, but disconnects before completing registration. ProtoMQ log shows `keepalive timeout`. Root cause: V1 checkin response timing — the script runner or fallback autoresponder may not respond fast enough.
2. **Registration polling:** Serial output shows "Polling for registration message response...2" — Metro expects a registration ack that may differ from the checkin response ProtoMQ sends.
3. **USB disconnect/reconnect cycles:** The Metro boot-loops when it can't complete registration, causing repeated USB disconnect events in `dmesg`.

---

## Protobuf Architecture

### V1 vs V2 Protocol

| | V1 (Metro ESP32-S2 firmware) | V2 (newer firmware) |
|---|---|---|
| **Topic pattern** | `{user}/wprsnpr/{deviceid}/signals/{direction}/{component}` | `{user}/ws-d2b/{deviceid}` / `{user}/ws-b2d/{deviceid}` |
| **Message format** | Flat: `checkinRequest`, `checkinResponse`, `displayAdd` | Nested: `{ checkin: { request: {...} } }`, `{ display: { add: {...} } }` |
| **Bundle namespace** | `wippersnapper.signal.BrokerToDevice` (flat fields) | `wippersnapper.signal.v1.*` (separate types per component) |

### Proto Bundle Status

- **Pi 5 bundle** (`protobufs/bundle.json`): Old V1-style with flat `signal.BrokerToDevice` — **no display fields**.
- **Local V2 bundle** (`protobufs-v1/bundle.json`): Has `wippersnapper.signal.v1.DisplayRequest` etc. but uses different namespace.
- **Custom V2 bundle** was built during session `5f53c087` that adds display (including CharLCD) fields to `BrokerToDevice` via a modified `signal.proto`. This was deployed to Pi 5 for testing.

### V1 Topic Routing Fix (commit b25fd7e)

The `ScriptExecutor` in `broker/script_runner.js` originally stored a single `_b2dTopic` from the first incoming message. For V1, each component needs its own topic suffix (e.g., `.../signals/broker/display` vs `.../signals/broker/checkin`).

**Fix:** Added `_v1TopicBase` tracking + `_getPublishTopic(step)` — if a step has a `topic` field and we're on V1, it constructs `{base}/{step.topic}` instead of using the single stored topic.

---

## Test Infrastructure (branch: video-qr-pytest-capture)

| File | Purpose |
|---|---|
| `conftest.py` | Pytest fixtures: `video_capture`, `board_roi`, `distinct_frames` |
| `runner_config.py` | Board capability config, revision matching, feature flags |
| `tools/video_capture.py` | OpenCV VideoRecorder (background thread capture) |
| `tools/solenoid_hub_control.py` | MCP23017 solenoid driver for USB power toggling |
| `tools/board_calibration.json` | Per-board bounding box ROIs (from annotated reference image) |
| `tools/qr_locator.py` | QR code detection + GrabCut segmentation for board ROIs |
| `tools/frame_extractor.py` | Extract visually-distinct frames from recorded video |
| `tools/display_comparator.py` | HTML report generation |
| `tools/board_monitor.py` | Per-board ROI crops from live camera/video |
| `tools/calibration_data.py` | QR centre positions, scale pairs, coordinate transforms |
| `hil_exceptions.py` | Structured HIL failure types (TargetFailure, RigFailure, InfraFailure) |
| `runner.json.example` | Example runner config with all 13 boards |
| `docs/test_session_plan.md` | Architecture plan for visual event detection + serial/MQTT correlation |

### Pytest Markers

- `@pytest.mark.board("https://adafru.it/398")` — associate test with board by QR URL
- `@pytest.mark.requires_feature("camera")` — skip if runner lacks feature

### GitHub Repos

- `tyeth-ai-assisted/protomq` — fork with push access
- `tyeth/protomq` — upstream (no direct push; use PRs from fork)
- PR #1: `video-qr-pytest-capture` → `displays-v2-testing` (test pipeline)
- Issue #2: "Consolidation plan: V1+V2 visual testing with runner API endpoint"

---

## Session Index

| Date | Session ID | Content |
|---|---|---|
| 2026-04-07 | a3ad0df8 | IMX519 autofocus research for Pi Zero 2W — tuning file fix, lens position calibration |
| 2026-04-07 | ebc0d1d7 | Video-QR pytest pipeline build (subagent, failed push to tyeth/protomq) |
| 2026-04-07 | f734734f | Video-QR pytest pipeline build (subagent, successfully pushed via fork + PR) |
| 2026-04-08 | 5f53c087 | Full display bench test session — ProtoMQ setup, V2 proto bundle build, Metro secrets, solenoid power cycle, camera discovery. **Key hardware mapping source.** |
| 2026-04-08 | c7fbb11e | V1 keepalive timeout debugging — Metro connects but registration fails |
| 2026-04-10 | ec72ee24 | V1 topic routing fix (b25fd7e), runner API, USB re-enumeration after reboot, serial capture setup |

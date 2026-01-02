#!/usr/bin/env python3
"""Entry point for the Emporia energy dashboard backend."""

from __future__ import annotations

import datetime
import time

import jwt
from flask import Flask, Response, abort, jsonify
from flask_cors import CORS

try:  # pragma: no cover - optional dependency
    import cv2  # type: ignore[import-not-found]
except ImportError:  # pragma: no cover - keep server running without restream support
    cv2 = None

from backend.config import (
    DEVICE_CACHE_TTL,
    ELECTRICITY_RATE,
    GAS_RTSP_URL,
    RETROACTIVE_CORRECTION_SECONDS,
    SECRET_KEY,
    SYSTEM_NAME,
    VERBOSE_LOGGING,
    WATER_RTSP_URL,
    build_stream_info,
    get_config_value,
    get_configured_credentials,
    log_configuration_snapshot,
    restream_available,
)
from backend.demo import demo_bp
from backend.emporia import emporia_bp, get_authenticated_username, is_authenticated
from backend.streams import analyze_frame, streams_bp


app = Flask(__name__)
CORS(app)

app.register_blueprint(demo_bp)
app.register_blueprint(emporia_bp)
app.register_blueprint(streams_bp)


log_configuration_snapshot()


def stream_rtsp_as_mjpeg(stream_name: str, rtsp_url: str) -> Response:
    """Proxy an RTSP stream as MJPEG if OpenCV is available."""
    if not rtsp_url:
        abort(404, description="Stream not configured")
    if cv2 is None:
        abort(503, description="Restreaming unavailable: install opencv-python-headless")

    cap = cv2.VideoCapture(rtsp_url)
    if not cap.isOpened():
        abort(502, description="Unable to open RTSP stream")

    def generate():
        last_frame_time = time.time()
        try:
            while True:
                success, frame = cap.read()
                if not success:
                    if time.time() - last_frame_time > 5:
                        break
                    time.sleep(0.1)
                    continue
                last_frame_time = time.time()
                if success:
                    analyze_frame(stream_name, frame)
                success, buffer = cv2.imencode(".jpg", frame)
                if not success:
                    continue
                yield (
                    b"--frame\r\n"
                    b"Content-Type: image/jpeg\r\n\r\n" + buffer.tobytes() + b"\r\n"
                )
        finally:
            cap.release()

    return Response(generate(), mimetype="multipart/x-mixed-replace; boundary=frame")


@app.get("/api/streams")
def get_stream_urls():
    """Expose configured utility stream metadata."""
    return jsonify(
        {
            "gas": build_stream_info("gas", GAS_RTSP_URL),
            "water": build_stream_info("water", WATER_RTSP_URL),
        }
    )


@app.get("/api/streams/<stream_name>/mjpeg")
def mjpeg_stream(stream_name: str):
    """Generate an MJPEG restream for the requested utility."""
    if stream_name not in {"gas", "water"}:
        abort(404, description="Unknown stream")
    url = GAS_RTSP_URL if stream_name == "gas" else WATER_RTSP_URL
    return stream_rtsp_as_mjpeg(stream_name, url)


@app.get("/")
def root():
    """Server status, configuration, and health summary."""
    stored_username, stored_password = get_configured_credentials()
    has_stored_credentials = bool(stored_username and stored_password)

    now = datetime.datetime.now(datetime.UTC)

    auth_username = get_authenticated_username()
    authenticated = is_authenticated()

    token = None
    if authenticated and auth_username:
        token = jwt.encode(
            {
                "username": auth_username,
                "exp": now + datetime.timedelta(hours=24),
            },
            SECRET_KEY,
            algorithm="HS256",
        )

    config_payload = {
        "electricityRate": ELECTRICITY_RATE,
        "systemName": SYSTEM_NAME,
        "gasStreamUrl": GAS_RTSP_URL or None,
        "waterStreamUrl": WATER_RTSP_URL or None,
        "gasStream": build_stream_info("gas", GAS_RTSP_URL),
        "waterStream": build_stream_info("water", WATER_RTSP_URL),
        "retroactiveCorrectionSeconds": RETROACTIVE_CORRECTION_SECONDS,
    }

    return jsonify(
        {
            "status": "up",
            "timestamp": now.isoformat(),
            "restreamAvailable": restream_available(),
            "authenticated": authenticated,
            "username": auth_username if authenticated else stored_username,
            "token": token,
            "hasStoredCredentials": has_stored_credentials,
            "config": config_payload,
            "health": {
                "status": "healthy",
                "timestamp": now.isoformat(),
                "authenticated": authenticated,
            },
        }
    )


if __name__ == "__main__":
    host = get_config_value("BACKEND_HOST", "0.0.0.0") or "0.0.0.0"
    port = int(get_config_value("BACKEND_PORT", "5001") or "5001")
    debug = (get_config_value("BACKEND_DEBUG", "true") or "true").lower() == "true"

    print("=" * 60)
    print("Energy Monitor Backend Server")
    print("=" * 60)
    print(f"Server starting on http://{host}:{port}")
    print(f"System Name: {SYSTEM_NAME}")
    print(f"Electricity Rate: ${ELECTRICITY_RATE:.6f} per kWh")
    print(f"Device Cache TTL: {DEVICE_CACHE_TTL} seconds")
    print(f"Retroactive Correction Seconds: {RETROACTIVE_CORRECTION_SECONDS} seconds")
    print(f"Verbose Logging: {'Enabled' if VERBOSE_LOGGING else 'Disabled'}")
    print("Endpoints:")
    print("  GET    /                        - Status, configuration, and health summary")
    print("  POST   /api/emporia/auth        - Authenticate using stored credentials")
    print("  GET    /api/emporia/devices     - Get device list")
    print("  POST   /api/emporia/devices/refresh - Force refresh device cache")
    print("  GET    /api/emporia/realtime    - Get real-time energy data")
    print("  GET    /api/emporia/history     - Get historical energy data")
    print("  POST   /api/emporia/logout      - Logout and clear authentication state")
    print("  GET    /api/demo/devices        - Get demo device list")
    print("  GET    /api/demo/realtime       - Get demo real-time data")
    print("  GET    /api/demo/history        - Get demo historical data")
    print("  GET    /api/streams             - Get utility stream metadata")
    print("  GET    /api/streams/<stream>/mjpeg - MJPEG proxy for configured stream")
    print("=" * 60)
    print()

    app.run(host=host, port=port, debug=debug)

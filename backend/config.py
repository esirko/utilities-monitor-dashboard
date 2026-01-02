from __future__ import annotations

import datetime
import json
import os
from typing import Dict, Optional

try:
    import cv2  # type: ignore[import-not-found]
except ImportError:  # pragma: no cover
    cv2 = None


def _load_env_file(path: str) -> Dict[str, str]:
    values: Dict[str, str] = {}

    if not os.path.exists(path):
        return values

    try:
        with open(path, "r", encoding="utf-8") as env_file:
            for raw_line in env_file:
                line = raw_line.strip()

                if not line or line.startswith("#"):
                    continue

                if line.startswith("export "):
                    line = line[len("export "):]

                if "=" not in line:
                    continue

                key, value = line.split("=", 1)
                key = key.strip()
                value = value.strip()

                if not key:
                    continue

                if ((value.startswith('"') and value.endswith('"')) or
                        (value.startswith("'") and value.endswith("'"))) and len(value) >= 2:
                    value = value[1:-1]

                values[key] = value
    except OSError:
        return {}

    return values


ENV_FILE_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".env")
ENV_FILE_VALUES = _load_env_file(os.path.abspath(ENV_FILE_PATH))


def get_config_value(key: str, default: Optional[str] = None) -> Optional[str]:
    if key in os.environ:
        return os.environ.get(key)
    return ENV_FILE_VALUES.get(key, default)


def mask_secret(value: Optional[str]) -> str:
    if not value:
        return ""
    if len(value) <= 4:
        return "***"
    return f"{value[:2]}***{value[-2:]}"


def mask_url_credentials(url: Optional[str]) -> Optional[str]:
    if not url:
        return url

    from urllib.parse import urlparse, urlunparse

    try:
        parsed = urlparse(url)
    except ValueError:
        return url

    if parsed.username is None and parsed.password is None:
        return url

    hostname = parsed.hostname or ""
    if ":" in hostname and not hostname.startswith("["):
        hostname = f"[{hostname}]"

    port = f":{parsed.port}" if parsed.port else ""

    userinfo = ""
    if parsed.username:
        userinfo = parsed.username
        if parsed.password is not None:
            userinfo += ":***"
        userinfo += "@"

    masked_netloc = f"{userinfo}{hostname}{port}"

    return urlunparse((
        parsed.scheme,
        masked_netloc,
        parsed.path or "",
        parsed.params,
        parsed.query,
        parsed.fragment
    ))


def restream_available() -> bool:
    return cv2 is not None


def build_stream_info(name: str, url: Optional[str]):
    if not url:
        return {
            "rtsp": None,
            "mjpeg": None,
            "restreamAvailable": False
        }
    info = {
        "rtsp": url,
        "restreamAvailable": restream_available()
    }
    info["mjpeg"] = f"/api/streams/{name}/mjpeg" if info["restreamAvailable"] else None
    return info


HISTORY_RANGE_MAP = {
    "1 Min": 60,
    "5 Min": 300,
    "15 Min": 900,
    "1 Hour": 3600
}


SECRET_KEY = get_config_value("SECRET_KEY", "your-secret-key-change-this-in-production")
ELECTRICITY_RATE = float(get_config_value("ELECTRICITY_RATE", "0.314555") or "0.314555")
SYSTEM_NAME = get_config_value("SYSTEM_NAME", "Home")
DEVICE_CACHE_TTL = int(get_config_value("DEVICE_CACHE_TTL", "300") or "300")
RETROACTIVE_CORRECTION_SECONDS = int(
    get_config_value("RETROACTIVE_CORRECTION_SECONDS", "5") or "5"
)
VERBOSE_LOGGING = (get_config_value("VERBOSE_LOGGING", "false") or "false").lower() == "true"
GAS_RTSP_URL = get_config_value("GAS_RTSP_URL", "") or ""
WATER_RTSP_URL = get_config_value("WATER_RTSP_URL", "") or ""


def get_configured_credentials() -> tuple[Optional[str], Optional[str]]:
    username = get_config_value("EMPORIA_USERNAME")
    password = get_config_value("EMPORIA_PASSWORD")

    username = username.strip() if isinstance(username, str) else None
    password = password.strip() if isinstance(password, str) else None

    if username and password:
        return username, password
    return None, None


def log_configuration_snapshot() -> None:
    print("[Config] Loaded configuration values:")
    stored_username, stored_password = get_configured_credentials()
    config_snapshot = {
        "SECRET_KEY": mask_secret(SECRET_KEY),
        "ELECTRICITY_RATE": ELECTRICITY_RATE,
        "SYSTEM_NAME": SYSTEM_NAME,
        "DEVICE_CACHE_TTL": DEVICE_CACHE_TTL,
        "RETROACTIVE_CORRECTION_SECONDS": RETROACTIVE_CORRECTION_SECONDS,
        "VERBOSE_LOGGING": VERBOSE_LOGGING,
        "GAS_RTSP_URL": mask_url_credentials(GAS_RTSP_URL),
        "WATER_RTSP_URL": mask_url_credentials(WATER_RTSP_URL),
        "EMPORIA_USERNAME": stored_username or "",
        "EMPORIA_PASSWORD": mask_secret(stored_password),
    }

    for key in ("BACKEND_HOST", "BACKEND_PORT", "BACKEND_DEBUG"):
        config_snapshot[key] = get_config_value(key, None)

    config_snapshot["BACKEND_HOST"] = config_snapshot.get("BACKEND_HOST") or "0.0.0.0"
    config_snapshot["BACKEND_PORT"] = config_snapshot.get("BACKEND_PORT") or "5001"
    backend_debug = config_snapshot.get("BACKEND_DEBUG")
    if isinstance(backend_debug, str):
        backend_debug = backend_debug.lower() == "true"
    config_snapshot["BACKEND_DEBUG"] = backend_debug if backend_debug is not None else True

    config_snapshot["restreamAvailable"] = restream_available()

    for key, value in config_snapshot.items():
        if key.endswith("_URL"):
            value = mask_url_credentials(value)
        print(f"[Config]   {key}: {value}")


__all__ = [
    "SECRET_KEY",
    "ELECTRICITY_RATE",
    "SYSTEM_NAME",
    "DEVICE_CACHE_TTL",
    "RETROACTIVE_CORRECTION_SECONDS",
    "VERBOSE_LOGGING",
    "GAS_RTSP_URL",
    "WATER_RTSP_URL",
    "HISTORY_RANGE_MAP",
    "restream_available",
    "build_stream_info",
    "get_config_value",
    "get_configured_credentials",
    "log_configuration_snapshot",
    "mask_secret",
    "mask_url_credentials",
]

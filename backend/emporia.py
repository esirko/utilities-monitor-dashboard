from __future__ import annotations

import datetime
import json
import time
from functools import wraps
from typing import Any, Dict, Tuple

from flask import Blueprint, jsonify, request
import jwt
from pyemvue import PyEmVue
from pyemvue.enums import Scale, Unit

from backend.config import (
    SECRET_KEY,
    DEVICE_CACHE_TTL,
    VERBOSE_LOGGING,
    HISTORY_RANGE_MAP,
    get_configured_credentials,
)

emporia_bp = Blueprint("emporia", __name__, url_prefix="/api/emporia")

vue = PyEmVue()
_authenticated = False
_credentials_username: str | None = None

device_cache: Dict[str, Any] = {
    "devices": None,
    "timestamp": None,
}


def is_authenticated() -> bool:
    return _authenticated


def get_authenticated_username() -> str | None:
    return _credentials_username


def _set_authenticated(username: str | None, value: bool) -> None:
    global _authenticated, _credentials_username
    _authenticated = value
    _credentials_username = username if value else None


def invalidate_device_cache() -> None:
    device_cache["devices"] = None
    device_cache["timestamp"] = None
    print("[Cache] Device cache invalidated")


def get_cached_devices():
    now = datetime.datetime.now(datetime.UTC)

    if (
        device_cache["devices"] is not None
        and device_cache["timestamp"] is not None
        and (now - device_cache["timestamp"]).total_seconds() < DEVICE_CACHE_TTL
    ):
        print(
            "[Cache] Using cached devices (age: "
            f"{(now - device_cache['timestamp']).total_seconds():.1f}s)"
        )
        return device_cache["devices"]

    print("[Cache] Cache miss or stale, fetching devices from API")
    log_emporia_request("vue.get_devices")
    devices = vue.get_devices()
    log_devices(devices)

    device_cache["devices"] = devices
    device_cache["timestamp"] = now
    print(f"[Cache] Cached {len(devices)} devices")
    return devices


def token_required(func):
    @wraps(func)
    def decorated(*args, **kwargs):
        token = request.headers.get("Authorization")

        if not token:
            return jsonify({"error": "Token is missing"}), 401

        try:
            token = token.replace("Bearer ", "")
            jwt.decode(token, SECRET_KEY, algorithms=["HS256"])
        except jwt.ExpiredSignatureError:
            return jsonify({"error": "Token has expired"}), 401
        except jwt.InvalidTokenError:
            return jsonify({"error": "Token is invalid"}), 401

        return func(*args, **kwargs)

    return decorated


def log_emporia_request(method_name: str, **params) -> Dict[str, Any]:
    redacted_params = params.copy()
    if "password" in redacted_params:
        redacted_params["password"] = "***REDACTED***"

    params_str = ", ".join(f"{k}={v}" for k, v in redacted_params.items())
    print(f"[Emporia API] REQUEST  > {method_name}({params_str})")
    return redacted_params


def log_emporia_response_full_json(method_name: str, response: Any) -> None:
    def object_to_dict(obj: Any):
        if obj is None:
            return None
        if isinstance(obj, (str, int, float, bool)):
            return obj
        if isinstance(obj, dict):
            return {k: object_to_dict(v) for k, v in obj.items()}
        if isinstance(obj, (list, tuple)):
            return [object_to_dict(item) for item in obj]
        if hasattr(obj, "__dict__"):
            result = {}
            for key, value in obj.__dict__.items():
                if not key.startswith("_"):
                    result[key] = object_to_dict(value)
            return result
        return str(obj)

    try:
        converted = object_to_dict(response)
        response_str = json.dumps(converted, indent=2, default=str)
        print(f"[Emporia API] RESPONSE < {method_name}:\n{response_str}")
    except Exception as exc:  # pragma: no cover - debug helper
        print(
            f"[Emporia API] RESPONSE < {method_name}: "
            f"<unable to serialize: {exc}>"
        )


def log_devices(devices) -> None:
    print("[Emporia API] RESPONSE < vue.get_devices:")
    for device in devices:
        print(
            " - Device GID: {gid}, Name: {name}, Channels: {count}".format(
                gid=device.device_gid,
                name=device.device_name,
                count=len(device.channels) if hasattr(device, "channels") else 0,
            )
        )
        if hasattr(device, "channels"):
            for channel in device.channels:
                print(
                    f"    - Channel Num: {channel.channel_num}, "
                    f"Name: {channel.name}"
                )


def log_usage_recursive(usage_dict, info, depth=0, first_call=True):
    if first_call:
        print("[Emporia API] RESPONSE < vue.get_device_list_usage:")
    for gid, device in usage_dict.items():
        for channelnum, channel in device.channels.items():
            name = channel.name
            if name == "Main":
                name = info[gid].device_name
            print("-" * depth, f"{gid} {channelnum:<2} {name:<20} {channel.usage} kW")
            if channel.nested_devices:
                log_usage_recursive(channel.nested_devices, info, depth + 1, False)


def log_usage_compact(usage_dict, info):
    device_summaries = []
    total_kw = 0.0

    def collect_usage(usage_dict_inner, depth=0):
        nonlocal total_kw
        for gid, device in usage_dict_inner.items():
            for channelnum, channel in device.channels.items():
                name = channel.name
                if name == "Main":
                    name = info[gid].device_name
                usage_kw = channel.usage
                total_kw += usage_kw
                device_summaries.append(f"{name}:{usage_kw:.3f}kW")
                if channel.nested_devices:
                    collect_usage(channel.nested_devices, depth + 1)

    collect_usage(usage_dict)
    devices_str = ", ".join(device_summaries)
    log_message = (
        "[Emporia API] RESPONSE < vue.get_device_list_usage: "
        f"Total={total_kw:.3f}kW [{devices_str}]"
    )
    print(log_message[:200])


@emporia_bp.post("/auth")
def authenticate_with_stored():
    global vue
    print("[Emporia Auth] Authentication with stored credentials requested")

    username, password = get_configured_credentials()

    if not username or not password:
        print("[Emporia Auth] ✗ No stored credentials available")
        return jsonify({
            "success": False,
            "message": "No stored credentials available",
        }), 401

    try:
        print(
            "[Emporia Auth] Attempting to authenticate with stored credentials "
            f"for {username}..."
        )
        log_emporia_request("vue.login", username=username, password=password)
        response = vue.login(username=username, password=password)
        log_emporia_response_full_json("vue.login", response)

        if response:
            _set_authenticated(username, True)
            invalidate_device_cache()
            token = jwt.encode(
                {
                    "username": username,
                    "exp": datetime.datetime.now(datetime.UTC)
                    + datetime.timedelta(hours=24),
                },
                SECRET_KEY,
                algorithm="HS256",
            )
            print(f"[Emporia Auth] ✓ Authentication successful for {username}")
            return jsonify(
                {
                    "success": True,
                    "token": token,
                    "message": "Connected successfully with stored credentials",
                }
            )

        _set_authenticated(None, False)
        print("[Emporia Auth] ✗ Authentication failed: Invalid credentials")
        return (
            jsonify(
                {
                    "success": False,
                    "message": "Connection failed: Invalid stored credentials",
                }
            ),
            401,
        )

    except Exception as exc:
        _set_authenticated(None, False)
        print(f"[Emporia Auth] ✗ Authentication failed: {exc}")
        return (
            jsonify(
                {
                    "success": False,
                    "message": f"Connection failed: {exc}",
                }
            ),
            401,
        )


@emporia_bp.post("/logout")
@token_required
def logout_emporia():
    _set_authenticated(None, False)
    invalidate_device_cache()
    return jsonify({"success": True, "message": "Logged out successfully"})


@emporia_bp.get("/devices")
@token_required
def get_devices_endpoint():
    if not is_authenticated():
        return jsonify({"error": "Not authenticated with Emporia Vue"}), 401

    try:
        devices = get_cached_devices()
        device_list = []

        for device in devices:
            channels = device.channels if hasattr(device, "channels") else []
            device_list.append(
                {
                    "id": str(device.device_gid),
                    "name": device.device_name or "Unknown Device",
                    "category": "Main",
                    "status": "active",
                }
            )

            for channel in channels:
                if (
                    channel
                    and hasattr(channel, "channel_num")
                    and channel.channel_num != "1,2,3"
                ):
                    device_list.append(
                        {
                            "id": f"{device.device_gid}-{channel.channel_num}",
                            "name": channel.name or f"Circuit {channel.channel_num}",
                            "category": "Circuit",
                            "status": "active",
                        }
                    )

        return jsonify({"devices": device_list})

    except Exception as exc:
        error_message = str(exc)
        print(f"[Error] Failed to get devices: {error_message}")
        if "401" in error_message or "Unauthorized" in error_message or "authentication" in error_message.lower():
            print(
                "[Error] Detected Emporia API authentication failure, "
                "invalidating local auth state"
            )
            _set_authenticated(None, False)
            invalidate_device_cache()
            return jsonify({"error": "Emporia API authentication expired", "needsReauth": True}), 401
        return jsonify({"error": f"Failed to get devices: {error_message}"}), 500


@emporia_bp.post("/devices/refresh")
@token_required
def refresh_devices():
    if not is_authenticated():
        return jsonify({"error": "Not authenticated with Emporia Vue"}), 401

    try:
        invalidate_device_cache()
        devices = get_cached_devices()
        return jsonify(
            {
                "success": True,
                "message": "Device cache refreshed",
                "device_count": len(devices),
            }
        )
    except Exception as exc:
        return jsonify({"error": f"Failed to refresh devices: {exc}"}), 500


@emporia_bp.get("/realtime")
@token_required
def get_realtime():
    if not is_authenticated():
        return jsonify({"error": "Not authenticated with Emporia Vue"}), 401

    try:
        devices = get_cached_devices()
        device_gids = []
        device_info = {}

        for device in devices:
            if device.device_gid not in device_gids:
                device_gids.append(device.device_gid)
                device_info[device.device_gid] = device
            else:
                device_info[device.device_gid].channels += device.channels

        instant = datetime.datetime.now(datetime.UTC)
        log_emporia_request(
            "vue.get_device_list_usage",
            deviceGids=device_gids,
            instant=instant.isoformat(),
            scale=Scale.SECOND.value,
            unit=Unit.KWH.value,
        )
        usage_dict = vue.get_device_list_usage(
            deviceGids=device_gids,
            instant=None,
            scale=Scale.SECOND.value,
            unit=Unit.KWH.value,
        )

        for gid, device in usage_dict.items():
            for channelnum, channel in device.channels.items():
                channel.usage = 3600 * channel.usage

        if VERBOSE_LOGGING:
            log_usage_recursive(usage_dict, device_info)
        else:
            log_usage_compact(usage_dict, device_info)

        devices_data = {}
        total_watts = 0.0

        for device in devices:
            gid = device.device_gid
            if gid in usage_dict:
                usage = usage_dict[gid]
                if hasattr(usage, "instant"):
                    watts = (usage.instant or 0) * 1000
                elif hasattr(usage, "usage"):
                    watts = (usage.usage or 0) * 1000
                else:
                    watts = 0

                devices_data[str(gid)] = round(watts, 2)
                total_watts += watts

                if hasattr(usage, "channels") and usage.channels:
                    for channel_num, channel_usage in usage.channels.items():
                        if channel_num == "1,2,3":
                            continue
                        if channel_usage and hasattr(channel_usage, "usage"):
                            channel_watts = (channel_usage.usage or 0) * 1000
                            devices_data[f"{gid}-{channel_num}"] = round(channel_watts, 2)

        return jsonify(
            {
                "timestamp": int(datetime.datetime.now(datetime.UTC).timestamp() * 1000),
                "total": round(total_watts, 2),
                "devices": devices_data,
            }
        )

    except Exception as exc:
        error_message = str(exc)
        print(f"[Error] Failed to get real-time data: {error_message}")
        if "401" in error_message or "Unauthorized" in error_message or "authentication" in error_message.lower():
            print("[Error] Detected Emporia API authentication failure, invalidating local auth state")
            _set_authenticated(None, False)
            invalidate_device_cache()
            return jsonify({"error": "Emporia API authentication expired", "needsReauth": True}), 401
        return jsonify({"error": f"Failed to get real-time data: {error_message}"}), 500


@emporia_bp.get("/history")
@token_required
def get_history():
    if not is_authenticated():
        return jsonify({"error": "Not authenticated with Emporia Vue"}), 401

    time_range = request.args.get("range", "1 Min")
    seconds = HISTORY_RANGE_MAP.get(time_range, 60)

    try:
        devices = get_cached_devices()
        device_gids = []
        device_info = {}
        for device in devices:
            if device.device_gid not in device_gids:
                device_gids.append(device.device_gid)
                device_info[device.device_gid] = device
            else:
                device_info[device.device_gid].channels += device.channels

        data_points = []
        now = datetime.datetime.now(datetime.UTC)

        for i in range(seconds, 0, -1):
            timestamp = now - datetime.timedelta(seconds=i)
            log_emporia_request(
                "vue.get_device_list_usage",
                deviceGids=device_gids,
                instant=timestamp.isoformat(),
                scale=Scale.SECOND.value,
                unit=Unit.KWH.value,
            )
            usage_dict = vue.get_device_list_usage(
                deviceGids=device_gids,
                instant=timestamp,
                scale=Scale.SECOND.value,
                unit=Unit.KWH.value,
            )

            for gid, device in usage_dict.items():
                for channelnum, channel in device.channels.items():
                    channel.usage = 3600 * channel.usage

            if VERBOSE_LOGGING:
                log_usage_recursive(usage_dict, device_info)
            else:
                log_usage_compact(usage_dict, device_info)

            devices_data = {}
            total_watts = 0.0

            for device in devices:
                gid = device.device_gid
                if gid in usage_dict:
                    usage = usage_dict[gid]
                    watts = (getattr(usage, "instant", 0) or 0) * 1000
                    devices_data[str(gid)] = round(watts, 2)
                    total_watts += watts

                    if hasattr(usage, "channels") and usage.channels:
                        for channel_num, channel_usage in usage.channels.items():
                            if channel_num == "1,2,3":
                                continue
                            if channel_usage and hasattr(channel_usage, "usage"):
                                channel_watts = (channel_usage.usage or 0) * 1000
                                devices_data[f"{gid}-{channel_num}"] = round(channel_watts, 2)

            data_points.append(
                {
                    "timestamp": int(timestamp.timestamp() * 1000),
                    "total": round(total_watts, 2),
                    "devices": devices_data,
                }
            )

        return jsonify({"dataPoints": data_points})

    except Exception as exc:
        error_message = str(exc)
        print(f"[Error] Failed to get historical data: {error_message}")
        if "401" in error_message or "Unauthorized" in error_message or "authentication" in error_message.lower():
            print("[Error] Detected Emporia API authentication failure, invalidating local auth state")
            _set_authenticated(None, False)
            invalidate_device_cache()
            return jsonify({"error": "Emporia API authentication expired", "needsReauth": True}), 401
        return jsonify({"dataPoints": []})


__all__ = [
    "emporia_bp",
    "token_required",
    "is_authenticated",
    "get_authenticated_username",
    "invalidate_device_cache",
    "get_cached_devices",
]

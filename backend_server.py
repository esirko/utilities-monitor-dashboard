#!/usr/bin/env python3
"""
Example Python Backend Server for Energy Monitor Dashboard
Uses pyemvue library to fetch real energy data from Emporia Vue

Installation:
    pip install flask flask-cors pyemvue pyjwt

Configuration (Environment Variables):
    BACKEND_HOST      - Host to bind to (default: 0.0.0.0)
    BACKEND_PORT      - Port to listen on (default: 5001)
    BACKEND_DEBUG     - Enable debug mode (default: true)
    SECRET_KEY        - JWT secret key (default: 'your-secret-key-change-this-in-production')
    ELECTRICITY_RATE  - Rate per kWh in dollars (default: 0.314555)
    SYSTEM_NAME       - Name of the system/house (default: 'Home')
    DEVICE_CACHE_TTL  - Device cache time-to-live in seconds (default: 300)
    VERBOSE_LOGGING   - Enable verbose device usage logging (default: false)

Credentials:
Usage:
    python backend_server.py
    
    Or with custom configuration:
    BACKEND_PORT=8000 SECRET_KEY=my-secret python backend_server.py

API Endpoints:
    GET    /                        - Server status, configuration, and health summary
    POST   /api/emporia/auth        - Authenticate with Emporia using stored credentials
    GET    /api/emporia/devices     - Get list of devices
    POST   /api/emporia/devices/refresh - Force refresh device cache
    GET    /api/emporia/realtime    - Get current energy data
    GET    /api/emporia/history     - Get historical energy data
    GET    /api/streams             - Get stream metadata for utility cameras
    GET    /api/streams/<stream_name>/mjpeg - MJPEG proxy for configured streams
"""

from flask import Flask, request, jsonify, Response, abort
from flask_cors import CORS
from pyemvue import PyEmVue
from pyemvue.enums import Scale, Unit
import jwt
import datetime
import os
import time
from functools import wraps
import json
import math
import random
import threading
from urllib.parse import urlparse, urlunparse

try:
    import cv2  # type: ignore[import-not-found]
except ImportError:  # pragma: no cover
    cv2 = None

app = Flask(__name__)
CORS(app)  # Enable CORS for React frontend


def _load_env_file(path: str) -> dict[str, str]:
    """Parse a .env style file into a dictionary."""
    values: dict[str, str] = {}

    if not os.path.exists(path):
        return values

    try:
        with open(path, 'r', encoding='utf-8') as env_file:
            for raw_line in env_file:
                line = raw_line.strip()

                if not line or line.startswith('#'):
                    continue

                if line.startswith('export '):
                    line = line[len('export '):]

                if '=' not in line:
                    continue

                key, value = line.split('=', 1)
                key = key.strip()
                value = value.strip()

                if not key:
                    continue

                # Remove surrounding quotes if present
                if ((value.startswith('"') and value.endswith('"')) or
                        (value.startswith("'") and value.endswith("'"))) and len(value) >= 2:
                    value = value[1:-1]

                values[key] = value
    except OSError:
        # If the file can't be read, fall back to empty dict
        return {}

    return values


ENV_FILE_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), '.env')
ENV_FILE_VALUES = _load_env_file(ENV_FILE_PATH)


def _get_config_value(key: str, default: str | None = None) -> str | None:
    """Fetch a configuration value using env vars to override .env file values."""
    if key in os.environ:
        return os.environ.get(key)
    value = ENV_FILE_VALUES.get(key)
    if value is not None:
        return value
    return default


def _mask_secret(value: str | None) -> str:
    if not value:
        return ''
    if len(value) <= 4:
        return '***'
    return f"{value[:2]}***"


def _mask_url_credentials(url: str | None) -> str | None:
    if not url:
        return url

    try:
        parsed = urlparse(url)
    except ValueError:
        return url

    if parsed.username is None and parsed.password is None:
        return url

    hostname = parsed.hostname or ''
    if ':' in hostname and not hostname.startswith('['):
        hostname = f"[{hostname}]"

    port = f":{parsed.port}" if parsed.port else ''

    userinfo = ''
    if parsed.username:
        userinfo = parsed.username
        if parsed.password is not None:
            userinfo += ':***'
        userinfo += '@'

    masked_netloc = f"{userinfo}{hostname}{port}"

    return urlunparse((
        parsed.scheme,
        masked_netloc,
        parsed.path or '',
        parsed.params,
        parsed.query,
        parsed.fragment
    ))


DEVICE_CONFIGS = [
    {
        'name': 'HVAC System',
        'base_watts': 3200,
        'variance': 800,
        'category': 'Climate'
    },
    {
        'name': 'Refrigerator',
        'base_watts': 150,
        'variance': 50,
        'category': 'Kitchen'
    },
    {
        'name': 'Water Heater',
        'base_watts': 4500,
        'variance': 500,
        'category': 'Utility',
        'duty_cycle': 0.3
    },
    {
        'name': 'Washer/Dryer',
        'base_watts': 2800,
        'variance': 400,
        'category': 'Laundry',
        'duty_cycle': 0.2
    },
    {
        'name': 'Kitchen Appliances',
        'base_watts': 800,
        'variance': 600,
        'category': 'Kitchen',
        'duty_cycle': 0.4
    },
    {
        'name': 'Lighting',
        'base_watts': 400,
        'variance': 200,
        'category': 'Lighting'
    },
    {
        'name': 'Entertainment',
        'base_watts': 250,
        'variance': 150,
        'category': 'Electronics'
    },
    {
        'name': 'Home Office',
        'base_watts': 180,
        'variance': 80,
        'category': 'Electronics'
    },
    {
        'name': 'Garage',
        'base_watts': 120,
        'variance': 100,
        'category': 'Utility',
        'duty_cycle': 0.15
    },
]

HISTORY_RANGE_MAP = {
    '1 Min': 60,
    '5 Min': 300,
    '15 Min': 900,
    '1 Hour': 3600
}


class DemoEnergySimulator:
    def __init__(self):
        self.devices: dict[str, dict[str, float | str]] = {}
        self.phase_offsets: dict[str, float] = {}
        self.duty_cycle_states: dict[str, bool] = {}
        self.duty_cycle_timers: dict[str, int] = {}
        self.config_map: dict[str, dict[str, float | str]] = {}
        self.lock = threading.Lock()

        for index, config in enumerate(DEVICE_CONFIGS):
            device_id = f"device-{index + 1}"
            device = {
                'id': device_id,
                'name': config['name'],
                'category': config['category'],
                'status': 'active',
                'watts': config['base_watts'],
            }
            self.devices[device_id] = device
            self.phase_offsets[device_id] = random.random() * math.pi * 2
            self.config_map[device_id] = config

            if 'duty_cycle' in config:
                self.duty_cycle_states[device_id] = random.random() > 0.5
                self.duty_cycle_timers[device_id] = 0

    def _update_device_locked(self, device_id: str, timestamp: int) -> float:
        device = self.devices.get(device_id)
        config = self.config_map.get(device_id)

        if not device or not config:
            return 0.0

        phase_offset = self.phase_offsets.get(device_id, 0.0)

        duty_cycle = config.get('duty_cycle')
        if duty_cycle is not None:
            timer = self.duty_cycle_timers.get(device_id, 0) + 1
            self.duty_cycle_timers[device_id] = timer

            if timer > 30:
                if random.random() < 0.1:
                    current_state = self.duty_cycle_states.get(device_id, True)
                    self.duty_cycle_states[device_id] = not current_state
                    self.duty_cycle_timers[device_id] = 0

            if not self.duty_cycle_states.get(device_id, True):
                watts = random.random() * 5
                device['watts'] = watts
                device['status'] = 'idle'
                return watts

        time_factor = timestamp / 1000.0
        slow_wave = math.sin(time_factor * 0.1 + phase_offset) * 0.3
        fast_wave = math.sin(time_factor * 0.5 + phase_offset) * 0.15
        noise = (random.random() - 0.5) * 0.1
        variation = slow_wave + fast_wave + noise

        base_watts = config['base_watts']
        variance = config['variance']
        watts = base_watts + (variance * variation)
        watts = max(0.0, watts)

        device['watts'] = watts
        device['status'] = 'active' if watts > base_watts * 0.1 else 'idle'
        return watts

    def _generate_point_locked(self, timestamp: int) -> dict[str, object]:
        device_watts: dict[str, float] = {}
        total = 0.0

        for device_id in self.devices.keys():
            watts = self._update_device_locked(device_id, timestamp)
            device_watts[device_id] = round(float(watts), 3)
            total += watts

        return {
            'timestamp': timestamp,
            'devices': device_watts,
            'total': round(float(total), 3)
        }

    def generate_point(self, timestamp: int | None = None) -> dict[str, object]:
        with self.lock:
            ts = timestamp or int(time.time() * 1000)
            return self._generate_point_locked(ts)

    def generate_history(self, seconds: int) -> list[dict[str, object]]:
        if seconds <= 0:
            return []

        with self.lock:
            now_ms = int(time.time() * 1000)
            start_ms = now_ms - (seconds - 1) * 1000
            history: list[dict[str, object]] = []
            for i in range(seconds):
                ts = start_ms + (i * 1000)
                history.append(self._generate_point_locked(ts))
            return history

    def get_devices(self) -> list[dict[str, object]]:
        with self.lock:
            return [
                {
                    'id': device_id,
                    'name': device['name'],
                    'category': device['category'],
                    'status': device.get('status', 'active')
                }
                for device_id, device in self.devices.items()
            ]


demo_simulator = DemoEnergySimulator()


def _get_configured_credentials() -> tuple[str | None, str | None]:
    username = _get_config_value('EMPORIA_USERNAME')
    password = _get_config_value('EMPORIA_PASSWORD')

    username = username.strip() if isinstance(username, str) else None
    password = password.strip() if isinstance(password, str) else None

    if username and password:
        return username, password
    return None, None


# Configuration
SECRET_KEY = _get_config_value('SECRET_KEY', 'your-secret-key-change-this-in-production')
ELECTRICITY_RATE = float(_get_config_value('ELECTRICITY_RATE', '0.314555') or '0.314555')
SYSTEM_NAME = _get_config_value('SYSTEM_NAME', 'Home')
DEVICE_CACHE_TTL = int(_get_config_value('DEVICE_CACHE_TTL', '300') or '300')  # Cache TTL in seconds (default: 5 minutes)
VERBOSE_LOGGING = (_get_config_value('VERBOSE_LOGGING', 'false') or 'false').lower() == 'true'  # Enable verbose device usage logging
GAS_RTSP_URL = _get_config_value('GAS_RTSP_URL', '') or ''
WATER_RTSP_URL = _get_config_value('WATER_RTSP_URL', '') or ''


def log_configuration_snapshot() -> None:
    print("[Config] Loaded configuration values:")
    stored_username, stored_password = _get_configured_credentials()
    config_snapshot = {
        'SECRET_KEY': _mask_secret(SECRET_KEY),
        'ELECTRICITY_RATE': ELECTRICITY_RATE,
        'SYSTEM_NAME': SYSTEM_NAME,
        'DEVICE_CACHE_TTL': DEVICE_CACHE_TTL,
        'VERBOSE_LOGGING': VERBOSE_LOGGING,
        'GAS_RTSP_URL': _mask_url_credentials(GAS_RTSP_URL),
        'WATER_RTSP_URL': _mask_url_credentials(WATER_RTSP_URL),
        'EMPORIA_USERNAME': stored_username or '',
        'EMPORIA_PASSWORD': _mask_secret(stored_password)
    }

    for key in ('BACKEND_HOST', 'BACKEND_PORT', 'BACKEND_DEBUG'):
        config_snapshot[key] = _get_config_value(key, None)

    # Normalize backend settings for display
    config_snapshot['BACKEND_HOST'] = config_snapshot.get('BACKEND_HOST') or '0.0.0.0'
    config_snapshot['BACKEND_PORT'] = config_snapshot.get('BACKEND_PORT') or '5001'
    backend_debug = config_snapshot.get('BACKEND_DEBUG')
    if isinstance(backend_debug, str):
        backend_debug = backend_debug.lower() == 'true'
    config_snapshot['BACKEND_DEBUG'] = backend_debug if backend_debug is not None else True

    for key, value in config_snapshot.items():
        if key.endswith('_URL'):
            value = _mask_url_credentials(value)  # ensure masked even if override came from env
        print(f"[Config]   {key}: {value}")


log_configuration_snapshot()


def restream_available() -> bool:
    return cv2 is not None


def build_stream_info(name: str, url: str | None):
    if not url:
        return {
            'rtsp': None,
            'mjpeg': None,
            'restreamAvailable': False
        }
    info = {
        'rtsp': url,
        'restreamAvailable': restream_available()
    }
    if info['restreamAvailable']:
        info['mjpeg'] = f"/api/streams/{name}/mjpeg"
    else:
        info['mjpeg'] = None
    return info


def stream_rtsp_as_mjpeg(rtsp_url: str):
    if not rtsp_url:
        abort(404, description='Stream not configured')
    if not restream_available():
        abort(503, description='Restreaming unavailable: install opencv-python-headless')

    cap = cv2.VideoCapture(rtsp_url)
    if not cap.isOpened():
        abort(502, description='Unable to open RTSP stream')

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
                success, buffer = cv2.imencode('.jpg', frame)
                if not success:
                    continue
                yield (b'--frame\r\n'
                       b'Content-Type: image/jpeg\r\n\r\n' + buffer.tobytes() + b'\r\n')
        finally:
            cap.release()

    return Response(generate(), mimetype='multipart/x-mixed-replace; boundary=frame')


@app.route('/api/demo/devices', methods=['GET'])
def get_demo_devices():
    """List simulated devices for demo mode."""
    return jsonify({'devices': demo_simulator.get_devices()})


@app.route('/api/demo/realtime', methods=['GET'])
def get_demo_realtime():
    """Get simulated real-time energy usage data."""
    data_point = demo_simulator.generate_point()
    return jsonify(data_point)


@app.route('/api/demo/history', methods=['GET'])
def get_demo_history():
    """Get simulated historical energy data."""
    time_range = request.args.get('range', '1 Min')
    seconds = HISTORY_RANGE_MAP.get(time_range, 60)
    history = demo_simulator.generate_history(seconds)
    return jsonify({'dataPoints': history})
vue = PyEmVue()
authenticated = False
credentials_username = None

# Device cache
device_cache = {
    'devices': None,
    'timestamp': None
}

def get_cached_devices():
    """Get devices from cache or fetch if cache is stale"""
    global device_cache
    
    now = datetime.datetime.now(datetime.UTC)
    
    # Check if cache is valid
    if (device_cache['devices'] is not None and 
        device_cache['timestamp'] is not None and 
        (now - device_cache['timestamp']).total_seconds() < DEVICE_CACHE_TTL):
        print(f"[Cache] Using cached devices (age: {(now - device_cache['timestamp']).total_seconds():.1f}s)")
        return device_cache['devices']
    
    # Cache is stale or empty, fetch new data
    print(f"[Cache] Cache miss or stale, fetching devices from API")
    log_emporia_request('vue.get_devices')
    devices = vue.get_devices()
    log_devices(devices)
    
    # Update cache
    device_cache['devices'] = devices
    device_cache['timestamp'] = now
    print(f"[Cache] Cached {len(devices)} devices")
    
    return devices

def invalidate_device_cache():
    """Invalidate the device cache"""
    global device_cache
    device_cache['devices'] = None
    device_cache['timestamp'] = None
    print(f"[Cache] Device cache invalidated")

# Print usage data, taken from the example at https://github.com/magico13/PyEmVue
def log_usage_recursive(usage_dict, info, depth=0, first_call=True):
    """Verbose logging for usage data"""
    if first_call:
        print(f"[Emporia API] RESPONSE < vue.get_device_list_usage:")
    for gid, device in usage_dict.items():
        for channelnum, channel in device.channels.items():
            name = channel.name
            if name == 'Main':
                name = info[gid].device_name
            print('-'*depth, f'{gid} {channelnum:<2} {name:<20} {channel.usage} kW')
            if channel.nested_devices:
                log_usage_recursive(channel.nested_devices, info, depth+1, first_call=False)

def log_usage_compact(usage_dict, info):
    """Compact single-line logging for usage data"""
    device_summaries = []
    total_kw = 0
    
    def collect_usage(usage_dict, depth=0):
        nonlocal total_kw
        for gid, device in usage_dict.items():
            for channelnum, channel in device.channels.items():
                name = channel.name
                if name == 'Main':
                    name = info[gid].device_name
                usage_kw = channel.usage
                total_kw += usage_kw
                device_summaries.append(f"{name}:{usage_kw:.3f}kW")
                if channel.nested_devices:
                    collect_usage(channel.nested_devices, depth+1)
    
    collect_usage(usage_dict)
    devices_str = ", ".join(device_summaries)
    log_message = f"[Emporia API] RESPONSE < vue.get_device_list_usage: Total={total_kw:.3f}kW [{devices_str}]"
    print(log_message[:200])

def log_devices(devices):
    print(f"[Emporia API] RESPONSE < vue.get_devices:")
    for device in devices:
        print(f" - Device GID: {device.device_gid}, Name: {device.device_name}, Channels: {len(device.channels) if hasattr(device, 'channels') else 0}")
        if hasattr(device, 'channels'):
            for channel in device.channels:
                print(f"    - Channel Num: {channel.channel_num}, Name: {channel.name}")

# Helper function to log Emporia API requests
def log_emporia_request(method_name, **params):
    """Log Emporia API requests with parameters (redacting sensitive data)"""
    redacted_params = params.copy()
    
    # Redact password if present
    if 'password' in redacted_params:
        redacted_params['password'] = '***REDACTED***'
    
    # Format parameters nicely
    params_str = ', '.join(f'{k}={v}' for k, v in redacted_params.items())
    
    print(f"[Emporia API] REQUEST  > {method_name}({params_str})")
    
    return redacted_params

def log_emporia_response_full_json(method_name, response):
    """Log Emporia API responses with detailed object introspection"""
    
    def object_to_dict(obj):
        """Convert an object to a dictionary representation by introspecting its attributes"""
        if obj is None:
            return None
        elif isinstance(obj, (str, int, float, bool)):
            return obj
        elif isinstance(obj, dict):
            return {k: object_to_dict(v) for k, v in obj.items()}
        elif isinstance(obj, (list, tuple)):
            return [object_to_dict(item) for item in obj]
        elif hasattr(obj, '__dict__'):
            # Object with attributes - convert to dict
            result = {}
            for key, value in obj.__dict__.items():
                if not key.startswith('_'):  # Skip private attributes
                    result[key] = object_to_dict(value)
            return result
        else:
            # Fallback to string representation
            return str(obj)
    
    try:
        # Convert response to a JSON-serializable structure
        if response is None:
            response_str = "None"
        elif isinstance(response, (list, dict)):
            converted = object_to_dict(response)
            response_str = json.dumps(converted, indent=2, default=str)
        elif isinstance(response, (str, int, float, bool)):
            response_str = str(response)
        else:
            # For custom objects, introspect and show attributes
            converted = object_to_dict(response)
            response_str = json.dumps(converted, indent=2, default=str)
        
        print(f"[Emporia API] RESPONSE < {method_name}:")
        print(response_str)
    except Exception as e:
        print(f"[Emporia API] RESPONSE < {method_name}: <unable to serialize: {str(e)}>")


# Authentication decorator
def token_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        token = request.headers.get('Authorization')
        
        if not token:
            return jsonify({'error': 'Token is missing'}), 401
            
        try:
            token = token.replace('Bearer ', '')
            data = jwt.decode(token, SECRET_KEY, algorithms=['HS256'])
        except jwt.ExpiredSignatureError:
            return jsonify({'error': 'Token has expired'}), 401
        except jwt.InvalidTokenError:
            return jsonify({'error': 'Token is invalid'}), 401
            
        return f(*args, **kwargs)
    
    return decorated



@app.route('/api/emporia/auth', methods=['POST'])
def authenticate_with_stored():
    """Authenticate with Emporia using stored credentials (for login screen)"""
    global authenticated, credentials_username
    
    print("[Emporia Auth] Authentication with stored credentials requested")
    
    username, password = _get_configured_credentials()
    
    if not username or not password:
        print("[Emporia Auth] ✗ No stored credentials available")
        return jsonify({
            'success': False,
            'message': 'No stored credentials available'
        }), 401
    
    try:
        print(f"[Emporia Auth] Attempting to authenticate with stored credentials for {username}...")
        log_emporia_request('vue.login', username=username, password=password)
        response = vue.login(username=username, password=password)
        log_emporia_response_full_json('vue.login', response)
        
        if response:
            authenticated = True
            credentials_username = username
            
            # Invalidate device cache after authentication
            invalidate_device_cache()
            
            # Generate new JWT token
            token = jwt.encode({
                'username': username,
                'exp': datetime.datetime.now(datetime.UTC) + datetime.timedelta(hours=24)
            }, SECRET_KEY, algorithm='HS256')
            
            print(f"[Emporia Auth] ✓ Authentication successful for {username}")
            
            return jsonify({
                'success': True,
                'token': token,
                'message': 'Connected successfully with stored credentials'
            })
        else:
            authenticated = False
            credentials_username = None
            print("[Emporia Auth] ✗ Authentication failed: Invalid credentials")
            return jsonify({
                'success': False,
                'message': 'Connection failed: Invalid stored credentials'
            }), 401
        
    except Exception as e:
        authenticated = False
        credentials_username = None
        print(f"[Emporia Auth] ✗ Authentication failed: {str(e)}")
        return jsonify({
            'success': False,
            'message': f'Connection failed: {str(e)}'
        }), 401


@app.route('/api/emporia/logout', methods=['POST'])
@token_required
def logout_emporia():
    """Invalidate Emporia authentication and cached data."""
    global authenticated, credentials_username

    authenticated = False
    credentials_username = None
    invalidate_device_cache()

    return jsonify({
        'success': True,
        'message': 'Logged out successfully'
    })

@app.route('/api/emporia/devices', methods=['GET'])
@token_required
def get_devices():
    """Get list of all devices"""
    global authenticated, credentials_username
    
    if not authenticated:
        return jsonify({'error': 'Not authenticated with Emporia Vue'}), 401
    
    try:
        devices = get_cached_devices()
        device_list = []
        
        for device in devices:
            # Get channels for this device
            channels = device.channels if hasattr(device, 'channels') else []
            
            # Add main device
            device_list.append({
                'id': str(device.device_gid),
                'name': device.device_name or 'Unknown Device',
                'category': 'Main',
                'status': 'active'
            })
            
            # Add channels (individual circuits/devices)
            for channel in channels:
                if channel and hasattr(channel, 'channel_num') and channel.channel_num != '1,2,3':
                    device_list.append({
                        'id': f"{device.device_gid}-{channel.channel_num}",
                        'name': channel.name or f"Circuit {channel.channel_num}",
                        'category': 'Circuit',
                        'status': 'active'
                    })
        
        return jsonify({'devices': device_list})
        
    except Exception as e:
        error_message = str(e)
        print(f"[Error] Failed to get devices: {error_message}")
        
        # Check if this is an authentication error from Emporia API
        if '401' in error_message or 'Unauthorized' in error_message or 'authentication' in error_message.lower():
            print("[Error] Detected Emporia API authentication failure, invalidating local auth state")
            authenticated = False
            credentials_username = None
            invalidate_device_cache()
            return jsonify({'error': 'Emporia API authentication expired', 'needsReauth': True}), 401
        
        return jsonify({'error': f'Failed to get devices: {error_message}'}), 500

@app.route('/api/emporia/realtime', methods=['GET'])
@token_required
def get_realtime():
    """Get real-time energy consumption data"""
    global authenticated, credentials_username
    
    if not authenticated:
        return jsonify({'error': 'Not authenticated with Emporia Vue'}), 401
    
    try:
        # Get all devices from cache
        devices = get_cached_devices()
        device_gids = []
        device_info = {}
        for device in devices:
            if not device.device_gid in device_gids:
                device_gids.append(device.device_gid)
                device_info[device.device_gid] = device
            else:
                device_info[device.device_gid].channels += device.channels
        
        # Fetch usage data for the last second
        instant = datetime.datetime.now(datetime.UTC)
        log_emporia_request('vue.get_device_list_usage', deviceGids=device_gids, instant=instant.isoformat(), scale=Scale.SECOND.value, unit=Unit.KWH.value)
        usage_dict = vue.get_device_list_usage( deviceGids=device_gids, instant=None, scale=Scale.SECOND.value, unit=Unit.KWH.value)

        # Correct units to kW
        for gid, device in usage_dict.items():
            for channelnum, channel in device.channels.items():
                channel.usage = 3600 * channel.usage

        if VERBOSE_LOGGING:
            log_usage_recursive(usage_dict, device_info)
        else:
            log_usage_compact(usage_dict, device_info)
        
        # Convert to watts and build response
        devices_data = {}
        total_watts = 0
        
        for device in devices:
            gid = device.device_gid
            
            # Get main device usage
            if gid in usage_dict:
                usage = usage_dict[gid]
                
                # Get usage from the device object
                if hasattr(usage, 'instant'):
                    watts = (usage.instant or 0) * 1000  # Convert kW to watts
                elif hasattr(usage, 'usage'):
                    watts = (usage.usage or 0) * 1000
                else:
                    watts = 0
                
                devices_data[str(gid)] = round(watts, 2)
                total_watts += watts
                
                # Get channel usage if available
                if hasattr(usage, 'channels') and usage.channels:
                    for channel_num, channel_usage in usage.channels.items():
                        if channel_num == "1,2,3":
                            continue
                        if channel_usage and hasattr(channel_usage, 'usage'):
                            channel_watts = (channel_usage.usage or 0) * 1000
                            devices_data[f"{gid}-{channel_num}"] = round(channel_watts, 2)
        
        return jsonify({
            'timestamp': int(datetime.datetime.now(datetime.UTC).timestamp() * 1000),
            'total': round(total_watts, 2),
            'devices': devices_data
        })
        
    except Exception as e:
        error_message = str(e)
        print(f"[Error] Failed to get real-time data: {error_message}")
        
        # Check if this is an authentication error from Emporia API
        if '401' in error_message or 'Unauthorized' in error_message or 'authentication' in error_message.lower():
            print("[Error] Detected Emporia API authentication failure, invalidating local auth state")
            authenticated = False
            credentials_username = None
            invalidate_device_cache()
            return jsonify({'error': 'Emporia API authentication expired', 'needsReauth': True}), 401
        
        return jsonify({'error': f'Failed to get real-time data: {error_message}'}), 500

@app.route('/api/emporia/history', methods=['GET'])
@token_required
def get_history():
    """Get historical energy data"""
    global authenticated, credentials_username
    
    if not authenticated:
        return jsonify({'error': 'Not authenticated with Emporia Vue'}), 401
    
    time_range = request.args.get('range', '1 Min')
    
    seconds = HISTORY_RANGE_MAP.get(time_range, 60)
    
    try:
        devices = get_cached_devices()
        device_gids = []
        device_info = {}
        for device in devices:
            if not device.device_gid in device_gids:
                device_gids.append(device.device_gid)
                device_info[device.device_gid] = device
            else:
                device_info[device.device_gid].channels += device.channels
        
        # Generate data points for the requested time range
        data_points = []
        now = datetime.datetime.now(datetime.UTC)
        
        # For simplicity, fetch recent usage and extrapolate
        # In production, you'd want to use vue.get_chart_usage() for actual historical data
        for i in range(seconds, 0, -1):
            timestamp = now - datetime.timedelta(seconds=i)
            
            log_emporia_request('vue.get_device_list_usage', deviceGids=device_gids, instant=timestamp.isoformat(), scale=Scale.SECOND.value, unit=Unit.KWH.value)
            usage_dict = vue.get_device_list_usage( deviceGids=device_gids, instant=timestamp, scale=Scale.SECOND.value, unit=Unit.KWH.value)

            # Correct units to kW
            for gid, device in usage_dict.items():
                for channelnum, channel in device.channels.items():
                    channel.usage = 3600 * channel.usage

            if VERBOSE_LOGGING:
                log_usage_recursive(usage_dict, device_info)
            else:
                log_usage_compact(usage_dict, device_info)
        
            devices_data = {}
            total_watts = 0
            
            for device in devices:
                gid = device.device_gid
                if gid in usage_dict:
                    usage = usage_dict[gid]
                    watts = (getattr(usage, 'instant', 0) or 0) * 1000
                    devices_data[str(gid)] = round(watts, 2)
                    total_watts += watts
           
            # Get channel usage if available
            if hasattr(usage, 'channels') and usage.channels:
                for channel_num, channel_usage in usage.channels.items():
                    if channel_num == "1,2,3":
                        continue
                    if channel_usage and hasattr(channel_usage, 'usage'):
                        channel_watts = (channel_usage.usage or 0) * 1000
                        devices_data[f"{gid}-{channel_num}"] = round(channel_watts, 2) 

            data_points.append({
                'timestamp': int(timestamp.timestamp() * 1000),
                'total': round(total_watts, 2),
                'devices': devices_data
            })
        
        return jsonify({'dataPoints': data_points})
        
    except Exception as e:
        error_message = str(e)
        print(f"[Error] Failed to get historical data: {error_message}")
        
        # Check if this is an authentication error from Emporia API
        if '401' in error_message or 'Unauthorized' in error_message or 'authentication' in error_message.lower():
            print("[Error] Detected Emporia API authentication failure, invalidating local auth state")
            authenticated = False
            credentials_username = None
            invalidate_device_cache()
            return jsonify({'error': 'Emporia API authentication expired', 'needsReauth': True}), 401
        
        # If historical fetch fails, return empty array
        return jsonify({'dataPoints': []})

@app.route('/api/emporia/devices/refresh', methods=['POST'])
@token_required
def refresh_devices():
    """Invalidate device cache and force refresh"""
    if not authenticated:
        return jsonify({'error': 'Not authenticated with Emporia Vue'}), 401
    
    try:
        invalidate_device_cache()
        devices = get_cached_devices()
        
        return jsonify({
            'success': True,
            'message': 'Device cache refreshed',
            'device_count': len(devices)
        })
    except Exception as e:
        return jsonify({'error': f'Failed to refresh devices: {str(e)}'}), 500

@app.route('/api/streams', methods=['GET'])
def get_stream_urls():
    """Public endpoint exposing utility stream URLs"""
    return jsonify({
        'gas': build_stream_info('gas', GAS_RTSP_URL),
        'water': build_stream_info('water', WATER_RTSP_URL)
    })


@app.route('/api/streams/<stream_name>/mjpeg', methods=['GET'])
def mjpeg_stream(stream_name: str):
    """MJPEG proxy for configured RTSP streams"""
    if stream_name not in {'gas', 'water'}:
        abort(404, description='Unknown stream')
    url = GAS_RTSP_URL if stream_name == 'gas' else WATER_RTSP_URL
    return stream_rtsp_as_mjpeg(url)

@app.route('/', methods=['GET'])
def root():
    """Combined server status, configuration, and health details."""
    stored_username, stored_password = _get_configured_credentials()
    has_stored_credentials = bool(stored_username and stored_password)

    now = datetime.datetime.now(datetime.UTC)

    token = None
    if authenticated and credentials_username:
        token = jwt.encode({
            'username': credentials_username,
            'exp': now + datetime.timedelta(hours=24)
        }, SECRET_KEY, algorithm='HS256')

    config_payload = {
        'electricityRate': ELECTRICITY_RATE,
        'systemName': SYSTEM_NAME,
        'gasStreamUrl': GAS_RTSP_URL or None,
        'waterStreamUrl': WATER_RTSP_URL or None,
        'gasStream': build_stream_info('gas', GAS_RTSP_URL),
        'waterStream': build_stream_info('water', WATER_RTSP_URL)
    }

    return jsonify({
        'status': 'up',
        'timestamp': now.isoformat(),
        'restreamAvailable': restream_available(),
        'authenticated': authenticated,
        'username': credentials_username if authenticated else stored_username,
        'token': token,
        'hasStoredCredentials': has_stored_credentials,
        'config': config_payload,
        'health': {
            'status': 'healthy',
            'timestamp': now.isoformat(),
            'authenticated': authenticated
        }
    })

if __name__ == '__main__':
    # Read host and port from environment variables
    host = _get_config_value('BACKEND_HOST', '0.0.0.0') or '0.0.0.0'
    port = int(_get_config_value('BACKEND_PORT', '5001') or '5001')
    debug = (_get_config_value('BACKEND_DEBUG', 'true') or 'true').lower() == 'true'
    
    print("=" * 60)
    print("Energy Monitor Backend Server")
    print("=" * 60)
    print(f"Server starting on http://{host}:{port}")
    print(f"System Name: {SYSTEM_NAME}")
    print(f"Electricity Rate: ${ELECTRICITY_RATE:.6f} per kWh")
    print(f"Device Cache TTL: {DEVICE_CACHE_TTL} seconds")
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

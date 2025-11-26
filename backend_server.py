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
    You can store your Emporia credentials in a .creds.json file:
    {
        "username": "your-emporia-username@example.com",
        "password": "your-emporia-password"
    }
    
    Copy .creds.json.example to .creds.json and update with your credentials.
    The server will auto-authenticate on startup if .creds.json is present.

Usage:
    python backend_server.py
    
    Or with custom configuration:
    BACKEND_PORT=8000 SECRET_KEY=my-secret python backend_server.py

API Endpoints:
    POST   /api/auth/login          - Authenticate with Emporia Vue
    POST   /api/auth/reauthenticate - Re-authenticate using stored credentials
    POST   /api/auth/connect-stored - Connect using stored credentials (for login screen)
    GET    /api/devices             - Get list of devices
    POST   /api/devices/refresh     - Force refresh device cache
    GET    /api/energy/realtime     - Get current energy data
    GET    /api/energy/history      - Get historical energy data
"""

from flask import Flask, request, jsonify
from flask_cors import CORS
from pyemvue import PyEmVue
from pyemvue.enums import Scale, Unit
import jwt
import datetime
import os
from functools import wraps
import json

app = Flask(__name__)
CORS(app)  # Enable CORS for React frontend

# Configuration
SECRET_KEY = os.environ.get('SECRET_KEY', 'your-secret-key-change-this-in-production')
ELECTRICITY_RATE = float(os.environ.get('ELECTRICITY_RATE', '0.314555'))
SYSTEM_NAME = os.environ.get('SYSTEM_NAME', 'Home')
DEVICE_CACHE_TTL = int(os.environ.get('DEVICE_CACHE_TTL', '300'))  # Cache TTL in seconds (default: 5 minutes)
VERBOSE_LOGGING = os.environ.get('VERBOSE_LOGGING', 'false').lower() == 'true'  # Enable verbose device usage logging
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

# Load credentials from .creds.json if it exists
def load_credentials():
    """Load credentials from .creds.json file if it exists"""
    creds_file = '.creds.json'
    if os.path.exists(creds_file):
        try:
            with open(creds_file, 'r') as f:
                creds = json.load(f)
                username = creds.get('username')
                password = creds.get('password')
                
                if username and password:
                    print(f"[Credentials] Found .creds.json file")
                    return username, password
                else:
                    print(f"[Credentials] .creds.json file exists but missing username or password")
        except json.JSONDecodeError as e:
            print(f"[Credentials] Error parsing .creds.json: {e}")
        except Exception as e:
            print(f"[Credentials] Error reading .creds.json: {e}")
    return None, None

# Auto-authenticate on startup if credentials are available
def auto_authenticate():
    """Automatically authenticate with Emporia Vue if credentials are in .creds.json"""
    global authenticated, credentials_username
    
    username, password = load_credentials()
    if username and password:
        try:
            print(f"[Credentials] Attempting auto-authentication for {username}...")
            log_emporia_request('vue.login', username=username, password=password)
            response = vue.login(username=username, password=password)
            log_emporia_response_full_json('vue.login', response)
            
            # Only set authenticated if login returned True
            if response:
                authenticated = True
                credentials_username = username
                print(f"[Credentials] ✓ Auto-authentication successful for {username}")
            else:
                authenticated = False
                credentials_username = None
                print(f"[Credentials] ✗ Auto-authentication failed: Invalid credentials")
        except Exception as e:
            authenticated = False
            credentials_username = None
            print(f"[Credentials] ✗ Auto-authentication failed: {str(e)}")
    else:
        print(f"[Credentials] No .creds.json file found - manual login required")

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

@app.route('/api/auth/login', methods=['POST'])
def login():
    """Authenticate with Emporia Vue credentials"""
    global authenticated, credentials_username
    
    data = request.json
    username = data.get('username')
    password = data.get('password')
    
    if not username or not password:
        return jsonify({
            'success': False,
            'message': 'Username and password are required'
        }), 400
    
    try:
        # Authenticate with Emporia Vue
        log_emporia_request('vue.login', username=username, password=password)
        response = vue.login(username=username, password=password)
        log_emporia_response_full_json('vue.login', response)
        
        # Only set authenticated if login returned True
        if response:
            authenticated = True
            credentials_username = username
            
            # Generate JWT token
            token = jwt.encode({
                'username': username,
                'exp': datetime.datetime.now(datetime.UTC) + datetime.timedelta(hours=24)
            }, SECRET_KEY, algorithm='HS256')
            
            return jsonify({
                'success': True,
                'token': token,
                'message': 'Login successful'
            })
        else:
            authenticated = False
            credentials_username = None
            return jsonify({
                'success': False,
                'message': 'Authentication failed: Invalid credentials'
            }), 401
        
    except Exception as e:
        authenticated = False
        credentials_username = None
        return jsonify({
            'success': False,
            'message': f'Authentication failed: {str(e)}'
        }), 401

@app.route('/api/auth/reauthenticate', methods=['POST'])
def reauthenticate():
    """Re-authenticate using stored credentials from .creds.json"""
    global authenticated, credentials_username
    
    print("[Re-Auth] Re-authentication requested")
    
    username, password = load_credentials()
    
    if not username or not password:
        print("[Re-Auth] ✗ No stored credentials available")
        return jsonify({
            'success': False,
            'message': 'No stored credentials available for re-authentication'
        }), 401
    
    try:
        print(f"[Re-Auth] Attempting to re-authenticate with Emporia API for {username}...")
        log_emporia_request('vue.login', username=username, password=password)
        response = vue.login(username=username, password=password)
        log_emporia_response_full_json('vue.login', response)
        
        if response:
            authenticated = True
            credentials_username = username
            
            # Invalidate device cache after re-authentication
            invalidate_device_cache()
            
            # Generate new JWT token
            token = jwt.encode({
                'username': username,
                'exp': datetime.datetime.now(datetime.UTC) + datetime.timedelta(hours=24)
            }, SECRET_KEY, algorithm='HS256')
            
            print(f"[Re-Auth] ✓ Re-authentication successful for {username}")
            
            return jsonify({
                'success': True,
                'token': token,
                'message': 'Re-authentication successful'
            })
        else:
            authenticated = False
            credentials_username = None
            print("[Re-Auth] ✗ Re-authentication failed: Invalid credentials")
            return jsonify({
                'success': False,
                'message': 'Re-authentication failed: Invalid credentials'
            }), 401
        
    except Exception as e:
        authenticated = False
        credentials_username = None
        print(f"[Re-Auth] ✗ Re-authentication failed: {str(e)}")
        return jsonify({
            'success': False,
            'message': f'Re-authentication failed: {str(e)}'
        }), 401

@app.route('/api/auth/connect-stored', methods=['POST'])
def connect_with_stored():
    """Connect using stored credentials from .creds.json (for login screen)"""
    global authenticated, credentials_username
    
    print("[Connect-Stored] Connection with stored credentials requested")
    
    username, password = load_credentials()
    
    if not username or not password:
        print("[Connect-Stored] ✗ No stored credentials available")
        return jsonify({
            'success': False,
            'message': 'No stored credentials available'
        }), 401
    
    try:
        print(f"[Connect-Stored] Attempting to connect with stored credentials for {username}...")
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
            
            print(f"[Connect-Stored] ✓ Connection successful for {username}")
            
            return jsonify({
                'success': True,
                'token': token,
                'message': 'Connected successfully with stored credentials'
            })
        else:
            authenticated = False
            credentials_username = None
            print("[Connect-Stored] ✗ Connection failed: Invalid credentials")
            return jsonify({
                'success': False,
                'message': 'Connection failed: Invalid credentials in .creds.json'
            }), 401
        
    except Exception as e:
        authenticated = False
        credentials_username = None
        print(f"[Connect-Stored] ✗ Connection failed: {str(e)}")
        return jsonify({
            'success': False,
            'message': f'Connection failed: {str(e)}'
        }), 401

@app.route('/api/devices', methods=['GET'])
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

@app.route('/api/energy/realtime', methods=['GET'])
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

@app.route('/api/energy/history', methods=['GET'])
@token_required
def get_history():
    """Get historical energy data"""
    global authenticated, credentials_username
    
    if not authenticated:
        return jsonify({'error': 'Not authenticated with Emporia Vue'}), 401
    
    time_range = request.args.get('range', '1 Min')
    
    # Map frontend ranges to seconds
    range_map = {
        '1 Min': 60,
        '5 Min': 300,
        '15 Min': 900,
        '1 Hour': 3600
    }
    
    seconds = range_map.get(time_range, 60)
    
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

@app.route('/api/devices/refresh', methods=['POST'])
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

@app.route('/api/config', methods=['GET'])
@token_required
def get_config():
    """Get configuration variables (electricity rate, system name, etc.)"""
    return jsonify({
        'electricityRate': ELECTRICITY_RATE,
        'systemName': SYSTEM_NAME
    })

@app.route('/', methods=['GET'])
def root():
    """Root endpoint - server status"""
    token = None
    if authenticated and credentials_username:
        token = jwt.encode({
            'username': credentials_username,
            'exp': datetime.datetime.now(datetime.UTC) + datetime.timedelta(hours=24)
        }, SECRET_KEY, algorithm='HS256')
    
    username, password = load_credentials()
    has_stored_credentials = bool(username and password)
    
    return jsonify({
        'message': 'Energy Monitor Backend Server is running',
        'status': 'up',
        'authenticated': authenticated,
        'username': credentials_username if authenticated else None,
        'token': token,
        'hasStoredCredentials': has_stored_credentials,
        'timestamp': datetime.datetime.now(datetime.UTC).isoformat()
    })

@app.route('/health', methods=['GET'])
def health():
    """Health check endpoint"""
    return jsonify({
        'status': 'healthy',
        'authenticated': authenticated,
        'username': credentials_username if authenticated else None,
        'timestamp': datetime.datetime.now(datetime.UTC).isoformat()
    })

if __name__ == '__main__':
    # Read host and port from environment variables
    host = os.environ.get('BACKEND_HOST', '0.0.0.0')
    port = int(os.environ.get('BACKEND_PORT', '5001'))
    debug = os.environ.get('BACKEND_DEBUG', 'true').lower() == 'true'
    
    print("=" * 60)
    print("Energy Monitor Backend Server")
    print("=" * 60)
    print(f"Server starting on http://{host}:{port}")
    print(f"System Name: {SYSTEM_NAME}")
    print(f"Electricity Rate: ${ELECTRICITY_RATE:.6f} per kWh")
    print(f"Device Cache TTL: {DEVICE_CACHE_TTL} seconds")
    print(f"Verbose Logging: {'Enabled' if VERBOSE_LOGGING else 'Disabled'}")
    print("Endpoints:")
    print("  GET    /                        - Server status")
    print("  POST   /api/auth/login          - Authenticate with credentials")
    print("  POST   /api/auth/reauthenticate - Re-authenticate using stored credentials")
    print("  POST   /api/auth/connect-stored - Connect using stored credentials (for login screen)")
    print("  GET    /api/devices             - Get device list")
    print("  POST   /api/devices/refresh     - Force refresh device cache")
    print("  GET    /api/energy/realtime     - Get real-time energy data")
    print("  GET    /api/energy/history      - Get historical energy data")
    print("  GET    /api/config              - Get configuration (electricity rate, system name)")
    print("  GET    /health                  - Health check")
    print("=" * 60)
    print()
    
    app.run(host=host, port=port, debug=debug)

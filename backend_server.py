#!/usr/bin/env python3
"""
Example Python Backend Server for Energy Monitor Dashboard
Uses pyemvue library to fetch real energy data from Emporia Vue

Installation:
    pip install flask flask-cors pyemvue pyjwt

Configuration (Environment Variables):
    BACKEND_HOST    - Host to bind to (default: 0.0.0.0)
    BACKEND_PORT    - Port to listen on (default: 5001)
    BACKEND_DEBUG   - Enable debug mode (default: true)
    SECRET_KEY      - JWT secret key (default: 'your-secret-key-change-this-in-production')

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
    POST   /api/auth/login        - Authenticate with Emporia Vue
    GET    /api/devices           - Get list of devices
    GET    /api/energy/realtime   - Get current energy data
    GET    /api/energy/history    - Get historical energy data
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
vue = PyEmVue()
authenticated = False
credentials_username = None

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
            log_emporia_response('vue.login', response)
            
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

def log_emporia_response(method_name, response):
    """Log Emporia API responses"""
    try:
        # Try to format the response nicely
        if response is None:
            response_str = "None"
        elif isinstance(response, (list, dict)):
            response_str = json.dumps(response, indent=2, default=str)
        elif isinstance(response, str):
            response_str = response
        else:
            # For objects, try to get useful string representation
            response_str = str(response)
            # If it's a list of objects, show count and first few items
            if isinstance(response, list):
                response_str = f"List[{len(response)} items]: {[str(item) for item in response[:3]]}"
        
        print(f"[Emporia API] < RESPONSE {method_name}: {response_str}")
    except Exception as e:
        print(f"[Emporia API] < RESPONSE {method_name}: <unable to serialize: {str(e)}>")

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
        log_emporia_response('vue.login', response)
        
        # Only set authenticated if login returned True
        if response:
            authenticated = True
            credentials_username = username
            
            # Generate JWT token
            token = jwt.encode({
                'username': username,
                'exp': datetime.datetime.utcnow() + datetime.timedelta(hours=24)
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

@app.route('/api/devices', methods=['GET'])
@token_required
def get_devices():
    """Get list of all devices"""
    if not authenticated:
        return jsonify({'error': 'Not authenticated with Emporia Vue'}), 401
    
    try:
        log_emporia_request('vue.get_devices')
        devices = vue.get_devices()
        log_emporia_response('vue.get_devices', devices)
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
        return jsonify({'error': f'Failed to get devices: {str(e)}'}), 500

@app.route('/api/energy/realtime', methods=['GET'])
@token_required
def get_realtime():
    """Get real-time energy consumption data"""
    if not authenticated:
        return jsonify({'error': 'Not authenticated with Emporia Vue'}), 401
    
    try:
        # Get all devices
        log_emporia_request('vue.get_devices')
        devices = vue.get_devices()
        log_emporia_response('vue.get_devices', devices)
        device_gids = [d.device_gid for d in devices]
        
        # Fetch usage data for the last second
        instant = datetime.datetime.utcnow()
        log_emporia_request('vue.get_device_list_usage', 
                          deviceGids=device_gids,
                          instant=instant.isoformat(),
                          scale=Scale.SECOND.value,
                          unit=Unit.KWH.value)
        usage_dict = vue.get_device_list_usage(
            deviceGids=device_gids,
            instant=instant,
            scale=Scale.SECOND.value,
            unit=Unit.KWH.value
        )
        log_emporia_response('vue.get_device_list_usage', usage_dict)
        
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
                        if channel_usage and hasattr(channel_usage, 'usage'):
                            channel_watts = (channel_usage.usage or 0) * 1000
                            devices_data[f"{gid}-{channel_num}"] = round(channel_watts, 2)
        
        return jsonify({
            'timestamp': int(datetime.datetime.utcnow().timestamp() * 1000),
            'total': round(total_watts, 2),
            'devices': devices_data
        })
        
    except Exception as e:
        return jsonify({'error': f'Failed to get real-time data: {str(e)}'}), 500

@app.route('/api/energy/history', methods=['GET'])
@token_required
def get_history():
    """Get historical energy data"""
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
        log_emporia_request('vue.get_devices')
        devices = vue.get_devices()
        log_emporia_response('vue.get_devices', devices)
        device_gids = [d.device_gid for d in devices]
        
        # Generate data points for the requested time range
        data_points = []
        now = datetime.datetime.utcnow()
        
        # For simplicity, fetch recent usage and extrapolate
        # In production, you'd want to use vue.get_chart_usage() for actual historical data
        for i in range(seconds, 0, -1):
            timestamp = now - datetime.timedelta(seconds=i)
            
            log_emporia_request('vue.get_device_list_usage',
                              deviceGids=device_gids,
                              instant=timestamp.isoformat(),
                              scale=Scale.SECOND.value,
                              unit=Unit.KWH.value)
            usage_dict = vue.get_device_list_usage(
                deviceGids=device_gids,
                instant=timestamp,
                scale=Scale.SECOND.value,
                unit=Unit.KWH.value
            )
            log_emporia_response('vue.get_device_list_usage', usage_dict)
            
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
        # If historical fetch fails, return empty array
        return jsonify({'dataPoints': []})

@app.route('/', methods=['GET'])
def root():
    """Root endpoint - server status"""
    return jsonify({
        'message': 'Energy Monitor Backend Server is running',
        'status': 'up',
        'authenticated': authenticated,
        'username': credentials_username if authenticated else None,
        'timestamp': datetime.datetime.utcnow().isoformat()
    })

@app.route('/health', methods=['GET'])
def health():
    """Health check endpoint"""
    return jsonify({
        'status': 'healthy',
        'authenticated': authenticated,
        'username': credentials_username if authenticated else None,
        'timestamp': datetime.datetime.utcnow().isoformat()
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
    print("Endpoints:")
    print("  GET    /                      - Server status")
    print("  POST   /api/auth/login        - Authenticate with credentials")
    print("  GET    /api/devices           - Get device list")
    print("  GET    /api/energy/realtime   - Get real-time energy data")
    print("  GET    /api/energy/history    - Get historical energy data")
    print("  GET    /health                - Health check")
    print("=" * 60)
    print()
    
    # Auto-authenticate if credentials are available
    auto_authenticate()
    print()
    
    app.run(host=host, port=port, debug=debug)

#!/usr/bin/env python3
"""
Example Python Backend Server for Energy Monitor Dashboard
Uses pyemvue library to fetch real energy data from Emporia Vue

Installation:
    pip install flask flask-cors pyemvue pyjwt

Configuration (Environment Variables):
    BACKEND_HOST    - Host to bind to (default: 0.0.0.0)
    BACKEND_PORT    - Port to listen on (default: 5000)
    BACKEND_DEBUG   - Enable debug mode (default: true)
    SECRET_KEY      - JWT secret key (default: 'your-secret-key-change-this-in-production')

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

app = Flask(__name__)
CORS(app)  # Enable CORS for React frontend

# Configuration
SECRET_KEY = os.environ.get('SECRET_KEY', 'your-secret-key-change-this-in-production')
vue = PyEmVue()
authenticated = False

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
    global authenticated
    
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
        vue.login(username=username, password=password)
        authenticated = True
        
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
        
    except Exception as e:
        authenticated = False
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
        devices = vue.get_devices()
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
        devices = vue.get_devices()
        device_gids = [d.device_gid for d in devices]
        
        # Fetch usage data for the last second
        usage_dict = vue.get_device_list_usage(
            deviceGids=device_gids,
            instant=datetime.datetime.utcnow(),
            scale=Scale.SECOND.value,
            unit=Unit.KWH.value
        )
        
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
        devices = vue.get_devices()
        device_gids = [d.device_gid for d in devices]
        
        # Generate data points for the requested time range
        data_points = []
        now = datetime.datetime.utcnow()
        
        # For simplicity, fetch recent usage and extrapolate
        # In production, you'd want to use vue.get_chart_usage() for actual historical data
        for i in range(seconds, 0, -1):
            timestamp = now - datetime.timedelta(seconds=i)
            
            usage_dict = vue.get_device_list_usage(
                deviceGids=device_gids,
                instant=timestamp,
                scale=Scale.SECOND.value,
                unit=Unit.KWH.value
            )
            
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

@app.route('/health', methods=['GET'])
def health():
    """Health check endpoint"""
    return jsonify({
        'status': 'healthy',
        'authenticated': authenticated,
        'timestamp': datetime.datetime.utcnow().isoformat()
    })

if __name__ == '__main__':
    # Read host and port from environment variables
    host = os.environ.get('BACKEND_HOST', '0.0.0.0')
    port = int(os.environ.get('BACKEND_PORT', '5000'))
    debug = os.environ.get('BACKEND_DEBUG', 'true').lower() == 'true'
    
    print("=" * 60)
    print("Energy Monitor Backend Server")
    print("=" * 60)
    print(f"Server starting on http://{host}:{port}")
    print("Endpoints:")
    print("  POST   /api/auth/login")
    print("  GET    /api/devices")
    print("  GET    /api/energy/realtime")
    print("  GET    /api/energy/history")
    print("  GET    /health")
    print("=" * 60)
    print()
    
    app.run(host=host, port=port, debug=debug)

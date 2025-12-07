# Backend Integration Guide

## Overview
This React app needs to connect to a Python backend server that uses the `pyemvue` library to fetch real energy data from Emporia Vue.

## Architecture

```
[React Frontend] <--HTTP--> [Python Backend Server] <--pyemvue--> [Emporia Vue API]
```

## Required Python Backend API Endpoints

Your Python server should expose these REST API endpoints:

### 1. Authentication Endpoint
```
POST /api/auth/login
Body: { "username": "string", "password": "string" }
Response: { "success": boolean, "token": "string", "message": "string" }
```

### 2. Get Devices Endpoint
```
GET /api/devices
Headers: { "Authorization": "Bearer {token}" }
Response: {
  "devices": [
    {
      "id": "string",
      "name": "string",
      "category": "string",
      "status": "active" | "idle" | "offline"
    }
  ]
}
```

### 3. Get Real-Time Energy Data
```
GET /api/energy/realtime
Headers: { "Authorization": "Bearer {token}" }
Response: {
  "timestamp": number,
  "total": number,
  "devices": {
    "device-id": number (watts)
  }
}
```

### 4. Get Historical Energy Data
```
GET /api/energy/history?range=1m|5m|15m|1h
Headers: { "Authorization": "Bearer {token}" }
Response: {
  "dataPoints": [
    {
      "timestamp": number,
      "total": number,
      "devices": { "device-id": number }
    }
  ]
}
```

## Example Python Backend (Flask)

```python
from flask import Flask, request, jsonify
from flask_cors import CORS
from pyemvue import PyEmVue
from pyemvue.enums import Scale, Unit
import jwt
import datetime

app = Flask(__name__)
CORS(app)  # Enable CORS for React app

vue = PyEmVue()
SECRET_KEY = "your-secret-key"  # Change this!

@app.route('/api/auth/login', methods=['POST'])
def login():
    data = request.json
    username = data.get('username')
    password = data.get('password')
    
    try:
        vue.login(username=username, password=password)
        token = jwt.encode({
            'username': username,
            'exp': datetime.datetime.utcnow() + datetime.timedelta(hours=24)
        }, SECRET_KEY)
        
        return jsonify({
            'success': True,
            'token': token,
            'message': 'Login successful'
        })
    except Exception as e:
        return jsonify({
            'success': False,
            'message': str(e)
        }), 401

@app.route('/api/devices', methods=['GET'])
def get_devices():
    # Verify token here
    try:
        devices = vue.get_devices()
        device_list = []
        for device in devices:
            device_list.append({
                'id': str(device.device_gid),
                'name': device.device_name,
                'category': 'Unknown',
                'status': 'active'
            })
        return jsonify({'devices': device_list})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/energy/realtime', methods=['GET'])
def get_realtime():
    try:
        device_usage = vue.get_device_list_usage(
            deviceGids=[d.device_gid for d in vue.get_devices()],
            instant=datetime.datetime.utcnow(),
            scale=Scale.SECOND.value,
            unit=Unit.KWH.value
        )
        
        devices = {}
        total = 0
        for gid, usage in device_usage.items():
            watts = usage * 1000  # Convert kWh to watts
            devices[str(gid)] = watts
            total += watts
            
        return jsonify({
            'timestamp': int(datetime.datetime.utcnow().timestamp() * 1000),
            'total': total,
            'devices': devices
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    host = os.environ.get('BACKEND_HOST', '0.0.0.0')
    port = int(os.environ.get('BACKEND_PORT', '5000'))
    debug = os.environ.get('BACKEND_DEBUG', 'true').lower() == 'true'
    app.run(host=host, port=port, debug=debug)
```

## Configuration

### Frontend Configuration

Create a `.env.local` file and set the `VITE_API_URL` environment variable to point to your Python backend:

```bash
# .env.local
VITE_API_URL=http://localhost:5000
```

### Backend Configuration

The Python backend server can be configured using environment variables:

```bash
# Backend server settings
BACKEND_HOST=0.0.0.0          # Host to bind to (default: 0.0.0.0)
BACKEND_PORT=5000             # Port to listen on (default: 5000)
BACKEND_DEBUG=true            # Enable debug mode (default: true)
SECRET_KEY=your-secret-key    # JWT secret key (change in production!)
```

You can set these in your shell before running the server:

```bash
export BACKEND_PORT=8000
export SECRET_KEY=my-super-secret-key
python backend_server.py
```

Or use a `.env` file with a tool like `python-dotenv` (not included by default).

## Running Both Servers

1. **Start Python Backend:**
   ```bash
   python backend_server.py
   ```
   
   The server will read configuration from environment variables or use defaults.

2. **Start React Frontend:**
   ```bash
   npm run dev
   ```
   
   The frontend will read `VITE_API_URL` from `.env.local`.

## Security Notes

1. **Never commit credentials** - Use environment variables
2. **Use HTTPS in production** - Encrypt data in transit
3. **Implement proper authentication** - Use JWT or session tokens
4. **Add rate limiting** - Protect against abuse
5. **Validate all inputs** - Prevent injection attacks
6. **CORS configuration** - Only allow your frontend domain

## Testing the Connection

Use the login form in the app to authenticate, then the dashboard will automatically fetch real data from your Python backend instead of using simulated data.

## Performance Optimizations

### Device Caching

The backend server implements device caching to reduce API calls to the Emporia service:

- **Initial Fetch**: Devices are fetched from the Emporia API once during login. Cache refreshes occur when explicitly requested.
- **Cached Usage**: All subsequent requests to `/api/devices`, `/api/energy/realtime`, and `/api/energy/history` use the cached device list
- **Manual Refresh**: If you add/remove devices in your Emporia account, you can refresh the cache by calling:
  ```
  POST /api/devices/refresh
  Headers: { "Authorization": "Bearer {token}" }
  ```

This optimization significantly reduces the number of API calls to Emporia's servers, improving response times and reducing load.

# System Configuration

## Overview
The backend server supports configurable system settings through environment variables. This allows users to customize the system name (e.g., "Home", "Office", "Lake House") and electricity rate for their specific deployment.

## Configuration

### Environment Variables

#### SYSTEM_NAME
- **Name**: `SYSTEM_NAME`
- **Description**: The name of the system/house being monitored
- **Default Value**: `Home`
- **Format**: String (e.g., "Home", "Office", "Lake House")

#### ELECTRICITY_RATE
- **Name**: `ELECTRICITY_RATE`
- **Description**: The rate of electricity in your local currency per kilowatt-hour (kWh)
- **Default Value**: `0.314555`
- **Format**: Decimal number (e.g., 0.314555 means $0.314555 per kWh)

### Files Created/Modified

1. **`.env.local`** (Created)
   - Contains all backend server configuration including the new `ELECTRICITY_RATE` variable
   - This file is gitignored and should be customized per deployment

2. **`.env.local.example`** (Created)
   - Template file showing all available configuration options
   - Users should copy this to `.env.local` and customize values
   - Safe to commit to git (contains no secrets)

3. **`backend_server.py`** (Modified)
   - Reads `ELECTRICITY_RATE` and `SYSTEM_NAME` from environment variables
   - New endpoint: `GET /api/config` - Returns server configuration including electricity rate and system name
   - Root endpoint (`/`) now includes configuration in status response
   - Server startup message displays the configured values

4. **`BACKEND_INTEGRATION.md`** (Modified)
   - Updated documentation to include the new configuration variable
   - Added the new `/api/config` endpoint to API documentation
   - Expanded backend configuration section with examples

## Usage

### Setting Configuration Values

**Option 1: Using .env.local file (Recommended)**
```bash
# Copy the example file
cp .env.example .env.local

# Edit .env.local and set your values
SYSTEM_NAME=Lake House
ELECTRICITY_RATE=0.15
```

**Option 2: Environment Variables**
```bash
export SYSTEM_NAME="Lake House"
export ELECTRICITY_RATE=0.15
python backend_server.py
```

**Option 3: Inline with Command**
```bash
SYSTEM_NAME="Lake House" ELECTRICITY_RATE=0.15 python backend_server.py
```

### Accessing Configuration from Frontend

The configuration can be fetched from the backend via:

```javascript
// GET /api/config (requires authentication)
const response = await fetch('http://localhost:5001/api/config', {
  headers: {
    'Authorization': `Bearer ${token}`
  }
})
const config = await response.json()
console.log(config.systemName)        // "Home" or your custom name
console.log(config.electricityRate)   // 0.314555 or your custom rate
```

## Future Enhancements

With this configuration in place, you can now:
1. Display the system/house name in the dashboard header
2. Calculate real-time energy costs by multiplying watts × time × rate
3. Display cost information alongside power consumption
4. Set budget alerts based on spending
5. Track daily/monthly energy costs
6. Compare costs across different time periods
7. Manage multiple systems/locations with different names and rates

## Security Note

The `.env.local` file is automatically gitignored (via the `*.local` pattern in `.gitignore`) to prevent accidentally committing sensitive configuration or credentials.

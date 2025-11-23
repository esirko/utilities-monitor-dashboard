# Electricity Rate Configuration

## Overview
The backend server now supports a configurable electricity rate through environment variables. This allows users to set their local electricity rate and potentially calculate energy costs.

## Configuration

### Environment Variable
- **Name**: `ELECTRICITY_RATE`
- **Description**: The rate of electricity in your local currency per kilowatt-hour (kWh)
- **Default Value**: `0.3243`
- **Format**: Decimal number (e.g., 0.3243 means $0.3243 per kWh)

### Files Created/Modified

1. **`.env.local`** (Created)
   - Contains all backend server configuration including the new `ELECTRICITY_RATE` variable
   - This file is gitignored and should be customized per deployment

2. **`.env.local.example`** (Created)
   - Template file showing all available configuration options
   - Users should copy this to `.env.local` and customize values
   - Safe to commit to git (contains no secrets)

3. **`backend_server.py`** (Modified)
   - Reads `ELECTRICITY_RATE` from environment variables with default of 0.3243
   - New endpoint: `GET /api/config` - Returns server configuration including electricity rate
   - Root endpoint (`/`) now includes electricity rate in status response
   - Server startup message displays the configured electricity rate

4. **`BACKEND_INTEGRATION.md`** (Modified)
   - Updated documentation to include the new configuration variable
   - Added the new `/api/config` endpoint to API documentation
   - Expanded backend configuration section with examples

## Usage

### Setting the Electricity Rate

**Option 1: Using .env.local file (Recommended)**
```bash
# Copy the example file
cp .env.local.example .env.local

# Edit .env.local and set your rate
ELECTRICITY_RATE=0.15
```

**Option 2: Environment Variable**
```bash
export ELECTRICITY_RATE=0.15
python backend_server.py
```

**Option 3: Inline with Command**
```bash
ELECTRICITY_RATE=0.15 python backend_server.py
```

### Accessing the Rate from Frontend

The electricity rate can be fetched from the backend via:

```javascript
// GET /api/config (requires authentication)
const response = await fetch('http://localhost:5001/api/config', {
  headers: {
    'Authorization': `Bearer ${token}`
  }
})
const config = await response.json()
console.log(config.electricityRate) // 0.3243
```

Or from the public root endpoint:
```javascript
// GET / (no authentication required)
const response = await fetch('http://localhost:5001/')
const status = await response.json()
console.log(status.electricityRate) // 0.3243
```

## Future Enhancements

With this configuration in place, you can now:
1. Calculate real-time energy costs by multiplying watts × time × rate
2. Display cost information alongside power consumption
3. Set budget alerts based on spending
4. Track daily/monthly energy costs
5. Compare costs across different time periods

## Security Note

The `.env.local` file is automatically gitignored (via the `*.local` pattern in `.gitignore`) to prevent accidentally committing sensitive configuration or credentials.

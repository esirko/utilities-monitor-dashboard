# Quick Start Guide

## Step 1: Install Dependencies

### Frontend (Node.js)
```bash
npm install
```

### Backend (Python)

First, create and activate a virtual environment to keep dependencies scoped to this project:

**On macOS/Linux:**
```bash
python3 -m venv venv
source venv/bin/activate
```

**On Windows:**
```bash
python -m venv venv
venv\Scripts\activate
```

Then install the required packages:
```bash
pip install -r requirements.txt
```

> **Note:** You'll need to activate the virtual environment (using the `source` or `venv\Scripts\activate` command) each time you open a new terminal before running the backend server.

## Step 2: Configure Environment

### Option A: Using .creds.json (Recommended for Simplicity)

Store your Emporia Vue credentials in a `.creds.json` file:

```bash
cp .creds.json.example .creds.json
```

Edit `.creds.json` with your credentials:
```json
{
  "username": "your-emporia-username@example.com",
  "password": "your-emporia-password"
}
```

The backend will automatically authenticate on startup if this file exists.

> **Note:** `.creds.json` is already in `.gitignore` - your credentials will not be committed to Git.

### Option B: Using .env.local

Create `.env.local` file:
```bash
cp .env.example .env.local
```

#### Frontend Configuration
The default configuration works for local development:
```env
VITE_API_URL=http://localhost:5000
```

#### Backend Configuration
You can customize the backend server by editing `.env.local`:
```env
BACKEND_HOST=0.0.0.0
BACKEND_PORT=5000
BACKEND_DEBUG=true
SECRET_KEY=your-secret-key-change-this-in-production
```

If you change `BACKEND_PORT`, make sure to update `VITE_API_URL` to match.

## Step 3: Start Backend Server

### If Using .creds.json

Simply start the backend server - it will auto-authenticate:
```bash
python backend_server.py
```

You should see:
```
============================================================
Energy Monitor Backend Server
============================================================
Server starting on http://0.0.0.0:5000
...
[Credentials] Found .creds.json file
[Credentials] Attempting auto-authentication for your-email@example.com...
[Credentials] ✓ Auto-authentication successful for your-email@example.com
```

### If Using .env.local (Environment Variables)

The backend server needs to load environment variables from `.env.local` before starting. Choose the option that works for your system:

#### Option A: Using export (macOS/Linux)

In terminal 1:
```bash
# Load environment variables from .env.local
export $(grep -v '^#' .env.local | xargs)

# Start the backend server
python backend_server.py
```

#### Option B: Using set (Windows Command Prompt)

In terminal 1:
```cmd
# Load environment variables from .env.local (one at a time)
for /f "tokens=*" %i in ('type .env.local ^| findstr /v "^#"') do set %i

# Start the backend server
python backend_server.py
```

#### Option C: Using PowerShell (Windows)

In terminal 1:
```powershell
# Load environment variables from .env.local
Get-Content .env.local | Where-Object {$_ -notmatch '^#'} | ForEach-Object {
    if ($_ -match '(.+?)=(.+)') {
        [System.Environment]::SetEnvironmentVariable($matches[1], $matches[2])
    }
}

# Start the backend server
python backend_server.py
```

#### Option D: Set variables inline (All platforms)

In terminal 1:
```bash
# macOS/Linux
BACKEND_PORT=5000 SECRET_KEY=your-secret python backend_server.py

# Windows (PowerShell)
$env:BACKEND_PORT="5000"; $env:SECRET_KEY="your-secret"; python backend_server.py

# Windows (Command Prompt)
set BACKEND_PORT=5000 && set SECRET_KEY=your-secret && python backend_server.py
```

### Without .creds.json

If no `.creds.json` file is found, you'll see:
```
[Credentials] No .creds.json file found - manual login required
```

You'll need to login through the web interface.

## Step 4: Start Frontend

In terminal 2:
```bash
npm run dev
```

You should see:
```
VITE v6.x.x  ready in xxx ms

  ➜  Local:   http://localhost:5173/
```

## Step 5: Open in Browser

Navigate to: **http://localhost:5173**

## Step 6: Login

### If Using .creds.json
The backend auto-authenticates, so you may already be logged in! Just check the frontend.

### If Manual Login Required
Enter your Emporia Vue credentials:
- **Username**: Your Emporia Vue account email
- **Password**: Your Emporia Vue account password

Click **"Connect to Emporia Vue"**

## Step 7: View Energy Data

Once authenticated, you'll see:
- Real-time total power usage
- Live updating graph
- Individual device/circuit breakdown
- Time range selector (1m, 5m, 15m, 1h)

## Testing Without Hardware

Don't have Emporia Vue? Use **Demo Mode**:
1. Click the login screen's Demo Mode button (if available), OR
2. After logging in, click "Live Data" button in header to toggle to "Demo Mode"
3. Explore with simulated data

## Troubleshooting

### "Failed to connect to server"
- Make sure backend is running on port 5000
- Check `VITE_API_URL` in `.env.local`
- Verify environment variables were loaded (see Step 3)

### "Login failed"
- Verify credentials work in Emporia Vue mobile app
- Check backend terminal for error messages

### "No data showing"
- Switch to Demo Mode to verify frontend works
- Check browser console (F12) for errors
- Verify backend shows successful requests

### Backend still using port 5000 when changed
- Make sure you loaded environment variables before starting the server
- Restart the backend server after changing `.env.local`
- Try Option D (inline variables) to explicitly set the port

## Next Steps

- Customize colors in `src/index.css`
- Modify update frequency in `src/lib/types.ts`
- Add custom device categorization
- Deploy to production (see BACKEND_INTEGRATION.md)

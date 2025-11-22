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

Create `.env.local` file:
```bash
cp .env.example .env.local
```

### Frontend Configuration
The default configuration works for local development:
```env
VITE_API_URL=http://localhost:5000
```

### Backend Configuration
You can customize the backend server by editing `.env.local`:
```env
BACKEND_HOST=0.0.0.0
BACKEND_PORT=5000
BACKEND_DEBUG=true
SECRET_KEY=your-secret-key-change-this-in-production
```

If you change `BACKEND_PORT`, make sure to update `VITE_API_URL` to match.

## Step 3: Load Environment Variables and Start Backend Server

The backend server needs to load environment variables from `.env.local` before starting. Choose the option that works for your system:

### Option A: Using export (macOS/Linux)

In terminal 1:
```bash
# Load environment variables from .env.local
export $(grep -v '^#' .env.local | xargs)

# Start the backend server
python backend_server.py
```

### Option B: Using set (Windows Command Prompt)

In terminal 1:
```cmd
# Load environment variables from .env.local (one at a time)
for /f "tokens=*" %i in ('type .env.local ^| findstr /v "^#"') do set %i

# Start the backend server
python backend_server.py
```

### Option C: Using PowerShell (Windows)

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

### Option D: Set variables inline (All platforms)

In terminal 1:
```bash
# macOS/Linux
BACKEND_PORT=5000 SECRET_KEY=your-secret python backend_server.py

# Windows (PowerShell)
$env:BACKEND_PORT="5000"; $env:SECRET_KEY="your-secret"; python backend_server.py

# Windows (Command Prompt)
set BACKEND_PORT=5000 && set SECRET_KEY=your-secret && python backend_server.py
```

You should see:
```
============================================================
Energy Monitor Backend Server
============================================================
Server starting on http://0.0.0.0:5000
....
```

> **Important:** If you change `BACKEND_PORT` or other environment variables in `.env.local`, you must reload them and restart the backend server for changes to take effect.

## Step 4: Start Frontend

**Important:** If you changed `BACKEND_PORT` in `.env.local`, make sure `VITE_API_URL` matches it. For example, if you set `BACKEND_PORT=5001`, then `VITE_API_URL` should be `http://localhost:5001`.

In terminal 2:
```bash
npm run dev
```

You should see:
```
VITE v6.x.x  ready in xxx ms

  ➜  Local:   http://localhost:5173/
```

> **Note:** Vite automatically loads environment variables from `.env.local` when starting. If you modify `.env.local` while the dev server is running, you must restart `npm run dev` for changes to take effect.

## Step 5: Open in Browser

Navigate to: **http://localhost:5173**

## Step 6: Login

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
- Make sure backend is running (check terminal 1 for backend server output)
- Verify `VITE_API_URL` in `.env.local` matches your `BACKEND_PORT`
- If you changed the port, restart both backend AND frontend (`npm run dev`)
- Check environment variables were loaded for backend (see Step 3)

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

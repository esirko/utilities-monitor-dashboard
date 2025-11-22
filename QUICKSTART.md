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

### Backend Configuration (Optional)
The backend server uses sensible defaults, but you can customize it with environment variables:
```bash
export BACKEND_HOST=0.0.0.0    # Default: 0.0.0.0
export BACKEND_PORT=5000       # Default: 5000
export BACKEND_DEBUG=true      # Default: true
export SECRET_KEY=your-secret  # Default: generic key (change in production!)
```

If you change `BACKEND_PORT`, make sure to update `VITE_API_URL` in `.env.local` to match.

## Step 3: Start Backend Server

In terminal 1:
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
```

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

### "Login failed"
- Verify credentials work in Emporia Vue mobile app
- Check backend terminal for error messages

### "No data showing"
- Switch to Demo Mode to verify frontend works
- Check browser console (F12) for errors
- Verify backend shows successful requests

## Next Steps

- Customize colors in `src/index.css`
- Modify update frequency in `src/lib/types.ts`
- Add custom device categorization
- Deploy to production (see BACKEND_INTEGRATION.md)

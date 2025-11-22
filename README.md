# ⚡ Energy Monitor Dashboard

Real-time energy monitoring dashboard that connects to your **Emporia Vue** energy monitoring system via the `pyemvue` Python library. Visualizes household energy consumption across multiple devices with live-updating graphs and detailed usage statistics.

## 🚀 Features

- **Real-time Energy Monitoring** - Live power consumption updates every second
- **Interactive Time-Series Charts** - View usage over 1 min, 5 min, 15 min, or 1 hour windows
- **Device Breakdown** - See individual device/circuit power consumption
- **Secure Authentication** - Login with your Emporia Vue credentials
- **Demo Mode** - Test the interface with simulated data before connecting to real hardware
- **Beautiful Dark Theme** - Electric blue aesthetic perfect for energy monitoring

## 🏗️ Architecture

```
[React Frontend] ←→ [Python Backend] ←→ [Emporia Vue API]
  (This Project)    (backend_server.py)    (pyemvue library)
```

The React frontend communicates with a Python backend server that handles authentication and data fetching from Emporia Vue using the `pyemvue` library.

## 📋 Prerequisites

- **Node.js 18+** (for frontend)
- **Python 3.8+** (for backend)
- **Emporia Vue Account** - You need an active Emporia Vue account with energy monitoring devices

## 🚀 Quick Start

### 1. Install Frontend Dependencies

```bash
npm install
```

### 2. Install Python Backend Dependencies

```bash
pip install -r requirements.txt
```

Or install manually:
```bash
pip install flask flask-cors pyemvue pyjwt
```

### 3. Configure Environment Variables

Create a `.env.local` file in the project root:

```bash
cp .env.example .env.local
```

Edit `.env.local`:
```env
VITE_API_URL=http://localhost:5173
```

### 4. Start the Python Backend Server

```bash
python backend_server.py
```

The backend will start on `http://localhost:5173`

### 5. Start the React Frontend

In a separate terminal:

```bash
npm run dev
```

The frontend will start on `http://localhost:5173`

### 6. Login with Your Emporia Vue Credentials

1. Open `http://localhost:5173` in your browser
2. Enter your Emporia Vue username and password
3. Click "Connect to Emporia Vue"
4. The dashboard will load with your real energy data!

## 🎮 Demo Mode

Don't have Emporia Vue hardware? No problem! The app includes a **Demo Mode** with simulated energy data so you can explore the interface:

- Click "Demo Mode" button in the header to switch between demo and live data
- Demo mode generates realistic energy consumption patterns
- Perfect for testing and development

## 📁 Project Structure

```
/workspaces/spark-template/
├── src/
│   ├── components/
│   │   ├── LoginForm.tsx          # Authentication UI
│   │   ├── EnergyChart.tsx        # Real-time energy graph
│   │   ├── DeviceList.tsx         # Device breakdown list
│   │   └── TotalUsage.tsx         # Total consumption display
│   ├── hooks/
│   │   ├── use-energy-data.ts     # Demo data hook
│   │   └── use-real-energy-data.ts # Real API data hook
│   ├── lib/
│   │   ├── api.ts                 # Backend API client
│   │   ├── energySimulator.ts     # Demo data generator
│   │   └── types.ts               # TypeScript types
│   └── App.tsx                    # Main application
├── backend_server.py              # Python Flask backend
├── requirements.txt               # Python dependencies
├── BACKEND_INTEGRATION.md         # Detailed integration guide
└── README.md                      # This file
```

## 🔌 Backend API Endpoints

The Python backend exposes these endpoints:

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/auth/login` | Authenticate with Emporia Vue |
| `GET` | `/api/devices` | Get list of devices |
| `GET` | `/api/energy/realtime` | Get current energy data |
| `GET` | `/api/energy/history` | Get historical energy data |
| `GET` | `/health` | Health check |

## 🔒 Security Notes

⚠️ **Important Security Considerations:**

1. **Never commit credentials** - Use environment variables or secure vaults
2. **Use HTTPS in production** - Encrypt data in transit
3. **Change the SECRET_KEY** - Set `SECRET_KEY` environment variable in production
4. **Implement rate limiting** - Protect against abuse
5. **CORS configuration** - Restrict to your frontend domain in production
6. **Token expiration** - Tokens expire after 24 hours

## 🐛 Troubleshooting

### Backend won't start
- Make sure Python 3.8+ is installed: `python --version`
- Install dependencies: `pip install -r requirements.txt`
- Check if port 5173 is available

### Login fails
- Verify your Emporia Vue credentials are correct
- Check that the backend server is running
- Look at backend console for error messages
- Try logging into the Emporia Vue mobile app to verify credentials

### No data showing
- Check browser console for errors (F12)
- Verify `VITE_API_URL` in `.env.local` matches backend address
- Switch to Demo Mode to verify frontend is working
- Check backend logs for API errors

### CORS errors
- Ensure backend is running on the correct port
- Verify `VITE_API_URL` doesn't have trailing slash
- Check browser console for exact CORS error message

## 📚 Documentation

- **[BACKEND_INTEGRATION.md](./BACKEND_INTEGRATION.md)** - Detailed integration guide with examples
- **[PRD.md](./PRD.md)** - Product requirements and design specifications
- **[pyemvue Documentation](https://github.com/magico13/PyEmVue)** - Python library docs

## 🎨 Customization

### Change Colors
Edit `src/index.css` to modify the theme:
- Primary color (Electric Blue) - `--primary`
- Accent color (Voltage Yellow) - `--accent`
- Background colors - `--background`, `--card`

### Adjust Update Frequency
Modify `src/lib/types.ts` to change the update intervals:
```typescript
export const TIME_RANGES = {
  '1m': { label: '1 Min', seconds: 60, updateInterval: 1000 }, // 1 second
  // ...
}
```

### Add New Devices
The backend automatically discovers all devices from your Emporia Vue account. No configuration needed!

## 📄 License

The Spark Template files and resources from GitHub are licensed under the terms of the MIT license, Copyright GitHub, Inc.

## 💡 Need Help?

- Check the [BACKEND_INTEGRATION.md](./BACKEND_INTEGRATION.md) for detailed setup instructions
- Review the [pyemvue GitHub repo](https://github.com/magico13/PyEmVue) for library-specific issues
- Open an issue if you encounter problems

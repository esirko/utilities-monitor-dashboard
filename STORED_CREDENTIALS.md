# Stored Credentials Feature

## Overview
The application supports detecting and using stored credentials defined via environment variables (e.g., in `.env`) on the login screen.

## Backend Changes

### 1. Root Endpoint Enhancement
The root endpoint (`GET /`) now returns a `hasStoredCredentials` field that indicates whether the backend has valid credentials configured via environment variables:

```json
{
  "message": "Energy Monitor Backend Server is running",
  "status": "up",
  "authenticated": true,
  "username": "user@example.com",
  "token": "jwt-token-here",
  "hasStoredCredentials": true,
  "timestamp": "2024-01-01T00:00:00.000000"
}
```

### 2. New Connect-Stored Endpoint
Added `POST /api/auth/connect-stored` endpoint that allows the frontend to authenticate using stored credentials from the login screen:

- **Endpoint**: `POST /api/auth/connect-stored`
- **Purpose**: Connect using credentials stored in environment variables
- **Response**: Returns a JWT token on successful authentication
- **Use Case**: Displayed as a button on the login screen when `hasStoredCredentials` is `true`

```json
{
  "success": true,
  "token": "jwt-token-here",
  "message": "Connected successfully with stored credentials"
}
```

## Frontend Behavior

### Login Screen Flow

1. **On Load**: The login screen calls `api.checkBackendAuth()` which queries `GET /`
2. **Detection**: If `hasStoredCredentials` is `true`, displays "Connect with Stored Credentials" button
3. **User Action**: User can click the button to authenticate without entering credentials
4. **Authentication**: Frontend calls `POST /api/auth/connect-stored` and receives a JWT token
5. **Success**: User is logged in and redirected to the dashboard

### Visual Layout

When stored credentials are available:
```
┌─────────────────────────────────────┐
│  [Connect with Stored Credentials]  │
│                                      │
│  ──── Or enter new credentials ────  │
│                                      │
│  Username: [________________]        │
│  Password: [________________]        │
│                                      │
│  [Connect to Emporia Vue]            │
│                                      │
│  ──────────── Or ────────────────   │
│                                      │
│  [View Demo]                         │
└─────────────────────────────────────┘
```

When no stored credentials:
```
┌─────────────────────────────────────┐
│  Username: [________________]        │
│  Password: [________________]        │
│                                      │
│  [Connect to Emporia Vue]            │
│                                      │
│  ──────────── Or ────────────────   │
│                                      │
│  [View Demo]                         │
└─────────────────────────────────────┘
```

## Implementation Details

### Backend Functions
- `_get_configured_credentials()`: Helper to read credentials from environment variables
- `connect_with_stored()`: Endpoint handler for login screen connection

### Frontend Components
- `LoginForm.tsx`: Handles UI and user interaction
- `api.ts`: Contains `checkBackendAuth()` and `connectWithStoredCredentials()` methods

## Security Notes
- Credentials are never exposed to the frontend
- JWT tokens are used for all authenticated requests
- Store `EMPORIA_USERNAME` and `EMPORIA_PASSWORD` securely (e.g., in `.env`, a secrets manager, or host environment variables)
- All authentication happens server-side with the Emporia API

## Testing

To test this feature:

1. Ensure `EMPORIA_USERNAME` and `EMPORIA_PASSWORD` are set (for example, via `.env`).

2. Start the backend server:
   ```bash
   python backend_server.py
   ```

3. Start the frontend:
   ```bash
   npm run dev
   ```

4. Navigate to the login screen - you should see the "Connect with Stored Credentials" button

5. Click the button to authenticate without manual login

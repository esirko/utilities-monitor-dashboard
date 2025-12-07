# Automatic Re-Authentication

## Overview

The Energy Monitor Dashboard now includes automatic re-authentication functionality to handle session expiration with the Emporia API. When the backend server's authentication session expires (typically after running for an extended period), the system will automatically attempt to re-authenticate without requiring user intervention.

## How It Works

### Detection

The system detects authentication failures in two places:

1. **Backend Server**: When the Python backend receives a 401 or authentication-related error from the Emporia API, it:
   - Sets the local `authenticated` flag to `False`
   - Invalidates the device cache
   - Returns a 401 error with `needsReauth: true` to the frontend

2. **Frontend Client**: The API client (`src/lib/api.ts`) automatically detects 401 responses and triggers re-authentication

### Re-Authentication Flow

1. **401 Error Detected**: When a request fails with status 401
2. **Automatic Retry**: The frontend calls the `/api/auth/reauthenticate` endpoint
3. **Backend Re-authentication**: The backend server:
    - Loads credentials from configured environment variables (`EMPORIA_USERNAME` and `EMPORIA_PASSWORD`)
   - Calls `vue.login()` with stored credentials
   - Invalidates device cache to fetch fresh data
   - Returns a new JWT token if successful
4. **Request Retry**: The original request is automatically retried with the new token
5. **User Notification**: A toast notification informs the user of connection issues and restoration

### Rate Limiting

To prevent spamming the Emporia API, the system implements several protections:

- **Maximum Attempts**: Up to 3 re-authentication attempts before giving up
- **Exponential Backoff**: After max attempts, the system waits increasingly longer before retrying
- **Single Attempt Lock**: Only one re-authentication can be in progress at a time
- **Toast Throttling**: Error notifications are limited to once every 10 seconds

## Configuration

### Prerequisites

For automatic re-authentication to work, the backend server **must** have credentials available via environment variables (for example, defined in `.env`):

```env
EMPORIA_USERNAME=your-emporia-username@example.com
EMPORIA_PASSWORD=your-emporia-password
```

If either value is missing, the server cannot automatically re-authenticate and users will need to log in again through the UI.

### Backend Environment Variables

No additional environment variables are required beyond the credentials and standard configuration:

- `SECRET_KEY`: JWT token generation
- `EMPORIA_USERNAME` / `EMPORIA_PASSWORD`: Stored credentials for re-authentication

## User Experience

### Successful Re-Authentication

When re-authentication succeeds:
1. User sees a brief toast: "Authentication expired, attempting to reconnect..."
2. Data continues to flow after a brief interruption (typically 1-2 seconds)
3. Success toast: "Connection restored successfully"
4. No action required from the user

### Failed Re-Authentication

When re-authentication fails (e.g., invalid credentials, network issues):
1. User sees error toast: "Failed to reconnect. Please refresh the page and log in again."
2. Data stops updating
3. User must manually refresh the page and log in

## Monitoring

### Console Logs

The system logs all re-authentication activity to the browser console and backend server logs:

**Frontend:**
```
[API] Received 401 error, attempting re-authentication...
[API] Attempting automatic re-authentication (attempt 1/3)...
[API] ✓ Re-authentication successful
[API] Re-authentication succeeded, retrying original request...
```

**Backend:**
```
[Re-Auth] Re-authentication requested
[Re-Auth] Attempting to re-authenticate with Emporia API for user@example.com...
[Emporia API] REQUEST  > vue.login(username=user@example.com, password=***REDACTED***)
[Emporia API] RESPONSE < vue.login: ...
[Re-Auth] ✓ Re-authentication successful for user@example.com
[Cache] Device cache invalidated
```

### Error Cases

Common error scenarios logged:

- `No stored credentials available`: Required environment variables missing or invalid
- `Re-authentication already in progress`: Concurrent requests triggered re-auth simultaneously
- `Re-authentication rate limited`: Too many attempts in short time period
- `Emporia API authentication failure`: Credentials invalid or API unavailable

## API Endpoints

### POST /api/auth/reauthenticate

Re-authenticates the backend server with the Emporia API using stored credentials.

**Request:**
```
POST /api/auth/reauthenticate
Content-Type: application/json
```

**Response (Success):**
```json
{
    "success": true,
    "token": "eyJ0eXAiOiJKV1QiLCJhbGc...",
    "message": "Re-authentication successful"
}
```

**Response (Failure):**
```json
{
    "success": false,
    "message": "No stored credentials available for re-authentication"
}
```

## Technical Details

### Rate Limiting Algorithm

```typescript
// Constants
MAX_REAUTH_ATTEMPTS = 3
REAUTH_BACKOFF_MS = 5000 // 5 seconds

// Backoff calculation
if (attemptCount >= MAX_REAUTH_ATTEMPTS) {
    backoffTime = REAUTH_BACKOFF_MS * 2^(attemptCount - MAX_REAUTH_ATTEMPTS)
}
```

This creates the following backoff schedule:
- Attempts 1-3: Immediate retry
- Attempt 4: 5 second delay
- Attempt 5: 10 second delay
- Attempt 6: 20 second delay
- And so on...

### State Management

The frontend maintains re-authentication state in memory (not persisted):
- `reAuthInProgress`: Boolean flag for locking
- `reAuthAttemptCount`: Counter for rate limiting
- `lastReAuthAttempt`: Timestamp for backoff calculation

The backend maintains authentication state globally:
- `authenticated`: Boolean flag
- `credentials_username`: Currently authenticated username

## Troubleshooting

### Re-authentication Not Working

**Problem**: System doesn't automatically reconnect

**Solutions**:
1. Verify `EMPORIA_USERNAME` and `EMPORIA_PASSWORD` are set (for example, in `.env`)
2. Ensure the backend was started after loading these environment variables
3. Restart the backend server after updating credentials

### Too Many Failed Attempts

**Problem**: Error message "Failed to reconnect" appears immediately

**Solutions**:
1. Refresh the page to reset attempt counter
2. Check backend logs for root cause of failures
3. Verify Emporia API is accessible and credentials are valid
4. Wait for exponential backoff period to expire

### Frequent Re-authentication

**Problem**: System re-authenticates very frequently

**Possible Causes**:
1. Emporia API session timeout is very short (contact Emporia support)
2. Backend server is restarting frequently (check server health)
3. Network issues causing intermittent failures

## Future Enhancements

Potential improvements for future versions:

1. **Proactive Re-authentication**: Re-authenticate before session expires
2. **Credential Refresh**: Allow users to update credentials without server restart
3. **Connection Health Monitoring**: Display connection status indicator in UI
4. **Retry Strategy Customization**: Make retry limits and backoff configurable
5. **Multiple Credential Support**: Support multiple Emporia accounts with failover

import { Device, DataPoint } from './types'
import { toast } from 'sonner'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5173'

export class ApiError extends Error {
  constructor(
    message: string,
    public status?: number,
    public data?: any
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

let reAuthInProgress = false
let reAuthAttemptCount = 0
let lastReAuthAttempt = 0
const MAX_REAUTH_ATTEMPTS = 3
const REAUTH_BACKOFF_MS = 5000

async function attemptReAuthentication(): Promise<boolean> {
  const now = Date.now()
  
  if (reAuthInProgress) {
    console.log('[API] Re-authentication already in progress, skipping...')
    return false
  }
  
  if (reAuthAttemptCount >= MAX_REAUTH_ATTEMPTS) {
    const timeSinceLastAttempt = now - lastReAuthAttempt
    if (timeSinceLastAttempt < REAUTH_BACKOFF_MS * Math.pow(2, reAuthAttemptCount - MAX_REAUTH_ATTEMPTS)) {
      console.log('[API] Re-authentication rate limited, backing off...')
      return false
    }
    reAuthAttemptCount = 0
  }
  
  reAuthInProgress = true
  lastReAuthAttempt = now
  reAuthAttemptCount++
  
  try {
    console.log(`[API] Attempting automatic re-authentication (attempt ${reAuthAttemptCount}/${MAX_REAUTH_ATTEMPTS})...`)
    
    const response = await fetch(`${API_URL}/api/auth/reauthenticate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
    })
    
    if (!response.ok) {
      console.error('[API] Re-authentication failed:', response.status)
      if (reAuthAttemptCount >= MAX_REAUTH_ATTEMPTS) {
        toast.error('Failed to reconnect. Please refresh the page and log in again.')
      }
      return false
    }
    
    const data = await response.json()
    
    if (data.success && data.token) {
      localStorage.setItem('auth_token', data.token)
      console.log('[API] ✓ Re-authentication successful')
      reAuthAttemptCount = 0
      toast.success('Connection restored successfully')
      return true
    }
    
    console.error('[API] Re-authentication failed: Invalid response')
    if (reAuthAttemptCount >= MAX_REAUTH_ATTEMPTS) {
      toast.error('Failed to reconnect. Please refresh the page and log in again.')
    }
    return false
  } catch (error) {
    console.error('[API] Re-authentication error:', error)
    if (reAuthAttemptCount >= MAX_REAUTH_ATTEMPTS) {
      toast.error('Failed to reconnect. Please refresh the page and log in again.')
    }
    return false
  } finally {
    reAuthInProgress = false
  }
}

async function fetchWithAuth(endpoint: string, options: RequestInit = {}, retryOn401: boolean = true) {
  const token = localStorage.getItem('auth_token')
  
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...options.headers,
  }
  
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }
  
  const response = await fetch(`${API_URL}${endpoint}`, {
    ...options,
    headers,
  })
  
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}))
    
    if (response.status === 401 && retryOn401 && !endpoint.includes('/auth/')) {
      console.log('[API] Received 401 error, attempting re-authentication...')
      
      const reAuthSuccess = await attemptReAuthentication()
      
      if (reAuthSuccess) {
        console.log('[API] Re-authentication succeeded, retrying original request...')
        return fetchWithAuth(endpoint, options, false)
      } else {
        console.error('[API] Re-authentication failed, request cannot be retried')
      }
    }
    
    throw new ApiError(
      errorData.message || errorData.error || 'API request failed',
      response.status,
      errorData
    )
  }
  
  return response.json()
}

export const api = {
  async login(username: string, password: string): Promise<{ success: boolean; token: string; message: string }> {
    const response = await fetch(`${API_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    })
    
    const data = await response.json()
    
    if (!response.ok) {
      throw new ApiError(data.message || 'Login failed', response.status, data)
    }
    
    if (!data.success) {
      throw new ApiError(data.message || 'Login failed', response.status, data)
    }
    
    if (data.token) {
      localStorage.setItem('auth_token', data.token)
    }
    
    return data
  },

  async logout() {
    localStorage.removeItem('auth_token')
  },

  isAuthenticated(): boolean {
    return !!localStorage.getItem('auth_token')
  },

  async getDevices(): Promise<Device[]> {
    const data = await fetchWithAuth('/api/devices')
    return data.devices || []
  },

  async getRealtimeData(): Promise<DataPoint> {
    return fetchWithAuth('/api/energy/realtime')
  },

  async getHistoricalData(range: string): Promise<DataPoint[]> {
    const data = await fetchWithAuth(`/api/energy/history?range=${range}`)
    return data.dataPoints || []
  },

  async getConfig(): Promise<{ electricityRate: number; systemName: string }> {
    const data = await fetchWithAuth('/api/config')
    return {
      electricityRate: data.electricityRate || 0.314555,
      systemName: data.systemName || 'Home'
    }
  },

  async checkBackendAuth(): Promise<{ authenticated: boolean; username: string | null; token?: string; hasStoredCredentials?: boolean }> {
    try {
      const response = await fetch(`${API_URL}/`)
      if (!response.ok) {
        return { authenticated: false, username: null, hasStoredCredentials: false }
      }
      const data = await response.json()
      return {
        authenticated: data.authenticated || false,
        username: data.username || null,
        token: data.token || undefined,
        hasStoredCredentials: data.hasStoredCredentials || false
      }
    } catch (error) {
      console.error('Failed to check backend authentication status:', error)
      return { authenticated: false, username: null, hasStoredCredentials: false }
    }
  },

  async connectWithStoredCredentials(): Promise<{ success: boolean; token?: string; message?: string }> {
    try {
      const response = await fetch(`${API_URL}/api/auth/connect-stored`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })
      
      const data = await response.json()
      
      if (!response.ok) {
        throw new ApiError(data.message || 'Failed to connect with stored credentials', response.status, data)
      }
      
      if (data.success && data.token) {
        localStorage.setItem('auth_token', data.token)
      }
      
      return data
    } catch (error) {
      if (error instanceof ApiError) {
        throw error
      }
      throw new ApiError('Failed to connect to server. Make sure the backend is running.')
    }
  },
}

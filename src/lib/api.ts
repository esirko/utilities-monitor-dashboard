import { Device, DataPoint } from './types'
import { toast } from 'sonner'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5173'

export interface StreamInfo {
  rtsp?: string | null
  mjpeg?: string | null
  restreamAvailable?: boolean
}

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
let allowAutoReauth = true

function toAbsoluteUrl(path?: string | null): string | undefined {
  if (!path) return undefined
  if (/^https?:/i.test(path)) {
    return path
  }
  const base = API_URL.replace(/\/$/, '')
  const normalised = path.startsWith('/') ? path : `/${path}`
  return `${base}${normalised}`
}

function normaliseStreamInfo(raw: any): StreamInfo | undefined {
  if (!raw) return undefined
  const rtsp = raw.rtsp ?? raw.rtspUrl ?? raw.url ?? null
  const mjpeg = toAbsoluteUrl(raw.mjpeg ?? raw.restream ?? raw.mjpegUrl ?? null)
  const restreamAvailable = raw.restreamAvailable ?? Boolean(raw.mjpeg ?? raw.restream)
  if (!rtsp && !mjpeg) {
    return undefined
  }
  return {
    rtsp,
    mjpeg,
    restreamAvailable
  }
}

async function attemptReAuthentication(): Promise<boolean> {
  if (!allowAutoReauth) {
    console.log('[API] Auto re-auth disabled; skipping attempt.')
    return false
  }

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
    
    const response = await fetch(`${API_URL}/api/emporia/auth`, {
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

async function fetchRootSummary(): Promise<any> {
  const token = localStorage.getItem('auth_token')
  const headers: HeadersInit = {
    Accept: 'application/json'
  }

  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }

  const response = await fetch(`${API_URL}/`, { headers })
  const data = await response.json().catch(() => ({}))

  if (!response.ok) {
    throw new ApiError(
      data?.message || 'Failed to fetch server status',
      response.status,
      data
    )
  }

  return data
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
  async logout(): Promise<void> {
    const token = localStorage.getItem('auth_token')

    try {
      if (token) {
        const response = await fetch(`${API_URL}/api/emporia/logout`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          }
        })

        if (!response.ok) {
          const data = await response.json().catch(() => ({}))
          throw new ApiError(data.message || 'Logout failed', response.status, data)
        }
      }
    } catch (error) {
      console.error('Failed to logout from backend:', error)
    } finally {
      allowAutoReauth = false
      localStorage.removeItem('auth_token')
    }
  },

  isAuthenticated(): boolean {
    return !!localStorage.getItem('auth_token')
  },

  async getDevices(): Promise<Device[]> {
    const data = await fetchWithAuth('/api/emporia/devices')
    return data.devices || []
  },

  async getRealtimeData(): Promise<DataPoint> {
    return fetchWithAuth('/api/emporia/realtime')
  },

  async getHistoricalData(range: string): Promise<DataPoint[]> {
    const data = await fetchWithAuth(`/api/emporia/history?range=${range}`)
    return data.dataPoints || []
  },

  async getDemoRealtimeData(): Promise<DataPoint> {
    const response = await fetch(`${API_URL}/api/demo/realtime`)
    const data = await response.json().catch(() => ({}))
    if (!response.ok) {
      throw new ApiError(data.message || 'Failed to fetch demo real-time data', response.status, data)
    }
    return data
  },

  async getDemoHistoricalData(range: string): Promise<DataPoint[]> {
    const response = await fetch(`${API_URL}/api/demo/history?range=${encodeURIComponent(range)}`)
    const data = await response.json().catch(() => ({}))
    if (!response.ok) {
      throw new ApiError(data.message || 'Failed to fetch demo historical data', response.status, data)
    }
    return data.dataPoints || []
  },

  async getDemoDevices(): Promise<Device[]> {
    const response = await fetch(`${API_URL}/api/demo/devices`)
    const data = await response.json().catch(() => ({}))
    if (!response.ok) {
      throw new ApiError(data.message || 'Failed to fetch demo devices', response.status, data)
    }
    return data.devices || []
  },

  async getConfig(): Promise<{
    electricityRate: number
    systemName: string
    gasStreamUrl?: string
    waterStreamUrl?: string
    gasStream?: StreamInfo
    waterStream?: StreamInfo
  }> {
    const data = await fetchRootSummary()
    const config = data.config ?? {}
    return {
      electricityRate: config.electricityRate ?? data.electricityRate ?? 0.314555,
      systemName: config.systemName ?? data.systemName ?? 'Not connected',
      gasStreamUrl: config.gasStreamUrl,
      waterStreamUrl: config.waterStreamUrl,
      gasStream: normaliseStreamInfo(config.gasStream ?? data.gasStream),
      waterStream: normaliseStreamInfo(config.waterStream ?? data.waterStream)
    }
  },

  async checkBackendAuth(): Promise<{ authenticated: boolean; username: string | null; token?: string; hasStoredCredentials?: boolean; systemName?: string }> {
    try {
      const data = await fetchRootSummary()
      return {
        authenticated: data.authenticated || false,
        username: data.username || null,
        token: data.token || undefined,
        hasStoredCredentials: data.hasStoredCredentials ?? data?.authentication?.hasStoredCredentials ?? false,
        systemName: data.config?.systemName ?? data.systemName
      }
    } catch (error) {
      console.error('Failed to check backend authentication status:', error)
      return { authenticated: false, username: null, hasStoredCredentials: false, systemName: undefined }
    }
  },

  async connectWithStoredCredentials(): Promise<{ success: boolean; token?: string; message?: string }> {
    try {
      const response = await fetch(`${API_URL}/api/emporia/auth`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })
      
      const data = await response.json()
      
      if (!response.ok) {
        throw new ApiError(data.message || 'Failed to connect with stored credentials', response.status, data)
      }
      
      if (data.success && data.token) {
        localStorage.setItem('auth_token', data.token)
        allowAutoReauth = true
      }
      
      return data
    } catch (error) {
      if (error instanceof ApiError) {
        throw error
      }
      throw new ApiError('Failed to connect to server. Make sure the backend is running.')
    }
  },

  async getStreamUrls(): Promise<{ gas?: StreamInfo; water?: StreamInfo }> {
    try {
      const response = await fetch(`${API_URL}/api/streams`)
      if (!response.ok) {
        return { gas: undefined, water: undefined }
      }
      const data = await response.json()
      return {
        gas: normaliseStreamInfo(data.gas),
        water: normaliseStreamInfo(data.water)
      }
    } catch (error) {
      console.error('Failed to load stream URLs from backend:', error)
      return { gas: undefined, water: undefined }
    }
  },
}

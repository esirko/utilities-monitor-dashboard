import { Device, DataPoint } from './types'

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

async function fetchWithAuth(endpoint: string, options: RequestInit = {}) {
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

  async getElectricityRate(): Promise<number> {
    const data = await fetchWithAuth('/api/config/electricity-rate')
    return data.rate || 0.314555
  },
}

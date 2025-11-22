export interface Device {
  id: string
  name: string
  watts: number
  status: 'active' | 'idle' | 'offline'
  category: string
}

export interface DataPoint {
  timestamp: number
  devices: Record<string, number>
  total: number
}

export interface TimeRange {
  label: string
  seconds: number
  updateInterval: number
}

export const TIME_RANGES: Record<string, TimeRange> = {
  '1m': { label: '1 Min', seconds: 60, updateInterval: 1000 },
  '5m': { label: '5 Min', seconds: 300, updateInterval: 2000 },
  '15m': { label: '15 Min', seconds: 900, updateInterval: 5000 },
  '1h': { label: '1 Hour', seconds: 3600, updateInterval: 10000 },
}

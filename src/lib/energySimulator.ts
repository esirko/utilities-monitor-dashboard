import { Device, DataPoint } from './types'

const DEVICE_CONFIGS = [
  { name: 'HVAC System', baseWatts: 3200, variance: 800, category: 'Climate' },
  { name: 'Refrigerator', baseWatts: 150, variance: 50, category: 'Kitchen' },
  { name: 'Water Heater', baseWatts: 4500, variance: 500, category: 'Utility', dutyCycle: 0.3 },
  { name: 'Washer/Dryer', baseWatts: 2800, variance: 400, category: 'Laundry', dutyCycle: 0.2 },
  { name: 'Kitchen Appliances', baseWatts: 800, variance: 600, category: 'Kitchen', dutyCycle: 0.4 },
  { name: 'Lighting', baseWatts: 400, variance: 200, category: 'Lighting' },
  { name: 'Entertainment', baseWatts: 250, variance: 150, category: 'Electronics' },
  { name: 'Home Office', baseWatts: 180, variance: 80, category: 'Electronics' },
  { name: 'Garage', baseWatts: 120, variance: 100, category: 'Utility', dutyCycle: 0.15 },
]

class EnergySimulator {
  private devices: Map<string, Device>
  private phaseOffsets: Map<string, number>
  private dutyCycleStates: Map<string, boolean>
  private dutyCycleTimers: Map<string, number>
  
  constructor() {
    this.devices = new Map()
    this.phaseOffsets = new Map()
    this.dutyCycleStates = new Map()
    this.dutyCycleTimers = new Map()
    
    DEVICE_CONFIGS.forEach((config, index) => {
      const id = `device-${index + 1}`
      this.devices.set(id, {
        id,
        name: config.name,
        watts: 0,
        status: 'active',
        category: config.category,
      })
      this.phaseOffsets.set(id, Math.random() * Math.PI * 2)
      
      if (config.dutyCycle) {
        this.dutyCycleStates.set(id, Math.random() > 0.5)
        this.dutyCycleTimers.set(id, 0)
      }
    })
  }
  
  private updateDevice(deviceId: string, timestamp: number): number {
    const device = this.devices.get(deviceId)
    if (!device) return 0
    
    const configIndex = parseInt(deviceId.split('-')[1]) - 1
    const config = DEVICE_CONFIGS[configIndex]
    const phaseOffset = this.phaseOffsets.get(deviceId) || 0
    
    if (config.dutyCycle !== undefined) {
      const timer = this.dutyCycleTimers.get(deviceId) || 0
      const newTimer = timer + 1
      this.dutyCycleTimers.set(deviceId, newTimer)
      
      if (newTimer > 30) {
        const isOn = this.dutyCycleStates.get(deviceId) || false
        if (Math.random() < 0.1) {
          this.dutyCycleStates.set(deviceId, !isOn)
          this.dutyCycleTimers.set(deviceId, 0)
        }
      }
      
      const isOn = this.dutyCycleStates.get(deviceId)
      if (!isOn) {
        device.watts = Math.random() * 5
        device.status = 'idle'
        return device.watts
      }
    }
    
    const timeFactor = timestamp / 1000
    const slowWave = Math.sin(timeFactor * 0.1 + phaseOffset) * 0.3
    const fastWave = Math.sin(timeFactor * 0.5 + phaseOffset) * 0.15
    const noise = (Math.random() - 0.5) * 0.1
    
    const variation = slowWave + fastWave + noise
    const watts = config.baseWatts + (config.variance * variation)
    
    device.watts = Math.max(0, watts)
    device.status = device.watts > config.baseWatts * 0.1 ? 'active' : 'idle'
    
    return device.watts
  }
  
  generateDataPoint(timestamp: number): DataPoint {
    const deviceWatts: Record<string, number> = {}
    let total = 0
    
    this.devices.forEach((device, id) => {
      const watts = this.updateDevice(id, timestamp)
      deviceWatts[id] = watts
      total += watts
    })
    
    return {
      timestamp,
      devices: deviceWatts,
      total,
    }
  }
  
  getDevices(): Device[] {
    return Array.from(this.devices.values())
  }
  
  getDevice(id: string): Device | undefined {
    return this.devices.get(id)
  }
}

export const energySimulator = new EnergySimulator()

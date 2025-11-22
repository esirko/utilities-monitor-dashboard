import { useState, useEffect, useRef } from 'react'
import { DataPoint, TimeRange } from '@/lib/types'
import { energySimulator } from '@/lib/energySimulator'
import { api, ApiError } from '@/lib/api'

export function useRealEnergyData(timeRange: TimeRange, useRealData: boolean = true) {
  const [dataPoints, setDataPoints] = useState<DataPoint[]>([])
  const [error, setError] = useState<string | null>(null)
  const startTimeRef = useRef(Date.now())
  const intervalRef = useRef<number | undefined>(undefined)
  const lastUpdateRef = useRef<number>(Date.now())
  
  useEffect(() => {
    if (!useRealData) {
      startTimeRef.current = Date.now()
      
      const initialPoints: DataPoint[] = []
      const now = Date.now()
      for (let i = timeRange.seconds; i > 0; i--) {
        const timestamp = now - (i * 1000)
        initialPoints.push(energySimulator.generateDataPoint(timestamp))
      }
      setDataPoints(initialPoints)
      
      const maxPoints = timeRange.seconds
      
      intervalRef.current = window.setInterval(() => {
        const now = Date.now()
        const newPoint = energySimulator.generateDataPoint(now)
        
        setDataPoints(prev => {
          const updated = [...prev, newPoint]
          return updated.slice(-maxPoints)
        })
      }, timeRange.updateInterval)
      
      return () => {
        if (intervalRef.current) {
          clearInterval(intervalRef.current)
        }
      }
    }
    
    setError(null)
    const maxPoints = timeRange.seconds
    
    const fetchHistoricalData = async () => {
      try {
        const historical = await api.getHistoricalData(timeRange.label)
        setDataPoints(historical.slice(-maxPoints))
      } catch (err) {
        if (err instanceof ApiError) {
          setError(err.message)
        } else {
          setError('Failed to fetch historical data')
        }
        console.error('Error fetching historical data:', err)
      }
    }
    
    fetchHistoricalData()
    
    const fetchRealtimeData = async () => {
      try {
        const newPoint = await api.getRealtimeData()
        
        setDataPoints(prev => {
          const updated = [...prev, newPoint]
          return updated.slice(-maxPoints)
        })
        
        setError(null)
      } catch (err) {
        if (err instanceof ApiError) {
          setError(err.message)
        } else {
          setError('Failed to fetch real-time data')
        }
        console.error('Error fetching real-time data:', err)
      }
    }
    
    intervalRef.current = window.setInterval(() => {
      fetchRealtimeData()
    }, timeRange.updateInterval)
    
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
      }
    }
  }, [timeRange, useRealData])
  
  return { dataPoints, error }
}

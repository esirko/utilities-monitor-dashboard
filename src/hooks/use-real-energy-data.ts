import { useState, useEffect, useRef } from 'react'
import { DataPoint, TimeRange } from '@/lib/types'
import { energySimulator } from '@/lib/energySimulator'
import { api, ApiError } from '@/lib/api'
import { toast } from 'sonner'

export function useRealEnergyData(timeRange: TimeRange, useRealData: boolean = true, isPaused: boolean = false) {
  const [dataPoints, setDataPoints] = useState<DataPoint[]>([])
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState<boolean>(true)
  const startTimeRef = useRef(Date.now())
  const intervalRef = useRef<number | undefined>(undefined)
  const scrollIntervalRef = useRef<number | undefined>(undefined)
  const lastUpdateRef = useRef<number>(Date.now())
  const lastToastRef = useRef<number>(0)
  const isLoadingHistoricalRef = useRef<boolean>(false)
  const historicalDataLoadedRef = useRef<boolean>(false)
  
  useEffect(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
    }
    if (scrollIntervalRef.current) {
      clearInterval(scrollIntervalRef.current)
    }
    
    historicalDataLoadedRef.current = false
    isLoadingHistoricalRef.current = false
    setIsLoading(true)
    
    if (!useRealData) {
      startTimeRef.current = Date.now()
      
      const initialPoints: DataPoint[] = []
      const now = Date.now()
      for (let i = timeRange.seconds; i > 0; i--) {
        const timestamp = now - (i * 1000)
        initialPoints.push(energySimulator.generateDataPoint(timestamp))
      }
      setDataPoints(initialPoints)
      setIsLoading(false)
      
      const maxPoints = timeRange.seconds
      
      if (!isPaused) {
        intervalRef.current = window.setInterval(() => {
          const now = Date.now()
          const newPoint = energySimulator.generateDataPoint(now)
          
          setDataPoints(prev => {
            const updated = [...prev, newPoint]
            return updated.slice(-maxPoints)
          })
        }, timeRange.updateInterval)
      } else {
        scrollIntervalRef.current = window.setInterval(() => {
          const now = Date.now()
          setDataPoints(prev => {
            const oldestTime = now - (timeRange.seconds * 1000)
            return prev.filter(point => point.timestamp > oldestTime)
          })
        }, timeRange.updateInterval)
      }
      
      return () => {
        if (intervalRef.current) {
          clearInterval(intervalRef.current)
        }
        if (scrollIntervalRef.current) {
          clearInterval(scrollIntervalRef.current)
        }
      }
    }
    
    setError(null)
    const maxPoints = timeRange.seconds
    
    const calculateTotal = (dataPoint: DataPoint): DataPoint => {
      const total = Object.values(dataPoint.devices).reduce((sum, watts) => sum + watts, 0)
      return {
        ...dataPoint,
        total
      }
    }
    
    const fetchRealtimeData = async () => {
      if (!historicalDataLoadedRef.current) {
        return
      }
      
      try {
        const newPoint = await api.getRealtimeData()
        const pointWithTotal = calculateTotal(newPoint)
        
        setDataPoints(prev => {
          const lastPoint = prev[prev.length - 1]
          if (lastPoint && Math.abs(lastPoint.timestamp - pointWithTotal.timestamp) < 500) {
            return prev
          }
          
          const updated = [...prev, pointWithTotal]
          const sorted = updated.sort((a, b) => a.timestamp - b.timestamp)
          return sorted.slice(-maxPoints)
        })
        
        setError(null)
      } catch (err) {
        if (err instanceof ApiError) {
          setError(err.message)
          if (err.status === 401) {
            const now = Date.now()
            if (now - lastToastRef.current > 10000) {
              toast.error('Authentication expired, attempting to reconnect...')
              lastToastRef.current = now
            }
          }
        } else {
          setError('Failed to fetch real-time data')
        }
        console.error('Error fetching real-time data:', err)
      }
    }
    
    const startRealtimePolling = () => {
      if (!isPaused) {
        intervalRef.current = window.setInterval(() => {
          fetchRealtimeData()
        }, timeRange.updateInterval)
      } else {
        scrollIntervalRef.current = window.setInterval(() => {
          const now = Date.now()
          setDataPoints(prev => {
            const oldestTime = now - (timeRange.seconds * 1000)
            return prev.filter(point => point.timestamp > oldestTime)
          })
        }, timeRange.updateInterval)
      }
    }
    
    const fetchHistoricalData = async () => {
      isLoadingHistoricalRef.current = true
      try {
        const historical = await api.getHistoricalData(timeRange.label)
        const historicalWithTotals = historical.map(calculateTotal)
        
        if (isLoadingHistoricalRef.current) {
          const sortedHistorical = historicalWithTotals.sort((a, b) => a.timestamp - b.timestamp)
          setDataPoints(sortedHistorical.slice(-maxPoints))
          historicalDataLoadedRef.current = true
          setIsLoading(false)
          
          startRealtimePolling()
        }
      } catch (err) {
        if (err instanceof ApiError) {
          setError(err.message)
          if (err.status === 401) {
            const now = Date.now()
            if (now - lastToastRef.current > 10000) {
              toast.error('Authentication expired, attempting to reconnect...')
              lastToastRef.current = now
            }
          }
        } else {
          setError('Failed to fetch historical data')
        }
        console.error('Error fetching historical data:', err)
        
        historicalDataLoadedRef.current = true
        setIsLoading(false)
        startRealtimePolling()
      } finally {
        isLoadingHistoricalRef.current = false
      }
    }
    
    fetchHistoricalData()
    
    return () => {
      isLoadingHistoricalRef.current = false
      historicalDataLoadedRef.current = false
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
      }
      if (scrollIntervalRef.current) {
        clearInterval(scrollIntervalRef.current)
      }
    }
  }, [timeRange, useRealData, isPaused])
  
  return { dataPoints, error, isLoading }
}

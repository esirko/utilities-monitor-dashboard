import { useState, useEffect, useRef, useCallback } from 'react'
import { DataPoint, TimeRange } from '@/lib/types'
import { api, ApiError } from '@/lib/api'
import { toast } from 'sonner'

export function useRealEnergyData(timeRange: TimeRange, mode: 'real' | 'demo' | 'off' = 'real', isPaused: boolean = false) {
  const [dataPoints, setDataPoints] = useState<DataPoint[]>([])
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState<boolean>(true)
  const intervalRef = useRef<number | undefined>(undefined)
  const scrollIntervalRef = useRef<number | undefined>(undefined)
  const retroIntervalRef = useRef<number | undefined>(undefined)
  const lastToastRef = useRef<number>(0)
  const isLoadingHistoricalRef = useRef<boolean>(false)
  const historicalDataLoadedRef = useRef<boolean>(false)
  const hasRealtimeDataRef = useRef<boolean>(false)
  const retroCorrectionSecondsRef = useRef<number>(0)
  const useRealData = mode === 'real'
  
  const calculateTotal = useCallback((dataPoint: DataPoint): DataPoint => {
    const total = Object.values(dataPoint.devices).reduce((sum, watts) => sum + watts, 0)
    return {
      ...dataPoint,
      total
    }
  }, [])
  
  const mergeAndSortDataPoints = useCallback((existing: DataPoint[], incoming: DataPoint[]): DataPoint[] => {
    const allPoints = [...existing, ...incoming]
    const uniqueMap = new Map<number, DataPoint>()
    
    allPoints.forEach(point => {
      const roundedTimestamp = Math.floor(point.timestamp / 100) * 100
      if (!uniqueMap.has(roundedTimestamp) || uniqueMap.get(roundedTimestamp)!.timestamp < point.timestamp) {
        uniqueMap.set(roundedTimestamp, point)
      }
    })
    
    return Array.from(uniqueMap.values()).sort((a, b) => a.timestamp - b.timestamp)
  }, [])
  
  useEffect(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
    }
    if (scrollIntervalRef.current) {
      clearInterval(scrollIntervalRef.current)
    }
    if (retroIntervalRef.current) {
      clearInterval(retroIntervalRef.current)
    }
    
    historicalDataLoadedRef.current = false
    isLoadingHistoricalRef.current = false
    hasRealtimeDataRef.current = false
    retroCorrectionSecondsRef.current = 0
    setDataPoints([])

    if (mode === 'off') {
      setIsLoading(false)
      return () => {}
    }

    setError(null)
    const maxPoints = timeRange.seconds
    setIsLoading(true)
    
    const fetchRealtimeData = async (lookbackSeconds?: number) => {
      try {
        const newPoint = useRealData
          ? await api.getRealtimeData(lookbackSeconds)
          : await api.getDemoRealtimeData()
        const pointWithTotal = calculateTotal(newPoint)
        
        setDataPoints(prev => {
          const updated = mergeAndSortDataPoints(prev, [pointWithTotal])
          const sliced = updated.slice(-maxPoints)
          console.log(`[useRealEnergyData] Added realtime point at ${new Date(pointWithTotal.timestamp).toLocaleTimeString()}, total points: ${sliced.length}`)
          return sliced
        })

        const isPrimaryCall = !lookbackSeconds || lookbackSeconds <= 0

        if (isPrimaryCall) {
          if (!hasRealtimeDataRef.current) {
            hasRealtimeDataRef.current = true
            setIsLoading(false)
          }

          if (useRealData) {
            const rawDefault = newPoint.defaultRetroactiveCorrectionSeconds
            const parsedDefault = typeof rawDefault === 'number' && Number.isFinite(rawDefault)
              ? Math.max(0, rawDefault)
              : 0
            const delayChanged = parsedDefault !== retroCorrectionSecondsRef.current
            retroCorrectionSecondsRef.current = parsedDefault

            if (parsedDefault <= 0 || isPaused) {
              if (retroIntervalRef.current) {
                clearInterval(retroIntervalRef.current)
                retroIntervalRef.current = undefined
              }
            } else if (parsedDefault > 0) {
              if (delayChanged || !retroIntervalRef.current) {
                if (retroIntervalRef.current) {
                  clearInterval(retroIntervalRef.current)
                }
                retroIntervalRef.current = window.setInterval(() => {
                  void fetchRealtimeData(parsedDefault)
                }, timeRange.updateInterval)

                if (delayChanged) {
                  void fetchRealtimeData(parsedDefault)
                }
              }
            }
          }
        }

        setError(null)
      } catch (err) {
        if (err instanceof ApiError) {
          setError(err.message)
          if (useRealData && err.status === 401) {
            const now = Date.now()
            if (now - lastToastRef.current > 10000) {
              toast.error('Authentication expired, attempting to reconnect...')
              lastToastRef.current = now
            }
          }
        } else {
          setError(useRealData ? 'Failed to fetch real-time data' : 'Failed to fetch demo data')
        }
        console.error(`[useRealEnergyData] Error fetching ${useRealData ? 'real-time' : 'demo'} data:`, err)
      }
    }
    
    const startRealtimePolling = () => {
      if (!isPaused) {
        intervalRef.current = window.setInterval(() => {
          void fetchRealtimeData()
        }, timeRange.updateInterval)
      } else {
        if (retroIntervalRef.current) {
          clearInterval(retroIntervalRef.current)
          retroIntervalRef.current = undefined
        }
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
        const historical = useRealData
          ? await api.getHistoricalData(timeRange.label)
          : await api.getDemoHistoricalData(timeRange.label)
        const historicalWithTotals = historical.map(calculateTotal)
        
        if (isLoadingHistoricalRef.current) {
          setDataPoints(prev => {
            const merged = mergeAndSortDataPoints(prev, historicalWithTotals)
            const sliced = merged.slice(-maxPoints)
            console.log(`[useRealEnergyData] Loaded ${historicalWithTotals.length} historical points, merged to ${merged.length}, keeping ${sliced.length}`)
            return sliced
          })
          
          historicalDataLoadedRef.current = true
          if (!hasRealtimeDataRef.current) {
            setIsLoading(false)
          }
        }
      } catch (err) {
        if (err instanceof ApiError) {
          setError(err.message)
          if (useRealData && err.status === 401) {
            const now = Date.now()
            if (now - lastToastRef.current > 10000) {
              toast.error('Authentication expired, attempting to reconnect...')
              lastToastRef.current = now
            }
          }
        } else {
          setError(useRealData ? 'Failed to fetch historical data' : 'Failed to fetch demo history')
        }
        console.error(`[useRealEnergyData] Error fetching ${useRealData ? 'real' : 'demo'} historical data:`, err)
        
        historicalDataLoadedRef.current = true
        if (!hasRealtimeDataRef.current) {
          setIsLoading(false)
        }
      } finally {
        isLoadingHistoricalRef.current = false
      }
    }
    
    void fetchRealtimeData()
    startRealtimePolling()
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
      if (retroIntervalRef.current) {
        clearInterval(retroIntervalRef.current)
      }
    }
  }, [timeRange, mode, isPaused, calculateTotal, mergeAndSortDataPoints])
  
  return { dataPoints, error, isLoading }
}

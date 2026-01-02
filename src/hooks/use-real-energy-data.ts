import { useState, useEffect, useRef, useCallback } from 'react'
import { DataPoint, TimeRange } from '@/lib/types'
import { api, ApiError } from '@/lib/api'
import { toast } from 'sonner'

export function useRealEnergyData(
  timeRange: TimeRange,
  mode: 'real' | 'demo' | 'off' = 'real',
  isPaused: boolean = false,
  retroLookbackOverride?: number
) {
  const [dataPoints, setDataPoints] = useState<DataPoint[]>([])
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState<boolean>(true)
  const intervalRef = useRef<number | undefined>(undefined)
  const scrollIntervalRef = useRef<number | undefined>(undefined)
  const retroIntervalRef = useRef<number | undefined>(undefined)
  const primaryAlignTimeoutRef = useRef<number | undefined>(undefined)
  const retroAlignTimeoutRef = useRef<number | undefined>(undefined)
  const lastToastRef = useRef<number>(0)
  const isLoadingHistoricalRef = useRef<boolean>(false)
  const historicalDataLoadedRef = useRef<boolean>(false)
  const hasRealtimeDataRef = useRef<boolean>(false)
  const retroCorrectionSecondsRef = useRef<number>(0)
  const useRealData = mode === 'real'
  
  const alignToSecond = useCallback((timestamp: number): number => {
    return Math.round(timestamp / 1000) * 1000
  }, [])

  const calculateTotal = useCallback((dataPoint: DataPoint): DataPoint => {
    const total = Object.values(dataPoint.devices).reduce((sum, watts) => sum + watts, 0)
    return {
      ...dataPoint,
      total
    }
  }, [])
  
  const mergeAndSortDataPoints = useCallback((existing: DataPoint[], incoming: DataPoint[]): DataPoint[] => {
    const map = new Map<number, DataPoint>()

    const upsert = (point: DataPoint) => {
      const alignedTimestamp = alignToSecond(point.timestamp)
      map.set(alignedTimestamp, {
        ...point,
        timestamp: alignedTimestamp
      })
    }

    existing.forEach(upsert)
    incoming.forEach(upsert)

    return Array.from(map.values()).sort((a, b) => a.timestamp - b.timestamp)
  }, [alignToSecond])
  
  useEffect(() => {
    if (primaryAlignTimeoutRef.current !== undefined) {
      clearTimeout(primaryAlignTimeoutRef.current)
      primaryAlignTimeoutRef.current = undefined
    }
    if (intervalRef.current !== undefined) {
      clearInterval(intervalRef.current)
      intervalRef.current = undefined
    }
    if (scrollIntervalRef.current) {
      clearInterval(scrollIntervalRef.current)
    }
    if (retroAlignTimeoutRef.current !== undefined) {
      clearTimeout(retroAlignTimeoutRef.current)
      retroAlignTimeoutRef.current = undefined
    }
    if (retroIntervalRef.current !== undefined) {
      clearInterval(retroIntervalRef.current)
      retroIntervalRef.current = undefined
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

    const forcedRetroLookback =
      typeof retroLookbackOverride === 'number' && Number.isFinite(retroLookbackOverride)
        ? Math.max(0, Math.min(10, Math.round(retroLookbackOverride)))
        : null

    if (forcedRetroLookback !== null) {
      retroCorrectionSecondsRef.current = forcedRetroLookback
    }

    const fetchRealtimeData = async (lookbackSeconds?: number) => {
      try {
        const newPoint = useRealData
          ? await api.getRealtimeData(lookbackSeconds)
          : await api.getDemoRealtimeData()
        const pointWithTotal = calculateTotal(newPoint)
        const alignedPoint: DataPoint = {
          ...pointWithTotal,
          timestamp: alignToSecond(pointWithTotal.timestamp)
        }
        
        setDataPoints(prev => {
          const updated = mergeAndSortDataPoints(prev, [alignedPoint])
          const sliced = updated.slice(-maxPoints)
          console.log(`[useRealEnergyData] Added realtime point at ${new Date(alignedPoint.timestamp).toLocaleTimeString()}, total points: ${sliced.length}`)
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
            const desiredLookback = forcedRetroLookback !== null ? forcedRetroLookback : parsedDefault
            const normalizedLookback = Math.max(0, Math.min(10, desiredLookback))
            const previousLookback = retroCorrectionSecondsRef.current
            const lookbackChanged = normalizedLookback !== previousLookback
            retroCorrectionSecondsRef.current = normalizedLookback

            if (normalizedLookback <= 0 || isPaused) {
              stopRetroPolling()
            } else if (
              lookbackChanged ||
              retroIntervalRef.current === undefined ||
              retroAlignTimeoutRef.current === undefined
            ) {
              startRetroPolling()
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
    function getAlignedDelay(intervalMs: number): number {
      const now = Date.now()
      const next = Math.floor(now / intervalMs) * intervalMs + intervalMs
      const delay = next - now
      return delay === intervalMs ? 0 : delay
    }

    function stopPrimaryPolling() {
      if (primaryAlignTimeoutRef.current !== undefined) {
        clearTimeout(primaryAlignTimeoutRef.current)
        primaryAlignTimeoutRef.current = undefined
      }
      if (intervalRef.current !== undefined) {
        clearInterval(intervalRef.current)
        intervalRef.current = undefined
      }
    }

    function startPrimaryPolling() {
      if (isPaused) {
        stopPrimaryPolling()
        return
      }

      const intervalMs = timeRange.updateInterval
      const delay = getAlignedDelay(intervalMs)

      stopPrimaryPolling()

      const run = () => {
        if (isPaused) {
          stopPrimaryPolling()
          return
        }
        void fetchRealtimeData()
      }

      primaryAlignTimeoutRef.current = window.setTimeout(() => {
        run()
        intervalRef.current = window.setInterval(run, intervalMs)
      }, delay)
    }

    function stopRetroPolling() {
      if (retroAlignTimeoutRef.current !== undefined) {
        clearTimeout(retroAlignTimeoutRef.current)
        retroAlignTimeoutRef.current = undefined
      }
      if (retroIntervalRef.current !== undefined) {
        clearInterval(retroIntervalRef.current)
        retroIntervalRef.current = undefined
      }
    }

    function startRetroPolling() {
      if (!useRealData || isPaused) {
        stopRetroPolling()
        return
      }

      const lookback = retroCorrectionSecondsRef.current
      if (!lookback || lookback <= 0) {
        stopRetroPolling()
        return
      }

      const intervalMs = timeRange.updateInterval
      const delay = getAlignedDelay(intervalMs)

      stopRetroPolling()

      const run = () => {
        if (!useRealData || isPaused) {
          stopRetroPolling()
          return
        }
        const currentLookback = retroCorrectionSecondsRef.current
        if (!currentLookback || currentLookback <= 0) {
          stopRetroPolling()
          return
        }
        void fetchRealtimeData(currentLookback)
      }

      retroAlignTimeoutRef.current = window.setTimeout(() => {
        run()
        retroIntervalRef.current = window.setInterval(run, intervalMs)
      }, delay)
    }

    const startRealtimePolling = () => {
      if (!isPaused) {
        if (scrollIntervalRef.current) {
          clearInterval(scrollIntervalRef.current)
          scrollIntervalRef.current = undefined
        }
        startPrimaryPolling()
        if (retroCorrectionSecondsRef.current > 0) {
          startRetroPolling()
        }
      } else {
        stopPrimaryPolling()
        stopRetroPolling()
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
      stopPrimaryPolling()
      stopRetroPolling()
      if (scrollIntervalRef.current) {
        clearInterval(scrollIntervalRef.current)
        scrollIntervalRef.current = undefined
      }
    }
  }, [timeRange, mode, isPaused, retroLookbackOverride, calculateTotal, mergeAndSortDataPoints, alignToSecond])
  
  return { dataPoints, error, isLoading }
}

import { useState, useEffect, useRef } from 'react'
import { DataPoint, TimeRange } from '@/lib/types'
import { energySimulator } from '@/lib/energySimulator'

export function useEnergyData(timeRange: TimeRange, isPaused: boolean = false) {
  const [dataPoints, setDataPoints] = useState<DataPoint[]>([])
  const startTimeRef = useRef(Date.now())
  const animationFrameRef = useRef<number | undefined>(undefined)
  const lastUpdateRef = useRef<number>(Date.now())
  const lastScrollRef = useRef<number>(Date.now())
  
  useEffect(() => {
    startTimeRef.current = Date.now()
    
    const initialPoints: DataPoint[] = []
    const now = Date.now()
    for (let i = timeRange.seconds; i > 0; i--) {
      const timestamp = now - (i * 1000)
      initialPoints.push(energySimulator.generateDataPoint(timestamp))
    }
    setDataPoints(initialPoints)
    
    const maxPoints = timeRange.seconds
    
    const update = () => {
      const now = Date.now()
      const timeSinceLastUpdate = now - lastUpdateRef.current
      const timeSinceLastScroll = now - lastScrollRef.current
      
      if (timeSinceLastUpdate >= timeRange.updateInterval && !isPaused) {
        lastUpdateRef.current = now
        lastScrollRef.current = now
        
        const newPoint = energySimulator.generateDataPoint(now)
        
        setDataPoints(prev => {
          const updated = [...prev, newPoint]
          return updated.slice(-maxPoints)
        })
      } else if (timeSinceLastScroll >= timeRange.updateInterval && isPaused) {
        lastScrollRef.current = now
        
        setDataPoints(prev => {
          const oldestTime = now - (timeRange.seconds * 1000)
          return prev.filter(point => point.timestamp > oldestTime)
        })
      }
      
      animationFrameRef.current = requestAnimationFrame(update)
    }
    
    animationFrameRef.current = requestAnimationFrame(update)
    
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
      }
    }
  }, [timeRange, isPaused])
  
  return dataPoints
}

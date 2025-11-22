import { useEffect, useState } from 'react'
import { Card } from '@/components/ui/card'
import { Lightning, TrendUp, TrendDown } from '@phosphor-icons/react'
import { motion, useSpring, useTransform } from 'framer-motion'

interface TotalUsageProps {
  currentWatts: number
  previousWatts?: number
}

export function TotalUsage({ currentWatts, previousWatts = 0 }: TotalUsageProps) {
  const [displayValue, setDisplayValue] = useState(0)
  
  useEffect(() => {
    const startValue = displayValue
    const endValue = currentWatts
    const duration = 300
    const startTime = Date.now()
    
    const animate = () => {
      const now = Date.now()
      const elapsed = now - startTime
      const progress = Math.min(elapsed / duration, 1)
      
      const eased = 1 - Math.pow(1 - progress, 3)
      const value = startValue + (endValue - startValue) * eased
      
      setDisplayValue(value)
      
      if (progress < 1) {
        requestAnimationFrame(animate)
      }
    }
    
    requestAnimationFrame(animate)
  }, [currentWatts])
  
  const kilowatts = displayValue / 1000
  const trend = currentWatts - previousWatts
  const trendPercent = previousWatts > 0 ? ((trend / previousWatts) * 100) : 0
  
  return (
    <Card className="p-6 border-2 border-primary/30 bg-gradient-to-br from-card to-card/50">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-2">
            <Lightning weight="fill" className="w-5 h-5 text-accent" />
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
              Total Power
            </h2>
          </div>
          
          <div className="flex items-baseline gap-2">
            <motion.div
              className="text-5xl font-bold tabular-nums"
              key={Math.floor(kilowatts)}
            >
              {kilowatts.toFixed(2)}
            </motion.div>
            <span className="text-2xl text-muted-foreground font-medium">kW</span>
          </div>
          
          {previousWatts > 0 && (
            <div className="flex items-center gap-2 mt-3">
              {trend > 0 ? (
                <TrendUp weight="bold" className="w-4 h-4 text-accent" />
              ) : (
                <TrendDown weight="bold" className="w-4 h-4 text-primary" />
              )}
              <span className="text-sm text-muted-foreground">
                {Math.abs(trendPercent).toFixed(1)}% {trend > 0 ? 'increase' : 'decrease'}
              </span>
            </div>
          )}
        </div>
        
        <div className="text-right">
          <div className="text-sm text-muted-foreground mb-1">Current Draw</div>
          <div className="text-lg font-mono tabular-nums">
            {Math.round(currentWatts)} W
          </div>
        </div>
      </div>
    </Card>
  )
}

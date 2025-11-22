import { Device } from '@/lib/types'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Lightning, Circle } from '@phosphor-icons/react'
import { motion } from 'framer-motion'

interface DeviceListProps {
  devices: Device[]
}

export function DeviceList({ devices }: DeviceListProps) {
  const sortedDevices = [...devices].sort((a, b) => b.watts - a.watts)
  
  return (
    <div className="space-y-3">
      {sortedDevices.map((device) => (
        <motion.div
          key={device.id}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
        >
          <Card className="p-4 border-2 hover:border-primary/50 transition-colors">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  {device.status === 'active' && (
                    <Lightning weight="fill" className="w-4 h-4 text-accent" />
                  )}
                  <h3 className="font-semibold text-sm truncate">{device.name}</h3>
                </div>
                <p className="text-xs text-muted-foreground">{device.category}</p>
              </div>
              
              <div className="flex flex-col items-end gap-2">
                <div className="text-right">
                  <div className="text-2xl font-bold tabular-nums">
                    {(device.watts / 1000).toFixed(2)}
                  </div>
                  <div className="text-xs text-muted-foreground">kW</div>
                </div>
                
                <Badge 
                  variant={device.status === 'active' ? 'default' : 'secondary'}
                  className="text-xs"
                >
                  <Circle 
                    weight="fill" 
                    className="w-2 h-2 mr-1"
                  />
                  {device.status}
                </Badge>
              </div>
            </div>
            
            <div className="mt-3 h-1 bg-secondary rounded-full overflow-hidden">
              <motion.div
                className="h-full bg-gradient-to-r from-primary to-accent"
                initial={{ width: 0 }}
                animate={{ width: `${Math.min(100, (device.watts / 5000) * 100)}%` }}
                transition={{ duration: 0.3 }}
              />
            </div>
          </Card>
        </motion.div>
      ))}
    </div>
  )
}

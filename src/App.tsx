import { useState, useMemo } from 'react'
import { Card } from '@/components/ui/card'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { EnergyChart } from '@/components/EnergyChart'
import { DeviceList } from '@/components/DeviceList'
import { TotalUsage } from '@/components/TotalUsage'
import { useEnergyData } from '@/hooks/use-energy-data'
import { energySimulator } from '@/lib/energySimulator'
import { TIME_RANGES } from '@/lib/types'
import { Lightning, ChartLine } from '@phosphor-icons/react'

function App() {
  const [selectedRange, setSelectedRange] = useState<keyof typeof TIME_RANGES>('1m')
  const timeRange = TIME_RANGES[selectedRange]
  const dataPoints = useEnergyData(timeRange)
  
  const currentTotal = useMemo(() => {
    if (dataPoints.length === 0) return 0
    return dataPoints[dataPoints.length - 1].total
  }, [dataPoints])
  
  const previousTotal = useMemo(() => {
    if (dataPoints.length < 2) return 0
    return dataPoints[dataPoints.length - 2].total
  }, [dataPoints])
  
  const devices = useMemo(() => {
    const deviceList = energySimulator.getDevices()
    if (dataPoints.length === 0) return deviceList
    
    const latestData = dataPoints[dataPoints.length - 1]
    return deviceList.map(device => ({
      ...device,
      watts: latestData.devices[device.id] || 0
    }))
  }, [dataPoints])
  
  return (
    <div className="min-h-screen bg-background p-4 md:p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        <header className="flex items-center gap-3 mb-8">
          <div className="p-3 rounded-lg bg-primary/20 border-2 border-primary">
            <Lightning weight="fill" className="w-8 h-8 text-primary" />
          </div>
          <div>
            <h1 className="text-3xl md:text-4xl font-bold tracking-tight">
              Energy Monitor
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Real-time power consumption tracking
            </p>
          </div>
        </header>
        
        <TotalUsage 
          currentWatts={currentTotal} 
          previousWatts={previousTotal}
        />
        
        <Card className="p-6">
          <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
            <div className="flex items-center gap-2">
              <ChartLine weight="bold" className="w-5 h-5 text-primary" />
              <h2 className="text-xl font-semibold">Power Usage</h2>
            </div>
            
            <Tabs value={selectedRange} onValueChange={(v) => setSelectedRange(v as keyof typeof TIME_RANGES)}>
              <TabsList className="grid grid-cols-4 w-full sm:w-auto">
                {Object.entries(TIME_RANGES).map(([key, range]) => (
                  <TabsTrigger key={key} value={key} className="text-xs sm:text-sm">
                    {range.label}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          </div>
          
          <div className="bg-secondary/30 rounded-lg p-4">
            <EnergyChart data={dataPoints} height={400} />
          </div>
        </Card>
        
        <Card className="p-6">
          <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
            <Lightning weight="bold" className="w-5 h-5 text-accent" />
            Active Devices
            <span className="text-sm font-normal text-muted-foreground ml-2">
              ({devices.filter(d => d.status === 'active').length} active)
            </span>
          </h2>
          <DeviceList devices={devices} />
        </Card>
        
        <footer className="text-center text-xs text-muted-foreground py-4">
          <p>Live energy monitoring • Updates every {timeRange.updateInterval / 1000}s</p>
        </footer>
      </div>
    </div>
  )
}

export default App

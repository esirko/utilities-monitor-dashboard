import { useState, useMemo, useEffect } from 'react'
import { Card } from '@/components/ui/card'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { EnergyChart } from '@/components/EnergyChart'
import { DeviceList } from '@/components/DeviceList'
import { TotalUsage } from '@/components/TotalUsage'
import { LoginForm } from '@/components/LoginForm'
import { Clock } from '@/components/Clock'
import { useEnergyData } from '@/hooks/use-energy-data'
import { useRealEnergyData } from '@/hooks/use-real-energy-data'
import { energySimulator } from '@/lib/energySimulator'
import { api } from '@/lib/api'
import { TIME_RANGES } from '@/lib/types'
import { Lightning, ChartLine, SignOut, Pause, Play } from '@phosphor-icons/react'

type DataMode = 'demo' | 'real'

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [isDemoMode, setIsDemoMode] = useState(false)
  const [dataMode, setDataMode] = useState<DataMode>('demo')
  const [selectedRange, setSelectedRange] = useState<keyof typeof TIME_RANGES>('1m')
  const [isPaused, setIsPaused] = useState(false)
  const timeRange = TIME_RANGES[selectedRange]
  
  useEffect(() => {
    const resizeObserverErrorHandler = (e: ErrorEvent) => {
      if (
        e.message === 'ResizeObserver loop completed with undelivered notifications.' ||
        e.message.includes('ResizeObserver loop')
      ) {
        e.stopImmediatePropagation()
        e.preventDefault()
        return true
      }
    }
    
    window.addEventListener('error', resizeObserverErrorHandler, true)
    
    return () => {
      window.removeEventListener('error', resizeObserverErrorHandler, true)
    }
  }, [])
  
  const demoData = useEnergyData(timeRange, isPaused)
  const { dataPoints: realDataPoints, error: realDataError, isLoading: isLoadingRealData } = useRealEnergyData(timeRange, dataMode === 'real', isPaused)
  const [backendDevices, setBackendDevices] = useState<any[]>([])
  const [electricityRate, setElectricityRate] = useState<number>(0.314555)
  const [systemName, setSystemName] = useState<string>('Home')
  
  const dataPoints = dataMode === 'real' ? realDataPoints : demoData
  
  useEffect(() => {
    if (isAuthenticated && dataMode === 'demo') {
      setDataMode('real')
    }
  }, [isAuthenticated])
  
  useEffect(() => {
    if (dataMode === 'real' && isAuthenticated) {
      const fetchDevices = async () => {
        try {
          const devices = await api.getDevices()
          setBackendDevices(devices)
        } catch (err) {
          console.error('Failed to fetch devices from backend:', err)
          setBackendDevices([])
        }
      }
      fetchDevices()
      
      const fetchConfig = async () => {
        try {
          const config = await api.getConfig()
          setElectricityRate(config.electricityRate)
          setSystemName(config.systemName)
        } catch (err) {
          console.error('Failed to fetch config from backend:', err)
        }
      }
      fetchConfig()
    }
  }, [dataMode, isAuthenticated])
  
  const currentTotal = useMemo(() => {
    if (dataPoints.length === 0) return 0
    return dataPoints[dataPoints.length - 1].total
  }, [dataPoints])
  
  const previousTotal = useMemo(() => {
    if (dataPoints.length < 2) return 0
    return dataPoints[dataPoints.length - 2].total
  }, [dataPoints])
  
  const devices = useMemo(() => {
    const latestData = dataPoints.length > 0 ? dataPoints[dataPoints.length - 1] : null
    
    if (dataMode === 'real' && backendDevices.length > 0 && latestData) {
      const uniqueDevicesMap = new Map<string, any>()
      backendDevices.forEach(device => {
        uniqueDevicesMap.set(String(device.id), device)
      })
      
      return Array.from(uniqueDevicesMap.values()).map(device => {
        const watts = latestData.devices[device.id] || 0
        return {
          ...device,
          id: String(device.id),
          watts,
          status: watts > 10 ? 'active' as const : 'idle' as const
        }
      })
    }
    
    const deviceList = energySimulator.getDevices()
    if (!latestData) return deviceList
    
    return deviceList.map(device => ({
      ...device,
      watts: latestData.devices[device.id] || 0
    }))
  }, [dataPoints, dataMode, backendDevices])
  
  const hourlyCost = useMemo(() => {
    const kWh = currentTotal / 1000
    return kWh * electricityRate
  }, [currentTotal, electricityRate])
  
  const monthlyCost = useMemo(() => {
    return hourlyCost * 24 * 30
  }, [hourlyCost])
  
  const handleLogout = () => {
    api.logout()
    setIsAuthenticated(false)
    setIsDemoMode(false)
    setDataMode('demo')
    setIsPaused(false)
  }
  
  const handleLoginSuccess = () => {
    setIsAuthenticated(true)
    setIsDemoMode(false)
    setDataMode('real')
    setIsPaused(false)
  }
  
  const handleDemoMode = () => {
    setIsDemoMode(true)
    setDataMode('demo')
    setIsPaused(false)
  }
  
  if (!isAuthenticated && !isDemoMode) {
    return <LoginForm onLoginSuccess={handleLoginSuccess} onDemoMode={handleDemoMode} />
  }
  
  return (
    <div className="min-h-screen bg-background p-4 md:p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        <header className="flex items-center justify-between mb-8 flex-wrap gap-4">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-lg bg-primary/20 border-2 border-primary">
              <Lightning weight="fill" className="w-8 h-8 text-primary" />
            </div>
            <div>
              <h1 className="text-3xl md:text-4xl font-bold tracking-tight">
                Energy Monitor {!isDemoMode && systemName && `- ${systemName}`}
              </h1>
              <p className="text-sm text-muted-foreground mt-1">
                {isDemoMode ? 'Demo Mode - Simulated Data' : 'Real-time power consumption tracking with Emporia Vue and pyemvue'}
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <Button 
              variant={isPaused ? "default" : "outline"}
              size="sm" 
              onClick={() => setIsPaused(!isPaused)}
            >
              {isPaused ? (
                <>
                  <Play className="w-4 h-4 mr-2" />
                  Resume
                </>
              ) : (
                <>
                  <Pause className="w-4 h-4 mr-2" />
                  Pause
                </>
              )}
            </Button>
            <Button variant="outline" size="sm" onClick={handleLogout}>
              <SignOut className="w-4 h-4 mr-2" />
              {isDemoMode ? 'Exit Demo' : 'Logout'}
            </Button>
          </div>
        </header>
        
        <div className="flex justify-center mb-4">
          <Clock />
        </div>
        
        {realDataError && dataMode === 'real' && (
          <Alert variant="destructive">
            <AlertDescription>
              {realDataError} - Switched to demo mode.
            </AlertDescription>
          </Alert>
        )}
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <TotalUsage 
            currentWatts={currentTotal} 
            previousWatts={previousTotal}
          />
          <Card className="p-6 border-2 border-primary/30">
            <div className="text-xs text-muted-foreground uppercase tracking-wider mb-2">Hourly Cost</div>
            <div className="text-3xl font-bold text-foreground tabular-nums">
              ${hourlyCost.toFixed(4)}
            </div>
          </Card>
          <Card className="p-6 border-2 border-primary/30">
            <div className="text-xs text-muted-foreground uppercase tracking-wider mb-2">Monthly Extrapolation</div>
            <div className="text-3xl font-bold text-foreground tabular-nums">
              ${monthlyCost.toFixed(2)}
            </div>
          </Card>
        </div>
        
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
          
          <div className="bg-secondary/30 rounded-lg p-4 relative min-h-[400px]">
            <EnergyChart data={dataPoints} devices={devices} height={400} />
            {dataMode === 'real' && isLoadingRealData && dataPoints.length === 0 && (
              <div className="absolute inset-0 flex items-center justify-center bg-secondary/50 backdrop-blur-sm rounded-lg">
                <div className="text-center">
                  <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary mb-2"></div>
                  <p className="text-sm text-muted-foreground">Loading historical data...</p>
                </div>
              </div>
            )}
            {dataMode === 'real' && isLoadingRealData && dataPoints.length > 0 && (
              <div className="absolute top-2 right-2 flex items-center gap-2 bg-card/90 backdrop-blur-sm px-3 py-1.5 rounded-md border border-border">
                <div className="inline-block animate-spin rounded-full h-3 w-3 border-b-2 border-primary"></div>
                <p className="text-xs text-muted-foreground">Loading...</p>
              </div>
            )}
          </div>
        </Card>
        
        <Card className="p-6 font-mono">
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
          <p>
            {isPaused ? 'Data updates paused' : `Live energy monitoring • Updates every ${timeRange.updateInterval / 1000}s`}
          </p>
        </footer>
      </div>
    </div>
  );
}

export default App

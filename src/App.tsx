import { useState, useMemo, useEffect, ReactNode } from 'react'
import { Card } from '@/components/ui/card'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '@/components/ui/resizable'
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

type PaneKey = 'emporia' | 'automation' | 'insights'
type LayoutMode = 'single' | 'dual-horizontal' | 'dual-vertical' | 'triple'
type PaneSlot = 'primary' | 'secondary' | 'tertiary'

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [isDemoMode, setIsDemoMode] = useState(false)
  const [dataMode, setDataMode] = useState<DataMode>('demo')
  const [selectedRange, setSelectedRange] = useState<keyof typeof TIME_RANGES>('1m')
  const [isPaused, setIsPaused] = useState(false)
  const timeRange = TIME_RANGES[selectedRange]
  const [layoutMode, setLayoutMode] = useState<LayoutMode>('single')
  const [paneAssignments, setPaneAssignments] = useState<Record<PaneSlot, PaneKey>>({
    primary: 'emporia',
    secondary: 'automation',
    tertiary: 'insights'
  })
  
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
    console.log(`[App] Data mode: ${dataMode}, Data points: ${dataPoints.length}, Range: ${selectedRange}`)
    if (dataPoints.length > 0) {
      const oldest = new Date(dataPoints[0].timestamp).toLocaleTimeString()
      const newest = new Date(dataPoints[dataPoints.length - 1].timestamp).toLocaleTimeString()
      console.log(`[App] Data range: ${oldest} to ${newest}`)
    }
  }, [dataPoints, dataMode, selectedRange])
  
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

  const paneMeta: Record<PaneKey, { label: string; description: string }> = {
    emporia: {
      label: 'Emporia Portal',
      description: 'Live Emporia Vue account dashboard'
    },
    automation: {
      label: 'Automation Studio',
      description: 'Design and test upcoming automation flows'
    },
    insights: {
      label: 'Insights Notebook',
      description: 'Collect research notes and analytics ideas'
    }
  }
  const paneKeys = Object.keys(paneMeta) as PaneKey[]

  const updatePaneAssignment = (slot: PaneSlot, nextPane: PaneKey) => {
    setPaneAssignments(prev => {
      if (prev[slot] === nextPane) return prev
      const updated: Record<PaneSlot, PaneKey> = { ...prev }
      const conflict = (Object.entries(prev).find(([, pane]) => pane === nextPane)?.[0] as PaneSlot | undefined)
      if (conflict) {
        updated[conflict] = prev[slot]
      }
      updated[slot] = nextPane
      return updated
    })
  }

  const renderPlaceholderPane = (
    title: string,
    description: string,
    cards: Array<{ title: string; body: string }>
  ) => (
    <div className="flex h-full flex-col overflow-hidden bg-background">
      <div className="border-b px-4 py-3 sm:px-6">
        <h2 className="text-lg font-semibold leading-tight">{title}</h2>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-6">
        <div className="grid gap-4 md:grid-cols-2">
          {cards.map(card => (
            <Card key={card.title} className="border-dashed bg-card/40 p-4">
              <h3 className="text-sm font-semibold">{card.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{card.body}</p>
            </Card>
          ))}
        </div>
      </div>
    </div>
  )

  const automationPane = renderPlaceholderPane(
    'Automation Studio',
    'Prototype future automations, schedules, and device routines in this workspace.',
    [
      {
        title: 'Trigger ideas',
        body: 'Sketch automation triggers such as peak-hour usage, device state changes, or manual overrides.'
      },
      {
        title: 'Action sequences',
        body: 'Plan the steps each routine should perform. This placeholder will host drag-and-drop workflow editors.'
      },
      {
        title: 'Metrics to monitor',
        body: 'List the readings that confirm or abort a routine, including voltage, temperature, or occupancy.'
      },
      {
        title: 'Next steps',
        body: 'Capture integration tasks, API needs, or notifications you want to add once the feature ships.'
      }
    ]
  )

  const insightsPane = renderPlaceholderPane(
    'Insights Notebook',
    'Track observations, analysis questions, and follow-ups alongside your energy data.',
    [
      {
        title: 'Observation log',
        body: 'Note trends, anomalies, or spikes that deserve deeper investigation when analytics tools arrive.'
      },
      {
        title: 'Hypothesis queue',
        body: 'Record questions the team wants to validate—like device drift, seasonal patterns, or forecast accuracy.'
      },
      {
        title: 'Data wishlist',
        body: 'Document external feeds or sensors that would enhance reporting once they are connected.'
      },
      {
        title: 'Collaboration notes',
        body: 'Assign follow-ups, jot meeting notes, or track approvals from partner teams in one place.'
      }
    ]
  )

  const emporiaPane = (
    <div className="flex h-full flex-col overflow-hidden bg-background">
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-7xl mx-auto space-y-6 px-4 py-6 md:px-6">
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
    </div>
  )

  const paneContentMap: Record<PaneKey, ReactNode> = {
    emporia: emporiaPane,
    automation: automationPane,
    insights: insightsPane
  }

  const renderAssignmentSelect = (slot: PaneSlot, label: string, isVisible: boolean) => {
    if (!isVisible) return null
    return (
      <div className="flex flex-col gap-1">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</span>
        <Select value={paneAssignments[slot]} onValueChange={(value) => updatePaneAssignment(slot, value as PaneKey)}>
          <SelectTrigger size="sm" className="min-w-[12rem] bg-background/80">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {paneKeys.map(option => (
              <SelectItem key={option} value={option}>
                {paneMeta[option].label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    )
  }

  const renderLayout = () => {
    const primary = paneAssignments.primary
    const secondary = paneAssignments.secondary
    const tertiary = paneAssignments.tertiary

    const panel = (key: PaneKey) => (
      <div className="h-full" key={key}>
        {paneContentMap[key]}
      </div>
    )

    switch (layoutMode) {
      case 'single':
        return (
          <div className="h-full">
            {panel(primary)}
          </div>
        )
      case 'dual-horizontal':
        return (
          <ResizablePanelGroup direction="horizontal" className="h-full">
            <ResizablePanel defaultSize={50} minSize={20} collapsible collapsedSize={0}>
              {panel(primary)}
            </ResizablePanel>
            <ResizableHandle withHandle />
            <ResizablePanel defaultSize={50} minSize={20} collapsible collapsedSize={0}>
              {panel(secondary)}
            </ResizablePanel>
          </ResizablePanelGroup>
        )
      case 'dual-vertical':
        return (
          <ResizablePanelGroup direction="vertical" className="h-full">
            <ResizablePanel defaultSize={50} minSize={20} collapsible collapsedSize={0}>
              {panel(primary)}
            </ResizablePanel>
            <ResizableHandle withHandle />
            <ResizablePanel defaultSize={50} minSize={20} collapsible collapsedSize={0}>
              {panel(secondary)}
            </ResizablePanel>
          </ResizablePanelGroup>
        )
      case 'triple':
        return (
          <ResizablePanelGroup direction="horizontal" className="h-full">
            <ResizablePanel defaultSize={40} minSize={20} collapsible collapsedSize={0}>
              {panel(primary)}
            </ResizablePanel>
            <ResizableHandle withHandle />
            <ResizablePanel defaultSize={60} minSize={30} collapsible collapsedSize={0}>
              <ResizablePanelGroup direction="vertical" className="h-full">
                <ResizablePanel defaultSize={50} minSize={20} collapsible collapsedSize={0}>
                  {panel(secondary)}
                </ResizablePanel>
                <ResizableHandle withHandle />
                <ResizablePanel defaultSize={50} minSize={20} collapsible collapsedSize={0}>
                  {panel(tertiary)}
                </ResizablePanel>
              </ResizablePanelGroup>
            </ResizablePanel>
          </ResizablePanelGroup>
        )
      default:
        return null
    }
  }

  const showSecondary = layoutMode !== 'single'
  const showTertiary = layoutMode === 'triple'

  const primaryLabel =
    layoutMode === 'single'
      ? 'Fullscreen Pane'
      : layoutMode === 'dual-horizontal'
        ? 'Left Pane'
        : layoutMode === 'dual-vertical'
          ? 'Top Pane'
          : 'Main Pane'

  const secondaryLabel =
    layoutMode === 'dual-horizontal'
      ? 'Right Pane'
      : layoutMode === 'dual-vertical'
        ? 'Bottom Pane'
        : 'Secondary Pane'

  const tertiaryLabel = 'Supporting Pane'

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex max-w-[1440px] flex-col gap-6 px-4 py-6">
        <Card className="flex flex-col gap-4 p-4 shadow-sm">
          <div className="space-y-1">
            <h2 className="text-lg font-semibold">Workspace layout</h2>
            <p className="text-sm text-muted-foreground">
              Arrange the Emporia portal alongside upcoming modules. Choose a layout and assign panes to each slot.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <ToggleGroup
              type="single"
              value={layoutMode}
              onValueChange={(value) => value && setLayoutMode(value as LayoutMode)}
              variant="outline"
              size="sm"
            >
              <ToggleGroupItem value="single">Single</ToggleGroupItem>
              <ToggleGroupItem value="dual-horizontal">Split H</ToggleGroupItem>
              <ToggleGroupItem value="dual-vertical">Split V</ToggleGroupItem>
              <ToggleGroupItem value="triple">1 : 2</ToggleGroupItem>
            </ToggleGroup>
          </div>
          <div className="flex flex-wrap items-end gap-4">
            {renderAssignmentSelect('primary', primaryLabel, true)}
            {renderAssignmentSelect('secondary', secondaryLabel, showSecondary)}
            {renderAssignmentSelect('tertiary', tertiaryLabel, showTertiary)}
          </div>
        </Card>
        <div className="rounded-xl border bg-card/40 shadow-sm">
          <div className="h-[72vh] min-h-[520px] overflow-hidden">
            {renderLayout()}
          </div>
        </div>
      </div>
    </div>
  )
}

export default App

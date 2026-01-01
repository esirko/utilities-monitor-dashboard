import {
  useState,
  useMemo,
  useEffect,
  ReactNode,
  ComponentProps,
  useId,
  useCallback,
  useRef,
} from 'react'
import { Card } from '@/components/ui/card'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '@/components/ui/resizable'
import { EnergyChart } from '@/components/EnergyChart'
import { DeviceList } from '@/components/DeviceList'
import { LoginForm } from '@/components/LoginForm'
import { Clock } from '@/components/Clock'
import { UtilityStream, SelectionRect } from '@/components/UtilityStream'
import { Checkbox } from '@/components/ui/checkbox'
import { useRealEnergyData } from '@/hooks/use-real-energy-data'
import { api, StreamInfo } from '@/lib/api'
import { TIME_RANGES } from '@/lib/types'
import { Lightning, ChartLine, SignOut, Pause, Play } from '@phosphor-icons/react'

type DataMode = 'demo' | 'real'

type PaneKey = 'electricity' | 'gas' | 'water'
type SplitOrientation = 'horizontal' | 'vertical'

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [isDemoMode, setIsDemoMode] = useState(false)
  const [dataMode, setDataMode] = useState<DataMode>('demo')
  const [selectedRange, setSelectedRange] = useState<keyof typeof TIME_RANGES>('1m')
  const timeRange = TIME_RANGES[selectedRange]
  const [paneVisibility, setPaneVisibility] = useState<Record<PaneKey, boolean>>({
    electricity: true,
    gas: true,
    water: true
  })
  const [splitOrientation, setSplitOrientation] = useState<SplitOrientation>('horizontal')
  const [gasStream, setGasStream] = useState<StreamInfo>({})
  const [waterStream, setWaterStream] = useState<StreamInfo>({})
  const [waterInvertZoom, setWaterInvertZoom] = useState<boolean>(true)
  const waterInvertZoomId = useId()
  const selectionTimersRef = useRef<Record<'gas' | 'water', ReturnType<typeof setTimeout> | null>>({
    gas: null,
    water: null,
  })
  const SELECTION_DEBOUNCE_MS = 300

  const sendSelection = useCallback(
    (streamName: 'gas' | 'water', selection: SelectionRect | null) => {
      const timers = selectionTimersRef.current
      const existing = timers[streamName]
      if (existing) {
        clearTimeout(existing)
      }

      timers[streamName] = window.setTimeout(() => {
        void api.setStreamSelection(streamName, selection).catch(error => {
          console.error(`[App] Failed to update ${streamName} selection:`, error)
        })
        timers[streamName] = null
      }, SELECTION_DEBOUNCE_MS)
    },
    [SELECTION_DEBOUNCE_MS]
  )

  useEffect(() => {
    const timers = selectionTimersRef.current
    return () => {
      (Object.values(timers) as Array<ReturnType<typeof setTimeout> | null>).forEach(timer => {
        if (timer) {
          clearTimeout(timer)
        }
      })
    }
  }, [])

  const handleGasSelectionChange = useCallback(
    (selection: SelectionRect | null) => {
      sendSelection('gas', selection)
    },
    [sendSelection]
  )

  const handleWaterSelectionChange = useCallback(
    (selection: SelectionRect | null) => {
      sendSelection('water', selection)
    },
    [sendSelection]
  )
  
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
  
  const energyMode: 'real' | 'demo' | 'off' =
    isAuthenticated && dataMode === 'real'
      ? 'real'
      : isDemoMode && dataMode === 'demo'
        ? 'demo'
        : 'off'

  const { dataPoints, error: energyDataError, isLoading: isLoadingEnergyData } = useRealEnergyData(timeRange, energyMode, false)
  const [backendDevices, setBackendDevices] = useState<any[]>([])
  const [electricityRate, setElectricityRate] = useState<number>(0.314555)
  const [systemName, setSystemName] = useState<string>('Not connected')
  
  useEffect(() => {
    console.log(`[App] Data mode: ${dataMode}, Data points: ${dataPoints.length}, Range: ${selectedRange}`)
    if (dataPoints.length > 0) {
      const oldest = new Date(dataPoints[0].timestamp).toLocaleTimeString()
      const newest = new Date(dataPoints[dataPoints.length - 1].timestamp).toLocaleTimeString()
      console.log(`[App] Data range: ${oldest} to ${newest}`)
    }
  }, [dataPoints, dataMode, selectedRange])
  
  useEffect(() => {
    let cancelled = false

    const loadInitialConfig = async () => {
      try {
        const config = await api.getConfig()
        if (cancelled) return

        setElectricityRate(config.electricityRate)
        setSystemName(config.systemName || 'Not connected')

        if (config.gasStreamUrl !== undefined) {
          setGasStream(prev => ({ ...prev, rtsp: config.gasStreamUrl || null }))
        }
        if (config.waterStreamUrl !== undefined) {
          setWaterStream(prev => ({ ...prev, rtsp: config.waterStreamUrl || null }))
        }
        if (config.gasStream) {
          setGasStream(config.gasStream)
        }
        if (config.waterStream) {
          setWaterStream(config.waterStream)
        }
      } catch (err) {
        console.error('Failed to fetch initial config from backend:', err)
      }
    }

    loadInitialConfig()

    return () => {
      cancelled = true
    }
  }, [])
  
  useEffect(() => {
    let cancelled = false

    const fetchDevices = async () => {
      try {
        if (dataMode === 'real') {
          if (!isAuthenticated) {
            if (!cancelled) {
              setBackendDevices([])
            }
            return
          }
          const devices = await api.getDevices()
          if (!cancelled) {
            setBackendDevices(devices)
          }
        } else {
          const devices = await api.getDemoDevices()
          if (!cancelled) {
            setBackendDevices(devices)
          }
        }
      } catch (err) {
        console.error('Failed to fetch devices from backend:', err)
        if (!cancelled) {
          setBackendDevices([])
        }
      }
    }

    const fetchRealConfig = async () => {
      try {
        const config = await api.getConfig()
        if (cancelled) return

        setElectricityRate(config.electricityRate)
        setSystemName(config.systemName)

        if (config.gasStreamUrl !== undefined) {
          setGasStream(prev => ({ ...prev, rtsp: config.gasStreamUrl || null }))
        }
        if (config.waterStreamUrl !== undefined) {
          setWaterStream(prev => ({ ...prev, rtsp: config.waterStreamUrl || null }))
        }
        if (config.gasStream) {
          setGasStream(config.gasStream)
        }
        if (config.waterStream) {
          setWaterStream(config.waterStream)
        }
      } catch (err) {
        console.error('Failed to fetch config from backend:', err)
      }
    }

    if (energyMode === 'off') {
      setBackendDevices([])
      return () => {
        cancelled = true
      }
    }

    fetchDevices()

    if (dataMode === 'real' && isAuthenticated) {
      fetchRealConfig()
    }

    return () => {
      cancelled = true
    }
  }, [dataMode, isAuthenticated, energyMode])

  useEffect(() => {
    let cancelled = false
    const loadStreams = async () => {
      const streams = await api.getStreamUrls()
      if (!cancelled) {
        setGasStream(streams.gas || {})
        setWaterStream(streams.water || {})
      }
    }
    loadStreams()
    return () => {
      cancelled = true
    }
  }, [])
  
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
    const deviceSource = backendDevices.length > 0
      ? backendDevices
      : Object.keys(latestData?.devices ?? {}).map((id) => ({
          id,
          name: id,
          category: 'Demo',
          status: 'active'
        }))

    if (deviceSource.length === 0) {
      return []
    }

    return deviceSource.map(device => {
      const deviceId = String(device.id)
      const watts = latestData?.devices?.[deviceId] ?? 0
      return {
        ...device,
        id: deviceId,
        watts,
        status: watts > 10 ? 'active' : 'idle'
      }
    })
  }, [dataPoints, backendDevices])
  
  const hourlyCost = useMemo(() => {
    const kWh = currentTotal / 1000
    return kWh * electricityRate
  }, [currentTotal, electricityRate])
  
  const monthlyCost = useMemo(() => {
    return hourlyCost * 24 * 30
  }, [hourlyCost])

  const totalKilowatts = useMemo(() => currentTotal / 1000, [currentTotal])
  
  const handleLogout = async () => {
    await api.logout()
    setIsAuthenticated(false)
    setIsDemoMode(false)
    setDataMode('demo')
    setBackendDevices([])
    setGasStream({})
    setWaterStream({})
  }
  
  const handleLoginSuccess = () => {
    setIsAuthenticated(true)
    setIsDemoMode(false)
    setDataMode('real')
  }
  
  const handleDemoMode = () => {
    setIsDemoMode(true)
    setDataMode('demo')
  }
  
  const paneMeta: Record<PaneKey, { label: string; description: string }> = {
    electricity: {
      label: 'Electricity',
      description: 'Live Emporia Vue account dashboard'
    },
    gas: {
      label: 'Gas',
      description: 'Upcoming controls and analytics for gas utilities'
    },
    water: {
      label: 'Water',
      description: 'Placeholder workspace for water usage insights'
    }
  }
  const paneKeys = Object.keys(paneMeta) as PaneKey[]

  const handlePaneSelectionChange = (values: string[]) => {
    const typedValues = values.filter((value): value is PaneKey => paneKeys.includes(value as PaneKey))
    if (typedValues.length === 0) {
      return
    }
    setPaneVisibility(prev => {
      const next = { ...prev }
      paneKeys.forEach(key => {
        next[key] = typedValues.includes(key)
      })
      return next
    })
  }

  const renderPlaceholderPane = (
    title: string,
    description?: string,
    cards?: Array<{ title: string; body: string }>,
    stream?: StreamInfo,
    options?: {
      streamProps?: Partial<ComponentProps<typeof UtilityStream>>
      extrasBelowStream?: ReactNode
    }
  ) => (
    <div className="flex h-full flex-col overflow-hidden bg-background">
      <div className="border-b px-4 py-3 sm:px-6">
        <h2 className="text-lg font-semibold leading-tight">{title}</h2>
        {description ? (
          <p className="text-sm text-muted-foreground">{description}</p>
        ) : null}
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-6">
        <div className="space-y-6">
          <UtilityStream
            rtspUrl={stream?.rtsp ?? null}
            mjpegUrl={stream?.mjpeg ?? null}
            restreamAvailable={stream?.restreamAvailable}
            title={`${title} stream`}
            note={stream?.mjpeg
              ? 'Drag on the video to select a region to zoom. Double-click or use reset to clear the selection.'
              : (!stream?.restreamAvailable
                ? 'Backend restreaming is disabled. Install the restream dependencies or expose an MJPEG/WebRTC feed for browser playback.'
                : undefined)
            }
            {...options?.streamProps}
          />
          {options?.extrasBelowStream}
          {cards && cards.length > 0 && (
            <div className="grid gap-4 md:grid-cols-2">
              {cards.map(card => (
                <Card key={card.title} className="border-dashed bg-card/40 p-4">
                  <h3 className="text-sm font-semibold">{card.title}</h3>
                  <p className="mt-2 text-sm text-muted-foreground">{card.body}</p>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )

  const gasPane = renderPlaceholderPane(
    'Gas',
    undefined,
    undefined,
    gasStream,
    {
      streamProps: { onSelectionChange: handleGasSelectionChange }
    }
  )

  const waterPane = renderPlaceholderPane(
    'Water',
    undefined,
    undefined,
    waterStream,
    {
      streamProps: {
        invertZoomPreview: waterInvertZoom,
        onSelectionChange: handleWaterSelectionChange,
      },
      extrasBelowStream: (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Checkbox
            id={waterInvertZoomId}
            checked={waterInvertZoom}
            onCheckedChange={checked => setWaterInvertZoom(checked === true)}
          />
          <label
            htmlFor={waterInvertZoomId}
            className="cursor-pointer select-none text-muted-foreground"
          >
            Render zoom preview upside-down
          </label>
        </div>
      )
    }
  )

  const electricityPane = (!isAuthenticated && !isDemoMode) ? (
    <div className="flex h-full items-center justify-center overflow-hidden bg-background px-4 py-6">
      <div className="w-full max-w-md">
        <LoginForm onLoginSuccess={handleLoginSuccess} onDemoMode={handleDemoMode} />
      </div>
    </div>
  ) : (
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
                  {systemName || 'Not connected'}
                </h1>
                <p className="text-sm text-muted-foreground mt-1">
                  {isDemoMode
                    ? 'Demo Mode - Simulated Data'
                    : 'Real-time power consumption tracking with Emporia Vue and pyemvue'}
                </p>
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={handleLogout}>
                <SignOut className="w-4 h-4 mr-2" />
                {isDemoMode ? 'Exit Demo' : 'Logout'}
              </Button>
            </div>
          </header>
          
          {energyDataError && (
            <Alert variant="destructive">
              <AlertDescription>
                {energyDataError}
              </AlertDescription>
            </Alert>
          )}
          
          <Card className="p-6">
            <div className="flex flex-col gap-6">
              <div className="flex flex-wrap items-start justify-between gap-6">
                <div className="flex items-center gap-2">
                  <ChartLine weight="bold" className="w-5 h-5 text-primary" />
                  <h2 className="text-xl font-semibold">Power Usage</h2>
                </div>
                <div className="flex flex-wrap items-end gap-x-8 gap-y-4 text-sm sm:text-base">
                  <div className="flex flex-col min-w-[150px]">
                    <span className="text-xs uppercase tracking-wider text-muted-foreground">Total Power</span>
                    <div className="flex items-baseline gap-2">
                      <span className="text-3xl font-bold tabular-nums">{totalKilowatts.toFixed(3)}</span>
                      <span className="text-sm text-muted-foreground">kW</span>
                    </div>
                  </div>
                  <div className="flex flex-col min-w-[150px]">
                    <span className="text-xs uppercase tracking-wider text-muted-foreground">Hourly Cost</span>
                    <span className="text-2xl font-semibold tabular-nums">${hourlyCost.toFixed(4)}</span>
                  </div>
                  <div className="flex flex-col min-w-[150px]">
                    <span className="text-xs uppercase tracking-wider text-muted-foreground">Monthly Extrapolation</span>
                    <span className="text-2xl font-semibold tabular-nums">${monthlyCost.toFixed(2)}</span>
                  </div>
                </div>
              </div>
              <div className="bg-secondary/30 rounded-lg p-4 relative min-h-[400px]">
                <EnergyChart data={dataPoints} devices={devices} height={400} />
                {isLoadingEnergyData && dataPoints.length === 0 && (
                  <div className="absolute inset-0 flex items-center justify-center bg-secondary/50 backdrop-blur-sm rounded-lg">
                    <div className="text-center">
                      <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary mb-2"></div>
                      <p className="text-sm text-muted-foreground">Loading energy data...</p>
                    </div>
                  </div>
                )}
                {isLoadingEnergyData && dataPoints.length > 0 && (
                  <div className="absolute top-2 right-2 flex items-center gap-2 bg-card/90 backdrop-blur-sm px-3 py-1.5 rounded-md border border-border">
                    <div className="inline-block animate-spin rounded-full h-3 w-3 border-b-2 border-primary"></div>
                    <p className="text-xs text-muted-foreground">Updating data...</p>
                  </div>
                )}
              </div>
              <div className="flex justify-start">
                <Tabs value={selectedRange} onValueChange={(v) => setSelectedRange(v as keyof typeof TIME_RANGES)}>
                  <TabsList className="grid w-full grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-0 sm:w-auto">
                    {Object.entries(TIME_RANGES).map(([key, range]) => (
                      <TabsTrigger key={key} value={key} className="text-xs sm:text-sm">
                        {range.label}
                      </TabsTrigger>
                    ))}
                  </TabsList>
                </Tabs>
              </div>
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
            <p>Live energy monitoring • Updates every {timeRange.updateInterval / 1000}s</p>
          </footer>
        </div>
      </div>
    </div>
  )

  const paneContentMap: Record<PaneKey, ReactNode> = {
    electricity: electricityPane,
    gas: gasPane,
    water: waterPane
  }
  const visiblePanes = paneKeys.filter((key): key is PaneKey => paneVisibility[key])
  const orderedPanes: PaneKey[] = visiblePanes.includes('electricity')
    ? (['electricity', ...visiblePanes.filter(key => key !== 'electricity')] as PaneKey[])
    : visiblePanes

  const renderLayout = () => {
    if (orderedPanes.length === 0) {
      return (
        <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
          Enable at least one pane to get started.
        </div>
      )
    }

    const panel = (key: PaneKey) => (
      <div className="h-full" key={key}>
        {paneContentMap[key]}
      </div>
    )

    if (orderedPanes.length === 1) {
      return <div className="h-full">{panel(orderedPanes[0])}</div>
    }

    if (orderedPanes.length === 2) {
      const [first, second] = orderedPanes
      if (splitOrientation === 'horizontal') {
        return (
          <ResizablePanelGroup direction="horizontal" className="h-full">
            <ResizablePanel defaultSize={50} minSize={20} collapsible collapsedSize={0}>
              {panel(first)}
            </ResizablePanel>
            <ResizableHandle withHandle />
            <ResizablePanel defaultSize={50} minSize={20} collapsible collapsedSize={0}>
              {panel(second)}
            </ResizablePanel>
          </ResizablePanelGroup>
        )
      }
      return (
        <ResizablePanelGroup direction="vertical" className="h-full">
          <ResizablePanel defaultSize={50} minSize={20} collapsible collapsedSize={0}>
            {panel(first)}
          </ResizablePanel>
          <ResizableHandle withHandle />
          <ResizablePanel defaultSize={50} minSize={20} collapsible collapsedSize={0}>
            {panel(second)}
          </ResizablePanel>
        </ResizablePanelGroup>
      )
    }

    const [first, second, third] = orderedPanes

    if (splitOrientation === 'horizontal') {
      return (
        <ResizablePanelGroup direction="horizontal" className="h-full">
          <ResizablePanel defaultSize={40} minSize={20} collapsible collapsedSize={0}>
            {panel(first)}
          </ResizablePanel>
          <ResizableHandle withHandle />
          <ResizablePanel defaultSize={60} minSize={30} collapsible collapsedSize={0}>
            <ResizablePanelGroup direction="vertical" className="h-full">
              <ResizablePanel defaultSize={50} minSize={20} collapsible collapsedSize={0}>
                {panel(second)}
              </ResizablePanel>
              <ResizableHandle withHandle />
              <ResizablePanel defaultSize={50} minSize={20} collapsible collapsedSize={0}>
                {panel(third)}
              </ResizablePanel>
            </ResizablePanelGroup>
          </ResizablePanel>
        </ResizablePanelGroup>
      )
    }

    return (
      <ResizablePanelGroup direction="vertical" className="h-full">
        <ResizablePanel defaultSize={40} minSize={20} collapsible collapsedSize={0}>
          {panel(first)}
        </ResizablePanel>
        <ResizableHandle withHandle />
        <ResizablePanel defaultSize={60} minSize={30} collapsible collapsedSize={0}>
          <ResizablePanelGroup direction="horizontal" className="h-full">
            <ResizablePanel defaultSize={50} minSize={20} collapsible collapsedSize={0}>
              {panel(second)}
            </ResizablePanel>
            <ResizableHandle withHandle />
            <ResizablePanel defaultSize={50} minSize={20} collapsible collapsedSize={0}>
              {panel(third)}
            </ResizablePanel>
          </ResizablePanelGroup>
        </ResizablePanel>
      </ResizablePanelGroup>
    )
  }

  const utilitiesTitle = 'Utilities monitor'
  const canAdjustOrientation = visiblePanes.length >= 2
  const utilitiesToggleValues = visiblePanes

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex max-w-[1440px] flex-col gap-6 px-4 py-6">
        <Card className="flex items-center gap-3 p-3 shadow-sm sm:p-4">
          <h1 className="text-xl font-semibold leading-tight tracking-tight sm:text-2xl">
            <span className="inline-flex items-center gap-2 text-left sm:gap-3">
              <span>{utilitiesTitle}</span>
              {systemName && !isDemoMode && (
                <>
                  <span className="text-muted-foreground">-</span>
                  <span>{systemName}</span>
                </>
              )}
              <span className="text-muted-foreground">-</span>
              <span className="inline-flex">
                <Clock />
              </span>
            </span>
          </h1>
        </Card>
        <div className="rounded-xl border bg-card/40 shadow-sm">
          <div className="h-[72vh] min-h-[520px] overflow-hidden">
            {renderLayout()}
          </div>
        </div>
        <footer className="mt-auto">
          <Card className="flex flex-col gap-3 p-3 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:p-4">
            <span className="text-sm font-medium text-muted-foreground">View controls</span>
            <div className="flex flex-wrap items-center gap-3 sm:gap-4">
              <ToggleGroup
                type="multiple"
                value={utilitiesToggleValues}
                onValueChange={handlePaneSelectionChange}
                variant="outline"
                size="sm"
              >
                {paneKeys.map((pane) => (
                  <ToggleGroupItem
                    key={pane}
                    value={pane}
                    className="capitalize px-3 text-sm leading-tight border border-transparent text-muted-foreground transition-all hover:border-2 hover:border-orange-400 hover:bg-transparent hover:text-foreground data-[state=on]:border-2 data-[state=on]:border-yellow-400 data-[state=on]:bg-yellow-400 data-[state=on]:text-slate-900 data-[state=on]:hover:border-orange-400"
                  >
                    {paneMeta[pane].label}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
              <ToggleGroup
                type="single"
                value={splitOrientation}
                onValueChange={(value) => {
                  if (!value || !canAdjustOrientation) return
                  setSplitOrientation(value as SplitOrientation)
                }}
                variant="outline"
                size="sm"
                className={!canAdjustOrientation ? 'opacity-60' : ''}
              >
                <ToggleGroupItem
                  value="horizontal"
                  disabled={!canAdjustOrientation}
                  className="px-3 border border-transparent text-muted-foreground transition-all hover:border-2 hover:border-orange-400 hover:bg-transparent hover:text-foreground data-[state=on]:border-2 data-[state=on]:border-yellow-400 data-[state=on]:bg-yellow-400 data-[state=on]:text-slate-900 data-[state=on]:hover:border-orange-400 disabled:opacity-60"
                >
                  Horizontal
                </ToggleGroupItem>
                <ToggleGroupItem
                  value="vertical"
                  disabled={!canAdjustOrientation}
                  className="px-3 border border-transparent text-muted-foreground transition-all hover:border-2 hover:border-orange-400 hover:bg-transparent hover:text-foreground data-[state=on]:border-2 data-[state=on]:border-yellow-400 data-[state=on]:bg-yellow-400 data-[state=on]:text-slate-900 data-[state=on]:hover:border-orange-400 disabled:opacity-60"
                >
                  Vertical
                </ToggleGroupItem>
              </ToggleGroup>
            </div>
          </Card>
        </footer>
      </div>
    </div>
  )
}

export default App

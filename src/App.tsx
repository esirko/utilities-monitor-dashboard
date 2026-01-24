import {
  useState,
  useMemo,
  useEffect,
  ReactNode,
  ComponentProps,
  useCallback,
  useRef,
} from 'react'
import { Card } from '@/components/ui/card'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '@/components/ui/resizable'
import { EnergyChart } from '@/components/EnergyChart'
import { DeviceList } from '@/components/DeviceList'
import { LoginForm } from '@/components/LoginForm'
import { Clock } from '@/components/Clock'
import { UtilityStream, SelectionRect } from '@/components/UtilityStream'
import { useRealEnergyData } from '@/hooks/use-real-energy-data'
import { api, StreamInfo } from '@/lib/api'
import { TIME_RANGES } from '@/lib/types'
import { Lightning, ChartLine, SignOut, Pause, Play, Flame, Drop } from '@phosphor-icons/react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

type DataMode = 'demo' | 'real'

type PaneKey = 'electricity' | 'gas' | 'water'
type SplitOrientation = 'horizontal' | 'vertical'

const ZERO_SELECTION_BOXES: SelectionRect[] = [
  { x: 0, y: 0, width: 0, height: 0 },
  { x: 0, y: 0, width: 0, height: 0 },
]

const boxesConfigured = (boxes: SelectionRect[] | undefined): boolean =>
  Array.isArray(boxes) && boxes.some(box => box.width > 0 && box.height > 0)

const cloneZeroBoxes = (): SelectionRect[] => ZERO_SELECTION_BOXES.map(box => ({ ...box }))

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [isDemoMode, setIsDemoMode] = useState(false)
  const [dataMode, setDataMode] = useState<DataMode>('demo')
  const [selectedRange, setSelectedRange] = useState<keyof typeof TIME_RANGES>('1m')
  const timeRange = TIME_RANGES[selectedRange]
  const retroLookbackEnabled = selectedRange === '1m'
  const [paneVisibility, setPaneVisibility] = useState<Record<PaneKey, boolean>>({
    electricity: true,
    gas: true,
    water: true
  })
  const [splitOrientation, setSplitOrientation] = useState<SplitOrientation>('horizontal')
  const [gasStream, setGasStream] = useState<StreamInfo>({})
  const [waterStream, setWaterStream] = useState<StreamInfo>({})
  const [waterInvertZoom, setWaterInvertZoom] = useState<boolean>(true)
  const retroLookbackInitializedRef = useRef(false)

  const updateStreamSelectionState = useCallback((streamName: 'gas' | 'water', boxes: SelectionRect[], configured?: boolean) => {
    const resolved = configured ?? boxesConfigured(boxes)
    if (streamName === 'gas') {
      setGasStream(prev => ({ ...prev, selectionBoxes: boxes, selectionConfigured: resolved }))
    } else {
      setWaterStream(prev => ({ ...prev, selectionBoxes: boxes, selectionConfigured: resolved }))
    }
  }, [])

  const handleConfirmSelectionSet = useCallback(async (streamName: 'gas' | 'water', boxes: SelectionRect[]) => {
    await api.setStreamSelections(streamName, boxes)
    try {
      const { boxes: persisted, configured } = await api.getStreamSelections(streamName)
      updateStreamSelectionState(streamName, persisted, configured)
    } catch (error) {
      console.error(`[App] Failed to refresh ${streamName} selections after confirmation:`, error)
      updateStreamSelectionState(streamName, boxes)
    }
  }, [updateStreamSelectionState])

  const handleResetSelectionSet = useCallback(async (streamName: 'gas' | 'water') => {
    await api.resetStreamSelections(streamName)
    try {
      const { boxes: persisted, configured } = await api.getStreamSelections(streamName)
      updateStreamSelectionState(streamName, persisted, configured)
    } catch (error) {
      console.error(`[App] Failed to refresh ${streamName} selections after reset:`, error)
      updateStreamSelectionState(streamName, cloneZeroBoxes(), false)
    }
  }, [updateStreamSelectionState])
  
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

  const [backendDevices, setBackendDevices] = useState<any[]>([])
  const [electricityRate, setElectricityRate] = useState<number>(0.314555)
  const [systemName, setSystemName] = useState<string>('Not connected')
  const [retroLookbackSeconds, setRetroLookbackSeconds] = useState<number>(5)
  const clampRetroLookback = useCallback((value: number) => {
    if (!Number.isFinite(value)) return 0
    return Math.min(10, Math.max(0, Math.round(value)))
  }, [])

  const handleRetroLookbackChange = useCallback((value: string) => {
    retroLookbackInitializedRef.current = true
    const parsed = Number(value)
    setRetroLookbackSeconds(clampRetroLookback(Number.isFinite(parsed) ? parsed : 0))
  }, [clampRetroLookback])

  const { dataPoints, error: energyDataError, isLoading: isLoadingEnergyData } = useRealEnergyData(
    timeRange,
    energyMode,
    false,
    retroLookbackEnabled ? retroLookbackSeconds : 0
  )
  
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
        if (
          !retroLookbackInitializedRef.current &&
          typeof config.retroactiveCorrectionSeconds === 'number'
        ) {
          setRetroLookbackSeconds(clampRetroLookback(config.retroactiveCorrectionSeconds))
          retroLookbackInitializedRef.current = true
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
        if (
          !retroLookbackInitializedRef.current &&
          typeof config.retroactiveCorrectionSeconds === 'number'
        ) {
          setRetroLookbackSeconds(clampRetroLookback(config.retroactiveCorrectionSeconds))
          retroLookbackInitializedRef.current = true
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
      ratesInfo?: { title: string; content: ReactNode }
      icon?: ReactNode
    }
  ) => (
    <div className="flex h-full flex-col overflow-hidden bg-background">
      <div className="border-b px-4 py-3 sm:px-6">
        <div className="flex items-center gap-3">
          {options?.icon}
          <h2 className="text-lg font-semibold leading-tight">{title}</h2>
          {options?.ratesInfo && (
            <Dialog>
              <DialogTrigger asChild>
                <button className="text-sm text-primary hover:underline focus:outline-none">
                  Rates
                </button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{options.ratesInfo.title}</DialogTitle>
                </DialogHeader>
                <DialogDescription asChild>
                  <div className="text-sm text-muted-foreground">
                    {options.ratesInfo.content}
                  </div>
                </DialogDescription>
              </DialogContent>
            </Dialog>
          )}
        </div>
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
              ? 'Draw two regions on the video, then confirm to save. Double-click the active region to clear it.'
              : (!stream?.restreamAvailable
                ? 'Backend restreaming is disabled. Install the restream dependencies or expose an MJPEG/WebRTC feed for browser playback.'
                : undefined)
            }
            savedSelections={stream?.selectionBoxes}
            selectionConfigured={stream?.selectionConfigured}
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
      icon: <Flame weight="fill" className="w-5 h-5 text-orange-500" />,
      streamProps: {
        onConfirmSelections: boxes => handleConfirmSelectionSet('gas', boxes),
        onResetSelections: () => handleResetSelectionSet('gas'),
      },
      ratesInfo: {
        title: 'Gas Rates',
        content: (
          <div className="space-y-2">
            <p>The upper right dial is in units of CCF (100 cubic feet) (which is why it says 1000 cubic feet per rev).</p>
            <p>The lower left dial spins 200 times per CCF (so a full rev is a half cubic foot, as it says).</p>
            <p>1 CCF = 1.0293 therms.</p>
            <p><strong>The gas rate is $2.61/therm, or $2.69/CCF, or 1.34 cents per revolution (lower-left dial).</strong></p>
            <p>If the lower-left dial completed a revolution every 60 seconds, and stayed at that rate for a month, the cost would be $581.</p>
          </div>
        ),
      },
    }
  )

  const waterPane = renderPlaceholderPane(
    'Water',
    undefined,
    undefined,
    waterStream,
    {
      icon: <Drop weight="fill" className="w-5 h-5 text-blue-500" />,
      streamProps: {
        onConfirmSelections: boxes => handleConfirmSelectionSet('water', boxes),
        onResetSelections: () => handleResetSelectionSet('water'),
        secondaryPreviewFlipped: waterInvertZoom,
        onSecondaryPreviewFlipToggle: value => setWaterInvertZoom(value),
      },
      extrasBelowStream: null,
      ratesInfo: {
        title: 'Water Rates',
        content: (
          <div className="space-y-2">
            <p><strong>The water rate is 7.96 cents per cubic foot</strong> (up to 8000 cubic feet, and 16.53 cents per cubic foot after that).</p>
            <p></p>
          </div>
        ),
      },
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
              <Lightning weight="fill" className="w-5 h-5 text-yellow-500" />
              <h1 className="text-lg font-semibold tracking-tight">Electricity</h1>
              {isDemoMode && (
                <span className="text-sm text-muted-foreground">(Demo Mode)</span>
              )}
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
            <div className="flex flex-col gap-4">
              <div className="flex flex-wrap items-end gap-x-8 gap-y-3 text-sm sm:text-base">
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
              <div className="bg-secondary/30 rounded-lg p-4 relative min-h-[400px]">
                <EnergyChart
                  data={dataPoints}
                  devices={devices}
                  height={400}
                  retroLookbackSeconds={retroLookbackEnabled ? retroLookbackSeconds : undefined}
                  showRetroLookbackLine={retroLookbackEnabled}
                  sampleIntervalMs={timeRange.updateInterval}
                  timeRangeSeconds={timeRange.seconds}
                />
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
              <div className="flex flex-wrap items-center justify-between gap-4">
                <Tabs value={selectedRange} onValueChange={(v) => setSelectedRange(v as keyof typeof TIME_RANGES)}>
                  <TabsList className="grid w-full grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-0 sm:w-auto">
                    {Object.entries(TIME_RANGES).map(([key, range]) => (
                      <TabsTrigger key={key} value={key} className="text-xs sm:text-sm">
                        {range.label}
                      </TabsTrigger>
                    ))}
                  </TabsList>
                </Tabs>
                {retroLookbackEnabled && (
                  <div className="flex items-center gap-2 text-xs sm:text-sm">
                    <span className="uppercase tracking-wider text-muted-foreground hidden sm:inline">Retro Lookback</span>
                    <Select value={String(retroLookbackSeconds)} onValueChange={handleRetroLookbackChange}>
                      <SelectTrigger className="w-[100px] sm:w-[120px] text-xs sm:text-sm">
                        <SelectValue placeholder="0" />
                      </SelectTrigger>
                      <SelectContent className="max-h-60">
                        {Array.from({ length: 11 }, (_, index) => index).map((seconds) => (
                          <SelectItem key={seconds} value={String(seconds)}>
                            {seconds} sec{seconds === 1 ? '' : 's'}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
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
      <div className="mx-auto flex max-w-[1440px] flex-col gap-3 px-4 py-3">
        <Card className="flex items-center gap-2 px-3 py-2 shadow-sm">
          <h1 className="text-lg font-semibold leading-tight tracking-tight">
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
          <div className="h-[calc(100vh-80px)] min-h-[520px] overflow-hidden">
            {renderLayout()}
          </div>
        </div>
        <footer className="mt-8">
          <Card className="flex flex-col gap-3 px-3 py-2 shadow-sm sm:flex-row sm:items-center sm:justify-between">
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
                    className="capitalize px-3.5 text-sm leading-tight border border-transparent text-muted-foreground transition-all hover:border-2 hover:border-orange-400 hover:bg-transparent hover:text-foreground data-[state=on]:border-2 data-[state=on]:border-yellow-400 data-[state=on]:bg-yellow-400 data-[state=on]:text-slate-900 data-[state=on]:hover:border-orange-400 min-w-[110px] justify-center"
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

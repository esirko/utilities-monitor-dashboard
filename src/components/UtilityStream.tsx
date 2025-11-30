import { useEffect, useMemo, useRef, useState } from 'react'
import ReactPlayer from 'react-player'
import { Alert, AlertDescription } from '@/components/ui/alert'

interface UtilityStreamProps {
  rtspUrl?: string | null
  mjpegUrl?: string | null
  restreamAvailable?: boolean
  title: string
  note?: string
}

interface SelectionRect {
  x: number
  y: number
  width: number
  height: number
}

function isValidUrl(value?: string | null) {
  if (!value) return false
  try {
    const parsed = new URL(value)
    return Boolean(parsed.protocol)
  } catch {
    return false
  }
}

function getStreamDetails(rtspUrl?: string | null, fallbackUrl?: string | null) {
  const activeUrl = rtspUrl ?? fallbackUrl ?? null
  if (!activeUrl || !isValidUrl(activeUrl)) {
    return {
      isValid: false,
      message: 'No stream URL available. Configure the backend GAS_RTSP_URL/WATER_RTSP_URL to enable live video.',
      protocol: null as string | null
    }
  }
  const protocol = new URL((rtspUrl ?? fallbackUrl) as string).protocol.replace(':', '').toLowerCase()
  const isRtsp = protocol === 'rtsp'
  const message = isRtsp
    ? 'RTSP streams are not natively supported in browsers. Ensure the backend is restreaming this feed (e.g., via WebRTC/HLS) for playback here.'
    : undefined
  return {
    isValid: true,
    message,
    protocol
  }
}

// react-player's type definitions don't align perfectly with our TS config. Cast to any for flexibility.
const Player = ReactPlayer as unknown as React.FC<any>

export function UtilityStream({ rtspUrl, mjpegUrl, restreamAvailable, title, note }: UtilityStreamProps) {
  const details = useMemo(() => getStreamDetails(rtspUrl, mjpegUrl), [rtspUrl, mjpegUrl])
  const [status, setStatus] = useState<'idle' | 'loading' | 'playing' | 'error'>(mjpegUrl ? 'loading' : 'idle')
  const [selection, setSelection] = useState<SelectionRect | null>(null)
  const [isSelecting, setIsSelecting] = useState(false)
  const dragStartRef = useRef<{ x: number; y: number } | null>(null)
  const isSelectingRef = useRef(false)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const moveListenerRef = useRef<((event: PointerEvent) => void) | null>(null)
  const upListenerRef = useRef<((event: PointerEvent) => void) | null>(null)

  useEffect(() => {
    setStatus(mjpegUrl ? 'loading' : 'idle')
    setSelection(null)
    isSelectingRef.current = false
  }, [mjpegUrl])

  useEffect(() => {
    if (status === 'error') {
      setSelection(null)
    }
  }, [status])

  if (!details.isValid) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{details.message}</AlertDescription>
      </Alert>
    )
  }

  const canSelect = Boolean(mjpegUrl) && status !== 'error'

  const clamp = (value: number) => Math.min(Math.max(value, 0), 1)
  const MIN_SELECTION = 0.05

  const removeGlobalListeners = () => {
    if (moveListenerRef.current) {
      window.removeEventListener('pointermove', moveListenerRef.current)
      moveListenerRef.current = null
    }
    if (upListenerRef.current) {
      window.removeEventListener('pointerup', upListenerRef.current)
      window.removeEventListener('pointercancel', upListenerRef.current)
      upListenerRef.current = null
    }
  }

  useEffect(() => () => removeGlobalListeners(), [])

  const updateSelectionFromClient = (clientX: number, clientY: number) => {
    if (!isSelectingRef.current || !dragStartRef.current || !containerRef.current) {
      return
    }
    const rect = containerRef.current.getBoundingClientRect()
    const x = clamp((clientX - rect.left) / rect.width)
    const y = clamp((clientY - rect.top) / rect.height)
    const start = dragStartRef.current
    const left = Math.min(start.x, x)
    const top = Math.min(start.y, y)
    const width = Math.abs(x - start.x)
    const height = Math.abs(y - start.y)
    setSelection({ x: left, y: top, width, height })
  }

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!canSelect || !containerRef.current) return
    event.preventDefault()
    const rect = containerRef.current.getBoundingClientRect()
    const x = clamp((event.clientX - rect.left) / rect.width)
    const y = clamp((event.clientY - rect.top) / rect.height)
    dragStartRef.current = { x, y }
    setSelection({ x, y, width: 0, height: 0 })
    setIsSelecting(true)
    isSelectingRef.current = true

    const handleMove = (nativeEvent: PointerEvent) => {
      updateSelectionFromClient(nativeEvent.clientX, nativeEvent.clientY)
    }

    const handleUp = (nativeEvent: PointerEvent) => {
      finalizeSelection()
      removeGlobalListeners()
    }

    moveListenerRef.current = handleMove
    upListenerRef.current = handleUp

    window.addEventListener('pointermove', handleMove)
    window.addEventListener('pointerup', handleUp)
    window.addEventListener('pointercancel', handleUp)
  }

  const updateSelection = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!isSelectingRef.current) return
    updateSelectionFromClient(event.clientX, event.clientY)
  }

  const finalizeSelection = (event?: React.PointerEvent<HTMLDivElement>) => {
    if (!isSelectingRef.current) return
    if (event && containerRef.current) {
      try {
        containerRef.current.releasePointerCapture(event.pointerId)
      } catch {
        // ignore
      }
    }
    setIsSelecting(false)
    isSelectingRef.current = false
    dragStartRef.current = null
    setSelection(prev => {
      if (!prev) return null
      if (prev.width < MIN_SELECTION || prev.height < MIN_SELECTION) {
        return null
      }
      return prev
    })
    removeGlobalListeners()
  }

  const clearSelection = () => {
    setSelection(null)
    dragStartRef.current = null
    setIsSelecting(false)
    isSelectingRef.current = false
    removeGlobalListeners()
  }

  const showZoom = Boolean(selection && mjpegUrl && status === 'playing')

  let zoomStyles: React.CSSProperties | undefined
  if (selection && selection.width > 0 && selection.height > 0) {
    const widthPercent = 100 / Math.max(selection.width, 0.0001)
    const heightPercent = 100 / Math.max(selection.height, 0.0001)
    const leftPercent = (-selection.x * 100) / Math.max(selection.width, 0.0001)
    const topPercent = (-selection.y * 100) / Math.max(selection.height, 0.0001)
    zoomStyles = {
      position: 'absolute',
      width: `${widthPercent}%`,
      height: `${heightPercent}%`,
      left: `${leftPercent}%`,
      top: `${topPercent}%`
    }
  }

  return (
    <div className="space-y-3">
      <div
        ref={containerRef}
        className="relative aspect-video overflow-hidden rounded-md border border-border/60 bg-black"
        onPointerDown={handlePointerDown}
        onPointerMove={updateSelection}
        onPointerUp={finalizeSelection}
        onDoubleClick={clearSelection}
        role="presentation"
        style={{ touchAction: 'none' }}
      >
        {mjpegUrl ? (
          <>
            {(status === 'loading') && (
              <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
                Loading video…
              </div>
            )}
            {(status === 'error') && (
              <div className="absolute inset-0 flex items-center justify-center bg-background/80 text-sm text-destructive">
                Failed to load restream. Check backend restreamer.
              </div>
            )}
            <img
              src={mjpegUrl}
              alt={`${title} live stream`}
              className={`h-full w-full object-cover ${status === 'error' ? 'hidden' : ''}`}
              onLoad={() => setStatus('playing')}
              onError={() => setStatus('error')}
            />
            {selection && !isSelecting && (
              <div className="pointer-events-none absolute inset-x-2 bottom-2 rounded-md bg-background/70 px-3 py-1 text-xs text-foreground">
                Zooming on selected region • Double-click to reset
              </div>
            )}
          </>
        ) : (
          <Player
            url={rtspUrl ?? undefined}
            playing
            controls
            muted
            width="100%"
            height="100%"
          />
        )}
        {selection && status !== 'error' && (
          <div
            className="pointer-events-none absolute border-2 border-primary/80 bg-primary/20"
            style={{
              left: `${selection.x * 100}%`,
              top: `${selection.y * 100}%`,
              width: `${selection.width * 100}%`,
              height: `${selection.height * 100}%`
            }}
          />
        )}
        {!selection && canSelect && status === 'playing' && (
          <div className="pointer-events-none absolute inset-x-2 bottom-2 rounded-md bg-background/70 px-3 py-1 text-xs text-foreground">
            Click and drag to zoom • Double-click to reset
          </div>
        )}
      </div>
      {showZoom && zoomStyles && (
        <div className="space-y-2">
          <div className="text-sm font-medium text-muted-foreground">Zoom preview</div>
          <div className="relative aspect-video overflow-hidden rounded-md border border-border/60 bg-black">
            <img
              src={mjpegUrl as string}
              alt={`${title} zoomed preview`}
              className="absolute h-full w-full object-cover"
              style={zoomStyles}
            />
          </div>
          <button
            type="button"
            onClick={clearSelection}
            className="text-xs font-medium text-primary hover:underline"
          >
            Reset zoom
          </button>
        </div>
      )}
      {(details.message || note || (!restreamAvailable && !mjpegUrl)) && (
        <Alert>
          <AlertDescription>
            {details.message}
            {details.message && note ? ' ' : ''}
            {note}
            {!restreamAvailable && !mjpegUrl ? ' Backend restreaming is disabled or unavailable.' : ''}
          </AlertDescription>
        </Alert>
      )}
    </div>
  )
}

export default UtilityStream

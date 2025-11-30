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
  const imageRef = useRef<HTMLImageElement | null>(null)
  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const animationFrameRef = useRef<number | null>(null)
  const [frameSize, setFrameSize] = useState<{ width: number; height: number } | null>(null)
  const dragModeRef = useRef<'idle' | 'draw' | 'move'>('idle')
  const moveOffsetRef = useRef<{ dx: number; dy: number }>({ dx: 0, dy: 0 })

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

  useEffect(() => () => removeGlobalListeners(), [])

  useEffect(() => {
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
        animationFrameRef.current = null
      }
    }
  }, [])

  const canSelect = Boolean(mjpegUrl) && status !== 'error'
  const clamp = (value: number) => Math.min(Math.max(value, 0), 1)
  const MIN_SELECTION = 0.05

   const containerSizeRef = useRef<{ width: number; height: number }>({ width: 0, height: 0 })

  function removeGlobalListeners() {
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

  const updateSelectionFromClient = (clientX: number, clientY: number) => {
    if (!isSelectingRef.current || !containerRef.current) {
      return
    }
      const rect = containerRef.current.getBoundingClientRect()
      containerSizeRef.current = { width: rect.width, height: rect.height }
    const x = clamp((clientX - rect.left) / rect.width)
    const y = clamp((clientY - rect.top) / rect.height)
    if (dragModeRef.current === 'move') {
      setSelection(prev => {
        if (!prev) return prev
        const width = prev.width
        const height = prev.height
        const tentativeX = clamp(x - moveOffsetRef.current.dx)
        const tentativeY = clamp(y - moveOffsetRef.current.dy)
        const clampedX = Math.min(Math.max(tentativeX, 0), 1 - width)
        const clampedY = Math.min(Math.max(tentativeY, 0), 1 - height)
        if (clampedX === prev.x && clampedY === prev.y) {
          return prev
        }
        return { ...prev, x: clampedX, y: clampedY }
      })
    } else {
      const start = dragStartRef.current
      if (!start) return
      const left = Math.min(start.x, x)
      const top = Math.min(start.y, y)
      const width = Math.abs(x - start.x)
      const height = Math.abs(y - start.y)
      setSelection({ x: left, y: top, width, height })
    }
  }

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!canSelect || !containerRef.current) return
    event.preventDefault()
    const rect = containerRef.current.getBoundingClientRect()
      containerSizeRef.current = { width: rect.width, height: rect.height }
    const x = clamp((event.clientX - rect.left) / rect.width)
    const y = clamp((event.clientY - rect.top) / rect.height)
    const pointer = { x, y }
    const existing = selection

    if (
      existing &&
      pointer.x >= existing.x &&
      pointer.x <= existing.x + existing.width &&
      pointer.y >= existing.y &&
      pointer.y <= existing.y + existing.height
    ) {
      dragModeRef.current = 'move'
      moveOffsetRef.current = {
        dx: pointer.x - existing.x,
        dy: pointer.y - existing.y
      }
      dragStartRef.current = null
    } else {
      dragModeRef.current = 'draw'
      dragStartRef.current = pointer
      setSelection({ x: pointer.x, y: pointer.y, width: 0, height: 0 })
    }

    setIsSelecting(true)
    isSelectingRef.current = true

    const handleMove = (nativeEvent: PointerEvent) => {
      updateSelectionFromClient(nativeEvent.clientX, nativeEvent.clientY)
    }

    const handleUp = (_nativeEvent: PointerEvent) => {
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
    const currentMode = dragModeRef.current
    setSelection(prev => {
      if (!prev) return null
      if (currentMode === 'draw' && (prev.width < MIN_SELECTION || prev.height < MIN_SELECTION)) {
        return null
      }
      return prev
    })
    dragModeRef.current = 'idle'
    removeGlobalListeners()
  }

  const clearSelection = () => {
    setSelection(null)
    dragStartRef.current = null
    setIsSelecting(false)
    isSelectingRef.current = false
    dragModeRef.current = 'idle'
    removeGlobalListeners()
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current)
      animationFrameRef.current = null
    }
  }

  const handleImageLoad = (event: React.SyntheticEvent<HTMLImageElement>) => {
    const img = event.currentTarget
    imageRef.current = img
    setFrameSize({
      width: img.naturalWidth || img.width,
      height: img.naturalHeight || img.height
    })
    setStatus('playing')
  }

  const drawZoomPreview = () => {
    if (!selection || !imageRef.current || !previewCanvasRef.current || status !== 'playing') {
      return
    }
    const img = imageRef.current
    const canvas = previewCanvasRef.current
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const naturalWidth = img.naturalWidth || frameSize?.width
    const naturalHeight = img.naturalHeight || frameSize?.height
    if (!naturalWidth || !naturalHeight) return

    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return
    const containerWidth = rect.width
    const containerHeight = rect.height
    if (!containerWidth || !containerHeight) return

    if (canvas.width !== containerWidth || canvas.height !== containerHeight) {
      canvas.width = containerWidth
      canvas.height = containerHeight
    }

    const scale = Math.max(containerWidth / naturalWidth, containerHeight / naturalHeight)
    const displayedWidth = naturalWidth * scale
    const displayedHeight = naturalHeight * scale
    const offsetX = (displayedWidth - containerWidth) / 2
    const offsetY = (displayedHeight - containerHeight) / 2

    const leftPx = selection.x * containerWidth
    const topPx = selection.y * containerHeight
    const widthPx = selection.width * containerWidth
    const heightPx = selection.height * containerHeight

    const sx = (leftPx + offsetX) / scale
    const sy = (topPx + offsetY) / scale
    const sw = widthPx / scale
    const sh = heightPx / scale
    if (sw <= 1 || sh <= 1) return

    const clampedSX = Math.min(Math.max(sx, 0), naturalWidth - sw)
    const clampedSY = Math.min(Math.max(sy, 0), naturalHeight - sh)

    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(img, clampedSX, clampedSY, sw, sh, 0, 0, canvas.width, canvas.height)
  }

  useEffect(() => {
    if (!selection || status !== 'playing' || !mjpegUrl) {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
        animationFrameRef.current = null
      }
      return
    }

    const tick = () => {
      drawZoomPreview()
      animationFrameRef.current = requestAnimationFrame(tick)
    }

    animationFrameRef.current = requestAnimationFrame(tick)

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
        animationFrameRef.current = null
      }
    }
  }, [selection, status, mjpegUrl, frameSize])

  if (!details.isValid) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{details.message}</AlertDescription>
      </Alert>
    )
  }

  const showZoom = Boolean(selection && mjpegUrl && status === 'playing')

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
              ref={imageRef}
              src={mjpegUrl}
              alt={`${title} live stream`}
              className={`h-full w-full object-cover ${status === 'error' ? 'hidden' : ''}`}
              onLoad={handleImageLoad}
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
      {showZoom && (
        <div className="space-y-2">
          <div className="text-sm font-medium text-muted-foreground">Zoom preview</div>
          <div className="relative aspect-video overflow-hidden rounded-md border border-border/60 bg-black">
            <canvas ref={previewCanvasRef} className="h-full w-full" />
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

import { useEffect, useMemo, useState } from 'react'
import ReactPlayer from 'react-player'
import { Alert, AlertDescription } from '@/components/ui/alert'

interface UtilityStreamProps {
  rtspUrl?: string | null
  mjpegUrl?: string | null
  restreamAvailable?: boolean
  title: string
  note?: string
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

  useEffect(() => {
    setStatus(mjpegUrl ? 'loading' : 'idle')
  }, [mjpegUrl])

  if (!details.isValid) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{details.message}</AlertDescription>
      </Alert>
    )
  }

  return (
    <div className="space-y-3">
      <div className="relative aspect-video overflow-hidden rounded-md border border-border/60 bg-black">
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
      </div>
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

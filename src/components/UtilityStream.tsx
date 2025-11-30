import { useMemo } from 'react'
import ReactPlayer from 'react-player'
import { Alert, AlertDescription } from '@/components/ui/alert'

interface UtilityStreamProps {
  url?: string | null
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

function getStreamDetails(url?: string | null) {
  if (!url || !isValidUrl(url)) {
    return {
      isValid: false,
      message: 'No stream URL available. Configure the backend GAS_RTSP_URL/WATER_RTSP_URL to enable live video.',
      protocol: null as string | null
    }
  }
  const protocol = new URL(url).protocol.replace(':', '').toLowerCase()
  const isRtsp = protocol === 'rtsp' || protocol === 'rstp'
  const message = isRtsp
    ? 'RTSP streams are not natively supported in browsers. Ensure the backend is restreaming this feed (e.g., via WebRTC/HLS) for playback here.'
    : undefined
  return {
    isValid: true,
    message,
    protocol
  }
}

export function UtilityStream({ url, title, note }: UtilityStreamProps) {
  const details = useMemo(() => getStreamDetails(url), [url])

  if (!details.isValid) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{details.message}</AlertDescription>
      </Alert>
    )
  }

  return (
    <div className="space-y-3">
      <div className="aspect-video overflow-hidden rounded-md border border-border/60 bg-black">
        <ReactPlayer
          url={url || ''}
          playing
          controls
          muted
          width="100%"
          height="100%"
        />
      </div>
      {(details.message || note) && (
        <Alert>
          <AlertDescription>
            {details.message}
            {details.message && note ? ' ' : ''}
            {note}
          </AlertDescription>
        </Alert>
      )}
    </div>
  )
}

export default UtilityStream

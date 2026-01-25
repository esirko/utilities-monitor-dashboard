import { useState, useEffect } from 'react'

export function Clock() {
  const [time, setTime] = useState(new Date())

  useEffect(() => {
    const interval = setInterval(() => {
      setTime(new Date())
    }, 1000)

    return () => clearInterval(interval)
  }, [])

  const formatDateTime = (date: Date) => {
    const dayDate = date.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric'
    })
    const time = date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      second: '2-digit',
      hour12: true
    })
    return `${dayDate} ${time}`
  }

  return (
    <div className="text-lg font-semibold tabular-nums text-foreground">
      {formatDateTime(time)}
    </div>
  )
}

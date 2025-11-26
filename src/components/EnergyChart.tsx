import { useEffect, useRef } from 'react'
import * as d3 from 'd3'
import { DataPoint, Device } from '@/lib/types'

interface EnergyChartProps {
  data: DataPoint[]
  devices: Device[]
  height?: number
}

export function EnergyChart({ data, devices, height = 400 }: EnergyChartProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const tooltipRef = useRef<d3.Selection<HTMLDivElement, unknown, null, undefined> | null>(null)
  const lastMousePositionRef = useRef<{ x: number; y: number } | null>(null)
  const isMouseOverRef = useRef(false)
  const devicesMapRef = useRef<Map<string, Device>>(new Map())
  
  useEffect(() => {
    const newMap = new Map<string, Device>()
    devices.forEach(device => {
      newMap.set(device.id, device)
    })
    devicesMapRef.current = newMap
  }, [devices])
  
  useEffect(() => {
    if (!svgRef.current || !containerRef.current || data.length === 0) return
    
    const container = containerRef.current
    const width = container.clientWidth
    const margin = { top: 20, right: 20, bottom: 40, left: 60 }
    const innerWidth = width - margin.left - margin.right
    const innerHeight = height - margin.top - margin.bottom
    
    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()
    
    const g = svg
      .append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`)
    
    const deviceIds = data.length > 0 ? Object.keys(data[data.length - 1].devices) : []
    
    const expectedInterval = 1000
    const gapThreshold = expectedInterval * 2
    
    const gaps: Array<{ start: number; end: number }> = []
    for (let i = 1; i < data.length; i++) {
      const timeDiff = data[i].timestamp - data[i - 1].timestamp
      if (timeDiff > gapThreshold) {
        gaps.push({
          start: data[i - 1].timestamp,
          end: data[i].timestamp
        })
      }
    }
    
    const now = Date.now()
    const timeWindowMs = (data.length > 0 && data[data.length - 1]) 
      ? now - data[0].timestamp 
      : 60000
    
    const xScale = d3.scaleLinear()
      .domain([now - timeWindowMs, now])
      .range([0, innerWidth])
    
    const maxTotal = d3.max(data, d => d.total) || 10000
    const yScale = d3.scaleLinear()
      .domain([0, maxTotal * 1.1])
      .range([innerHeight, 0])
    
    const colorScale = d3.scaleOrdinal<string>()
      .domain(deviceIds)
      .range([
        'oklch(0.65 0.19 240)',
        'oklch(0.70 0.18 280)',
        'oklch(0.75 0.16 320)',
        'oklch(0.70 0.17 200)',
        'oklch(0.68 0.18 260)',
        'oklch(0.85 0.15 95)',
        'oklch(0.72 0.16 180)',
        'oklch(0.67 0.19 220)',
        'oklch(0.78 0.14 300)',
      ])
    
    const gridLines = g.append('g').attr('class', 'grid')
    
    const yTicks = yScale.ticks(5)
    gridLines
      .selectAll('line')
      .data(yTicks)
      .join('line')
      .attr('x1', 0)
      .attr('x2', innerWidth)
      .attr('y1', d => yScale(d))
      .attr('y2', d => yScale(d))
      .attr('stroke', 'oklch(0.35 0.02 240)')
      .attr('stroke-width', 1)
      .attr('stroke-dasharray', '2,2')
      .attr('opacity', 0.3)
    
    const stack = d3.stack<DataPoint>()
      .keys(deviceIds)
      .value((d, key) => d.devices[key] || 0)
    
    const stackedData = stack(data)
    
    const area = d3.area<d3.SeriesPoint<DataPoint>>()
      .x(d => xScale(d.data.timestamp))
      .y0(d => yScale(d[0]))
      .y1(d => yScale(d[1]))
      .curve(d3.curveMonotoneX)
      .defined((d, i) => {
        if (i === 0) return true
        const prevTimestamp = data[i - 1]?.timestamp
        const currTimestamp = d.data.timestamp
        const timeDiff = currTimestamp - prevTimestamp
        return timeDiff <= gapThreshold
      })
    
    const areaGroups = g
      .selectAll('.area-group')
      .data(stackedData)
      .join('g')
      .attr('class', 'area-group')
    
    areaGroups
      .append('path')
      .attr('d', area)
      .attr('fill', d => colorScale(d.key))
      .attr('opacity', 0.7)
      .attr('stroke', d => colorScale(d.key))
      .attr('stroke-width', 1.5)
    
    const latestDataPoint = data[data.length - 1]
    const deviceSizes = deviceIds.map(id => ({
      id,
      watts: latestDataPoint.devices[id] || 0,
      device: devicesMapRef.current.get(id)
    })).sort((a, b) => b.watts - a.watts)
    
    const topDevices = deviceSizes.slice(0, 3).filter(d => d.watts > 100)
    
    topDevices.forEach(({ id, device }) => {
      const deviceName = device?.name || id
      const series = stackedData.find(s => s.key === id)
      if (!series) return
      
      const leftIndex = Math.floor(data.length * 0.1)
      const leftPoint = series[leftIndex]
      if (!leftPoint) return
      
      const y0 = yScale(leftPoint[0])
      const y1 = yScale(leftPoint[1])
      const regionHeight = y0 - y1
      
      if (regionHeight < 20) return
      
      const labelY = (y0 + y1) / 2
      const labelX = innerWidth * 0.15
      
      const textColor = 'oklch(1 0 0)'
      
      const textElement = g.append('text')
        .attr('x', labelX)
        .attr('y', labelY)
        .attr('text-anchor', 'middle')
        .attr('dominant-baseline', 'middle')
        .attr('font-family', 'JetBrains Mono')
        .attr('font-size', '12px')
        .attr('font-weight', '600')
        .attr('fill', textColor)
        .attr('pointer-events', 'none')
        .text(deviceName)
      
      const bbox = (textElement.node() as SVGTextElement).getBBox()
      
      g.insert('rect', 'text:last-of-type')
        .attr('x', bbox.x - 4)
        .attr('y', bbox.y - 2)
        .attr('width', bbox.width + 8)
        .attr('height', bbox.height + 4)
        .attr('fill', colorScale(id))
        .attr('opacity', 0.9)
        .attr('rx', 3)
        .attr('pointer-events', 'none')
    })
    
    gaps.forEach(gap => {
      const x1 = xScale(gap.start)
      const x2 = xScale(gap.end)
      
      g.append('rect')
        .attr('x', x1)
        .attr('y', 0)
        .attr('width', x2 - x1)
        .attr('height', innerHeight)
        .attr('fill', 'oklch(0.40 0.04 240)')
        .attr('opacity', 0.3)
        .attr('stroke', 'oklch(0.60 0.10 240)')
        .attr('stroke-width', 1)
        .attr('stroke-dasharray', '4,4')
      
      const textX = (x1 + x2) / 2
      const textY = innerHeight / 2
      
      g.append('text')
        .attr('x', textX)
        .attr('y', textY)
        .attr('text-anchor', 'middle')
        .attr('fill', 'oklch(0.70 0.08 240)')
        .attr('font-family', 'JetBrains Mono')
        .attr('font-size', '11px')
        .attr('font-weight', '500')
        .text('Missing Data')
    })
    
    const xAxis = d3.axisBottom(xScale)
      .ticks(5)
      .tickFormat((d) => {
        const date = new Date(d as number)
        return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}:${String(date.getSeconds()).padStart(2, '0')}`
      })
    
    g.append('g')
      .attr('transform', `translate(0,${innerHeight})`)
      .call(xAxis)
      .attr('color', 'oklch(0.60 0.02 240)')
      .selectAll('text')
      .style('font-family', 'JetBrains Mono')
      .style('font-size', '11px')
    
    const yAxis = d3.axisLeft(yScale)
      .ticks(5)
      .tickFormat(d => `${(d as number / 1000).toFixed(3)}kW`)
    
    g.append('g')
      .call(yAxis)
      .attr('color', 'oklch(0.60 0.02 240)')
      .selectAll('text')
      .style('font-family', 'JetBrains Mono')
      .style('font-size', '11px')
    
    if (!tooltipRef.current) {
      tooltipRef.current = d3.select(container)
        .append('div')
        .attr('class', 'tooltip')
        .style('position', 'absolute')
        .style('pointer-events', 'none')
        .style('opacity', 0)
        .style('background', 'oklch(0.20 0.01 240)')
        .style('border', '1px solid oklch(0.65 0.19 240)')
        .style('border-radius', '4px')
        .style('padding', '8px')
        .style('font-family', 'JetBrains Mono')
        .style('font-size', '12px')
        .style('color', 'oklch(0.95 0.01 240)')
    }
    
    const tooltip = tooltipRef.current
    
    const updateTooltip = (mouseX: number, mouseY: number, offsetX: number, offsetY: number) => {
      const timestamp = xScale.invert(mouseX)
      
      const bisect = d3.bisector<DataPoint, number>(d => d.timestamp).left
      const index = bisect(data, timestamp)
      
      if (index >= 0 && index < data.length) {
        const dataPoint = data[index]
        const date = new Date(dataPoint.timestamp)
        const timeStr = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}:${String(date.getSeconds()).padStart(2, '0')}`
        
        const stackPoint = stackedData.find((series) => {
          const point = series[index]
          if (!point) return false
          const y0 = yScale(point[0])
          const y1 = yScale(point[1])
          return mouseY >= y1 && mouseY <= y0
        })
        
        let html = `<div style="font-weight: 600; margin-bottom: 4px;">${timeStr}</div>`
        
        if (stackPoint) {
          const deviceId = stackPoint.key
          const deviceWatts = dataPoint.devices[deviceId] || 0
          const device = devicesMapRef.current.get(deviceId)
          const deviceName = device?.name || deviceId
          const deviceColor = colorScale(deviceId)
          
          html += `<div style="display: flex; align-items: center; gap: 6px; margin-bottom: 2px;">
            <div style="width: 10px; height: 10px; background: ${deviceColor}; border-radius: 2px;"></div>
            <span style="font-weight: 600;">${deviceName}</span>
          </div>`
          html += `<div style="color: oklch(0.85 0.15 95); font-weight: 600; margin-left: 16px;">${(deviceWatts / 1000).toFixed(3)} kW</div>`
          html += `<div style="margin-top: 6px; padding-top: 6px; border-top: 1px solid oklch(0.35 0.02 240); color: oklch(0.70 0.02 240);">Total: ${(dataPoint.total / 1000).toFixed(3)} kW</div>`
        } else {
          html += `<div style="color: oklch(0.85 0.15 95); font-weight: 600;">Total: ${(dataPoint.total / 1000).toFixed(3)} kW</div>`
        }
        
        tooltip
          .html(html)
          .style('opacity', 1)
          .style('left', `${offsetX - tooltip.node()!.offsetWidth - 10}px`)
          .style('top', `${offsetY - 10}px`)
      }
    }
    
    const overlay = g
      .append('rect')
      .attr('class', 'overlay')
      .attr('width', innerWidth)
      .attr('height', innerHeight)
      .attr('fill', 'none')
      .attr('pointer-events', 'all')
      .on('mousemove', function(event) {
        const [mouseX, mouseY] = d3.pointer(event)
        lastMousePositionRef.current = { x: mouseX, y: mouseY }
        isMouseOverRef.current = true
        updateTooltip(mouseX, mouseY, event.offsetX, event.offsetY)
      })
      .on('mouseout', () => {
        isMouseOverRef.current = false
        lastMousePositionRef.current = null
        tooltip.style('opacity', 0)
      })
    
    if (isMouseOverRef.current && lastMousePositionRef.current) {
      const svgRect = svgRef.current?.getBoundingClientRect()
      const containerRect = container.getBoundingClientRect()
      if (svgRect && containerRect) {
        const offsetX = lastMousePositionRef.current.x + margin.left
        const offsetY = lastMousePositionRef.current.y + margin.top
        updateTooltip(lastMousePositionRef.current.x, lastMousePositionRef.current.y, offsetX, offsetY)
      }
    }
  }, [data, devices, height])
  
  return (
    <div ref={containerRef} className="w-full relative">
      <svg
        ref={svgRef}
        width="100%"
        height={height}
        style={{ display: 'block' }}
      />
    </div>
  )
}

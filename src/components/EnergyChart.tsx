import { useEffect, useRef } from 'react'
import * as d3 from 'd3'
import { DataPoint } from '@/lib/types'
import { energySimulator } from '@/lib/energySimulator'

interface EnergyChartProps {
  data: DataPoint[]
  height?: number
}

export function EnergyChart({ data, height = 400 }: EnergyChartProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  
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
    
    const devices = energySimulator.getDevices()
    const deviceIds = devices.map(d => d.id)
    
    const xScale = d3.scaleLinear()
      .domain([data[0].timestamp, data[data.length - 1].timestamp])
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
      .tickFormat(d => `${(d as number / 1000).toFixed(1)}kW`)
    
    g.append('g')
      .call(yAxis)
      .attr('color', 'oklch(0.60 0.02 240)')
      .selectAll('text')
      .style('font-family', 'JetBrains Mono')
      .style('font-size', '11px')
    
    const tooltip = d3.select(container)
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
    
    const overlay = g
      .append('rect')
      .attr('class', 'overlay')
      .attr('width', innerWidth)
      .attr('height', innerHeight)
      .attr('fill', 'none')
      .attr('pointer-events', 'all')
      .on('mousemove', function(event) {
        const [mouseX] = d3.pointer(event)
        const timestamp = xScale.invert(mouseX)
        
        const bisect = d3.bisector<DataPoint, number>(d => d.timestamp).left
        const index = bisect(data, timestamp)
        
        if (index >= 0 && index < data.length) {
          const dataPoint = data[index]
          const date = new Date(dataPoint.timestamp)
          const timeStr = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}:${String(date.getSeconds()).padStart(2, '0')}`
          
          let html = `<div style="font-weight: 600; margin-bottom: 4px;">${timeStr}</div>`
          html += `<div style="color: oklch(0.85 0.15 95); font-weight: 600;">Total: ${(dataPoint.total / 1000).toFixed(2)} kW</div>`
          
          tooltip
            .html(html)
            .style('opacity', 1)
            .style('left', `${event.offsetX + 10}px`)
            .style('top', `${event.offsetY - 10}px`)
        }
      })
      .on('mouseout', () => {
        tooltip.style('opacity', 0)
      })
    
    return () => {
      tooltip.remove()
    }
  }, [data, height])
  
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

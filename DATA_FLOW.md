# Data Flow Architecture

## Overview
This document describes how the Energy Monitor Dashboard handles data from both historical and real-time sources, ensuring all data is properly graphed regardless of the source.

## Key Principles

1. **Single Source of Truth**: All data points (historical and real-time) are stored in a single, unified array
2. **Automatic Merging**: New data is automatically merged with existing data and sorted by timestamp
3. **Deduplication**: Duplicate data points (based on timestamp) are automatically removed
4. **Reactive Updates**: The graph automatically re-renders whenever the data array changes

## Data Structure

All data points follow the `DataPoint` interface:
```typescript
interface DataPoint {
  timestamp: number        // Unix timestamp in milliseconds
  total: number           // Total power consumption in watts
  devices: {              // Per-device power consumption
    [deviceId: string]: number
  }
}
```

## Data Flow

### 1. Historical Data Loading
When the app switches to real mode or changes time ranges:
1. `useRealEnergyData` hook calls `api.getHistoricalData(timeRange.label)`
2. Historical data points are fetched from the backend
3. Each point has its `total` calculated (sum of all device watts)
4. Points are merged with existing data using `mergeAndSortDataPoints()`
5. The merged array is sorted by timestamp and deduplicated
6. The array is trimmed to keep only the last `maxPoints` (based on time range)
7. React state updates, triggering a graph re-render

### 2. Real-time Data Updates
After historical data loads, real-time polling starts:
1. Every `timeRange.updateInterval` ms, `fetchRealtimeData()` is called
2. A new data point is fetched from `api.getRealtimeData()`
3. The new point is merged with existing data using `mergeAndSortDataPoints()`
4. The array is kept sorted and deduplicated
5. Old points outside the time window are trimmed
6. React state updates, triggering a graph re-render

### 3. Data Merging Algorithm
The `mergeAndSortDataPoints()` function:
```typescript
1. Combines existing and incoming arrays
2. Creates a Map with rounded timestamps as keys (100ms buckets)
3. For duplicate timestamps, keeps the most recent point
4. Converts Map back to array
5. Sorts by timestamp (oldest to newest)
6. Returns the unified, sorted, deduplicated array
```

This ensures:
- No duplicate data points are graphed
- Historical and real-time data blend seamlessly
- The graph always shows a continuous timeline (when data is available)

## Component Integration

### App.tsx
```typescript
// Selects which data source to use
const dataPoints = dataMode === 'real' ? realDataPoints : demoData

// Passes unified array to graph
<EnergyChart data={dataPoints} devices={devices} height={400} />
```

### EnergyChart.tsx
```typescript
// Reacts to any change in the data array
useEffect(() => {
  // Re-renders D3 visualization with all available data
}, [data, devices, height])
```

## Time Window Management

Different time ranges have different settings:
- **1m**: 60 data points, updates every 1000ms
- **5m**: 300 data points, updates every 1000ms  
- **15m**: 900 data points, updates every 1000ms
- **1h**: 3600 data points, updates every 1000ms

The `maxPoints` limit ensures we don't accumulate infinite data:
```typescript
const maxPoints = timeRange.seconds
// Keep only the most recent maxPoints
return sorted.slice(-maxPoints)
```

## Gap Handling

The graph detects gaps in data (missing time periods):
1. Calculates expected interval between points (1000ms for most ranges)
2. If gap > 2x expected interval, marks it as a missing data region
3. Displays a shaded area with "Missing Data" label
4. Prevents D3 line from connecting across gaps

## Debugging

Console logs help track data flow:
- `[useRealEnergyData]` - Shows when historical data loads and real-time updates arrive
- `[App]` - Shows current data mode, point count, and time range
- `[EnergyChart]` - Shows when graph re-renders and with how many points

Check browser console to verify:
- Historical data is being loaded
- Real-time updates are arriving
- Data points are being merged correctly
- Graph is rendering with the expected number of points

## Common Issues & Solutions

### Issue: Historical data not showing
**Check**: Console logs for `[useRealEnergyData] Loaded X historical points`
**Solution**: Verify backend is returning data for the selected time range

### Issue: Real-time updates not showing
**Check**: Console logs for `[useRealEnergyData] Added realtime point at...`
**Solution**: Verify backend realtime endpoint is working and auth is valid

### Issue: Graph shows gaps in continuous data
**Check**: Verify data points have correct timestamps
**Solution**: Ensure backend returns timestamps in milliseconds (not seconds)

### Issue: Duplicate data on graph
**Check**: Shouldn't happen with current implementation
**Solution**: Verify `mergeAndSortDataPoints` is being called correctly

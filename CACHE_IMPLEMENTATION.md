# Device Cache Implementation

## Overview
Added caching for `vue.get_devices()` API calls to reduce unnecessary requests to the Emporia Vue API and improve backend performance.

## Changes Made

### 1. Cache Configuration
- Added `DEVICE_CACHE_TTL` environment variable (default: 300 seconds / 5 minutes)
- Cache stores device list with timestamp for TTL validation

### 2. Cache Functions

#### `get_cached_devices()`
- Retrieves devices from cache if valid (within TTL)
- Fetches fresh data from API if cache is stale or empty
- Logs cache hits/misses for monitoring

#### `invalidate_device_cache()`
- Manually invalidates the cache
- Useful for forcing a refresh when devices change

### 3. Updated Endpoints

All endpoints now use `get_cached_devices()` instead of direct `vue.get_devices()` calls:
- `GET /api/emporia/devices` - Uses cache
- `GET /api/emporia/realtime` - Uses cache
- `GET /api/emporia/history` - Uses cache

### 4. New Endpoint

**`POST /api/emporia/devices/refresh`**
- Requires authentication
- Invalidates cache and forces fresh device fetch
- Returns device count in response

## Benefits

1. **Reduced API Calls**: Devices are only fetched once per TTL period
2. **Improved Performance**: Faster response times for cached requests
3. **Lower Rate Limit Risk**: Fewer calls to Emporia API
4. **Manual Control**: Can force refresh via `/api/emporia/devices/refresh` endpoint

## Configuration

Set cache TTL via environment variable:
```bash
DEVICE_CACHE_TTL=600  # 10 minutes
```

## Monitoring

Cache activity is logged with `[Cache]` prefix:
- `[Cache] Using cached devices (age: 45.2s)` - Cache hit
- `[Cache] Cache miss or stale, fetching devices from API` - Cache miss
- `[Cache] Cached 5 devices` - Cache updated
- `[Cache] Device cache invalidated` - Cache cleared

## Example Usage

```python
# Normal usage - automatic caching
devices = get_cached_devices()

# Force refresh
invalidate_device_cache()
devices = get_cached_devices()
```

## API Usage

```bash
# Force device list refresh
curl -X POST http://localhost:5001/api/emporia/devices/refresh \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

# Energy Monitor Dashboard

Real-time energy monitoring dashboard that visualizes household energy consumption across multiple devices with live-updating graphs and detailed usage statistics.

**Experience Qualities**:
1. **Immediate** - Real-time data updates create a sense of live monitoring with sub-second refresh rates
2. **Insightful** - Clear visualizations reveal usage patterns and help identify energy-hungry devices at a glance
3. **Responsive** - Smooth animations and transitions make data changes feel fluid rather than jarring

**Complexity Level**: Light Application (multiple features with basic state)
  - Features real-time data visualization, device management, and time-series graphing with simulated live updates

## Essential Features

### Live Energy Graph
- **Functionality**: Displays real-time power consumption in watts across all monitored devices with auto-updating line chart
- **Purpose**: Provides immediate visual feedback on current energy usage patterns and trends
- **Trigger**: Automatically starts when dashboard loads
- **Progression**: Dashboard loads → Chart initializes with recent history → Updates every second with new data points → Scrolls timeline to show recent 60 seconds
- **Success criteria**: Graph updates smoothly at ~1Hz, shows multiple device traces, maintains 60-second rolling window

### Device List View
- **Functionality**: Shows all monitored devices with current power draw, status indicators, and cumulative usage
- **Purpose**: Allows users to quickly identify which devices are consuming power and how much
- **Trigger**: Displayed alongside main graph
- **Progression**: User views device list → Sees live power values → Can identify high-usage devices → Color-coded status helps prioritize attention
- **Success criteria**: Each device shows current watts, updates in real-time, sorted by power consumption

### Time Range Selector
- **Functionality**: Allows switching between different time windows (1 min, 5 min, 15 min, 1 hour)
- **Purpose**: Enables users to zoom out for broader usage patterns or zoom in for immediate detail
- **Trigger**: User clicks time range button
- **Progression**: User selects time range → Graph adjusts to show selected window → Update frequency adapts to time scale
- **Success criteria**: Smooth transitions between time ranges, appropriate data density for each scale

### Total Usage Display
- **Functionality**: Prominent display of current total household power consumption
- **Purpose**: Provides at-a-glance understanding of overall energy usage
- **Trigger**: Automatically calculated and displayed
- **Progression**: System sums all device usage → Displays total with units → Updates in real-time → Shows trend indicator
- **Success criteria**: Large, easy-to-read number that updates smoothly without jarring jumps

## Edge Case Handling
- **Zero Usage Periods**: Display flat line at zero rather than gaps or errors
- **Device Offline**: Show device as inactive with muted styling and last-known value
- **Data Spikes**: Smooth sudden changes with brief animation rather than instant jumps
- **No Devices**: Display empty state with helpful message about adding devices
- **Browser Tab Inactive**: Pause updates when tab not visible to conserve resources

## Design Direction
The design should evoke a high-tech monitoring station with an energy-focused aesthetic - think clean data visualization with electric accent colors that suggest power and efficiency. The interface should feel like a professional monitoring tool while remaining approachable and easy to interpret at a glance.

## Color Selection
Energy-themed palette with electric accents on a dark technical background

- **Primary Color**: Electric Blue (oklch(0.65 0.19 240)) - Represents electrical energy and technology, used for main interactive elements and primary data visualization
- **Secondary Colors**: 
  - Deep Slate (oklch(0.25 0.02 240)) - Technical background suggesting monitoring equipment
  - Charcoal (oklch(0.20 0.01 240)) - Card and panel backgrounds
- **Accent Color**: Voltage Yellow (oklch(0.85 0.15 95)) - Attention-grabbing highlight for high usage alerts and CTAs, suggests electrical charge
- **Foreground/Background Pairings**: 
  - Background (Deep Slate oklch(0.25 0.02 240)): Light Text (oklch(0.95 0.01 240)) - Ratio 9.2:1 ✓
  - Primary (Electric Blue oklch(0.65 0.19 240)): White text (oklch(1 0 0)) - Ratio 4.8:1 ✓
  - Accent (Voltage Yellow oklch(0.85 0.15 95)): Dark text (oklch(0.20 0.01 240)) - Ratio 11.5:1 ✓
  - Card (Charcoal oklch(0.20 0.01 240)): Light Text (oklch(0.95 0.01 240)) - Ratio 11.8:1 ✓

## Font Selection
Technical yet readable typeface that suggests precision instrumentation and data clarity

- **Typographic Hierarchy**:
  - H1 (Dashboard Title): JetBrains Mono Bold/32px/tight tracking (-0.02em) - Technical aesthetic
  - H2 (Section Headers): JetBrains Mono SemiBold/20px/normal tracking
  - H3 (Device Names): JetBrains Mono Medium/16px/normal tracking
  - Body (Values/Labels): JetBrains Mono Regular/14px/normal tracking
  - Large Numbers (Power Display): JetBrains Mono Bold/48px/tight tracking - Maximum readability for primary metric

## Animations
Subtle data-driven motion that reinforces the sense of live monitoring without distracting from information

- Graph line drawing uses smooth easing when new points appear
- Power values count up/down with spring physics rather than instant changes
- Device cards have gentle highlight pulses when usage spikes significantly
- Time range transitions use crossfade to maintain continuity
- All animations kept under 300ms to feel responsive and immediate

## Component Selection

- **Components**:
  - **Card**: Device panels and stat displays with dark backgrounds
  - **Tabs**: Time range selector with clear active state
  - **Badge**: Device status indicators (active/idle/offline)
  - **Separator**: Divides sections without heavy visual weight
  - **Scroll Area**: Device list when many devices present
  
- **Customizations**:
  - Custom D3.js line chart component for real-time graph with gradient fills
  - Custom device card with live-updating power meter visualization
  - Custom stat display with animated number transitions
  
- **States**:
  - Buttons: Glow effect on hover with electric blue, pressed state dims slightly
  - Device cards: Border highlights when device becomes active, muted when idle
  - Graph: Tooltip on hover showing exact values with timestamp
  
- **Icon Selection**:
  - Lightning (filled): Main app icon and high power indicators
  - ChartLine: Graph view toggle
  - Clock: Time range controls
  - Power: Device status indicators
  - TrendUp/TrendDown: Usage trend arrows
  
- **Spacing**:
  - Page padding: p-6 (24px)
  - Card padding: p-6 for content area
  - Section gaps: gap-6 between major sections
  - Element gaps: gap-4 within cards, gap-2 for tight groupings
  
- **Mobile**:
  - Stack time range tabs vertically on mobile
  - Single column layout for device cards
  - Graph height reduces to 250px on mobile
  - Total usage stat remains prominent at top
  - Sticky header with key metrics always visible

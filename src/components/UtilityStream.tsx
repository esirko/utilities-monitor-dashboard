import { useEffect, useMemo, useRef, useState } from 'react'
import ReactPlayer from 'react-player'
import { Alert, AlertDescription } from '@/components/ui/alert'

interface UtilityStreamProps {
	rtspUrl?: string | null
	mjpegUrl?: string | null
	restreamAvailable?: boolean
	title: string
	note?: string
	savedSelections?: SelectionRect[]
	selectionConfigured?: boolean
	onConfirmSelections?: (boxes: SelectionRect[]) => void | Promise<void>
	onResetSelections?: () => void | Promise<void>
	secondaryPreviewFlipped?: boolean
	onSecondaryPreviewFlipToggle?: (value: boolean) => void
}

export interface SelectionRect {
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

const MIN_SELECTION = 0.05

const BOX_META = [
	{
		label: 'Region 1',
		border: 'border-sky-400/90',
		background: 'bg-sky-400/25',
		badge: 'bg-sky-500/80 text-white'
	},
	{
		label: 'Region 2',
		border: 'border-orange-400/90',
		background: 'bg-orange-400/25',
		badge: 'bg-orange-500/80 text-white'
	}
] as const

type DragMode = 'draw' | 'move'

type DragContext = {
	index: number
	mode: DragMode
	start?: { x: number; y: number }
	offset?: { dx: number; dy: number }
	previous?: SelectionRect | null
}

function clampUnit(value: number) {
	if (!Number.isFinite(value)) return 0
	if (value < 0) return 0
	if (value > 1) return 1
	return value
}

function makeZeroRect(): SelectionRect {
	return { x: 0, y: 0, width: 0, height: 0 }
}

function normaliseSavedBoxes(saved?: SelectionRect[]): SelectionRect[] {
	if (!Array.isArray(saved)) {
		return [makeZeroRect(), makeZeroRect()]
	}
	const boxes: SelectionRect[] = []
	for (let i = 0; i < Math.min(saved.length, 2); i++) {
		const box = saved[i]
		boxes.push(
			box
				? {
						x: clampUnit(box.x),
						y: clampUnit(box.y),
						width: clampUnit(box.width),
						height: clampUnit(box.height),
					}
				: makeZeroRect()
		)
	}
	while (boxes.length < 2) {
		boxes.push(makeZeroRect())
	}
	return boxes
}

function isRectConfigured(rect?: SelectionRect | null): boolean {
	return Boolean(rect && rect.width > 0 && rect.height > 0)
}

function toRectOrZero(rect?: SelectionRect | null): SelectionRect {
	if (!rect) {
		return makeZeroRect()
	}
	return {
		x: clampUnit(rect.x),
		y: clampUnit(rect.y),
		width: clampUnit(rect.width),
		height: clampUnit(rect.height),
	}
}

export function UtilityStream({
	rtspUrl,
	mjpegUrl,
	restreamAvailable,
	title,
	note,
	savedSelections,
	selectionConfigured,
	onConfirmSelections,
	onResetSelections,
	secondaryPreviewFlipped = false,
	onSecondaryPreviewFlipToggle,
}: UtilityStreamProps) {
	const details = useMemo(() => getStreamDetails(rtspUrl, mjpegUrl), [rtspUrl, mjpegUrl])
	const savedBoxes = useMemo(() => normaliseSavedBoxes(savedSelections), [savedSelections])
	const remoteConfigured = selectionConfigured ?? savedBoxes.some(isRectConfigured)

	const [status, setStatus] = useState<'idle' | 'loading' | 'playing' | 'error'>(mjpegUrl ? 'loading' : 'idle')
	const [mode, setMode] = useState<'setup' | 'configured'>(remoteConfigured ? 'configured' : 'setup')
	const [draftBoxes, setDraftBoxes] = useState<(SelectionRect | null)[]>(() =>
		savedBoxes.map(box => (isRectConfigured(box) ? { ...box } : null))
	)
	const [activeIndex, setActiveIndex] = useState<number>(() => {
		const firstUnset = savedBoxes.findIndex(box => !isRectConfigured(box))
		return firstUnset === -1 ? 0 : firstUnset
	})
	const [isSelecting, setIsSelecting] = useState(false)
	const [isSubmitting, setIsSubmitting] = useState(false)
	const [isResetting, setIsResetting] = useState(false)

	const containerRef = useRef<HTMLDivElement | null>(null)
	const imageRef = useRef<HTMLImageElement | null>(null)
	const firstPreviewRef = useRef<HTMLCanvasElement | null>(null)
	const secondPreviewRef = useRef<HTMLCanvasElement | null>(null)
	const previewRefs = [firstPreviewRef, secondPreviewRef]
	const animationFrameRef = useRef<number | null>(null)
	const moveListenerRef = useRef<((event: PointerEvent) => void) | null>(null)
	const upListenerRef = useRef<((event: PointerEvent) => void) | null>(null)
	const dragContextRef = useRef<DragContext | null>(null)
	const isSelectingRef = useRef(false)
	const boxesRef = useRef<(SelectionRect | null)[]>(draftBoxes)
	const [frameSize, setFrameSize] = useState<{ width: number; height: number } | null>(null)

	useEffect(() => {
		setStatus(mjpegUrl ? 'loading' : 'idle')
	}, [mjpegUrl])

	useEffect(() => {
		boxesRef.current = draftBoxes
	}, [draftBoxes])

	useEffect(() => {
		setMode(remoteConfigured ? 'configured' : 'setup')
		setDraftBoxes(savedBoxes.map(box => (isRectConfigured(box) ? { ...box } : null)))
		if (!remoteConfigured) {
			const nextActive = savedBoxes.findIndex(box => !isRectConfigured(box))
			setActiveIndex(nextActive === -1 ? 0 : nextActive)
		}
	}, [remoteConfigured, savedBoxes])

	useEffect(() => () => removeGlobalListeners(), [])

	useEffect(() => {
		return () => {
			if (animationFrameRef.current) {
				cancelAnimationFrame(animationFrameRef.current)
				animationFrameRef.current = null
			}
		}
	}, [])

	useEffect(() => {
		if (status === 'error' && mode === 'setup') {
			setDraftBoxes([null, null])
		}
	}, [status, mode])

	const canSelect = Boolean(mjpegUrl) && status !== 'error' && mode === 'setup'
	const clamp = (value: number) => Math.min(Math.max(value, 0), 1)

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

	const updateDraftBox = (index: number, recipe: (prev: SelectionRect | null) => SelectionRect | null) => {
		setDraftBoxes(prev => {
			const next = [...prev]
			next[index] = recipe(prev[index])
			boxesRef.current = next
			return next
		})
	}

	const updateSelectionFromClient = (clientX: number, clientY: number) => {
		if (!isSelectingRef.current || !containerRef.current) {
			return
		}
		const rect = containerRef.current.getBoundingClientRect()
		const x = clamp((clientX - rect.left) / rect.width)
		const y = clamp((clientY - rect.top) / rect.height)
		const context = dragContextRef.current
		if (!context) return

		if (context.mode === 'move') {
			updateDraftBox(context.index, prev => {
				if (!prev) return prev
				const width = prev.width
				const height = prev.height
				const tentativeX = clamp(x - (context.offset?.dx ?? 0))
				const tentativeY = clamp(y - (context.offset?.dy ?? 0))
				const clampedX = Math.min(Math.max(tentativeX, 0), 1 - width)
				const clampedY = Math.min(Math.max(tentativeY, 0), 1 - height)
				if (clampedX === prev.x && clampedY === prev.y) {
					return prev
				}
				return { ...prev, x: clampedX, y: clampedY }
			})
		} else {
			const start = context.start
			if (!start) return
			const left = Math.min(start.x, x)
			const top = Math.min(start.y, y)
			const width = Math.abs(x - start.x)
			const height = Math.abs(y - start.y)
			const clampedLeft = clamp(left)
			const clampedTop = clamp(top)
			const boundedWidth = Math.min(width, 1 - clampedLeft)
			const boundedHeight = Math.min(height, 1 - clampedTop)
			updateDraftBox(context.index, () => ({
				x: clampedLeft,
				y: clampedTop,
				width: boundedWidth,
				height: boundedHeight,
			}))
		}
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

		const context = dragContextRef.current
		if (context && context.mode === 'draw') {
			const selection = boxesRef.current[context.index]
			if (!selection || selection.width < MIN_SELECTION || selection.height < MIN_SELECTION) {
				updateDraftBox(context.index, () => context.previous ?? null)
			}
		}

		dragContextRef.current = null
		removeGlobalListeners()
	}

	const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
		if (!canSelect || !containerRef.current) return
		event.preventDefault()
		const rect = containerRef.current.getBoundingClientRect()
		const x = clamp((event.clientX - rect.left) / rect.width)
		const y = clamp((event.clientY - rect.top) / rect.height)
		const pointer = { x, y }

		const hitIndex = boxesRef.current.findIndex(selection => {
			if (!selection) return false
			return (
				pointer.x >= selection.x &&
				pointer.x <= selection.x + selection.width &&
				pointer.y >= selection.y &&
				pointer.y <= selection.y + selection.height
			)
		})

		if (hitIndex !== -1) {
			const selection = boxesRef.current[hitIndex]
			dragContextRef.current = {
				index: hitIndex,
				mode: 'move',
				offset: {
					dx: pointer.x - (selection?.x ?? pointer.x),
					dy: pointer.y - (selection?.y ?? pointer.y),
				},
			}
			setActiveIndex(hitIndex)
		} else {
			const targetIndex = activeIndex
			dragContextRef.current = {
				index: targetIndex,
				mode: 'draw',
				start: pointer,
				previous: boxesRef.current[targetIndex] ?? null,
			}
			updateDraftBox(targetIndex, () => ({ x: pointer.x, y: pointer.y, width: 0, height: 0 }))
		}

		setIsSelecting(true)
		isSelectingRef.current = true

		const handleMove = (nativeEvent: PointerEvent) => {
			updateSelectionFromClient(nativeEvent.clientX, nativeEvent.clientY)
		}

		const handleUp = (_event: PointerEvent) => {
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

	const handleDoubleClick = () => {
		if (!canSelect) return
		updateDraftBox(activeIndex, () => null)
		dragContextRef.current = null
		setIsSelecting(false)
		isSelectingRef.current = false
	}

	const handleImageLoad = (event: React.SyntheticEvent<HTMLImageElement>) => {
		const img = event.currentTarget
		imageRef.current = img
		setFrameSize({
			width: img.naturalWidth || img.width,
			height: img.naturalHeight || img.height,
		})
		setStatus('playing')
	}

	const drawZoomPreview = (box: SelectionRect, canvas: HTMLCanvasElement | null) => {
		if (!canvas || !imageRef.current || status !== 'playing') return
		if (!isRectConfigured(box)) return

		const ctx = canvas.getContext('2d')
		if (!ctx) return

		const naturalWidth = imageRef.current.naturalWidth || frameSize?.width
		const naturalHeight = imageRef.current.naturalHeight || frameSize?.height
		if (!naturalWidth || !naturalHeight) return

		const containerRect = containerRef.current?.getBoundingClientRect()
		if (!containerRect || !containerRect.width || !containerRect.height) return

		const hostRect = canvas.parentElement?.getBoundingClientRect()
		const targetWidth = Math.max(1, Math.round(hostRect?.width ?? 0))
		const targetHeight = Math.max(1, Math.round(hostRect?.height ?? 0))
		if (!targetWidth || !targetHeight) return

		if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
			canvas.width = targetWidth
			canvas.height = targetHeight
		}

		const scale = Math.max(containerRect.width / naturalWidth, containerRect.height / naturalHeight)
		const displayedWidth = naturalWidth * scale
		const displayedHeight = naturalHeight * scale
		const offsetX = (displayedWidth - containerRect.width) / 2
		const offsetY = (displayedHeight - containerRect.height) / 2

		const leftPx = box.x * containerRect.width
		const topPx = box.y * containerRect.height
		const widthPx = box.width * containerRect.width
		const heightPx = box.height * containerRect.height

		const sx = (leftPx + offsetX) / scale
		const sy = (topPx + offsetY) / scale
		const sw = widthPx / scale
		const sh = heightPx / scale

		if (sw <= 1 || sh <= 1) return

		const clampedSX = Math.min(Math.max(sx, 0), naturalWidth - sw)
		const clampedSY = Math.min(Math.max(sy, 0), naturalHeight - sh)

		const selectionAspect = sw / sh
		const canvasAspect = canvas.width / canvas.height
		let destWidth: number
		let destHeight: number
		if (selectionAspect >= canvasAspect) {
			destWidth = canvas.width
			destHeight = destWidth / selectionAspect
		} else {
			destHeight = canvas.height
			destWidth = destHeight * selectionAspect
		}
		const destX = (canvas.width - destWidth) / 2
		const destY = (canvas.height - destHeight) / 2

		ctx.save()
		ctx.fillStyle = 'black'
		ctx.fillRect(0, 0, canvas.width, canvas.height)
		ctx.drawImage(imageRef.current, clampedSX, clampedSY, sw, sh, destX, destY, destWidth, destHeight)
		ctx.restore()
	}

	useEffect(() => {
		if (!mjpegUrl || status !== 'playing') {
			if (animationFrameRef.current) {
				cancelAnimationFrame(animationFrameRef.current)
				animationFrameRef.current = null
			}
			return
		}

		const tick = () => {
			const sourceBoxes = (mode === 'configured' ? savedBoxes : boxesRef.current).map(toRectOrZero)
			sourceBoxes.forEach((box, index) => {
				drawZoomPreview(box, previewRefs[index]?.current ?? null)
			})
			animationFrameRef.current = requestAnimationFrame(tick)
		}

		animationFrameRef.current = requestAnimationFrame(tick)

		return () => {
			if (animationFrameRef.current) {
				cancelAnimationFrame(animationFrameRef.current)
				animationFrameRef.current = null
			}
		}
	}, [mode, savedBoxes, status, mjpegUrl])

	const readyToConfirm = draftBoxes.every(isRectConfigured)

	const handleConfirm = async () => {
		if (!onConfirmSelections || !readyToConfirm) return
		const boxes = draftBoxes.map(toRectOrZero)
		setIsSubmitting(true)
		try {
			await onConfirmSelections(boxes)
		} finally {
			setIsSubmitting(false)
		}
	}

	const handleResetAll = async () => {
		if (!onResetSelections) return
		setIsResetting(true)
		try {
			await onResetSelections()
		} finally {
			setIsResetting(false)
		}
	}

	if (!details.isValid) {
		return (
			<Alert variant="destructive">
				<AlertDescription>{details.message}</AlertDescription>
			</Alert>
		)
	}

	return (
		<div className="space-y-4">
			<div
				ref={containerRef}
				className={`relative aspect-video overflow-hidden rounded-md border border-border/60 bg-black ${mode !== 'setup' ? 'cursor-default' : ''}`}
				onPointerDown={handlePointerDown}
				onPointerMove={updateSelection}
				onPointerUp={finalizeSelection}
				onDoubleClick={handleDoubleClick}
				role="presentation"
				style={{ touchAction: 'none' }}
			>
				{mjpegUrl ? (
					<>
						{status === 'loading' && (
							<div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
								Loading video…
							</div>
						)}
						{status === 'error' && (
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

				{mode === 'setup' &&
					draftBoxes.map((selection, index) => {
						if (!selection) return null
						const meta = BOX_META[index]
						const isActive = activeIndex === index
						return (
							<div
								key={index}
								className={`pointer-events-none absolute border-2 ${meta.border} ${meta.background} ${isActive ? 'ring-2 ring-offset-2 ring-offset-background ring-primary/60' : ''}`}
								style={{
									left: `${selection.x * 100}%`,
									top: `${selection.y * 100}%`,
									width: `${selection.width * 100}%`,
									height: `${selection.height * 100}%`,
								}}
							/>
						)
					})}

				{mode === 'setup' && canSelect && status === 'playing' && (
					<div className="pointer-events-none absolute inset-x-2 bottom-2 rounded-md bg-background/70 px-3 py-1 text-xs text-foreground">
						Draw {BOX_META[activeIndex].label.toLowerCase()} • Double-click to clear active region
					</div>
				)}

				{mode === 'configured' && (
					<div className="pointer-events-none absolute inset-x-2 bottom-2 rounded-md bg-background/70 px-3 py-1 text-xs text-muted-foreground">
						Regions locked • Use reset to reconfigure
					</div>
				)}
			</div>

			{mode === 'setup' ? (
				<div className="space-y-3">
					<div className="flex flex-wrap items-center gap-2 text-xs font-medium text-muted-foreground">
						<span>Active region:</span>
						{BOX_META.map((meta, index) => (
							<button
								key={meta.label}
								type="button"
								onClick={() => setActiveIndex(index)}
								className={`rounded-md border px-2 py-1 transition-colors ${
									activeIndex === index
										? 'border-primary/60 bg-primary/10 text-primary'
										: 'border-border bg-transparent text-muted-foreground hover:border-primary/50 hover:text-primary'
								}`}
							>
								{meta.label}
							</button>
						))}
					</div>

					<div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
						<span>Drag on the video to define each region. Click inside a region to move it.</span>
						<span>Double-click the video to clear whichever region is active.</span>
					</div>

					<div className="flex flex-wrap items-center gap-3 text-xs">
						{BOX_META.map((meta, index) => (
							<button
								key={meta.label}
								type="button"
								onClick={() => updateDraftBox(index, () => null)}
								disabled={!draftBoxes[index]}
								className={`font-medium hover:underline ${draftBoxes[index] ? 'text-primary' : 'text-muted-foreground cursor-default'}`}
							>
								Reset {meta.label.toLowerCase()}
							</button>
						))}
					</div>

					{onConfirmSelections && (
						<button
							type="button"
							onClick={handleConfirm}
							disabled={!readyToConfirm || isSubmitting}
							className={`inline-flex items-center gap-2 rounded-md border border-primary/70 px-3 py-1.5 text-xs font-semibold transition-colors ${
								readyToConfirm && !isSubmitting
									? 'bg-primary/10 text-primary hover:bg-primary/20'
									: 'bg-muted text-muted-foreground cursor-not-allowed border-border'
							}`}
						>
							{isSubmitting ? 'Saving…' : 'Confirm selections'}
						</button>
					)}
				</div>
			) : (
				<div className="space-y-3">
					<div className="space-y-3">
						{BOX_META.map((meta, index) => (
							<div key={meta.label} className="space-y-2">
								<div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
									<span className={`inline-flex items-center rounded-md px-2 py-0.5 ${meta.badge}`}>
										{meta.label}
									</span>
								</div>
								<div className="relative aspect-video overflow-hidden rounded-md border border-border/60 bg-black">
									<canvas
										ref={previewRefs[index]}
										className={`h-full w-full ${index === 1 && secondaryPreviewFlipped ? 'rotate-180' : ''}`}
									/>
								</div>
								{index === 1 && onSecondaryPreviewFlipToggle && (
									<button
										type="button"
										onClick={() => onSecondaryPreviewFlipToggle(!secondaryPreviewFlipped)}
										className="text-xs font-medium text-primary hover:underline"
									>
										{secondaryPreviewFlipped ? 'Disable upside-down view' : 'Flip upside-down'}
									</button>
								)}
							</div>
						))}
					</div>

					{onResetSelections && (
						<button
							type="button"
							onClick={handleResetAll}
							disabled={isResetting}
							className="text-xs font-medium text-destructive hover:underline"
						>
							{isResetting ? 'Resetting…' : 'Reset coordinates'}
						</button>
					)}
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

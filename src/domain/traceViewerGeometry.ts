import { reverseComplementChromatogram } from './dnaLibrary'
import type { ChromatogramData, RawChromatogramData } from './traceTypes'

export type TraceViewerBase = 'A' | 'T' | 'G' | 'C'
export type TraceViewerMode = 'standard' | 'autoscaled' | 'raw'
export type TraceViewerChromatogram = ChromatogramData & { raw?: RawChromatogramData }
export const TRACE_VIEWER_AUTOSCALE_RADIUS_BASES = 25
export const TRACE_VIEWER_AUTOSCALE_SMOOTH_BASES = 8
export const TRACE_VIEWER_AUTOSCALE_MAX_GAIN = 3
export type TraceViewerPoint = { x: number; y: number }
export type TraceViewerChannel = {
  base: TraceViewerBase
  points: TraceViewerPoint[]
  linePath: string
  areaPath: string
}
export type TraceViewerBaseLabel = { index: number; base: string; rawPosition: number; x: number; quality?: number }
export type TraceViewerQualityBar = { index: number; x: number; y: number; width: number; height: number }
export type TraceViewerRulerTick = { index: number; x: number; major: boolean; label?: number }
export type TraceViewerHitSegment = { index: number; start: number; end: number; center: number }
export type TraceViewerBaseSlot = { index: number; start: number; end: number; width: number; glyphOffset: number }
export type TraceViewerActiveMarker = { index: number; start: number; end: number; center: number }

export const TRACE_VIEWER_SEQUENCE_HEIGHT = 30
export const TRACE_VIEWER_DETAIL_HEIGHT = 40

export type TraceViewerGeometry = {
  width: number
  height: number
  baseline: number
  detailHeight: number
  rulerY: number
  channels: TraceViewerChannel[]
  bases: TraceViewerBaseLabel[]
  qualityBars: TraceViewerQualityBar[]
  ruler: TraceViewerRulerTick[]
  hitSegments: TraceViewerHitSegment[]
  baseSlots: TraceViewerBaseSlot[]
  activeMarkers: TraceViewerActiveMarker[]
}

const channels = [
  ['A', 'aTrace'],
  ['T', 'tTrace'],
  ['G', 'gTrace'],
  ['C', 'cTrace'],
] as const

export function orientTraceChromatogram(data: TraceViewerChromatogram, direction: 'forward' | 'reverse'): TraceViewerChromatogram {
  if (direction === 'forward') return data
  const processed = reverseComplementChromatogram(data)
  const raw = data.raw
  if (!raw) return processed
  const rawSampleCount = Math.max(raw.aTrace.length, raw.tTrace.length, raw.gTrace.length, raw.cTrace.length)
  const reverseSamples = (values: number[]) => values.slice().reverse()
  return {
    ...processed,
    raw: {
      aTrace: reverseSamples(raw.tTrace),
      tTrace: reverseSamples(raw.aTrace),
      gTrace: reverseSamples(raw.cTrace),
      cTrace: reverseSamples(raw.gTrace),
      ...(raw.basePos ? { basePos: raw.basePos.map((position) => rawSampleCount - 1 - position).reverse() } : {}),
    },
  }
}

/**
 * Per-scan shared upper envelope used by Autoscaled. A broad base-count window
 * avoids normalizing every individual peak to full height; the global floor
 * limits gain over Standard while all channels still share one denominator.
 */
export function traceViewerAutoscaleEnvelope(data: Pick<ChromatogramData, 'aTrace' | 'tTrace' | 'gTrace' | 'cTrace' | 'basePos'>) {
  const sampleCount = Math.max(data.aTrace.length, data.tTrace.length, data.gTrace.length, data.cTrace.length)
  if (!sampleCount) return []
  const channels = [data.aTrace, data.tTrace, data.gTrace, data.cTrace]
  const shared = Array.from({ length: sampleCount }, (_, index) => Math.max(0, ...channels.map((channel) => Math.max(0, channel[index] ?? 0))))
  const baseSteps = (data.basePos ?? [])
    .slice(1)
    .map((position, index) => position - data.basePos[index]!)
    .filter((step) => Number.isFinite(step) && step > 0)
    .sort((left, right) => left - right)
  const inferredStep = baseSteps.length
    ? baseSteps[Math.floor(baseSteps.length / 2)]!
    : sampleCount / Math.max(1, data.basePos.length || Math.floor(sampleCount / 10))
  const localRadius = Math.max(1, Math.round(inferredStep * TRACE_VIEWER_AUTOSCALE_RADIUS_BASES))
  const smoothRadius = Math.max(1, Math.round(inferredStep * TRACE_VIEWER_AUTOSCALE_SMOOTH_BASES))
  const localMax = traceViewerCenteredRollingMaximum(shared, localRadius)
  const smoothedEnvelope = traceViewerCenteredRollingAverage(localMax, smoothRadius)
  const globalMax = shared.reduce((maximum, value) => Math.max(maximum, value), 1)
  const denominatorFloor = globalMax / TRACE_VIEWER_AUTOSCALE_MAX_GAIN
  return shared.map((value, index) => Math.max(1, value, denominatorFloor, smoothedEnvelope[index] ?? 0))
}

function traceViewerCenteredRollingMaximum(values: number[], radius: number) {
  const result = new Array<number>(values.length)
  const deque = new Array<number>(values.length)
  let head = 0
  let tail = 0
  let addedThrough = -1
  for (let index = 0; index < values.length; index += 1) {
    const right = Math.min(values.length - 1, index + radius)
    while (addedThrough < right) {
      const next = ++addedThrough
      while (tail > head && values[deque[tail - 1]!]! <= values[next]!) tail -= 1
      deque[tail++] = next
    }
    const left = Math.max(0, index - radius)
    while (tail > head && deque[head]! < left) head += 1
    result[index] = values[deque[head]!] ?? 0
  }
  return result
}

function traceViewerCenteredRollingAverage(values: number[], radius: number) {
  const prefix = new Array<number>(values.length + 1).fill(0)
  for (let index = 0; index < values.length; index += 1) prefix[index + 1] = prefix[index]! + values[index]!
  return values.map((_, index) => {
    const left = Math.max(0, index - radius)
    const right = Math.min(values.length - 1, index + radius)
    return (prefix[right + 1]! - prefix[left]!) / (right - left + 1)
  })
}

/** Converts scan and matched base positions into an unaligned viewer layout. */
export function buildTraceViewerGeometry(
  data: TraceViewerChromatogram,
  options: {
    sampleScale?: number
    height?: number
    rulerStep?: number
    mode?: TraceViewerMode
    peakZoom?: number
  } = {},
): TraceViewerGeometry {
  const sampleScale = Math.max(0.01, options.sampleScale ?? 0.8)
  const height = Math.max(80, options.height ?? 360)
  const rulerStep = Math.max(1, Math.floor(options.rulerStep ?? 10))
  const mode = options.mode ?? 'standard'
  const peakZoom = Math.max(0.1, options.peakZoom ?? 1)
  const signalSource = mode === 'raw' ? data.raw : data
  const sampleCount = Math.max(...channels.map(([, key]) => signalSource?.[key].length ?? 0), 0)
  const width = Math.max(1, sampleCount - 1) * sampleScale
  const chartTop = 6
  const baseline = height - 8
  const chartHeight = baseline - chartTop
  const detailHeight = TRACE_VIEWER_DETAIL_HEIGHT
  const rulerY = 23
  let globalMax = 1
  for (const [, key] of channels) for (const value of data[key]) globalMax = Math.max(globalMax, value, 0)
  const autoscaleEnvelope = mode === 'autoscaled' ? traceViewerAutoscaleEnvelope(data) : []
  const rawValues = mode === 'raw' ? channels.flatMap(([, key]) => data.raw?.[key] ?? []) : []
  let rawMin = 0
  let rawMax = 0
  for (const value of rawValues) {
    rawMin = Math.min(rawMin, value)
    rawMax = Math.max(rawMax, value)
  }
  const rawRange = Math.max(1, rawMax - rawMin)
  const rawZeroY = chartTop + rawMax / rawRange * chartHeight

  const lineData: TraceViewerChannel[] = channels.map(([base, key]) => {
    const values = signalSource?.[key] ?? []
    const points = values.map((value, index) => ({
      x: index * sampleScale,
      y: mode === 'raw'
        ? Math.max(chartTop, Math.min(baseline, rawZeroY - value / rawRange * chartHeight * peakZoom))
        : baseline - Math.min(1, Math.max(0, value) / (mode === 'autoscaled' ? (autoscaleEnvelope[index] ?? globalMax) : globalMax) * peakZoom) * chartHeight,
    }))
    const linePath = traceViewerPath(points)
    const areaPath = points.length
      ? `${linePath} L${points[points.length - 1]!.x.toFixed(2)},${baseline.toFixed(2)} L${points[0]!.x.toFixed(2)},${baseline.toFixed(2)} Z`
      : ''
    return { base, points, linePath, areaPath }
  })

  // ABIF base calls and basePos are parallel arrays. Never synthesize missing scan
  // positions from ordinals: only keep calls whose explicit positions are valid.
  const matchedCalls: Array<{ index: number; base: string; rawPosition: number; quality?: number }> = []
  let previousPosition = -1
  for (let index = 0; mode !== 'raw' && index < data.baseCalls.length; index += 1) {
    const position = data.basePos[index]
    if (!Number.isFinite(position) || !Number.isInteger(position) || position < 0 || position >= sampleCount || position <= previousPosition) continue
    previousPosition = position
    matchedCalls.push({
      index,
      base: data.baseCalls[index]!.toUpperCase(),
      rawPosition: position,
      ...(typeof data.qualNums?.[index] === 'number' ? { quality: data.qualNums[index] } : {}),
    })
  }
  const bases: TraceViewerBaseLabel[] = matchedCalls.map((call, ordinal) => {
    const leftBoundary = ordinal === 0 ? 0 : Math.floor((matchedCalls[ordinal - 1]!.rawPosition + call.rawPosition) / 2) + 1
    const rightBoundary = ordinal === matchedCalls.length - 1
      ? sampleCount - 1
      : Math.floor((call.rawPosition + matchedCalls[ordinal + 1]!.rawPosition) / 2)
    const channelName = traceChannelForBase(call.base)
    const endpoint = ordinal === 0 || ordinal === matchedCalls.length - 1
    const displayPosition = channelName
      ? traceViewerNearestCalledChannelApex(
        data[channelName],
        call.rawPosition,
        endpoint ? Math.max(leftBoundary, call.rawPosition - 6) : leftBoundary,
        endpoint ? Math.min(rightBoundary, call.rawPosition + 6) : rightBoundary,
      )
      : call.rawPosition
    return { ...call, x: displayPosition * sampleScale }
  })
  const hitSegments = traceViewerHitSegments(bases.map((base) => ({ index: base.index, x: base.x })), width)
  const baseSlots = traceViewerBaseSlots(hitSegments)
  const activeMarkers = bases.map((base, ordinal) => {
    const previous = bases[ordinal - 1]?.x
    const next = bases[ordinal + 1]?.x
    const neighborGaps = [previous === undefined ? undefined : base.x - previous, next === undefined ? undefined : next - base.x]
      .filter((gap): gap is number => gap !== undefined && gap > 0)
    const localGap = neighborGaps.length ? Math.min(...neighborGaps) : sampleScale * 8
    const minimumHalfWidth = sampleScale * 1.25
    const maximumHalfWidth = sampleScale * 10
    const halfWidth = Math.max(0, Math.min(
      localGap * 0.45,
      maximumHalfWidth,
      Math.max(minimumHalfWidth, localGap * 0.42),
      base.x,
      width - base.x,
    ))
    return { index: base.index, start: base.x - halfWidth, end: base.x + halfWidth, center: base.x }
  })
  const maxQualityBarHeight = 17
  const qualityBars = bases.flatMap((base) => {
    if (base.quality === undefined) return []
    const barHeight = Math.max(1, Math.min(maxQualityBarHeight, base.quality / 60 * maxQualityBarHeight))
    return [{ index: base.index, x: base.x - 2.5, y: 20 - barHeight, width: 5, height: barHeight }]
  })
  const ruler: TraceViewerRulerTick[] = []
  if (mode === 'raw') {
    const rawRulerStep = Math.max(1, Math.round(options.rulerStep ?? 100))
    for (let scan = rawRulerStep; scan < sampleCount; scan += rawRulerStep) {
      ruler.push({ index: scan, x: scan * sampleScale, major: true, label: scan })
    }
  } else {
    for (const base of bases) {
      const major = base.index === 0 || (base.index + 1) % rulerStep === 0
      if (!major && base !== bases[bases.length - 1]) continue
      ruler.push({ index: base.index, x: base.x, major })
    }
  }
  const visibleBaseline = mode === 'raw' ? rawZeroY : baseline
  return { width, height, baseline: visibleBaseline, detailHeight, rulerY, channels: lineData, bases, qualityBars, ruler, hitSegments, baseSlots, activeMarkers }
}

function traceChannelForBase(base: string): 'aTrace' | 'tTrace' | 'gTrace' | 'cTrace' | null {
  switch (base) {
    case 'A': return 'aTrace'
    case 'T': return 'tTrace'
    case 'G': return 'gTrace'
    case 'C': return 'cTrace'
    default: return null
  }
}

/** Finds the nearest local peak, treating a flat local-max plateau as one apex. */
export function traceViewerNearestCalledChannelApex(values: number[], rawPosition: number, intervalStart: number, intervalEnd: number) {
  const start = Math.max(0, Math.ceil(intervalStart))
  const end = Math.min(values.length - 1, Math.floor(intervalEnd))
  if (end < start) return rawPosition
  let nearestPosition: number | null = null
  let nearestDistance = Number.POSITIVE_INFINITY
  let index = 0
  while (index < values.length) {
    if (!Number.isFinite(values[index])) {
      index += 1
      continue
    }
    const plateauStart = index
    const value = values[index]!
    while (index + 1 < values.length && values[index + 1] === value) index += 1
    const plateauEnd = index
    const left = plateauStart > 0 && Number.isFinite(values[plateauStart - 1]) ? values[plateauStart - 1]! : null
    const right = plateauEnd + 1 < values.length && Number.isFinite(values[plateauEnd + 1]) ? values[plateauEnd + 1]! : null
    const localApex = (left === null || value >= left) && (right === null || value >= right)
      && (left === null || right === null || value > left || value > right)
    if (localApex) {
      const candidateStart = Math.max(start, plateauStart)
      const candidateEnd = Math.min(end, plateauEnd)
      if (candidateStart <= candidateEnd) {
        const candidate = Math.max(candidateStart, Math.min(candidateEnd, rawPosition))
        const distance = Math.abs(candidate - rawPosition)
        if (distance < nearestDistance || (distance === nearestDistance && candidate < (nearestPosition ?? Number.POSITIVE_INFINITY))) {
          nearestPosition = candidate
          nearestDistance = distance
        }
      }
    }
    index += 1
  }
  return nearestPosition ?? rawPosition
}

export function traceViewerHitSegments(anchors: Array<{ index: number; x: number }>, width: number): TraceViewerHitSegment[] {
  const safeWidth = Math.max(1, width)
  return anchors.map((anchor, ordinal) => {
    const previous = anchors[ordinal - 1]?.x
    const next = anchors[ordinal + 1]?.x
    const start = ordinal === 0 ? 0 : Math.max(0, ((previous ?? anchor.x) + anchor.x) / 2)
    const end = ordinal === anchors.length - 1 ? safeWidth : Math.min(safeWidth, (anchor.x + (next ?? anchor.x)) / 2)
    return { index: anchor.index, start, end: Math.max(start, end), center: anchor.x }
  })
}

/** Base slots are an HTML view of hit segments, not a second spacing calculation. */
export function traceViewerBaseSlots(hitSegments: TraceViewerHitSegment[]): TraceViewerBaseSlot[] {
  return hitSegments.map((hit) => ({
    index: hit.index,
    start: hit.start,
    end: hit.end,
    width: hit.end - hit.start,
    glyphOffset: hit.center - hit.start,
  }))
}

/** Mirrors the visible scan-center across a direction-reversed chromatogram. */
export function traceViewerMirroredScrollLeft(previousWidth: number, nextWidth: number, scrollLeft: number, viewportWidth: number) {
  const oldWidth = Math.max(0, previousWidth)
  const newWidth = Math.max(0, nextWidth)
  const viewport = Math.max(0, viewportWidth)
  if (oldWidth === 0 || newWidth <= viewport) return 0
  const oldCenter = scrollLeft + viewport / 2
  const mirroredCenter = (oldWidth - oldCenter) / oldWidth * newWidth
  return Math.max(0, Math.min(newWidth - viewport, mirroredCenter - viewport / 2))
}

export function traceViewerPath(points: TraceViewerPoint[]) {
  if (!points.length) return ''
  return points.map((point, index) => `${index === 0 ? 'M' : 'L'}${point.x.toFixed(2)},${point.y.toFixed(2)}`).join(' ')
}

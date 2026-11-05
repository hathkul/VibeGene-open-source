import { describe, expect, it } from 'vitest'
import {
  buildTraceViewerGeometry,
  orientTraceChromatogram,
  traceViewerBaseSlots,
  traceViewerHitSegments,
  traceViewerMirroredScrollLeft,
  traceViewerAutoscaleEnvelope,
  TRACE_VIEWER_AUTOSCALE_MAX_GAIN,
  traceViewerNearestCalledChannelApex,
  traceViewerPath,
} from './traceViewerGeometry'
import type { ChromatogramData } from './traceTypes'

const data: ChromatogramData = {
  aTrace: [0, 3, 1],
  tTrace: [2, 0, 0],
  gTrace: [0, 0, 6],
  cTrace: [0, 4, 0],
  basePos: [0, 1, 2],
  baseCalls: ['A', 'T', 'G'],
  qualNums: [40, 32, 15],
}

describe('standalone trace viewer transforms and geometry', () => {
  it('reverse-complements the called bases and scan channels for reverse view', () => {
    const reversed = orientTraceChromatogram(data, 'reverse')
    expect(reversed.baseCalls).toEqual(['C', 'A', 'T'])
    expect(reversed.basePos).toEqual([0, 1, 2])
    expect(reversed.aTrace).toEqual([0, 0, 2])
    expect(reversed.tTrace).toEqual([1, 3, 0])
    expect(reversed.gTrace).toEqual([0, 4, 0])
    expect(reversed.cTrace).toEqual([6, 0, 0])
    expect(reversed.qualNums).toEqual([15, 32, 40])
  })

  it('reverse-complements raw sample channels and mirrors raw PLOC.1 positions', () => {
    const withRaw: ChromatogramData = {
      ...data,
      raw: {
        aTrace: [1, 2, 3, 4],
        tTrace: [11, 12, 13, 14],
        gTrace: [21, 22, 23, 24],
        cTrace: [31, 32, 33, 34],
        basePos: [1, 3],
      },
    }
    const reversed = orientTraceChromatogram(withRaw, 'reverse')
    expect(reversed.raw).toEqual({
      aTrace: [14, 13, 12, 11],
      tTrace: [4, 3, 2, 1],
      gTrace: [34, 33, 32, 31],
      cTrace: [24, 23, 22, 21],
      basePos: [0, 2],
    })
  })

  it('maps calls to raw scan positions and creates vertical quality bars', () => {
    const geometry = buildTraceViewerGeometry(data, { sampleScale: 2 })
    expect(geometry.width).toBe(4)
    expect(geometry.bases.map(({ base, x, quality }) => ({ base, x, quality }))).toEqual([
      { base: 'A', x: 0, quality: 40 },
      { base: 'T', x: 2, quality: 32 },
      { base: 'G', x: 4, quality: 15 },
    ])
    expect(geometry.qualityBars.map(({ index, x }) => ({ index, x }))).toEqual([
      { index: 0, x: -2.5 },
      { index: 1, x: -0.5 },
      { index: 2, x: 1.5 },
    ])
    expect(geometry.qualityBars[0]?.height).toBeCloseTo(11.3333, 3)
  })

  it('horizontal zoom changes width and base x while vertical zoom changes amplitude only', () => {
    const standard = buildTraceViewerGeometry(data, { mode: 'standard', peakZoom: 1 })
    const wider = buildTraceViewerGeometry(data, { sampleScale: 1.6, peakZoom: 1 })
    const taller = buildTraceViewerGeometry(data, { sampleScale: 0.8, peakZoom: 2 })
    expect(wider.width).toBe(standard.width * 2)
    expect(wider.bases[1]?.x).toBe((standard.bases[1]?.x ?? 0) * 2)
    expect(wider.channels[0]?.points[1]?.y).toBe(standard.channels[0]?.points[1]?.y)
    expect(taller.channels[0]?.points[1]?.x).toBe(standard.channels[0]?.points[1]?.x)
    expect(taller.channels[0]?.points[1]?.y).toBeLessThan(standard.channels[0]?.points[1]?.y ?? 0)
  })

  it('autoscale uses a broad gain-limited shared envelope, preserves ratios, and keeps weak starts low', () => {
    const length = 6000
    const aTrace = Array.from({ length }, () => 0)
    const tTrace = Array.from({ length }, () => 0)
    for (let scan = 0; scan < 150; scan += 13) {
      aTrace[scan] = 24 + (scan % 5) * 8
      tTrace[scan] = aTrace[scan]! / 2
    }
    for (let scan = 1000; scan <= 5000; scan += 200) {
      const amplitude = 900 - (scan - 1000) * 0.18
      aTrace[scan] = amplitude
      tTrace[scan] = amplitude / 2
    }
    const drifting: ChromatogramData = {
      aTrace,
      tTrace,
      gTrace: Array.from({ length }, () => 0),
      cTrace: Array.from({ length }, () => 0),
      basePos: Array.from({ length: 600 }, (_, index) => index * 10),
      baseCalls: [],
    }
    const envelope = traceViewerAutoscaleEnvelope(drifting)
    const standard = buildTraceViewerGeometry(drifting, { mode: 'standard' })
    const autoscaled = buildTraceViewerGeometry(drifting, { mode: 'autoscaled' })
    const globalMax = 900
    const plotRange = standard.baseline - 6
    const weakStartHeight = Math.max(...autoscaled.channels[0]!.points.slice(0, 150).map((point) => autoscaled.baseline - point.y))
    const standardLateHeight = standard.baseline - standard.channels[0]!.points[5000]!.y
    const autoscaledLateHeight = autoscaled.baseline - autoscaled.channels[0]!.points[5000]!.y
    const aPeakHeight = autoscaled.baseline - autoscaled.channels[0]!.points[3000]!.y
    const tPeakHeight = autoscaled.baseline - autoscaled.channels[1]!.points[3000]!.y
    expect(envelope[5000]).toBeGreaterThanOrEqual(globalMax / TRACE_VIEWER_AUTOSCALE_MAX_GAIN)
    expect(weakStartHeight / plotRange).toBeLessThan(0.35)
    expect(autoscaledLateHeight / standardLateHeight).toBeCloseTo(TRACE_VIEWER_AUTOSCALE_MAX_GAIN, 3)
    expect(tPeakHeight / aPeakHeight).toBeCloseTo(0.5, 5)
    const envelopeDeltas = Array.from({ length: 41 }, (_, index) => Math.abs(envelope[1000 + index * 100]! - envelope[1000 + index * 100 - 1]!))
    expect(Math.max(...envelopeDeltas)).toBeLessThan(globalMax * 0.06)
    expect(envelope.every((denominator) => denominator >= globalMax / TRACE_VIEWER_AUTOSCALE_MAX_GAIN)).toBe(true)
  })

  it('raw mode uses signed DATA1–4 with a true zero baseline and sample ruler', () => {
    const rawData = {
      ...data,
      raw: {
        aTrace: [-2, 0, 4, -1],
        tTrace: [1, 0, -6, 0],
        gTrace: [0, 3, 0, -2],
        cTrace: [-1, 2, 1, 0],
        basePos: [0, 1, 2],
      },
    }
    for (const key of ['aTrace', 'tTrace', 'gTrace', 'cTrace'] as const) {
      rawData.raw[key] = [...rawData.raw[key], ...Array.from({ length: 247 }, () => 0)]
    }
    const geometry = buildTraceViewerGeometry(rawData, { mode: 'raw', sampleScale: 1, height: 100, rulerStep: 100 })
    expect(geometry.width).toBe(250)
    expect(geometry.baseline).toBeCloseTo(6 + 4 / 10 * 86)
    expect(geometry.channels[0]!.points[2]!.y).toBe(6)
    expect(geometry.channels[1]!.points[2]!.y).toBe(92)
    expect(geometry.bases).toEqual([])
    expect(geometry.qualityBars).toEqual([])
    expect(geometry.ruler).toEqual([
      { index: 100, x: 100, major: true, label: 100 },
      { index: 200, x: 200, major: true, label: 200 },
    ])
  })

  it('builds base hit segments and numbered ruler ticks without consulting alignment', () => {
    expect(traceViewerHitSegments([{ index: 2, x: 0 }, { index: 4, x: 10 }, { index: 7, x: 20 }], 25)).toEqual([
      { index: 2, start: 0, end: 5, center: 0 },
      { index: 4, start: 5, end: 15, center: 10 },
      { index: 7, start: 15, end: 25, center: 20 },
    ])
    expect(buildTraceViewerGeometry(data, { sampleScale: 1, rulerStep: 2 }).ruler).toEqual([
      { index: 0, x: 0, major: true },
      { index: 1, x: 1, major: true },
      { index: 2, x: 2, major: false },
    ])
  })

  it.each([0.5, 1, 2.5])('uses identical hit, selectable-slot, glyph, marker, quality, and hover geometry at %sx', (zoom) => {
    const geometry = buildTraceViewerGeometry(data, { sampleScale: 0.8 * zoom })
    expect(geometry.baseSlots).toHaveLength(geometry.hitSegments.length)
    for (const base of geometry.bases) {
      const hit = geometry.hitSegments.find((entry) => entry.index === base.index)!
      const slot = geometry.baseSlots.find((entry) => entry.index === base.index)!
      const bar = geometry.qualityBars.find((entry) => entry.index === base.index)!
      const marker = geometry.activeMarkers.find((entry) => entry.index === base.index)!
      expect(hit.center).toBe(base.x)
      expect(slot.start).toBe(hit.start)
      expect(slot.end).toBe(hit.end)
      expect(slot.glyphOffset + slot.start).toBe(base.x)
      expect(bar.x + bar.width / 2).toBeCloseTo(base.x, 10)
      expect(marker.center).toBe(base.x)
      expect((marker.start + marker.end) / 2).toBeCloseTo(base.x, 10)
      expect(hit.start + (hit.end - hit.start)).toBe(slot.end)
    }
  })

  it('omits calls without valid matched scan positions rather than fabricating ordinal coordinates', () => {
    const geometry = buildTraceViewerGeometry({ ...data, basePos: [0, Number.NaN, 99], baseCalls: ['A', 'T', 'G'] })
    expect(geometry.bases).toEqual([{ index: 0, base: 'A', rawPosition: 0, x: 0.8, quality: 40 }])
    expect(geometry.hitSegments.map((segment) => segment.index)).toEqual([0])
    expect(geometry.ruler.map((tick) => tick.index)).toEqual([0])
  })

  it('snaps shoulder PLOCs to the called-channel apex inside the midpoint-bounded cell', () => {
    const shoulder: ChromatogramData = {
      ...data,
      aTrace: [0, 5, 12, 7, 1],
      tTrace: [0, 0, 0, 0, 0],
      gTrace: [0, 0, 0, 0, 0],
      cTrace: [0, 0, 0, 0, 0],
      basePos: [1],
      baseCalls: ['A'],
      qualNums: [40],
    }
    const before = [...shoulder.basePos]
    const geometry = buildTraceViewerGeometry(shoulder, { sampleScale: 2 })
    expect(geometry.bases[0]).toMatchObject({ index: 0, base: 'A', rawPosition: 1, x: 4 })
    expect(shoulder.basePos).toEqual(before)
    expect(traceViewerNearestCalledChannelApex([0, 5, 12, 7, 1], 1, 0, 4)).toBe(2)
  })

  it('chooses the nearest local apex rather than a stronger distant peak and falls back to raw PLOC when none exists', () => {
    expect(traceViewerNearestCalledChannelApex([0, 10, 0, 0, 0, 0, 25, 0], 2, 0, 7)).toBe(1)
    expect(traceViewerNearestCalledChannelApex([0, 1, 2, 3, 4, 5], 1, 0, 3)).toBe(1)
  })

  it('treats a flat local-max plateau as one apex and uses raw proximity then lower index', () => {
    expect(traceViewerNearestCalledChannelApex([0, 4, 8, 8, 8, 2], 3, 0, 5)).toBe(3)
    expect(traceViewerNearestCalledChannelApex([0, 8, 0, 0, 8, 0], 2.5, 0, 5)).toBe(1)
  })

  it('keeps homopolymer calls ordered and distinct when their peaks form a plateau', () => {
    const homopolymer: ChromatogramData = {
      aTrace: Array.from({ length: 12 }, (_, index) => index >= 2 && index <= 4 ? 8 : 0),
      tTrace: Array.from({ length: 12 }, () => 0),
      gTrace: Array.from({ length: 12 }, () => 0),
      cTrace: Array.from({ length: 12 }, () => 0),
      basePos: [2, 4],
      baseCalls: ['A', 'A'],
    }
    const geometry = buildTraceViewerGeometry(homopolymer)
    expect(geometry.bases.map((base) => base.rawPosition)).toEqual([2, 4])
    expect(geometry.bases.map((base) => base.x / 0.8)).toEqual([2, 4])
    expect(geometry.bases[0]!.x).toBeLessThan(geometry.bases[1]!.x)
  })

  it('limits first and last open-ended calls to six scans from raw PLOC', () => {
    const traces = Array.from({ length: 101 }, (_, index) => (index === 16 ? 10 : index === 82 ? 30 : 0))
    const edgeCalls: ChromatogramData = {
      aTrace: traces,
      tTrace: Array.from({ length: 101 }, () => 0),
      gTrace: Array.from({ length: 101 }, () => 0),
      cTrace: Array.from({ length: 101 }, () => 0),
      basePos: [10, 90],
      baseCalls: ['A', 'A'],
    }
    const geometry = buildTraceViewerGeometry(edgeCalls)
    expect(geometry.bases.map((base) => base.rawPosition)).toEqual([10, 90])
    expect(geometry.bases.map((base) => base.x / 0.8)).toEqual([16, 90])
    expect(Math.abs(geometry.bases[0]!.x / 0.8 - 10)).toBeLessThanOrEqual(6)
    expect(Math.abs(geometry.bases[1]!.x / 0.8 - 90)).toBeLessThanOrEqual(6)
  })

  it.each([0.5, 1, 2.5])('keeps the widened active marker centered on snapped calls at %sx', (zoom) => {
    const uneven: ChromatogramData = {
      aTrace: Array.from({ length: 40 }, (_, index) => index === 3 ? 8 : 0),
      tTrace: Array.from({ length: 40 }, (_, index) => index === 11 ? 8 : 0),
      gTrace: Array.from({ length: 40 }, (_, index) => index === 29 ? 8 : 0),
      cTrace: Array.from({ length: 40 }, () => 0),
      basePos: [2, 10, 30],
      baseCalls: ['A', 'T', 'G'],
      qualNums: [40, 30, 20],
    }
    const geometry = buildTraceViewerGeometry(uneven, { sampleScale: 0.8 * zoom })
    for (const base of geometry.bases) {
      const marker = geometry.activeMarkers.find((entry) => entry.index === base.index)!
      const hit = geometry.hitSegments.find((entry) => entry.index === base.index)!
      const quality = geometry.qualityBars.find((entry) => entry.index === base.index)!
      expect(marker.center).toBe(base.x)
      expect((marker.start + marker.end) / 2).toBeCloseTo(base.x, 10)
      expect(marker.start).toBeGreaterThanOrEqual(hit.start)
      expect(marker.end).toBeLessThanOrEqual(hit.end)
      expect(quality.x + quality.width / 2).toBeCloseTo(base.x, 10)
    }
  })

  it.each([0.5, 1, 2.5])('scales active-marker width with local base spacing without overlap at %sx', (zoom) => {
    const spacing: ChromatogramData = {
      aTrace: Array.from({ length: 51 }, (_, index) => index === 5 ? 8 : 0),
      tTrace: Array.from({ length: 51 }, (_, index) => index === 15 ? 8 : 0),
      gTrace: Array.from({ length: 51 }, (_, index) => index === 40 ? 8 : 0),
      cTrace: Array.from({ length: 51 }, () => 0),
      basePos: [5, 15, 40],
      baseCalls: ['A', 'T', 'G'],
    }
    const geometry = buildTraceViewerGeometry(spacing, { sampleScale: 0.8 * zoom })
    for (let ordinal = 0; ordinal < geometry.bases.length; ordinal += 1) {
      const base = geometry.bases[ordinal]!
      const marker = geometry.activeMarkers[ordinal]!
      const gaps = [geometry.bases[ordinal - 1], geometry.bases[ordinal + 1]]
        .filter((neighbor): neighbor is (typeof geometry.bases)[number] => neighbor !== undefined)
        .map((neighbor) => Math.abs(neighbor.x - base.x))
      const localGap = Math.min(...gaps)
      const ratio = (marker.end - marker.start) / localGap
      expect((marker.start + marker.end) / 2).toBeCloseTo(base.x, 10)
      expect(ratio).toBeGreaterThanOrEqual(0.75)
      expect(ratio).toBeLessThanOrEqual(0.9)
      const next = geometry.activeMarkers[ordinal + 1]
      if (next) expect(marker.end).toBeLessThan(next.start)
    }
  })

  it('uses hit segment boundaries for contiguous selectable sequence slots', () => {
    const hits = traceViewerHitSegments([{ index: 0, x: 4 }, { index: 1, x: 12 }, { index: 2, x: 27 }], 40)
    expect(traceViewerBaseSlots(hits)).toEqual([
      { index: 0, start: 0, end: 8, width: 8, glyphOffset: 4 },
      { index: 1, start: 8, end: 19.5, width: 11.5, glyphOffset: 4 },
      { index: 2, start: 19.5, end: 40, width: 20.5, glyphOffset: 7.5 },
    ])
    expect(traceViewerBaseSlots([])).toEqual([])
  })

  it.each([0.5, 1, 2.5])('mirrors the viewport center at %sx and round-trips across reverse toggles', (zoom) => {
    const width = 499 * 0.8 * zoom
    const viewport = 80
    const left = width / 4
    const mirrored = traceViewerMirroredScrollLeft(width, width, left, viewport)
    expect(mirrored).toBeCloseTo(width - left - viewport, 10)
    expect(traceViewerMirroredScrollLeft(width, width, mirrored, viewport)).toBeCloseTo(left, 10)
  })

  it('packs plot height and fixed sequence/detail bands into the measured scroller height', () => {
    const geometry = buildTraceViewerGeometry({ ...data, qualNums: [60, 40, 20] }, { height: 360 })
    expect(geometry.height).toBe(360)
    expect(geometry.baseline).toBe(352)
    expect(geometry.detailHeight).toBe(40)
    expect(geometry.rulerY).toBe(23)
    expect(geometry.qualityBars[0]?.y).toBe(3)
    expect(geometry.qualityBars[0]!.y + geometry.qualityBars[0]!.height).toBe(20)
    expect(geometry.height + 30 + geometry.detailHeight).toBe(430)
  })

  it('keeps quality and ruler positions fixed when quality bar display is toggled by the view', () => {
    const geometry = buildTraceViewerGeometry(data)
    expect(geometry.qualityBars.every((bar) => bar.y >= 0 && bar.y + bar.height <= geometry.rulerY - 2)).toBe(true)
    expect(geometry.rulerY).toBe(23)
  })

  it('handles zero-valued channels and empty SVG paths', () => {
    const zero = { ...data, aTrace: [0, 0, 0], tTrace: [], gTrace: [], cTrace: [] }
    const geometry = buildTraceViewerGeometry(zero)
    expect(geometry.channels[0]?.points.every((point) => Number.isFinite(point.y))).toBe(true)
    expect(traceViewerPath([])).toBe('')
    expect(traceViewerPath([{ x: 1, y: 2 }, { x: 3, y: 4 }])).toBe('M1.00,2.00 L3.00,4.00')
  })
})

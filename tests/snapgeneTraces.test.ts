import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it, vi } from 'vitest'
import { JSDOM } from 'jsdom'
import { collectSnapGeneTraceBlocks, encodeSnapGeneAlignmentPackets, parseSnapGeneTraceContainers, parseSnapGeneTracesAsync } from '../src/domain/snapgeneTraces'
import type { TraceFileRecord } from '../src/domain/traceTypes'
import { parseSnapGeneZtr, snapGeneZtrToChromatogram } from '../src/domain/snapgeneZtr'

const fixtureDir = dirname(fileURLToPath(import.meta.url))
const ztrFixture = join(fixtureDir, 'fixtures', 'snapgene-trace0.ztr')

describe('SnapGene ZTR parser', () => {
  it('parses chromatogram peaks, base calls, and peak positions from a ZTR chunk', () => {
    const bytes = readFileSync(ztrFixture)
    const parsed = parseSnapGeneZtr(bytes)
    expect(parsed).not.toBeNull()
    expect(parsed!.bases.length).toBeGreaterThan(100)
    expect(parsed!.positions.length).toBeGreaterThan(50)
    expect(parsed!.samples.A.length).toBeGreaterThan(1000)
    expect(Math.max(...parsed!.positions)).toBeGreaterThan(parsed!.samples.A.length * 0.9)
    expect(Math.max(...parsed!.positions)).toBeLessThan(parsed!.samples.A.length)

    const chromatogram = snapGeneZtrToChromatogram(parsed!)
    expect(chromatogram.baseCalls.join('')).toBe(parsed!.bases.toUpperCase())
    expect(chromatogram.aTrace.length).toBe(chromatogram.tTrace.length)
    expect(chromatogram.basePos.length).toBe(chromatogram.baseCalls.length)
  })
})


describe('SnapGene trace import', () => {
  it('preserves visibility independently from whether an entry has chromatogram data', async () => {
    const trace = (fileName: string, enabled: boolean, withPeaks: boolean): TraceFileRecord => ({
      id: fileName, fileName, sequence: 'ACGT', enabled, expanded: false, alignment: null,
      chromatogram: {
        baseCalls: ['A', 'C', 'G', 'T'], basePos: [0, 1, 2, 3],
        aTrace: withPeaks ? [1, 2, 3, 4] : [], cTrace: withPeaks ? [1, 2, 3, 4] : [],
        gTrace: withPeaks ? [1, 2, 3, 4] : [], tTrace: withPeaks ? [1, 2, 3, 4] : [],
      },
    })
    const original = [trace('hidden.ab1', false, true), trace('visible.ab1', true, true), trace('visible.seq', true, false), trace('hidden.seq', false, false)]
    const packets = encodeSnapGeneAlignmentPackets(original)
    const bytes = new Uint8Array(packets.flatMap(packet => Array.from(packet)))
    const { containers, alignableXml } = collectSnapGeneTraceBlocks(bytes)
    expect(alignableXml).toContain('name="hidden.ab1" ID="0" isTrace="1" use="0"')
    const sync = parseSnapGeneTraceContainers(containers, alignableXml)
    let clock = 0
    const clockSpy = vi.spyOn(performance, 'now').mockImplementation(() => { clock += 20; return clock })
    let asyncTraces: TraceFileRecord[]
    try {
      asyncTraces = await parseSnapGeneTracesAsync(bytes)
    } finally {
      clockSpy.mockRestore()
    }
    expect(sync.map(item => item.enabled)).toEqual([false, true, true, false])
    expect(asyncTraces.map(item => item.enabled)).toEqual([false, true, true, false])
    expect(sync.map(item => item.sequence)).toEqual(original.map(item => item.sequence))
    // Exercise the browser DOMParser branch as well as the Node fallback.
    const originalParser = globalThis.DOMParser
    try {
      globalThis.DOMParser = new JSDOM().window.DOMParser as typeof DOMParser
      expect(parseSnapGeneTraceContainers(containers, alignableXml).map(item => item.enabled)).toEqual([false, true, true, false])
    } finally {
      globalThis.DOMParser = originalParser
    }
    const toggled = sync.map(item => ({ ...item, enabled: !item.enabled }))
    const saved = encodeSnapGeneAlignmentPackets(toggled)
    const reopened = collectSnapGeneTraceBlocks(new Uint8Array(saved.flatMap(packet => Array.from(packet))))
    expect(parseSnapGeneTraceContainers(reopened.containers, reopened.alignableXml).map(item => item.enabled)).toEqual([true, false, false, true])
  })
})

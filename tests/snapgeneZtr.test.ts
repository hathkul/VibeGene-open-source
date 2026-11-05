import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { parseSnapGeneZtr, snapGeneZtrToChromatogram } from '../src/domain/snapgeneZtr'

const fixtureDir = dirname(fileURLToPath(import.meta.url))
const ztrFixture = join(fixtureDir, 'fixtures', 'snapgene-trace0.ztr')

describe('SnapGene ZTR parser', () => {
  it('parses chromatogram peaks, base calls, and peak positions from a ZTR chunk', () => {
    const bytes = readFileSync(ztrFixture)
    const parsed = parseSnapGeneZtr(bytes)
    expect(parsed).not.toBeNull()
    expect(parsed!.bases.length).toBeGreaterThan(100)
    expect(parsed!.positions.length).toBe(parsed!.bases.length)
    expect(parsed!.samples.A.length).toBeGreaterThan(1000)
    expect(Math.max(...parsed!.positions)).toBeGreaterThan(parsed!.samples.A.length * 0.9)
    expect(Math.max(...parsed!.positions)).toBeLessThan(parsed!.samples.A.length)

    const chromatogram = snapGeneZtrToChromatogram(parsed!)
    expect(chromatogram.baseCalls.join('')).toBe(parsed!.bases.toUpperCase())
    expect(chromatogram.aTrace.length).toBe(chromatogram.tTrace.length)
    expect(chromatogram.basePos.length).toBe(chromatogram.baseCalls.length)
    expect(Math.max(...chromatogram.basePos)).toBeGreaterThan(500)
    expect(Math.max(...chromatogram.basePos)).toBeLessThan(chromatogram.aTrace.length)
  })

  it('retains non-uniform base positions that track synthetic called-channel peaks', () => {
    const parsed = parseSnapGeneZtr(readFileSync(ztrFixture))!
    const chromatogram = snapGeneZtrToChromatogram(parsed)
    const { basePos, baseCalls } = chromatogram

    // Monotonic non-decreasing scan positions.
    for (let index = 1; index < basePos.length; index += 1) {
      expect(basePos[index]!).toBeGreaterThanOrEqual(basePos[index - 1]!)
    }

    // The synthetic trace stores intentionally non-uniform peak spacing.
    const steps: number[] = []
    for (let index = 1; index < basePos.length; index += 1) steps.push(basePos[index]! - basePos[index - 1]!)
    const meanStep = steps.reduce((sum, step) => sum + step, 0) / steps.length
    const variance = steps.reduce((sum, step) => sum + (step - meanStep) ** 2, 0) / steps.length
    expect(variance).toBeGreaterThan(0.5)

    // Positions should land on the called base's own signal (high purity),
    // confirming they correspond to the synthetic peaks.
    const channels: Record<string, number[]> = {
      A: chromatogram.aTrace,
      T: chromatogram.tTrace,
      G: chromatogram.gTrace,
      C: chromatogram.cTrace,
    }
    let purity = 0
    for (let index = 0; index < baseCalls.length; index += 1) {
      const scan = basePos[index]!
      const called = channels[baseCalls[index]!]?.[scan] ?? 0
      const total =
        (chromatogram.aTrace[scan] ?? 0) +
        (chromatogram.tTrace[scan] ?? 0) +
        (chromatogram.gTrace[scan] ?? 0) +
        (chromatogram.cTrace[scan] ?? 0)
      purity += total > 0 ? called / total : 0
    }
    expect(purity / baseCalls.length).toBeGreaterThan(0.5)
  })

  it('parses sequence-only ZTR traces without chromatogram samples', () => {
    const bytes = readFileSync(join(fixtureDir, 'fixtures', 'snapgene-base-only.ztr'))
    const parsed = parseSnapGeneZtr(bytes)
    expect(parsed).not.toBeNull()
    expect(parsed!.bases.length).toBeGreaterThan(100)
    expect(parsed!.samples.A.length).toBe(0)
    const chromatogram = snapGeneZtrToChromatogram(parsed!)
    expect(chromatogram.baseCalls.join('')).toBe(parsed!.bases.toUpperCase())
    expect(chromatogram.aTrace.length).toBe(0)
  })
})

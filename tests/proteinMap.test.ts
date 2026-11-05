import { describe, expect, it } from 'vitest'
import { layoutProteinMapBonds, layoutProteinMapFeatures, proteinMapBondPath, proteinMapBoundaryAtFraction, proteinMapResidueAtFraction, proteinMapTickStep } from '../src/domain/proteinMap'
import type { ProteinBond, SequenceFeature } from '../src/domain/types'

function feature(id: string, start: number, end: number): SequenceFeature {
  return {
    id,
    name: id,
    type: 'region',
    color: '#2563eb',
    locations: [{ start, end, strand: 'forward' }],
  }
}

function bond(id: string, start: number, end: number): ProteinBond {
  return {
    id,
    name: id,
    type: 'disulfide',
    endpoints: [{ residue: start }, { residue: end }],
  }
}

describe('protein map layout', () => {
  it('packs overlapping features into lanes and reuses free lanes', () => {
    const layout = layoutProteinMapFeatures([
      feature('long', 2, 20),
      feature('overlap', 10, 15),
      feature('later', 20, 30),
    ], 40)
    expect(layout.map(({ feature: item, lane }) => [item.id, lane])).toEqual([
      ['long', 0],
      ['overlap', 1],
      ['later', 0],
    ])
  })

  it('hides disabled features and clamps imported coordinates', () => {
    const hidden = { ...feature('hidden', 1, 5), visible: false }
    const layout = layoutProteinMapFeatures([hidden, feature('clamped', -5, 80)], 40)
    expect(layout).toHaveLength(1)
    expect(layout[0]).toMatchObject({ start: 0, end: 40 })
  })

  it('packs overlapping bonds into lanes', () => {
    const layout = layoutProteinMapBonds([
      bond('outer', 2, 20),
      bond('inner', 8, 12),
      bond('later', 21, 25),
    ], 40)
    expect(layout.map(({ bond: item, lane }) => [item.id, lane])).toEqual([
      ['outer', 0],
      ['inner', 1],
      ['later', 0],
    ])
  })

  it('draws rounded-rectangle bond connectors instead of arcs', () => {
    expect(proteinMapBondPath(10, 40, 100, 80, 6)).toBe(
      'M 10 100 V 86 Q 10 80 16 80 H 34 Q 40 80 40 86 V 100',
    )
    expect(proteinMapBondPath(20, 20, 100, 80)).toBe('M 20 100 V 80')
  })

  it('chooses readable ruler intervals', () => {
    expect(proteinMapTickStep(40)).toBe(5)
    expect(proteinMapTickStep(400)).toBe(50)
    expect(proteinMapTickStep(4_000)).toBe(500)
  })

  it('maps pointer fractions to residues across the whole protein', () => {
    expect(proteinMapResidueAtFraction(100, 0)).toBe(0)
    expect(proteinMapResidueAtFraction(100, 0.505)).toBe(50)
    expect(proteinMapResidueAtFraction(100, 1)).toBe(99)
  })

  it('maps pointer fractions to nearest residue seams', () => {
    expect(proteinMapBoundaryAtFraction(100, 0)).toBe(0)
    // Just past the midpoint of residue 0 → seam after it.
    expect(proteinMapBoundaryAtFraction(100, 0.006)).toBe(1)
    expect(proteinMapBoundaryAtFraction(100, 0.5)).toBe(50)
    expect(proteinMapBoundaryAtFraction(100, 1)).toBe(100)
  })
})

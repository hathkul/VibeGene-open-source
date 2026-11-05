import { describe, expect, it } from 'vitest'
import {
  enzymeSiteCounts,
  recognitionPositions,
  enzymeNamesBySelection,
  filterRestrictionSitesForEnzymeSet,
  restrictionSiteForCalloutEnzyme,
} from '../src/domain/restrictionSiteFilters'
import type { RestrictionEnzyme, RestrictionSite } from '../src/domain/types'

function site(name: string, start: number, cutTop: number, cutBottom: number): RestrictionSite {
  const enzyme: RestrictionEnzyme = {
    name,
    notation: 'G^GATCC',
    recognition: 'GGATCC',
    cutTop: 1,
    cutBottom: 5,
    type: 'II',
    overhang: { type: "5'", sequence: 'GATC', length: 4 },
    manufacturers: [],
    notes: [],
  }
  return {
    enzyme,
    start,
    end: start + 6,
    match: enzyme.recognition,
    cutTop,
    cutBottom,
  }
}

describe('restriction site filtering', () => {
  it('counts one physical site once when scan rows are duplicated', () => {
    const bam = site('BamHI', 10, 11, 15)
    expect(enzymeSiteCounts([bam, { ...bam }])).toEqual({ BamHI: 1 })
    expect(
      filterRestrictionSitesForEnzymeSet([bam, { ...bam }], {
        set: 'unique-six-plus',
        selectedNames: [],
      }),
    ).toHaveLength(2)
  })

  it('resolves a comma-joined callout to the requested real enzyme at that cut', () => {
    const bam = site('BamHI', 10, 11, 15)
    const xba = site('XbaI', 9, 11, 15)
    const merged = {
      ...bam,
      enzyme: { ...bam.enzyme, name: 'BamHI, XbaI' },
      match: '__enzyme_callout__',
    }
    expect(restrictionSiteForCalloutEnzyme(merged, 'XbaI', [bam, xba])).toBe(xba)
  })
})

describe('restriction coordinate policy', () => {
  it('projects recognition bases across circular origin and clips linear edges', () => {
    const motif = site('A', 8, 8, 9)
    expect([...recognitionPositions([motif], 10, 'circular')]).toEqual([8, 9, 0, 1, 2, 3])
    expect([...recognitionPositions([motif], 10, 'linear')]).toEqual([8, 9])
    expect([...recognitionPositions([motif], 0, 'circular')]).toEqual([])
    const spacer = { ...motif, start: 0, enzyme: { ...motif.enzyme, recognition: 'AA' + 'N'.repeat(8) + 'TT' } }
    expect([...recognitionPositions([spacer], 20, 'linear')]).toEqual([0, 1, 10, 11])
  })
  it('classifies both strand boundaries and allows the same name in both sets', () => {
    const result = enzymeNamesBySelection([site('A', 0, 2, 5), site('A', 0, 1, 3), site('B', 0, 5, 6)], { start: 2, end: 5 }, 10, 'linear')
    expect([...result.inside]).toEqual(['A'])
    expect([...result.outside]).toEqual(['A', 'B'])
  })
  it('handles circular wrap and origin boundary for staggered cuts', () => {
    const result = enzymeNamesBySelection([site('A', 0, 9, 1), site('B', 0, 9, 5)], { start: 8, end: 2 }, 10, 'circular')
    expect([...result.inside]).toEqual(['A'])
    expect([...result.outside]).toEqual(['B'])
    expect(enzymeNamesBySelection([site('C', 0, 0, 9)], { start: 8, end: 10 }, 10, 'circular').inside.has('C')).toBe(true)
  })
})

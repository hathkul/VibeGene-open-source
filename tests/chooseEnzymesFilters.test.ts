import { describe, expect, it } from 'vitest'
import {
  enzymeMatchesOverhangFilter,
  enzymeMatchesRecognitionLength,
  filterEnzymesByChooseCriteria,
  isNondegenerateSticky,
  isSiteInsideSelection,
} from '../src/domain/chooseEnzymesFilters'
import type { RestrictionEnzyme, RestrictionSite } from '../src/domain/types'

function fakeEnzyme(partial: Partial<RestrictionEnzyme> & Pick<RestrictionEnzyme, 'name'>): RestrictionEnzyme {
  return {
    notation: 'A/A',
    recognition: 'AAAA',
    cutTop: 2,
    cutBottom: 2,
    type: 'II',
    overhang: { type: 'blunt', sequence: null, length: 0 },
    manufacturers: [],
    notes: [],
    methylationRules: { dam: {}, dcm: {}, ecoKI: {} },
    ...partial,
  }
}

function fakeSite(enzyme: RestrictionEnzyme, start: number): RestrictionSite {
  return {
    enzyme,
    start,
    end: start + enzyme.recognition.length,
    cutTop: start + enzyme.cutTop,
    cutBottom: start + enzyme.cutBottom,
    orientation: 'forward',
  }
}

describe('chooseEnzymesFilters', () => {
  it('treats concrete overhang sequences as nondegenerate sticky', () => {
    const enzyme = fakeEnzyme({
      name: 'EcoRI',
      recognition: 'GAATTC',
      cutTop: 1,
      cutBottom: 5,
      overhang: { type: "5'", sequence: 'AATT', length: 4 },
    })
    expect(isNondegenerateSticky(enzyme)).toBe(true)
    expect(enzymeMatchesOverhangFilter(enzyme, 'nondeg-sticky')).toBe(true)
    expect(enzymeMatchesOverhangFilter(enzyme, '5-prime')).toBe(true)
  })

  it('rejects degenerate overhang sequences', () => {
    const enzyme = fakeEnzyme({
      name: 'AccI',
      recognition: 'GTMKAC',
      cutTop: 2,
      cutBottom: 4,
      overhang: { type: "5'", sequence: 'MK', length: 2 },
    })
    expect(isNondegenerateSticky(enzyme)).toBe(false)
    expect(enzymeMatchesOverhangFilter(enzyme, 'sticky')).toBe(true)
    expect(enzymeMatchesOverhangFilter(enzyme, 'blunt-or-nondeg-sticky')).toBe(false)
  })

  it('applies recognition length bounds with 9+ meaning unbounded max', () => {
    const enzyme = fakeEnzyme({ name: 'Long', recognition: 'AAAAAAAAAA' })
    expect(enzymeMatchesRecognitionLength(enzyme, 6, 9)).toBe(true)
    expect(enzymeMatchesRecognitionLength(enzyme, 6, 8)).toBe(false)
    expect(enzymeMatchesRecognitionLength(enzyme, 4, 9)).toBe(true)
  })

  it('filters by cuts only inside or outside the selection', () => {
    const insideEnzyme = fakeEnzyme({ name: 'Inside' })
    const outsideEnzyme = fakeEnzyme({ name: 'Outside' })
    const bothEnzyme = fakeEnzyme({ name: 'Both' })
    const sites = [
      fakeSite(insideEnzyme, 20),
      fakeSite(outsideEnzyme, 80),
      fakeSite(bothEnzyme, 25),
      fakeSite(bothEnzyme, 90),
    ]
    const criteria = {
      sourceSet: 'all' as const,
      cutLocation: 'only-inside' as const,
      cutCountMode: 'at-least' as const,
      cutCountAtLeast: 1,
      cutCountExact: 1,
      cutCountRangeMin: 1,
      cutCountRangeMax: 2,
      cutCountScope: 'entire' as const,
      overhang: 'blunt-or-sticky' as const,
      recognitionMin: 1,
      recognitionMax: 9,
    }
    const selection = { start: 10, end: 50 }
    const insideOnly = filterEnzymesByChooseCriteria(
      [insideEnzyme, outsideEnzyme, bothEnzyme],
      sites,
      criteria,
      selection,
    ).map((enzyme) => enzyme.name)
    expect(insideOnly).toEqual(['Inside'])

    const outsideOnly = filterEnzymesByChooseCriteria(
      [insideEnzyme, outsideEnzyme, bothEnzyme],
      sites,
      { ...criteria, cutLocation: 'only-outside' },
      selection,
    ).map((enzyme) => enzyme.name)
    expect(outsideOnly).toEqual(['Outside'])
  })

  it('counts cut sites inside the selection scope', () => {
    const enzyme = fakeEnzyme({ name: 'Multi' })
    const sites = [fakeSite(enzyme, 5), fakeSite(enzyme, 20), fakeSite(enzyme, 80)]
    expect(isSiteInsideSelection(20, { start: 10, end: 50 })).toBe(true)
    const matches = filterEnzymesByChooseCriteria(
      [enzyme],
      sites,
      {
        sourceSet: 'all',
        cutLocation: 'anywhere',
        cutCountMode: 'exact',
        cutCountAtLeast: 0,
        cutCountExact: 1,
        cutCountRangeMin: 1,
        cutCountRangeMax: 2,
        cutCountScope: 'inside-selection',
        overhang: 'blunt-or-sticky',
        recognitionMin: 1,
        recognitionMax: 9,
      },
      { start: 10, end: 50 },
    )
    expect(matches.map((item) => item.name)).toEqual(['Multi'])
  })
})

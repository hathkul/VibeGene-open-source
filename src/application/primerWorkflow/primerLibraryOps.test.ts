import { themeFixturePalette } from '../../test-support/themeFixturePalette'
import { describe, expect, it } from 'vitest'
import {
  countSkippedPresentPrimers,
  databasePrimerListEntries,
  libraryHybridizationTemplates,
  validLibraryMemberSequences,
} from './primerLibraryOps'

describe('validLibraryMemberSequences', () => {
  it('keeps parsed, non-empty member sequences in order', () => {
    const members = [
      { sequence: 'ACGT' },
      { sequence: 'GGGG', parseError: 'bad trace' },
      { sequence: '' },
      { sequence: 'TTTT', parseError: undefined },
    ]
    expect(validLibraryMemberSequences(members)).toEqual(['ACGT', 'TTTT'])
  })
})

describe('libraryHybridizationTemplates', () => {
  it('is only the consensus sequence for a plain construct', () => {
    expect(libraryHybridizationTemplates(false, 'ACGT', ['GGGG'])).toEqual(['ACGT'])
  })

  it('adds member sequences after the consensus for a library', () => {
    expect(libraryHybridizationTemplates(true, 'ACGT', ['GGGG', 'TTTT'])).toEqual(['ACGT', 'GGGG', 'TTTT'])
  })
})

describe('databasePrimerListEntries', () => {
  it('trims names, defaults blank names, normalizes sequence case, and keeps metadata', () => {
    expect(databasePrimerListEntries([
      { name: '  T7-F  ', sequence: 'acgt acgt', color: themeFixturePalette.primerTeal, description: 'fwd' },
      { name: '   ', sequence: 'gggg' },
    ])).toEqual([
      { name: 'T7-F', sequence: 'ACGTACGT', color: themeFixturePalette.primerTeal, description: 'fwd' },
      { name: 'Primer', sequence: 'GGGG', color: undefined, description: undefined },
    ])
  })

  it('drops entries whose sequence has no DNA bases', () => {
    expect(databasePrimerListEntries([
      { name: 'empty', sequence: '  ' },
      { name: 'noise', sequence: '123!' },
      { name: 'ok', sequence: 'acgt' },
    ]).map((entry) => entry.name)).toEqual(['ok'])
  })
})

describe('countSkippedPresentPrimers', () => {
  it('counts candidates already on the record by normalized sequence', () => {
    expect(countSkippedPresentPrimers(
      ['ACGT', 'gggg', 'TTTT'],
      [{ sequence: 'acgt' }, { sequence: 'GGGG' }],
    )).toBe(2)
  })

  it('counts a repeated candidate sequence once it has been seen', () => {
    expect(countSkippedPresentPrimers(['ACGT', 'ACGT', 'acgt'], [])).toBe(2)
  })

  it('returns zero when every candidate is new', () => {
    expect(countSkippedPresentPrimers(['ACGT'], [{ sequence: 'GGGG' }])).toBe(0)
  })
})

import { describe, expect, it } from 'vitest'
import { enzymeNameAtCharIndex, enzymeNamesFromLabel } from '../src/domain/enzymeLabel'

describe('enzymeNamesFromLabel', () => {
  it('splits comma-separated enzyme names', () => {
    expect(enzymeNamesFromLabel('EcoRI, MfeI')).toEqual(['EcoRI', 'MfeI'])
    expect(enzymeNamesFromLabel('EcoRI')).toEqual(['EcoRI'])
  })

  it('strips trailing position suffixes from each name', () => {
    expect(enzymeNamesFromLabel('EcoRI, BamHI (123)')).toEqual(['EcoRI', 'BamHI'])
    expect(enzymeNamesFromLabel('HindIII (42)')).toEqual(['HindIII'])
    expect(enzymeNamesFromLabel('NmeAIII (-10)')).toEqual(['NmeAIII'])
  })
})

describe('enzymeNameAtCharIndex', () => {
  const label = 'EcoRI, BamHI'

  it('returns the only name for single-enzyme labels', () => {
    expect(enzymeNameAtCharIndex('EcoRI', 0)).toBe('EcoRI')
    expect(enzymeNameAtCharIndex('EcoRI', 4)).toBe('EcoRI')
  })

  it('maps character indices to the clicked enzyme name', () => {
    expect(enzymeNameAtCharIndex(label, 0)).toBe('EcoRI')
    expect(enzymeNameAtCharIndex(label, 4)).toBe('EcoRI')
    expect(enzymeNameAtCharIndex(label, 5)).toBe('BamHI')
    expect(enzymeNameAtCharIndex(label, 8)).toBe('BamHI')
    expect(enzymeNameAtCharIndex(label, label.length - 1)).toBe('BamHI')
  })

  it('falls back to the last enzyme past the label end', () => {
    expect(enzymeNameAtCharIndex(label, label.length)).toBe('BamHI')
  })

  it('maps indices across labels with position suffixes', () => {
    const positioned = 'EcoRI, BamHI (123)'
    expect(enzymeNameAtCharIndex(positioned, 0)).toBe('EcoRI')
    expect(enzymeNameAtCharIndex(positioned, 8)).toBe('BamHI')
    expect(enzymeNameAtCharIndex(positioned, positioned.length - 1)).toBe('BamHI')
  })

  it('maps clicks on a signed position suffix to the enzyme name', () => {
    const positioned = 'NmeAIII (-10)'
    expect(enzymeNameAtCharIndex(positioned, positioned.length - 1)).toBe('NmeAIII')
  })
})

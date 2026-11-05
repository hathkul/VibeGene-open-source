import { describe, expect, it } from 'vitest'
import { absentGelDigestEnzymes, uniqueAgaroseGelOpenSources } from './agaroseGelSourceSearch'

describe('uniqueAgaroseGelOpenSources', () => {
  it('excludes the pinned current/history source and duplicate open constructs', () => {
    const sources = [
      { label: 'History source in another window', record: { id: 'history-source' } },
      { label: 'pUC19 first window', record: { id: 'puc19' } },
      { label: 'pUC19 second window', record: { id: 'puc19' } },
      { label: 'pET28', record: { id: 'pet28' } },
    ]
    expect(uniqueAgaroseGelOpenSources(sources, 'history-source')).toEqual([
      sources[1],
      sources[3],
    ])
  })
})

describe('absentGelDigestEnzymes', () => {
  it('reports unique selected enzymes without a cut site', () => {
    expect(absentGelDigestEnzymes(
      ['EcoRI', 'BamHI', 'EcoRI', ''],
      ['EcoRI', 'EcoRI'],
    )).toEqual(['BamHI'])
  })
})

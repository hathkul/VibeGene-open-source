import { describe, expect, it } from 'vitest'
import { enzymes, findRestrictionSites, isPalindromicRecognition } from '../src/domain/enzymes'

describe('isPalindromicRecognition', () => {
  it('detects classic palindromes', () => {
    expect(isPalindromicRecognition('GAATTC')).toBe(true)
    expect(isPalindromicRecognition('TCTAGA')).toBe(true)
  })

  it('detects non-palindromic Type IIS motifs', () => {
    expect(isPalindromicRecognition('GGTCTC')).toBe(false)
    expect(isPalindromicRecognition('GAAGAC')).toBe(false)
  })

  it('treats IUPAC self-complementary motifs as palindromic', () => {
    expect(isPalindromicRecognition('CCWGG')).toBe(true)
  })
})

describe('findRestrictionSites reverse-strand search', () => {
  const bsaI = {
    name: 'BsaI',
    notation: 'GGTCTC(1/5)',
    recognition: 'GGTCTC',
    cutTop: 7,
    cutBottom: 11,
    type: 'IIS' as const,
    overhang: { type: "5'" as const, sequence: 'NNNN', length: 4 },
    manufacturers: [],
    notes: [],
  }

  it('finds forward non-palindromic sites', () => {
    const sequence = 'AAAAAAGGTCTCAAAAAA'
    const sites = findRestrictionSites(sequence, [bsaI])
    expect(sites).toHaveLength(1)
    expect(sites[0]?.start).toBe(6)
    expect(sites[0]?.match).toBe('GGTCTC')
    expect(sites[0]?.cutTop).toBe(6 + 7)
    expect(sites[0]?.cutBottom).toBe(6 + 11)
  })

  it('finds reverse-orientation non-palindromic sites via reverse complement', () => {
    // GAGACC is reverse-complement of BsaI GGTCTC — only present on the reverse strand.
    const sequence = 'AAAAAAGAGACCAAAAAA'
    const sites = findRestrictionSites(sequence, [bsaI])
    expect(sites).toHaveLength(1)
    expect(sites[0]?.start).toBe(6)
    expect(sites[0]?.match).toBe('GAGACC')
    // Cut offsets mirror across the recognition block for reverse orientation.
    expect(sites[0]?.cutTop).toBe(6 + 6 - 11)
    expect(sites[0]?.cutBottom).toBe(6 + 6 - 7)
  })

  it('does not double-count palindromic sites', () => {
    const ecoRi = enzymes.find((enzyme) => enzyme.name === 'EcoRI')
    expect(ecoRi).toBeTruthy()
    const sequence = 'AAAAAGAATTCAAAAA'
    const sites = findRestrictionSites(sequence, [ecoRi!])
    expect(sites).toHaveLength(1)
    expect(sites[0]?.match).toBe('GAATTC')
  })

  it('reports both orientations when both motifs are present', () => {
    const sequence = 'AAAGGTCTCAAAAGAGACCAAA'
    const sites = findRestrictionSites(sequence, [bsaI])
    expect(sites).toHaveLength(2)
    expect(sites.map((site) => site.match).toSorted()).toEqual(['GAGACC', 'GGTCTC'])
  })
})

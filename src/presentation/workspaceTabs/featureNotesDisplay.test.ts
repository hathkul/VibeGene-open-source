import { describe, expect, it } from 'vitest'
import { featureNotesDisplayParts, translationSummary } from './featureNotesDisplay'

describe('feature notes display', () => {
  it('puts each qualifier on a separate line, preserving repeats and valueless flags', () => {
    expect(featureNotesDisplayParts('/gene="abc" /note="one" /note="two" /pseudo')).toEqual([
      { kind: 'qualifier', name: 'gene', value: 'abc' },
      { kind: 'qualifier', name: 'note', value: 'one' },
      { kind: 'qualifier', name: 'note', value: 'two' },
      { kind: 'qualifier', name: 'pseudo', value: null },
    ])
  })

  it('does not split quoted values, URLs, or existing multiline text', () => {
    const input = 'Description\n/note="see https://example.org/a and /gene=example" /product="X/Y"'
    expect(featureNotesDisplayParts(input)).toEqual([
      { kind: 'text', text: 'Description' },
      { kind: 'qualifier', name: 'note', value: 'see https://example.org/a and /gene=example' },
      { kind: 'qualifier', name: 'product', value: 'X/Y' },
    ])
    expect(featureNotesDisplayParts('A plain note')).toEqual([{ kind: 'text', text: 'A plain note' }])
    expect(featureNotesDisplayParts(undefined)).toEqual([{ kind: 'text', text: '-' }])
  })

  it('displays colon-format and mixed qualifiers without losing repeated fields or URLs', () => {
    expect(featureNotesDisplayParts('gene: bla note: see https://example.org/a /product="enzyme"')).toEqual([
      { kind: 'qualifier', name: 'gene', value: 'bla' },
      { kind: 'qualifier', name: 'note', value: 'see https://example.org/a' },
      { kind: 'qualifier', name: 'product', value: 'enzyme' },
    ])
    expect(featureNotesDisplayParts('note: one note: two')).toEqual([
      { kind: 'qualifier', name: 'note', value: 'one' },
      { kind: 'qualifier', name: 'note', value: 'two' },
    ])
    expect(featureNotesDisplayParts('/gene = "bla" product = enzyme')).toEqual([
      { kind: 'qualifier', name: 'gene', value: 'bla' },
      { kind: 'qualifier', name: 'product', value: 'enzyme' },
    ])
  })

  it('summarizes residue count and average mass without counting stop symbols', () => {
    expect(translationSummary('MA*')).toBe('2 amino acids = 0.2 kDa')
    expect(translationSummary('M')).toBe('1 amino acid = 0.1 kDa')
    expect(translationSummary('MX*')).toBe('2 amino acids · weight unavailable')
    expect(translationSummary('***')).toBeNull()
    expect(translationSummary('not a peptide!')).toBeNull()
  })
})

import { describe, expect, it } from 'vitest'
import {
  DEFAULT_NEW_PROTEIN_FILE_NAME,
  normalizeNewProteinFileName,
} from './newProteinFile'

describe('normalizeNewProteinFileName', () => {
  it('uses the native SnapGene protein extension by default', () => {
    expect(DEFAULT_NEW_PROTEIN_FILE_NAME).toBe('Untitled protein.prot')
    expect(normalizeNewProteinFileName('')).toBe('Untitled protein.prot')
  })

  it('adds .prot when the entered name has no extension', () => {
    expect(normalizeNewProteinFileName('My protein')).toBe('My protein.prot')
  })

  it('keeps an explicitly entered extension', () => {
    expect(normalizeNewProteinFileName('My protein.faa')).toBe('My protein.faa')
  })
})

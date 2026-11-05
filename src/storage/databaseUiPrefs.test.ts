import { describe, expect, it } from 'vitest'
import { moleculeBelongsInDatabaseFileView } from './databaseUiPrefs'

describe('moleculeBelongsInDatabaseFileView', () => {
  it('keeps DNA and RNA records in DNA, excluding protein files', () => {
    expect(moleculeBelongsInDatabaseFileView('dna', 'dna')).toBe(true)
    expect(moleculeBelongsInDatabaseFileView('rna', 'dna')).toBe(true)
    expect(moleculeBelongsInDatabaseFileView('protein', 'dna')).toBe(false)
  })

  it('shows only protein records in Proteins', () => {
    expect(moleculeBelongsInDatabaseFileView('protein', 'proteins')).toBe(true)
    expect(moleculeBelongsInDatabaseFileView('dna', 'proteins')).toBe(false)
    expect(moleculeBelongsInDatabaseFileView('rna', 'proteins')).toBe(false)
  })

  it('does not treat primer or translated-CDS rows as stored files', () => {
    expect(moleculeBelongsInDatabaseFileView('dna', 'primers')).toBe(false)
    expect(moleculeBelongsInDatabaseFileView('protein', 'cdses')).toBe(false)
  })
})

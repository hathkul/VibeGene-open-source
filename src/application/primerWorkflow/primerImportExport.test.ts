import { themeFixturePalette } from '../../test-support/themeFixturePalette'
import { describe, expect, it } from 'vitest'
import { libraryPrimerImportOptions, sgRnaExportPlan } from './primerImportExport'

describe('libraryPrimerImportOptions', () => {
  it('is undefined for a plain construct', () => {
    expect(libraryPrimerImportOptions(false, [{ sequence: 'ACGT' }])).toBeUndefined()
  })

  it('collects valid member sequences and all member primers for a library', () => {
    const members = [
      { sequence: 'ACGT', primers: [{ id: 'p1', name: 'm1-f', sequence: 'ACGT', color: themeFixturePalette.primerTeal }] },
      { sequence: 'GGGG', parseError: 'bad trace', primers: [{ id: 'p2', name: 'm2-f', sequence: 'GGGG', color: themeFixturePalette.primerTeal }] },
      { sequence: 'TTTT' },
    ]
    const options = libraryPrimerImportOptions(true, members)
    expect(options?.additionalTemplates).toEqual(['ACGT', 'TTTT'])
    expect(options?.additionalExistingPrimers.map((primer) => primer.id)).toEqual(['p1', 'p2'])
  })
})

describe('sgRnaExportPlan', () => {
  it('is null for an empty selection', () => {
    expect(sgRnaExportPlan([], 'construct.dna')).toBeNull()
  })

  it('names the file after the record without its .dna suffix', () => {
    expect(sgRnaExportPlan([{ guide: { name: 'g1' } }], 'my construct.dna')).toEqual({
      fileName: 'sgRNAs from my construct.txt',
      status: 'Exported sgRNA g1.',
    })
  })

  it('summarizes a multi-guide export', () => {
    expect(sgRnaExportPlan([{ guide: { name: 'g1' } }, { guide: { name: 'g2' } }], 'construct')?.status)
      .toBe('Exported 2 sgRNAs.')
  })
})

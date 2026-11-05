import { describe, expect, it } from 'vitest'
import { PROTEIN_FEATURE_COLORS } from '../../domain/proteinFeatures'
import type { ProteinBond, SequenceFeature, SequenceRecord } from '../../domain/types'
import { appendDnaAnnotations, appendInterProAnnotations, appendProteinAnnotations, appendTranslatedOrfAnnotations } from './featureAnnotation'

const feature = (id: string): SequenceFeature => ({
  id,
  name: id,
  type: 'misc_feature',
  color: PROTEIN_FEATURE_COLORS.other,
  locations: [{ start: 0, end: 3, strand: 'forward' }],
})

const record = (molecule: 'dna' | 'protein'): SequenceRecord => ({
  id: 'record', name: 'Record', description: '', molecule, topology: 'linear', sequence: molecule === 'dna' ? 'ATG' : 'M',
  features: [], primers: [], operations: [],
  createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
  construct: {
    syntheticDna: false, confirmedExperimentally: false, laboratoryHostOrganism: null,
    sourceOrganism: null, bacterialTransformationStrain: null, hostMethylation: { dam: false, dcm: false, ecoKI: false },
    sequenceClass: '', accessionNumber: '', codeNumber: '', sequenceAuthor: '', comments: '', references: '',
  },
  ...(molecule === 'protein' ? { protein: { numberingStart: 1, numberingRegions: [], bonds: [] } } : {}),
})

describe('feature annotation transitions', () => {
  it('appends DNA and translated-ORF features with operation history', () => {
    const dna = appendDnaAnnotations(record('dna'), [feature('dna-1')], 'DNA summary')
    const translated = appendTranslatedOrfAnnotations(record('dna'), [feature('orf-1')], 'ORF summary')
    expect(dna.features.map((entry) => entry.id)).toEqual(['dna-1'])
    expect(translated.features.map((entry) => entry.id)).toEqual(['orf-1'])
    expect(dna.operations.at(-1)?.summary).toBe('DNA summary')
    expect(translated.operations.at(-1)?.summary).toBe('ORF summary')
  })

  it('appends protein features and bonds without mutating the source', () => {
    const source = record('protein')
    const bond: ProteinBond = {
      id: 'bond-1', name: 'Bridge', type: 'disulfide',
      endpoints: [{ residue: 0 }, { residue: 1 }],
    }
    const next = appendProteinAnnotations(source, [feature('protein-1')], [bond], 'Protein summary')
    expect(source.features).toHaveLength(0)
    expect(source.protein?.bonds).toEqual([])
    expect(next.features.map((entry) => entry.id)).toEqual(['protein-1'])
    expect(next.protein?.bonds).toEqual([bond])
    expect(next.operations.at(-1)?.summary).toBe('Protein summary')
  })

  it('uses the InterPro/Pfam operation type', () => {
    const next = appendInterProAnnotations(record('protein'), [feature('domain-1')], 'Domain summary')
    expect(next.operations.at(-1)?.type).toBe('annotateInterProPfam')
  })
})

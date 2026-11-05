import { describe, expect, it } from 'vitest'
import { PROTEIN_FEATURE_COLORS } from '../../domain/proteinFeatures'
import type { ProteinBond, SequenceRecord } from '../../domain/types'
import { removeProteinBond, replaceProteinAnnotations, replaceProteinComparisonAlignmentCacheEntry, replaceProteinComparisonSources, replaceProteinComparisonVariableRegions, setProteinBondVisibility, upsertProteinBond } from './proteinWorkflow'

const record = (): SequenceRecord => ({
  id: 'protein', name: 'Protein', description: '', molecule: 'protein', topology: 'linear', sequence: 'MKT',
  features: [], primers: [], operations: [],
  createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
  construct: {
    syntheticDna: false, confirmedExperimentally: false, laboratoryHostOrganism: null,
    sourceOrganism: null, bacterialTransformationStrain: null, hostMethylation: { dam: false, dcm: false, ecoKI: false },
    sequenceClass: '', accessionNumber: '', codeNumber: '', sequenceAuthor: '', comments: '', references: '',
  },
  protein: { numberingStart: 1, numberingRegions: [], bonds: [], comparisonSources: [], comparisonAlignmentCache: [] },
})

describe('protein workflow transitions', () => {
  it('replaces comparison sources and prunes stale cache entries', () => {
    const source = { id: 'keep', name: 'Keep', kind: 'protein' as const, sequence: 'M', enabled: true }
    const stale = { sourceId: 'drop', signature: 'old', alignment: null }
    const next = replaceProteinComparisonSources({ ...record(), protein: { ...record().protein!, comparisonAlignmentCache: [stale] } }, [source])
    expect(next.protein?.comparisonSources).toEqual([source])
    expect(next.protein?.comparisonAlignmentCache).toEqual([])
  })

  it('keeps cache refreshes identity-stable when the entry is unchanged', () => {
    const entry = { sourceId: 'source', signature: 'sig', alignment: null }
    const source = { ...record(), protein: { ...record().protein!, comparisonAlignmentCache: [entry] } }
    expect(replaceProteinComparisonAlignmentCacheEntry(source, entry)).toBe(source)
    expect(replaceProteinComparisonAlignmentCacheEntry(source, { ...entry, signature: 'new' }).protein?.comparisonAlignmentCache).toEqual([{ ...entry, signature: 'new' }])
  })

  it('updates variable regions, bonds, and annotation history without mutating input', () => {
    const bond: ProteinBond = { id: 'bond', name: 'Bond', type: 'disulfide', endpoints: [{ residue: 0 }, { residue: 2 }] }
    const withRegions = replaceProteinComparisonVariableRegions(record(), [{ id: 'variable', start: 1, end: 2 }])
    const withBond = upsertProteinBond(withRegions, bond)
    const annotated = replaceProteinAnnotations(withBond, [{ id: 'feature', name: 'Feature', type: 'misc_feature', color: PROTEIN_FEATURE_COLORS.other, locations: [{ start: 0, end: 1, strand: 'forward' }] }], [bond], 'annotate', 'Annotated protein')
    expect(record().protein?.bonds).toEqual([])
    expect(annotated.protein?.bonds).toEqual([bond])
    expect(annotated.features.map((feature) => feature.id)).toEqual(['feature'])
    expect(annotated.operations.at(-1)?.summary).toBe('Annotated protein')
    expect(replaceProteinAnnotations(withBond, [], undefined, 'annotateDarpin', 'Annotated DARPin').protein?.bonds).toEqual([bond])
    expect(removeProteinBond(annotated, bond.id).protein?.bonds).toEqual([])
  })

  it('toggles protein bond visibility without mutating unrelated bonds', () => {
    const bond: ProteinBond = { id: 'bond', name: 'Bond', type: 'disulfide', endpoints: [{ residue: 0 }, { residue: 2 }] }
    const other: ProteinBond = { id: 'other', name: 'Other', type: 'disulfide', endpoints: [{ residue: 1 }, { residue: 3 }] }
    const source = { ...record(), protein: { ...record().protein!, bonds: [bond, other] } }
    const hidden = setProteinBondVisibility(source, bond.id, false)
    expect(hidden.protein?.bonds[0].visible).toBe(false)
    expect(hidden.protein?.bonds[1]).toEqual(other)
    const shown = setProteinBondVisibility(hidden, bond.id, true)
    expect(shown.protein?.bonds[0].visible).toBeUndefined()
  })
})

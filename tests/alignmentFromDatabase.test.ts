import { describe, expect, it } from 'vitest'
import { appendAlignedTracesFromSequences } from '../src/domain/traceFileWorkflow'
import { proteinComparisonSourceFromSequence } from '../src/domain/proteinComparisonImport'

describe('appendAlignedTracesFromSequences', () => {
  it('aligns Database construct sequences against a template', async () => {
    const template = 'ATGCGTACGTACGTACGT'
    const result = await appendAlignedTracesFromSequences(
      [{ name: 'query', sequence: 'CGTACGTACG' }],
      template,
      [],
      { topology: 'linear' },
    )
    expect(result.addedCount).toBe(1)
    expect(result.traces).toHaveLength(1)
    expect(result.traces[0]?.fileName).toBe('query')
    expect(result.traces[0]?.alignment).not.toBeNull()
  })

  it('keeps Database construct features on added traces', async () => {
    const result = await appendAlignedTracesFromSequences(
      [{
        name: 'query',
        sequence: 'CGTACGTACG',
        features: [{
          id: 'f1',
          name: 'tag',
          type: 'misc_feature',
          color: '#64748b',
          locations: [{ start: 0, end: 3, strand: 'forward' }],
        }],
      }],
      'ATGCGTACGTACGTACGT',
      [],
      { topology: 'linear' },
    )
    expect(result.addedTraceIds).toHaveLength(1)
    expect(result.traces[0]?.features?.[0]?.name).toBe('tag')
  })
})

describe('proteinComparisonSourceFromSequence', () => {
  it('builds protein and DNA comparison sources', () => {
    const protein = proteinComparisonSourceFromSequence('MSKGEEL', 'GFP', 'protein')
    expect(protein?.kind).toBe('protein')
    expect(protein?.sequence).toBe('MSKGEEL')
    const dna = proteinComparisonSourceFromSequence('ATGCGT', 'orf', 'dna', 'orf.gb')
    expect(dna?.kind).toBe('dna')
    expect(dna?.fileName).toBe('orf.gb')
    expect(dna?.sequence).toBe('ATGCGT')
  })
})

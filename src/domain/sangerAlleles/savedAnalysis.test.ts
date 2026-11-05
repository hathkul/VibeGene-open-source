// @vitest-environment jsdom
import { beforeAll, describe, expect, it } from 'vitest'
import { cloneFixture } from '../fixtures'
import { exportProjectJson, exportSnapGene, parseProjectJson, parseSnapGene } from '../parsers'
import { serializeProjectSnapshot } from '../projectSnapshot'
import { initSnapGeneLzma } from '../snapgeneLzma'
import { normalizeSavedSangerAlleleAnalysis, type SavedSangerAlleleAnalysis } from './savedAnalysis'

describe('saved Sanger analysis', () => {
  beforeAll(async () => { await initSnapGeneLzma() })
  it('marks the document changed and survives native DNA and project JSON round trips', () => {
    const source = { ...cloneFixture(), topology: 'linear' as const }
    const analysis: SavedSangerAlleleAnalysis = {
      version: 1, referenceSequence: source.sequence, selectedGroups: ['clone 1'], variantSelections: { 'clone 1': { 0: [1] } },
      results: [{ label: 'clone 1', traceNames: ['read.ab1'], result: { fit: 0.95, positions: 100, perRead: [{ name: 'read.ab1', fit: 0.95 }], warnings: [], alleles: [{ edit: { start: 1, end: 2, inserted: '', label: 'deletion' }, fraction: 1, ambiguous: true, alternatives: [{ edit: { start: 2, end: 3, inserted: '', label: 'alternative' }, reason: 'similar-fit' }], alternativesTruncated: false }] } }],
    }
    const record = { ...source, dna: { ...source.dna, sangerAlleleAnalysis: analysis } }
    expect(serializeProjectSnapshot(record, [])).not.toBe(serializeProjectSnapshot(source, []))
    expect(parseProjectJson(exportProjectJson(record)).record.dna?.sangerAlleleAnalysis).toEqual(analysis)
    expect(parseSnapGene(exportSnapGene(record), 'saved.dna').dna?.sangerAlleleAnalysis).toEqual(analysis)
    expect(normalizeSavedSangerAlleleAnalysis({ ...analysis, variantSelections: { 'clone 1': { 0: [5] } } })).toBeUndefined()
  })

  it('persists independent fits and rejects malformed nested results', () => {
    const source = { ...cloneFixture(), topology: 'linear' as const }
    const fit = { fit: 0.95, positions: 100, perRead: [], warnings: [], alleles: [{ edit: { start: 1, end: 2, inserted: '', label: 'deletion' }, fraction: 1, ambiguous: false, alternatives: [], alternativesTruncated: false }] }
    const analysis: SavedSangerAlleleAnalysis = { version: 1, referenceSequence: source.sequence, selectedGroups: [], variantSelections: {}, results: [{ label: 'clone', traceNames: ['a', 'b'], result: fit, independentReads: [{ name: 'a', orientation: 'forward', result: fit }, { name: 'b', orientation: 'reverse', error: 'no anchor' }] }] }
    const record = { ...source, dna: { ...source.dna, sangerAlleleAnalysis: analysis } }
    expect(parseProjectJson(exportProjectJson(record)).record.dna?.sangerAlleleAnalysis).toEqual(analysis)
    expect(parseSnapGene(exportSnapGene(record), 'saved.dna').dna?.sangerAlleleAnalysis).toEqual(analysis)
    const broken = structuredClone(analysis)
    broken.results[0]!.independentReads![0]!.result!.alleles[0]!.edit.end = source.sequence.length + 1
    expect(normalizeSavedSangerAlleleAnalysis(broken)).toBeUndefined()
  })
})

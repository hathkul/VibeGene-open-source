import { describe, expect, it, vi } from 'vitest'
import { cloneFixture } from '../../domain/fixtures'
import { isDnaLibraryRecord } from '../../domain/dnaLibrary'
import { createAlleleLibrary } from './library'
import type { AlleleFit } from '../../domain/sangerAlleles/fit'
import { alignPendingTraces } from '../../domain/traceFileWorkflow'

describe('Sanger allele output', () => {
  it('keeps a warning about conflicting independent reads in the exported library', async () => {
    const source = { ...cloneFixture(), topology: 'linear' as const }
    const makeFit = (start: number): AlleleFit => ({ fit: 0.95, positions: 80, perRead: [], warnings: [], alleles: [{ edit: { start, end: start + 1, inserted: '', label: 'deletion' }, fraction: 1, ambiguous: false, alternatives: [], alternativesTruncated: false }] })
    const group = { label: 'clone', traceNames: ['forward', 'reverse'], result: makeFit(1), independentReads: [{ name: 'forward', orientation: 'forward' as const, result: makeFit(1) }, { name: 'reverse', orientation: 'reverse' as const, result: makeFit(10) }] }
    const library = await createAlleleLibrary(source, [group])
    expect(library.description).toContain('Warning: independently fitted reads report different candidate sequences')
  })
  it('creates annotated allele members and refuses unresolved guesses', async () => {
    const source = { ...cloneFixture(), topology: 'linear' as const, sequence: 'ACGT'.repeat(40), features: [{ id: 'gene', name: 'Gene', type: 'gene', color: '', locations: [{ start: 0, end: 140, strand: 'forward' as const }] }], primers: [] }
    const result: AlleleFit = { fit: 0.95, positions: 80, perRead: [{ name: 'clone.ab1', fit: 0.95 }], warnings: [], alleles: [
      { edit: { start: 0, end: 0, inserted: '', label: 'Reference' }, fraction: 0.6, ambiguous: false, alternatives: [], alternativesTruncated: false },
      { edit: { start: 40, end: 43, inserted: '', label: '−3 bp' }, fraction: 0.4, ambiguous: false, alternatives: [], alternativesTruncated: false },
    ] }
    const alignPending = vi.fn(alignPendingTraces)
    const library = await createAlleleLibrary(source, [{ label: 'Group 1', traceNames: ['clone.ab1'], result }], alignPending)
    expect(library.name).toBe(`${source.name} Group 1 · Sanger allele candidates`)
    expect(alignPending).not.toHaveBeenCalled()
    expect(isDnaLibraryRecord(library)).toBe(true)
    expect(library.traceFiles).toHaveLength(2)
    expect(library.traceFiles?.[1]?.sequence).toBe(source.sequence.slice(0, 40) + source.sequence.slice(43))
    expect(library.traceFiles?.[1]?.features?.[0]).toMatchObject({ name: 'Gene', locations: [{ start: 0, end: 137 }] })
    expect(library.description).toContain('not confirmed genotypes')
    const combined = await createAlleleLibrary(source, [{ label: 'Group 1', traceNames: ['clone.ab1'], result }, { label: 'Group 2', traceNames: ['other.ab1'], result }], alignPending)
    expect(combined.name).toBe(`${source.name} · Sanger allele candidates`)
  })

  it('exports chosen competing variants with stable names and records their uncertainty', async () => {
    const source = { ...cloneFixture(), topology: 'linear' as const, sequence: 'ACGT'.repeat(40), primers: [], features: [] }
    const first = { start: 40, end: 43, inserted: '', label: '−3 bp at 41' }
    const second = { start: 41, end: 44, inserted: '', label: '−3 bp at 42' }
    const fit: AlleleFit = { fit: 0.99, positions: 80, perRead: [{ name: 'a.ab1', fit: 0.99 }], warnings: [], alleles: [
      { edit: first, fraction: 0.6, ambiguous: true, alternatives: [{ edit: second, reason: 'similar-fit' }], alternativesTruncated: false },
      { edit: { start: 0, end: 0, inserted: '', label: 'Reference' }, fraction: 0.4, ambiguous: false, alternatives: [], alternativesTruncated: false },
    ] }
    const groups = [{ label: 'clone 9', traceNames: ['a.ab1'], result: fit }]
    await expect(createAlleleLibrary(source, groups)).rejects.toThrow(/Select at least one variant/)
    await expect(createAlleleLibrary(source, groups, undefined, new Map([['clone 9', { 0: [2] }]]))).rejects.toThrow(/Invalid variant/)
    const single = await createAlleleLibrary(source, groups, undefined, new Map([['clone 9', { 0: [1] }]]))
    expect(single.traceFiles?.map((item) => item.fileName)).toEqual(['clone 9 allele_1 variant_2 (~60.0%)', 'clone 9 allele_2 variant_1 (~40.0%)'])
    expect(single.traceFiles?.[0]?.sequence).toBe(source.sequence.slice(0, 41) + source.sequence.slice(44))
    const both = await createAlleleLibrary(source, groups, undefined, new Map([['clone 9', { 0: [0, 1] }]]))
    expect(both.traceFiles?.map((item) => item.fileName)).toEqual(['clone 9 allele_1 variant_1 (~60.0%)', 'clone 9 allele_1 variant_2 (~60.0%)', 'clone 9 allele_2 variant_1 (~40.0%)'])
    expect(both.traceFiles?.[0]?.sequence).toBe(source.sequence.slice(0, 40) + source.sequence.slice(43))
    expect(both.description).toContain('competing hypotheses, not independent alleles')
    expect(both.description).toContain('estimated fraction applies to the allele as a whole')
  })

  it('does not create a library from poorly fitted candidates', async () => {
    const source = cloneFixture()
    const fit: AlleleFit = { fit: 0.79, positions: 80, perRead: [{ name: 'a.ab1', fit: 0.99 }], warnings: [], alleles: [{ edit: { start: 0, end: 0, inserted: '', label: 'Reference' }, fraction: 1, ambiguous: false, alternatives: [], alternativesTruncated: false }] }
    await expect(createAlleleLibrary(source, [{ label: 'Group 1', traceNames: ['a.ab1'], result: fit }])).rejects.toThrow(/No sufficiently fitted/)
  })

  it('uses the general alignment worker for large divergent regions and preserves member order', async () => {
    let state = 7
    const sequence = Array.from({ length: 1600 }, () => {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0
      return 'ACGT'[(state >>> 16) & 3]
    }).join('')
    const source = { ...cloneFixture(), sequence, topology: 'linear' as const, features: [], primers: [] }
    const fit: AlleleFit = { fit: 0.99, positions: 80, perRead: [{ name: 'a.ab1', fit: 0.99 }], warnings: [], alleles: [
      { edit: { start: 100, end: 110, inserted: '', label: 'first deletion' }, fraction: 0.5, ambiguous: false, alternatives: [], alternativesTruncated: false },
      { edit: { start: 1200, end: 1210, inserted: '', label: 'second deletion' }, fraction: 0.5, ambiguous: false, alternatives: [], alternativesTruncated: false },
    ] }
    const fallback = vi.fn(alignPendingTraces)
    const library = await createAlleleLibrary(source, [{ label: 'sample', traceNames: ['a.ab1'], result: fit }], fallback)
    expect(fallback).toHaveBeenCalledOnce()
    expect(fallback.mock.calls[0]![0]).toHaveLength(1)
    expect(library.traceFiles?.map((member) => member.fileName)).toEqual(['sample allele_1 variant_1 (~50.0%)', 'sample allele_2 variant_1 (~50.0%)'])
    expect(library.traceFiles?.every((member) => !!member.alignment && !member.parseError)).toBe(true)
  })
})

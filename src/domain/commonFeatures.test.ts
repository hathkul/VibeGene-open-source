import { themeFixturePalette } from '../test-support/themeFixturePalette'
import { describe, expect, it } from 'vitest'
import { detectCommonFeatures, findApproximateDnaHits, type CommonFeatureTemplate } from './commonFeatures'
import type { SequenceRecord } from './types'
import { defaultConstructProperties } from './constructProperties'

const template = (sequence: string): CommonFeatureTemplate => ({
  id: 'test', fileName: 'test.dna', name: 'Test feature', type: 'misc_feature', color: themeFixturePalette.bluePrimary,
  sequence, qualifiers: [], locations: [{ start: 0, end: sequence.length, strand: 'forward' }],
})

const record = (sequence: string, topology: 'linear' | 'circular' = 'linear'): SequenceRecord => ({
  id: 'record', name: 'Test', description: '', molecule: 'dna', topology, sequence, features: [], primers: [], operations: [], construct: defaultConstructProperties,
  createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
})

describe('approximate common-feature detection', () => {
  it('finds bounded substitutions and reports actual identity', () => {
    const query = 'ACGT'.repeat(30)
    const mutated = `${query.slice(0, 60)}T${query.slice(61)}`
    expect(findApproximateDnaHits(mutated, query, 'linear', 95)).toEqual([{
      start: 0,
      matchPercent: 119 / 120 * 100,
      matchedSegments: [{ start: 0, end: 60 }, { start: 61, end: 120 }],
    }])
  })

  it('supports approximate hits across a circular origin', () => {
    const query = 'AACCGGTTAACCGGTTAACCGGTTAACCGG'
    const circular = `${query.slice(20)}GGGGGG${query.slice(0, 20)}`
    const hits = findApproximateDnaHits(circular, query, 'circular', 95)
    expect(hits.some((hit) => hit.start === 16 && hit.matchPercent === 100)).toBe(true)
  })

  it('keeps short feature templates exact even when permissive matching is requested', () => {
    const query = 'ACGTACGTACGTACGTACGTACGT'
    const mutated = `${query.slice(0, 12)}T${query.slice(13)}`
    expect(detectCommonFeatures(record(mutated), [template(query)], { minimumIdentityPercent: 90 })).toHaveLength(0)
  })

  it('marks approximate features and omits mismatching bases from their segments', () => {
    const query = 'ACGT'.repeat(30)
    const mutated = `${query.slice(0, 60)}T${query.slice(61)}`
    const match = detectCommonFeatures(record(mutated), [template(query)], { minimumIdentityPercent: 95 })[0]!
    expect(match.feature.locations).toEqual([
      { start: 0, end: 60, strand: 'forward' },
      { start: 61, end: 120, strand: 'forward' },
    ])
    expect(match.feature.notes).toContain('Partial 99.2% match; non-matching bases omitted')
  })
})

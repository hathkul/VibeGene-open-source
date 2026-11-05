import { themeFixturePalette } from '../../test-support/themeFixturePalette'
import { describe, expect, it } from 'vitest'
import type { SequenceFeature } from '../../domain/types'
import {
  addCleavageSite,
  createFeatureSegment,
  deleteFeatureSegment,
  locationIntersectsRange,
  mergeFeatureSegments,
  removeCleavageSite,
  splicedSequenceForFeature,
} from './featureEditing'

function feature(locations: SequenceFeature['locations']): SequenceFeature {
  return { id: 'f1', name: 'Feature', type: 'misc_feature', color: themeFixturePalette.blackLong, locations }
}

describe('feature editing transitions', () => {
  it('detects linear and origin-wrapping intersections', () => {
    expect(locationIntersectsRange({ start: 10, end: 20, strand: 'forward' }, { start: 15, end: 25 }, 100)).toBe(true)
    expect(locationIntersectsRange({ start: 90, end: 10, strand: 'forward' }, { start: 95, end: 5 }, 100)).toBe(true)
    expect(locationIntersectsRange({ start: 20, end: 30, strand: 'forward' }, { start: 90, end: 10 }, 100)).toBe(false)
  })

  it('splits an overlapping segment and appends a disjoint segment', () => {
    const source = feature([{ start: 10, end: 30, strand: 'forward' }])
    const split = createFeatureSegment([source], source.id, { start: 15, end: 20 }, 100)
    expect(split.kind).toBe('updated')
    if (split.kind === 'updated') {
      expect(split.features[0]!.locations).toEqual([
        { start: 10, end: 15, strand: 'forward' },
        { start: 15, end: 20, strand: 'forward' },
        { start: 20, end: 30, strand: 'forward' },
      ])
    }
    const appended = createFeatureSegment([source], source.id, { start: 40, end: 50 }, 100)
    expect(appended.kind === 'updated' && appended.overlaps).toBe(false)
  })

  it('rejects replacing a feature with its identical whole range', () => {
    expect(createFeatureSegment(
      [feature([{ start: 10, end: 30, strand: 'forward' }])],
      'f1',
      { start: 10, end: 30 },
      100,
    ).kind).toBe('whole-feature')
  })

  it('deletes the preferred matching segment and merges intersecting segments', () => {
    const source = feature([
      { start: 10, end: 20, strand: 'forward' },
      { start: 30, end: 40, strand: 'forward' },
      { start: 50, end: 60, strand: 'forward' },
    ])
    const deleted = deleteFeatureSegment([source], { start: 32, end: 33 }, 100, source.id)
    expect(deleted.kind === 'updated' && deleted.features[0]!.locations).toHaveLength(2)
    const merged = mergeFeatureSegments([source], { start: 15, end: 35 }, 100, source.id)
    expect(merged.kind).toBe('updated')
    if (merged.kind === 'updated') {
      expect(merged.mergedCount).toBe(2)
      expect(merged.features[0]!.locations).toEqual([
        { start: 10, end: 40, strand: 'forward' },
        { start: 50, end: 60, strand: 'forward' },
      ])
    }
  })

  it('adds, sorts, and removes cleavage positions', () => {
    const source = { ...feature([{ start: 0, end: 20, strand: 'forward' }]), cleavageArrows: [12] }
    const added = addCleavageSite([source], source.id, 4)!
    expect(added[0]!.cleavageArrows).toEqual([4, 12])
    expect(addCleavageSite(added, source.id, 4)).toBeNull()
    expect(removeCleavageSite(added, source.id, 4)![0]!.cleavageArrows).toEqual([12])
    expect(removeCleavageSite(added, source.id, 'all')![0]!.cleavageArrows).toBeUndefined()
  })

  it('splices forward and reverse-strand segments in biological order', () => {
    const sequence = 'AAAACCCCGGGGTTTT'
    expect(splicedSequenceForFeature(feature([
      { start: 0, end: 4, strand: 'forward' },
      { start: 8, end: 12, strand: 'forward' },
    ]), sequence)).toBe('AAAAGGGG')
    expect(splicedSequenceForFeature(feature([
      { start: 0, end: 4, strand: 'reverse' },
      { start: 8, end: 12, strand: 'reverse' },
    ]), sequence)).toBe('CCCCTTTT')
  })
})

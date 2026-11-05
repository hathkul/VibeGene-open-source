import { describe, expect, it } from 'vitest'
import { mergeAbuttingAssemblyFeatures } from '../src/domain/featureMerge'
import type { SequenceFeature } from '../src/domain/types'

function feat(
  id: string,
  name: string,
  locations: SequenceFeature['locations'],
  extras?: Partial<SequenceFeature>,
): SequenceFeature {
  return {
    id,
    name,
    type: 'CDS',
    color: '#c00',
    locations,
    ...extras,
  }
}

describe('mergeAbuttingAssemblyFeatures', () => {
  it('merges abutting copies of the same feature into one span', () => {
    const merged = mergeAbuttingAssemblyFeatures([
      feat('a', 'CDS1', [{ start: 10, end: 40, strand: 'forward' }]),
      feat('b', 'CDS1', [{ start: 40, end: 70, strand: 'forward' }]),
    ])
    expect(merged).toHaveLength(1)
    expect(merged[0]?.locations).toEqual([{ start: 10, end: 70, strand: 'forward' }])
  })

  it('merges an insert cloned inside split halves of the same feature', () => {
    const merged = mergeAbuttingAssemblyFeatures([
      feat('left', 'CDS1', [{ start: 0, end: 20, strand: 'forward' }]),
      feat('mid', 'CDS1', [{ start: 20, end: 50, strand: 'forward' }]),
      feat('right', 'CDS1', [{ start: 50, end: 80, strand: 'forward' }]),
    ])
    expect(merged).toHaveLength(1)
    expect(merged[0]?.locations).toEqual([{ start: 0, end: 80, strand: 'forward' }])
  })

  it('does not merge across a gap or different feature names', () => {
    const merged = mergeAbuttingAssemblyFeatures([
      feat('a', 'CDS1', [{ start: 0, end: 20, strand: 'forward' }]),
      feat('b', 'CDS1', [{ start: 30, end: 50, strand: 'forward' }]),
      feat('c', 'CDS2', [{ start: 50, end: 70, strand: 'forward' }]),
    ])
    expect(merged.filter((feature) => feature.name === 'CDS1')).toHaveLength(2)
    expect(merged.filter((feature) => feature.name === 'CDS2')).toHaveLength(1)
  })

  it('does not merge adjacent same-named features from different source identities', () => {
    const merged = mergeAbuttingAssemblyFeatures([
      feat('a', 'CDS1', [{ start: 0, end: 20, strand: 'forward' }], { sourceFeatureId: 'source-a' }),
      feat('b', 'CDS1', [{ start: 20, end: 40, strand: 'forward' }], { sourceFeatureId: 'source-b' }),
    ])
    expect(merged).toHaveLength(2)
  })

  it('leaves ruler part-span features alone', () => {
    const merged = mergeAbuttingAssemblyFeatures([
      feat('a', 'Vector', [{ start: 0, end: 40, strand: 'forward' }], { mapTrack: 'ruler' }),
      feat('b', 'Vector', [{ start: 40, end: 80, strand: 'forward' }], { mapTrack: 'ruler' }),
    ])
    expect(merged).toHaveLength(2)
  })
})

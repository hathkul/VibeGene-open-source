import { describe, expect, it } from 'vitest'
import { createDnaLibraryFromMembers } from '../src/domain/dnaLibrary'
import { proteinComparisonSourcesFromLibraryFeature } from '../src/domain/proteinComparisonFromLibrary'
import { defaultFeatureTranslationOptions } from '../src/domain/geneticCode'
import { projectFeatureOntoLibraryMembers } from '../src/domain/libraryMemberFeatures'
import { traceRecordFromSequence } from '../src/domain/sequenceTraceFactory'
import type { SequenceFeature } from '../src/domain/types'

function cds(id: string, start: number, end: number): SequenceFeature {
  return {
    id,
    name: 'orf',
    type: 'CDS',
    color: '#f59e0b',
    translateInSequenceView: true,
    translation: defaultFeatureTranslationOptions(1),
    locations: [{ start, end, strand: 'forward' }],
  }
}

describe('proteinComparisonSourcesFromLibraryFeature', () => {
  it('adds each member CDS as DNA coding sequence for tolerant protein alignment', () => {
    // ATG GGA TAA
    const a = traceRecordFromSequence('ATGGGATAA', 'a.seq')
    const b = traceRecordFromSequence('ATGGGATAA', 'b.seq')
    const { members } = createDnaLibraryFromMembers([a, b], { name: 'Lib' })
    const feature = cds('cds1', 0, 9)
    const projectedMembers = projectFeatureOntoLibraryMembers(feature, members)
    const sources = proteinComparisonSourcesFromLibraryFeature(feature, projectedMembers)
    expect(sources).toHaveLength(2)
    expect(sources.every((source) => source.kind === 'dna')).toBe(true)
    expect(sources.every((source) => source.sequence === 'ATGGGATAA')).toBe(true)
    expect(sources.map((source) => source.id).sort()).toEqual(
      projectedMembers.map((member) => member.id).sort(),
    )
  })

  it('skips members without an alignable CDS span', () => {
    const member = {
      ...traceRecordFromSequence('ATGC', 'short.seq'),
      alignment: null,
    }
    const sources = proteinComparisonSourcesFromLibraryFeature(cds('cds1', 0, 9), [member])
    expect(sources).toEqual([])
  })
})

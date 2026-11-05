import { describe, expect, it } from 'vitest'
import { flipLibraryMember } from '../src/domain/dnaLibrary'
import { defaultFeatureTranslationOptions } from '../src/domain/geneticCode'
import { alignTraceToTemplate } from '../src/domain/traceAlignment'
import { traceRecordFromSequence } from '../src/domain/sequenceTraceFactory'
import type { SequenceFeature } from '../src/domain/types'

describe('flipLibraryMember', () => {
  it('reverse-complements a member and realigns to consensus', () => {
    const consensus = 'ATGAAAGGGTTTCCC'
    const memberSeq = 'ATGAAAGGGGCGTTTCCC'
    const alignment = alignTraceToTemplate(memberSeq, consensus)
    const feature: SequenceFeature = {
      id: 'f1',
      name: 'tag',
      type: 'misc_feature',
      color: '#2563eb',
      locations: [{ start: 0, end: 3, strand: 'forward' }],
    }
    const member = {
      ...traceRecordFromSequence(memberSeq, 'clone.seq'),
      alignment: alignment ?? undefined,
      features: [feature],
      translation: defaultFeatureTranslationOptions(1),
    }
    const flipped = flipLibraryMember(member, consensus, 'linear')
    expect(flipped.sequence).toBe('GGGAAACGCCCCTTTCAT')
    expect(flipped.features?.[0]?.locations[0]).toEqual({
      start: memberSeq.length - 3,
      end: memberSeq.length,
      strand: 'reverse',
    })
    expect(flipped.alignment).not.toBeNull()
  })
})

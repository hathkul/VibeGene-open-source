import { describe, expect, it } from 'vitest'
import { defaultFeatureTranslationOptions } from '../src/domain/geneticCode'
import {
  getLibraryReferenceMemberId,
  isLibraryConsensusEnabled,
  mergeLiftedFeaturesIntoConsensus,
  syncLibraryFeaturesFromReference,
  withLibraryConsensusEnabled,
  withLibraryReferenceMemberId,
} from '../src/domain/libraryMemberFeatures'
import { createId, featureBounds } from '../src/domain/sequence'
import { alignTraceToTemplate } from '../src/domain/traceAlignment'
import { remapFeaturesToTemplate } from '../src/domain/traceAnnotationView'
import { traceRecordFromSequence } from '../src/domain/sequenceTraceFactory'
import type { SequenceFeature, SequenceRecord } from '../src/domain/types'

const CONSENSUS = 'ATGAAAGGGTTTCCC'
const MEMBER = 'ATGAAAGGGGCGTTTCCC'

function cds(): SequenceFeature {
  return {
    id: 'cds',
    name: 'VHH',
    type: 'CDS',
    color: '#f59e0b',
    locations: [{ start: 0, end: CONSENSUS.length, strand: 'forward' }],
    translateInSequenceView: true,
    translation: defaultFeatureTranslationOptions(1),
  }
}

describe('library annotation reference', () => {
  it('stores null/omitted reference as consensus', () => {
    const record: SequenceRecord = {
      id: 'lib',
      name: 'Lib',
      molecule: 'dna',
      topology: 'linear',
      sequence: CONSENSUS,
      features: [],
      primers: [],
      operations: [],
      createdAt: '',
      updatedAt: '',
      dna: { documentRole: 'library' },
    }
    expect(getLibraryReferenceMemberId(record)).toBeNull()
    const withMember = withLibraryReferenceMemberId(record, 'm1')
    expect(getLibraryReferenceMemberId(withMember)).toBe('m1')
    expect(getLibraryReferenceMemberId(withLibraryReferenceMemberId(withMember, null))).toBeNull()
  })

  it('spreads features from a member reference onto peers while keeping native coords', () => {
    const alignment = alignTraceToTemplate(MEMBER, CONSENSUS)!
    const domain: SequenceFeature = {
      id: createId('feature'),
      name: 'CDR',
      type: 'misc_feature',
      color: '#2563eb',
      locations: [{ start: 6, end: 15, strand: 'forward' }],
    }
    const reference = {
      ...traceRecordFromSequence(MEMBER, 'good.seq'),
      id: 'ref-member',
      alignment,
      features: [domain],
    }
    const other = {
      ...traceRecordFromSequence(CONSENSUS, 'other.seq'),
      id: 'other-member',
      alignment: alignTraceToTemplate(CONSENSUS, CONSENSUS)!,
      features: undefined,
    }
    const sync = syncLibraryFeaturesFromReference([cds()], [reference, other], {
      referenceMemberId: 'ref-member',
      consensusSequence: CONSENSUS,
      topology: 'linear',
      consensusCds: cds(),
    })
    expect(sync.features.some((feature) => feature.id === domain.id)).toBe(true)
    const onRef = sync.members.find((member) => member.id === 'ref-member')!
    expect(featureBounds(onRef.features!.find((feature) => feature.id === domain.id)!)).toEqual({
      start: 6,
      end: 15,
      strand: 'forward',
    })
    const onOther = sync.members.find((member) => member.id === 'other-member')!
    expect(onOther.features?.some((feature) => feature.id === domain.id)).toBe(true)
  })

  it('lifts member features onto consensus coordinates', () => {
    const alignment = alignTraceToTemplate(MEMBER, CONSENSUS)!
    const domain: SequenceFeature = {
      id: 'd1',
      name: 'CDR',
      type: 'misc_feature',
      color: '#2563eb',
      locations: [{ start: 6, end: 15, strand: 'forward' }],
    }
    const lifted = remapFeaturesToTemplate([domain], alignment)
    expect(lifted).toHaveLength(1)
    const merged = mergeLiftedFeaturesIntoConsensus([cds()], lifted)
    expect(merged.some((feature) => feature.id === 'd1')).toBe(true)
    expect(CONSENSUS.slice(
      featureBounds(lifted[0]!).start,
      featureBounds(lifted[0]!).end,
    ).startsWith('GGG')).toBe(true)
  })

  it('does not duplicate consensus features when member copies use different ids', () => {
    const alignment = alignTraceToTemplate(MEMBER, CONSENSUS)!
    const consensusCds = cds()
    const memberCds: SequenceFeature = {
      ...consensusCds,
      id: 'member-cds-other-id',
      locations: [{ start: 0, end: MEMBER.length, strand: 'forward' }],
    }
    const reference = {
      ...traceRecordFromSequence(MEMBER, 'clone.seq'),
      id: 'ref-member',
      alignment,
      features: [memberCds],
    }
    const other = {
      ...traceRecordFromSequence(CONSENSUS, 'other.seq'),
      id: 'other-member',
      alignment: alignTraceToTemplate(CONSENSUS, CONSENSUS)!,
      features: undefined,
    }

    const sync = syncLibraryFeaturesFromReference([consensusCds], [reference, other], {
      referenceMemberId: 'ref-member',
      consensusSequence: CONSENSUS,
      topology: 'linear',
      consensusCds,
    })

    expect(sync.features).toHaveLength(1)
    expect(sync.features[0]?.id).toBe(consensusCds.id)
    expect(sync.features[0]?.name).toBe('VHH')

    // Switching ref again must not keep growing the consensus feature list.
    const again = syncLibraryFeaturesFromReference(sync.features, sync.members, {
      referenceMemberId: 'ref-member',
      consensusSequence: CONSENSUS,
      topology: 'linear',
      consensusCds: sync.features[0],
    })
    expect(again.features).toHaveLength(1)
  })

  it('tracks consensus browse visibility separately from the annotation reference', () => {
    const record: SequenceRecord = {
      id: 'lib',
      name: 'Lib',
      molecule: 'dna',
      topology: 'linear',
      sequence: CONSENSUS,
      features: [],
      primers: [],
      operations: [],
      createdAt: '',
      updatedAt: '',
      dna: { documentRole: 'library' },
    }
    expect(isLibraryConsensusEnabled(record)).toBe(true)
    const hidden = withLibraryConsensusEnabled(record, false)
    expect(isLibraryConsensusEnabled(hidden)).toBe(false)
    expect(isLibraryConsensusEnabled(withLibraryConsensusEnabled(hidden, true))).toBe(true)
  })
})

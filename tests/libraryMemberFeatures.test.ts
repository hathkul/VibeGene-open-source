import { describe, expect, it } from 'vitest'
import {
  adjustMemberFeaturesForReplacement,
  hydrateLibraryMemberFeaturesOntoTraces,
  packLibraryMemberFeatures,
  projectFeatureOntoLibraryMembers,
  removeFeatureFromLibraryMembers,
  resolveLibraryMemberFeatureName,
  withPackedLibraryMemberFeatures,
} from '../src/domain/libraryMemberFeatures'
import { applyMemberSequenceEditAtNativeRange, createDnaLibraryFromMembers } from '../src/domain/dnaLibrary'
import { featureBounds } from '../src/domain/sequence'
import { traceRecordFromSequence } from '../src/domain/sequenceTraceFactory'
import type { SequenceFeature } from '../src/domain/types'

function feature(id: string, start: number, end: number, strand: 'forward' | 'reverse' = 'forward'): SequenceFeature {
  return {
    id,
    name: id,
    type: 'misc_feature',
    color: '#64748b',
    locations: [{ start, end, strand }],
  }
}

describe('libraryMemberFeatures', () => {
  it('resolves <member> tokens in feature names', () => {
    expect(resolveLibraryMemberFeatureName('darpin <member>', 'BinderA')).toBe('darpin BinderA')
    expect(resolveLibraryMemberFeatureName('X <MEMBER> Y <member>', 'c1')).toBe('X c1 Y c1')
    expect(resolveLibraryMemberFeatureName('plain', 'BinderA')).toBe('plain')
  })

  it('packs and hydrates member features for persistence', () => {
    const member = {
      ...traceRecordFromSequence('ATGCATGC', 'read.seq'),
      features: [feature('f1', 1, 4)],
    }
    const { record } = createDnaLibraryFromMembers([member], { name: 'Lib' })
    const packed = withPackedLibraryMemberFeatures(record, [member])
    expect(packLibraryMemberFeatures([member])).toHaveLength(1)
    expect(packed.dna?.libraryMemberFeatures?.[0]?.features[0]?.id).toBe('f1')
    expect(packed.dna?.libraryMemberFeatures?.[0]?.fileName).toBe('read.seq')

    const bare = { ...member, features: undefined }
    const hydrated = hydrateLibraryMemberFeaturesOntoTraces(packed, [bare])
    expect(hydrated[0]?.features?.[0]?.id).toBe('f1')
  })

  it('rehydrates member features when SnapGene regenerates trace ids', () => {
    const member = {
      ...traceRecordFromSequence('ATGCATGC', '1A1'),
      features: [feature('f1', 1, 4)],
    }
    const packed = withPackedLibraryMemberFeatures(
      { ...createDnaLibraryFromMembers([member], { name: 'Lib' }).record },
      [member],
    )
    const reloaded = {
      ...traceRecordFromSequence('ATGCATGC', '1A1'),
      id: 'trace_reloaded',
      features: undefined,
    }
    const hydrated = hydrateLibraryMemberFeaturesOntoTraces(packed, [reloaded])
    expect(hydrated[0]?.id).toBe('trace_reloaded')
    expect(hydrated[0]?.features?.[0]?.locations[0]).toEqual({ start: 1, end: 4, strand: 'forward' })
  })

  it('rehydrates by pack order when fileName is absent (legacy packs)', () => {
    const member = {
      ...traceRecordFromSequence('ATGCATGC', '1A1'),
      features: [feature('cdr3', 4, 7)],
    }
    const packedRecord = {
      dna: {
        documentRole: 'library' as const,
        comparisonSources: [],
        comparisonAlignmentCache: [],
        libraryMemberFeatures: [{
          memberId: 'trace_old',
          features: [feature('cdr3', 4, 7)],
        }],
      },
    }
    const reloaded = {
      ...traceRecordFromSequence('ATGCATGC', '1A1'),
      id: 'trace_new',
      features: undefined,
    }
    const hydrated = hydrateLibraryMemberFeaturesOntoTraces(packedRecord, [reloaded])
    expect(hydrated[0]?.features?.[0]?.id).toBe('cdr3')
    void member
  })

  it('projects consensus features onto aligned members', () => {
    const a = traceRecordFromSequence('ATGCATGC', 'a.seq')
    const b = traceRecordFromSequence('ATGCATGC', 'b.seq')
    const { record, members } = createDnaLibraryFromMembers([a, b], { name: 'Lib' })
    const consensusFeature = feature('cds1', 2, 6)
    const next = projectFeatureOntoLibraryMembers(consensusFeature, members)
    expect(next.every((member) => member.features?.some((entry) => entry.id === 'cds1'))).toBe(true)
    expect(next[0]!.features![0]!.locations[0]).toEqual({ start: 2, end: 6, strand: 'forward' })
    void record
  })

  it('expands <member> in consensus feature names when projecting', () => {
    const a = traceRecordFromSequence('ATGCATGC', 'BinderA')
    const b = traceRecordFromSequence('ATGCATGC', 'BinderB.ab1')
    const { members } = createDnaLibraryFromMembers([a, b], { name: 'Lib' })
    const consensusFeature: SequenceFeature = {
      ...feature('dar1', 0, 8),
      name: 'darpin <member>',
    }
    const next = projectFeatureOntoLibraryMembers(consensusFeature, members)
    expect(next.find((member) => member.fileName === 'BinderA')?.features?.[0]?.name).toBe('darpin BinderA')
    expect(next.find((member) => member.fileName === 'BinderB.ab1')?.features?.[0]?.name).toBe('darpin BinderB.ab1')
  })

  it('projects non-protein consensus features as one contiguous DNA span across indels', async () => {
    const { alignTraceToTemplate } = await import('../src/domain/traceAlignment')
    const { remapFeaturesToTrace } = await import('../src/domain/traceAnnotationView')
    // Consensus: ATG AAA GGG TTT CCC
    const consensus = 'ATGAAAGGGTTTCCC'
    // +2 bp insert after ATG
    const memberSeq = 'ATGCCAAGGGTTTCCC'
    const alignment = alignTraceToTemplate(memberSeq, consensus)
    expect(alignment).not.toBeNull()
    const member = {
      ...traceRecordFromSequence(memberSeq, 'm.seq'),
      alignment,
    }
    // AAA GGG TTT = template 3..12 — not a protein import, so DNA min/max span
    const domain = feature('dom', 3, 12)
    const expected = remapFeaturesToTrace([domain], alignment!, { preserveCodons: false })[0]!
    const next = projectFeatureOntoLibraryMembers(domain, [member])
    const projected = next[0]!.features!.find((entry) => entry.id === 'dom')!
    expect(projected.locations).toHaveLength(1)
    expect(projected.locations).toEqual(expected.locations)
    // Contiguous span may include the insert; must not split into codon-gapped segments
    expect(projected.locations.length).toBe(1)
    expect(featureBounds(projected).end - featureBounds(projected).start).toBeGreaterThan(0)
  })

  it('projects protein-imported features via guided AA alignment (contiguous homolog span)', async () => {
    const { alignTraceToTemplate } = await import('../src/domain/traceAlignment')
    const { defaultFeatureTranslationOptions } = await import('../src/domain/geneticCode')
    const consensus = 'ATGAAAGGGTTTCCC'
    const memberSeq = 'ATGAAAGGGGCGTTTCCC'
    const alignment = alignTraceToTemplate(memberSeq, consensus)
    expect(alignment).not.toBeNull()
    const member = {
      ...traceRecordFromSequence(memberSeq, 'm.seq'),
      alignment,
    }
    const cds: SequenceFeature = {
      id: 'cds',
      name: 'VHH',
      type: 'CDS',
      color: '#f59e0b',
      locations: [{ start: 0, end: consensus.length, strand: 'forward' }],
      translateInSequenceView: true,
      translation: defaultFeatureTranslationOptions(1),
    }
    const domain = feature('dom', 6, 12)
    domain.notes = '/note="Mapped from protein annotation Domain (aa 3–4)"'
    const next = projectFeatureOntoLibraryMembers(domain, [member], {
      consensusSequence: consensus,
      topology: 'linear',
      consensusCds: cds,
    })
    const projected = next[0]!.features!.find((entry) => entry.id === 'dom')!
    expect(projected.locations).toHaveLength(1)
    const bounds = featureBounds(projected)
    expect(bounds.end - bounds.start).toBe(9)
    expect(memberSeq.slice(bounds.start, bounds.end)).toBe('GGGGCGTTT')
  })


  it('removes projected features from members', () => {
    const member = {
      ...traceRecordFromSequence('ATGC', 'a.seq'),
      features: [feature('cds1', 0, 3), feature('local', 1, 2)],
    }
    const next = removeFeatureFromLibraryMembers('cds1', [member])
    expect(next[0]!.features?.map((entry) => entry.id)).toEqual(['local'])
  })

  it('shifts member features on native sequence edits', () => {
    const member = {
      ...traceRecordFromSequence('ATGCATGC', 'a.seq'),
      features: [feature('f1', 4, 7)],
    }
    const edited = applyMemberSequenceEditAtNativeRange(member, 2, 2, 'AA')
    expect(edited.sequence).toBe('ATAAGCATGC')
    // Insert 2 bp at index 2 → feature that started at 4 moves to 6
    expect(edited.features?.[0]?.locations[0]).toEqual({ start: 6, end: 9, strand: 'forward' })
  })

  it('adjusts features for replacement helper', () => {
    const features = [feature('f1', 4, 7)]
    const next = adjustMemberFeaturesForReplacement(features, 2, 2, 3)
    expect(next?.[0]?.locations[0]).toEqual({ start: 7, end: 10, strand: 'forward' })
  })
})

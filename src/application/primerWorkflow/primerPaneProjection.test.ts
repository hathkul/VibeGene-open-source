import { themeFixturePalette } from '../../test-support/themeFixturePalette'
import { describe, expect, it } from 'vitest'
import { serializeFeatureQualifiers } from '../../domain/featureQualifiers'
import { sgRnaOligoDescription } from '../../domain/sgrnaOligoPrimers'
import type { TraceFileRecord } from '../../domain/traceTypes'
import type { Primer, SequenceFeature, SequenceRecord } from '../../domain/types'
import {
  hasRegularPrimerPaneSelection,
  paneMemberIdsWithPrimers,
  primersForPrimerPaneMember,
  selectedPrimersForMenu,
  selectedPrimersInPaneMember,
  selectedSgRnasInPaneMember,
  sgRnaAnnotationsForPrimerPaneMember,
  type PrimerPaneSelectionState,
} from './primerPaneProjection'

function primer(id: string, extra?: Partial<Primer>): Primer {
  return { id, name: id, sequence: 'ACGTACGT', color: id, ...extra }
}

function oligo(id: string): Primer {
  return primer(id, { description: sgRnaOligoDescription('sense') })
}

function sgRnaFeatures(tag: string): [SequenceFeature, SequenceFeature] {
  const common = { vibegene_sgrna_id: tag, vibegene_sgrna: '1' }
  const guide: SequenceFeature = {
    id: `guide-${tag}`,
    name: tag,
    type: 'misc_feature',
    color: themeFixturePalette.sgrnaGreen,
    locations: [{ start: 0, end: 20, strand: 'forward' }],
    notes: serializeFeatureQualifiers({ ...common, vibegene_sgrna_part: 'guide' }),
  }
  const pam: SequenceFeature = {
    id: `pam-${tag}`,
    name: `${tag} PAM`,
    type: 'misc_feature',
    color: themeFixturePalette.sgrnaGreen,
    locations: [{ start: 20, end: 23, strand: 'forward' }],
    notes: serializeFeatureQualifiers({ ...common, vibegene_sgrna_part: 'pam' }),
  }
  return [guide, pam]
}

function record(primers: Primer[], features: SequenceFeature[] = [], library = false): SequenceRecord {
  return {
    id: 'record', name: 'record', molecule: 'dna', topology: 'linear', sequence: 'ACGTACGTACGT',
    features, primers, history: [],
    ...(library ? { dna: { documentRole: 'library' } } : {}),
  } as unknown as SequenceRecord
}

function member(id: string, primers: Primer[] = [], features: SequenceFeature[] = []): TraceFileRecord {
  return {
    id, fileName: `${id}.ab1`, sequence: 'ACGTACGTACGT', chromatogram: {} as never,
    enabled: true, expanded: false, showAnnotations: true, alignment: null, primers, features,
  }
}

function selection(partial: Partial<PrimerPaneSelectionState> = {}): PrimerPaneSelectionState {
  return { selectedAlignmentTraceId: null, selectedPrimerId: null, selectedPrimerIds: [], ...partial }
}

describe('primerPaneProjection', () => {
  it('projects primers and sgRNA annotations from the main record or a library member', () => {
    const rec = record([primer('p1')])
    const members = [member('m1', [primer('pm1')], sgRnaFeatures('g1').concat() as SequenceFeature[])]

    expect(primersForPrimerPaneMember(rec, members, null).map((p) => p.id)).toEqual(['p1'])
    expect(primersForPrimerPaneMember(rec, members, 'm1').map((p) => p.id)).toEqual(['pm1'])
    expect(primersForPrimerPaneMember(rec, members, 'missing')).toEqual([])

    const annotations = sgRnaAnnotationsForPrimerPaneMember(rec, members, 'm1')
    expect(annotations).toHaveLength(1)
    expect(annotations[0]?.guide.id).toBe('guide-g1')
    expect(annotations[0]?.pam?.id).toBe('pam-g1')
    expect(sgRnaAnnotationsForPrimerPaneMember(rec, members, null)).toEqual([])
  })

  it('scopes selected primers by member and splits oligos from regular primers', () => {
    const rec = record([primer('p1'), oligo('o1')])
    const members = [member('m1', [primer('pm1'), oligo('om1')])]

    const mainSelection = selection({ selectedPrimerIds: ['p1', 'o1'] })
    expect(selectedPrimersInPaneMember(rec, members, null, false, mainSelection).map((p) => p.id)).toEqual(['p1'])
    expect(selectedPrimersInPaneMember(rec, members, null, true, mainSelection).map((p) => p.id)).toEqual(['o1'])

    const memberSelection = selection({ selectedAlignmentTraceId: 'm1', selectedPrimerIds: ['pm1', 'om1'] })
    expect(selectedPrimersInPaneMember(rec, members, 'm1', false, memberSelection).map((p) => p.id)).toEqual(['pm1'])
    expect(selectedPrimersInPaneMember(rec, members, null, false, memberSelection)).toEqual([])

    const singleIdSelection = selection({ selectedAlignmentTraceId: 'm1', selectedPrimerId: 'pm1' })
    expect(selectedPrimersInPaneMember(rec, members, 'm1', false, singleIdSelection).map((p) => p.id)).toEqual(['pm1'])
  })

  it('selects sgRNA annotations when the guide or PAM feature id is targeted', () => {
    const features = sgRnaFeatures('g1')
    const rec = record([], features)
    const members = [member('m1', [], features)]

    expect(selectedSgRnasInPaneMember(rec, members, null, ['guide-g1'])).toHaveLength(1)
    expect(selectedSgRnasInPaneMember(rec, members, 'm1', ['pam-g1'])).toHaveLength(1)
    expect(selectedSgRnasInPaneMember(rec, members, 'm1', ['other'])).toEqual([])
  })

  it('lists pane member ids only for DNA library records', () => {
    const members = [member('m1'), member('m2')]
    expect(paneMemberIdsWithPrimers(record([], [], true), members)).toEqual([null, 'm1', 'm2'])
    expect(paneMemberIdsWithPrimers(record([]), members)).toEqual([null])
  })

  it('reports a regular primer selection across the main record and library members', () => {
    const rec = record([primer('p1'), oligo('o1')], [], true)
    const members = [member('m1', [primer('pm1')])]

    expect(hasRegularPrimerPaneSelection(rec, members, selection({ selectedPrimerIds: ['p1'] }))).toBe(true)
    expect(hasRegularPrimerPaneSelection(rec, members, selection({ selectedAlignmentTraceId: 'm1', selectedPrimerIds: ['pm1'] }))).toBe(true)
    expect(hasRegularPrimerPaneSelection(rec, members, selection({ selectedPrimerIds: ['o1'] }))).toBe(false)
    expect(hasRegularPrimerPaneSelection(rec, members, selection())).toBe(false)
  })

  it('resolves menu primers from the selected member source with multi-id precedence', () => {
    const shared = primer('shared', { name: 'record copy' })
    const memberShared = primer('shared', { name: 'member copy' })
    const rec = record([shared, primer('p2')])
    const selectedMember = member('m1', [memberShared])

    expect(
      selectedPrimersForMenu(rec, selectedMember, { selectedPrimerId: 'shared', selectedPrimerIds: [] })
        .map((p) => p.name),
    ).toEqual(['member copy'])

    expect(
      selectedPrimersForMenu(rec, null, { selectedPrimerId: 'shared', selectedPrimerIds: ['p2', 'shared'] })
        .map((p) => p.id),
    ).toEqual(['p2', 'shared'])

    expect(
      selectedPrimersForMenu(rec, selectedMember, { selectedPrimerId: null, selectedPrimerIds: ['p2'] }),
    ).toEqual([])
  })
})

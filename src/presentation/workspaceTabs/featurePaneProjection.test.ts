import { describe, expect, it } from 'vitest'
import { serializeFeatureQualifiers } from '../../domain/featureQualifiers'
import type { TraceFileRecord } from '../../domain/traceTypes'
import { labPlasmid } from '../../domain/fixtures'
import type { SequenceFeature, SequenceRecord } from '../../domain/types'
import {
  buildDisplayAnnotationFeatures,
  buildFeatureSelectionMenuGates,
  buildFeatureTabProjection,
  buildFeatureVisibilityTargetIds,
  buildMapAnnotationFeatures,
  buildSelectableAnnotations,
  buildSelectedFeaturesForMenu,
  resolveFeaturePaneSourceFeatures,
  resolveSelectedFeature,
} from './featurePaneProjection'

function feature(id: string, extra: Partial<SequenceFeature> = {}): SequenceFeature {
  return {
    id,
    name: id,
    type: 'misc_feature',
    color: labPlasmid.features[0]!.color,
    locations: [{ start: 0, end: 10, strand: 'forward' }],
    ...extra,
  }
}

function sgRnaPair(tag: string): [SequenceFeature, SequenceFeature] {
  const common = { vibegene_sgrna_id: tag, vibegene_sgrna: '1' }
  return [
    feature(`guide-${tag}`, {
      notes: serializeFeatureQualifiers({ ...common, vibegene_sgrna_part: 'guide' }),
    }),
    feature(`pam-${tag}`, {
      name: `${tag} PAM`,
      notes: serializeFeatureQualifiers({ ...common, vibegene_sgrna_part: 'pam' }),
    }),
  ]
}

function dnaRecord(features: SequenceFeature[], library = false): SequenceRecord {
  return {
    id: 'rec',
    name: 'rec',
    molecule: 'dna',
    topology: 'linear',
    sequence: 'ACGTACGTACGT',
    features,
    primers: [],
    history: [],
    ...(library ? { dna: { documentRole: 'library' } } : {}),
  } as unknown as SequenceRecord
}

function trace(id: string, features: SequenceFeature[] = []): TraceFileRecord {
  return {
    id,
    fileName: `${id}.ab1`,
    sequence: 'ACGTACGTACGT',
    chromatogram: {} as never,
    enabled: true,
    expanded: false,
    showAnnotations: true,
    alignment: null,
    features,
  }
}

describe('featurePaneProjection', () => {
  it('merges ORF features only when ORFs are visible', () => {
    const plain = feature('gene')
    const orf = feature('orf-1', { type: 'CDS' })
    const withOrfs = buildDisplayAnnotationFeatures(
      [plain],
      { featuresVisible: true, orfsVisible: true, sgRnasVisible: false },
      [orf],
    )
    expect(withOrfs.map((entry) => entry.id)).toEqual(['gene', 'orf-1'])
    expect(
      buildDisplayAnnotationFeatures(
        [plain],
        { featuresVisible: true, orfsVisible: false, sgRnasVisible: false },
        [orf],
      ).map((entry) => entry.id),
    ).toEqual(['gene'])
  })

  it('lets sgRNA visibility follow the primers toggle, not the features toggle', () => {
    const [guide, pam] = sgRnaPair('a')
    const names = (featuresVisible: boolean, sgRnasVisible: boolean) =>
      buildDisplayAnnotationFeatures(
        [feature('promoter', { type: 'promoter' }), guide, pam],
        { featuresVisible, orfsVisible: false, sgRnasVisible },
        [],
      ).map((entry) => entry.name)

    expect(names(true, true)).toEqual(['promoter', 'guide-a', 'a PAM'])
    expect(names(true, false)).toEqual(['promoter'])
    expect(names(false, true)).toEqual(['guide-a', 'a PAM'])
  })

  it('strips primer binds from map layers and adds ruler-track features when features are visible', () => {
    const display = [
      feature('gene'),
      feature('bind', { type: 'primer_bind' }),
    ]
    const recordFeatures = [
      feature('ruler', { mapTrack: 'ruler' }),
      feature('bind', { type: 'primer_bind' }),
    ]
    expect(buildMapAnnotationFeatures(display, recordFeatures, true).map((entry) => entry.id)).toEqual([
      'gene',
      'ruler',
    ])
    expect(buildMapAnnotationFeatures(display, recordFeatures, false).map((entry) => entry.id)).toEqual(['gene'])
  })

  it('includes trace member features in selectable annotations when alignments are hidden', () => {
    const memberFeature = feature('member-only')
    const rec = dnaRecord([feature('consensus')], true)
    const traces = [trace('m1', [memberFeature])]
    expect(buildSelectableAnnotations(rec, traces, true, [])).toEqual([rec.features[0]])
    expect(buildSelectableAnnotations(rec, traces, false, [])).toEqual([rec.features[0], memberFeature])
  })

  it('resolves feature pane source features from the tab member or alignment member', () => {
    const rec = dnaRecord([feature('consensus')], true)
    const traces = [trace('m1', [feature('from-tab')]), trace('m2', [feature('from-align')])]
    expect(resolveFeaturePaneSourceFeatures(rec, traces, 'm1', traces[1]!)).toEqual(traces[0]!.features)
    expect(resolveFeaturePaneSourceFeatures(rec, traces, null, traces[1]!)).toEqual(traces[1]!.features)
    expect(resolveFeaturePaneSourceFeatures(rec, traces, null, null)).toEqual(rec.features)
  })

  it('builds visibility target ids only on the Features tab or feature focus', () => {
    const source = [feature('a'), feature('b')]
    const base = {
      activeTab: 'Features' as const,
      selectedFeature: null,
      selectedFeatureIds: ['a', 'missing'],
      selectionFocus: 'dna' as const,
      sourceFeatures: source,
    }
    expect(buildFeatureVisibilityTargetIds(base)).toEqual(['a'])
    expect(buildFeatureVisibilityTargetIds({ ...base, activeTab: 'Sequence', selectionFocus: 'feature' })).toEqual(['a'])
    expect(buildFeatureVisibilityTargetIds({ ...base, activeTab: 'Sequence', selectionFocus: 'dna' })).toEqual([])
    expect(
      buildFeatureVisibilityTargetIds({
        ...base,
        selectedFeatureIds: [],
        selectedFeature: source[1]!,
      }),
    ).toEqual(['b'])
  })

  it('falls back to the selected feature when menu ids are empty', () => {
    const source = [feature('a'), feature('b')]
    expect(buildSelectedFeaturesForMenu(source, ['b'], feature('fallback'))).toEqual([source[1]])
    expect(buildSelectedFeaturesForMenu(source, [], feature('fallback'))).toEqual([feature('fallback')])
  })

  it('finds selected features across consensus and member stores', () => {
    const rec = dnaRecord([feature('consensus')], true)
    const traces = [trace('m1', [feature('member')])]
    expect(resolveSelectedFeature(rec, traces, 'member', traces[0]!)).toEqual(traces[0]!.features![0])
    expect(resolveSelectedFeature(rec, traces, 'consensus', null)).toEqual(rec.features[0])
    expect(resolveSelectedFeature(rec, traces, null, null)).toBeNull()
  })

  it('builds feature tab rows for consensus and library members', () => {
    const rec = dnaRecord([feature('c1')], true)
    const traces = [trace('m1', [feature('m1')])]
    const projection = buildFeatureTabProjection(rec, traces, 'name', 'asc')
    expect(projection.entries.some((entry) => entry.kind === 'heading')).toBe(true)
    expect(projection.featureRows.map((row) => row.feature.id).sort()).toEqual(['c1', 'm1'])
  })

  it('derives merge and visibility menu gates from selected features', () => {
    const rec = dnaRecord([], false)
    const hidden = feature('hidden', { visible: false })
    const visible = feature('visible')
    const gates = buildFeatureSelectionMenuGates(rec, null, [hidden, visible])
    expect(gates.hasFeatureSelected).toBe(true)
    expect(gates.canMergeSelectedFeatures).toBe(true)
    expect(gates.canShowSelectedFeatures).toBe(true)
    expect(gates.canHideSelectedFeatures).toBe(true)
    expect(buildFeatureSelectionMenuGates(rec, 'm1', [visible]).canMergeSelectedFeatures).toBe(false)
  })
})

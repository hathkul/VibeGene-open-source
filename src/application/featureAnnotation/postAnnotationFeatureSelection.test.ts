import { describe, expect, it } from 'vitest'
import { labPlasmid } from '../../domain/fixtures'
import type { SequenceFeature } from '../../domain/types'
import { planPostAnnotationFeatureSelection } from './postAnnotationFeatureSelection'

const featureColor = labPlasmid.features[0]!.color

function feature(id: string, start: number, end: number): SequenceFeature {
  return {
    id,
    name: id,
    type: 'misc_feature',
    color: featureColor,
    locations: [{ start, end, strand: 'forward' }],
  }
}

describe('planPostAnnotationFeatureSelection', () => {
  it('returns noop for empty feature lists on every workflow', () => {
    for (const workflow of ['dnaDatabase', 'translatedOrf', 'commonDetected', 'proteinUniProt', 'proteinInterPro'] as const) {
      expect(planPostAnnotationFeatureSelection(workflow, [])).toEqual({ kind: 'noop' })
    }
  })

  it('selects all DNA database features on consensus scope with anchor', () => {
    const features = [feature('dna-a', 4, 10), feature('dna-b', 20, 24)]
    expect(planPostAnnotationFeatureSelection('dnaDatabase', features)).toEqual({
      kind: 'apply',
      primaryFeatureId: 'dna-a',
      selectedFeatureIds: ['dna-a', 'dna-b'],
      bounds: { start: 4, end: 10 },
      memberScope: {
        kind: 'consensus',
        featureTabSelectionMemberId: null,
        featureTabAnchor: { featureId: 'dna-a', memberId: null },
      },
    })
  })

  it('selects all translated-ORF features with omitted member scope', () => {
    const features = [feature('orf-a', 1, 8), feature('orf-b', 12, 18)]
    expect(planPostAnnotationFeatureSelection('translatedOrf', features)).toEqual({
      kind: 'apply',
      primaryFeatureId: 'orf-a',
      selectedFeatureIds: ['orf-a', 'orf-b'],
      bounds: { start: 1, end: 8 },
      memberScope: { kind: 'omitted' },
    })
  })

  it('selects all common-detected features on consensus scope with anchor', () => {
    const features = [feature('common-a', 2, 6), feature('common-b', 30, 35)]
    expect(planPostAnnotationFeatureSelection('commonDetected', features)).toEqual({
      kind: 'apply',
      primaryFeatureId: 'common-a',
      selectedFeatureIds: ['common-a', 'common-b'],
      bounds: { start: 2, end: 6 },
      memberScope: {
        kind: 'consensus',
        featureTabSelectionMemberId: null,
        featureTabAnchor: { featureId: 'common-a', memberId: null },
      },
    })
  })

  it('selects only the first protein UniProt feature and preserves member scope', () => {
    const features = [feature('protein-a', 5, 11), feature('protein-b', 15, 19)]
    expect(planPostAnnotationFeatureSelection('proteinUniProt', features)).toEqual({
      kind: 'apply',
      primaryFeatureId: 'protein-a',
      selectedFeatureIds: ['protein-a'],
      bounds: { start: 5, end: 11 },
      memberScope: { kind: 'preserve' },
    })
  })

  it('selects only the first InterPro feature and preserves member scope', () => {
    const features = [feature('domain-a', 0, 3), feature('domain-b', 7, 9)]
    expect(planPostAnnotationFeatureSelection('proteinInterPro', features)).toEqual({
      kind: 'apply',
      primaryFeatureId: 'domain-a',
      selectedFeatureIds: ['domain-a'],
      bounds: { start: 0, end: 3 },
      memberScope: { kind: 'preserve' },
    })
  })

  it('uses min/max bounds across multi-segment first features', () => {
    const gapped: SequenceFeature = {
      id: 'gapped',
      name: 'gapped',
      type: 'misc_feature',
      color: featureColor,
      locations: [
        { start: 40, end: 50, strand: 'forward' },
        { start: 5, end: 12, strand: 'forward' },
      ],
    }
    expect(planPostAnnotationFeatureSelection('dnaDatabase', [gapped, feature('second', 60, 70)])).toMatchObject({
      primaryFeatureId: 'gapped',
      bounds: { start: 5, end: 50 },
    })
  })
})

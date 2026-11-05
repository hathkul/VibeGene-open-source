import { featureBounds } from '../../domain/sequence'
import type { SequenceFeature } from '../../domain/types'

export type PostAnnotationSelectionWorkflow =
  | 'dnaDatabase'
  | 'translatedOrf'
  | 'commonDetected'
  | 'proteinUniProt'
  | 'proteinInterPro'

export type PostAnnotationMemberScope =
  /** Legacy protein paths never passed a member argument; leave member scope and anchor untouched. */
  | { kind: 'preserve' }
  /** Legacy translated-ORF `selectFeatures(features)` omitted the optional member argument entirely. */
  | { kind: 'omitted' }
  | {
      kind: 'consensus'
      featureTabSelectionMemberId: null
      featureTabAnchor: { featureId: string; memberId: null }
    }

export type PostAnnotationFeatureSelectionPlan =
  | { kind: 'noop' }
  | {
      kind: 'apply'
      primaryFeatureId: string
      selectedFeatureIds: string[]
      bounds: { start: number; end: number }
      memberScope: PostAnnotationMemberScope
    }

/** Deterministic post-annotation feature selection for external annotation workflows. */
export function planPostAnnotationFeatureSelection(
  workflow: PostAnnotationSelectionWorkflow,
  features: readonly SequenceFeature[],
): PostAnnotationFeatureSelectionPlan {
  if (features.length === 0) return { kind: 'noop' }
  const first = features[0]!
  const { start, end } = featureBounds(first)
  const allIds = features.map((feature) => feature.id)

  switch (workflow) {
    case 'dnaDatabase':
    case 'commonDetected':
      return {
        kind: 'apply',
        primaryFeatureId: first.id,
        selectedFeatureIds: allIds,
        bounds: { start, end },
        memberScope: {
          kind: 'consensus',
          featureTabSelectionMemberId: null,
          featureTabAnchor: { featureId: first.id, memberId: null },
        },
      }
    case 'translatedOrf':
      return {
        kind: 'apply',
        primaryFeatureId: first.id,
        selectedFeatureIds: allIds,
        bounds: { start, end },
        memberScope: { kind: 'omitted' },
      }
    case 'proteinUniProt':
    case 'proteinInterPro':
      return {
        kind: 'apply',
        primaryFeatureId: first.id,
        selectedFeatureIds: [first.id],
        bounds: { start, end },
        memberScope: { kind: 'preserve' },
      }
  }
}

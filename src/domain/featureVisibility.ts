import type { FeatureSegment, SequenceFeature } from './types'

/** Stable key for exact interval+strand identity (order-sensitive). */
export function featureLocationsKey(locations: Pick<FeatureSegment, 'start' | 'end' | 'strand'>[]): string {
  return locations.map((location) => `${location.start}:${location.end}:${location.strand}`).join('|')
}

/**
 * SnapGene-like GenBank decluttering: when a `gene` feature occupies exactly the same
 * intervals and strand as a `CDS`, hide the gene on map/sequence (keep it in the feature
 * list with `visible: false` so the user can show it again).
 *
 * Eukaryotic genes that extend beyond CDS (UTRs/introns) are left visible.
 */
export function hideGenesMatchingCds(features: SequenceFeature[]): SequenceFeature[] {
  const cdsKeys = new Set(
    features.filter((feature) => feature.type === 'CDS').map((feature) => featureLocationsKey(feature.locations)),
  )
  if (cdsKeys.size === 0) return features

  return features.map((feature) => {
    if (feature.type !== 'gene') return feature
    if (feature.visible === false) return feature
    if (!cdsKeys.has(featureLocationsKey(feature.locations))) return feature
    return { ...feature, visible: false }
  })
}

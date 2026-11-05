import type { SequenceFeature, Strand } from './types'

export type FeatureDirectionality = 'none' | 'forward' | 'reverse' | 'both'
export type FeatureArrowDirection = 'none' | 'forward' | 'reverse' | 'both'

const ALL_DIRECTIONS: readonly FeatureDirectionality[] = ['none', 'forward', 'reverse', 'both']
const NO_BIDIRECTIONAL_TYPES = new Set([
  '-10_signal', '-35_signal', "3'UTR", "5'UTR", 'CAAT_signal', 'enhancer', 'exon',
  'GC_signal', 'iDNA', 'intron', 'mat_peptide', 'misc_binding', 'misc_difference',
  'misc_recomb', 'mobile_element', 'modified_base', 'polyA_signal', 'polyA_site',
  'propeptide', 'proprotein', 'RBS', 'regulatory', 'S_region', 'sig_peptide',
  'TATA_signal', 'transit_peptide',
])
const STRAND_ONLY_TYPES = new Set([
  'C_region', 'CDS', 'D_segment', 'gene', 'J_segment', 'misc_RNA', 'mRNA',
  'N_region', 'ncRNA', 'operon', 'precursor_RNA', 'prim_transcript', 'primer_bind',
  'rRNA', 'tmRNA', 'tRNA', 'V_region', 'V_segment',
])
const NO_DIRECTION_TYPES = new Set([
  'assembly_gap', 'attenuator', 'centromere', 'conflict', 'gap', 'old_sequence',
  'source', 'STS', 'telomere', 'unsure',
])
const STANDARD_TYPES_WITH_DIRECTIONAL_ARROWS = new Set([
  'D-loop', 'LTR', 'misc_feature', 'misc_signal', 'misc_structure', 'oriT', 'promoter',
  'protein_bind', 'rep_origin', 'repeat_region', 'stem_loop', 'terminator', 'variation',
  ...NO_BIDIRECTIONAL_TYPES,
  ...STRAND_ONLY_TYPES,
])

export function featureTypeHasDirectionalOptions(type: string) {
  return STANDARD_TYPES_WITH_DIRECTIONAL_ARROWS.has(type)
}

/** Direction choices exposed by SnapGene for each standard DNA feature type. */
export function allowedFeatureDirectionalities(type: string): readonly FeatureDirectionality[] {
  if (NO_DIRECTION_TYPES.has(type)) return ['none']
  if (STRAND_ONLY_TYPES.has(type)) return ['forward', 'reverse']
  if (NO_BIDIRECTIONAL_TYPES.has(type)) return ['none', 'forward', 'reverse']
  return ALL_DIRECTIONS
}

export function coerceFeatureDirectionality(
  type: string,
  directionality: FeatureDirectionality,
  strand: Strand = 'forward',
): FeatureDirectionality {
  const allowed = allowedFeatureDirectionalities(type)
  if (allowed.includes(directionality)) return directionality
  if (allowed.includes(strand)) return strand
  return allowed[0] ?? 'none'
}

export function featureDirectionality(feature: SequenceFeature): FeatureDirectionality {
  if (feature.directionality) return feature.directionality
  if (!feature.locations.length) return 'forward'
  const strands = new Set(feature.locations.map((location) => location.strand))
  if (strands.size > 1) return 'both'
  return feature.locations[0]!.strand
}

/** Arrowheads to draw on this drawable piece, expressed in increasing/decreasing coordinates. */
export function featureArrowForPiece(info: {
  feature: SequenceFeature
  strand: Strand
  isFeatureStart: boolean
  isFeatureEnd: boolean
}): FeatureArrowDirection {
  const directionality = info.feature.directionality
  if (!directionality) {
    if (!info.isFeatureEnd) return 'none'
    return info.strand === 'reverse' ? 'reverse' : 'forward'
  }
  if (directionality === 'none') return 'none'

  // Feature start/end are biological endpoints. Convert them to coordinate sides so the
  // property controls the visible arrow direction without changing translation strand.
  const atLowCoordinate = info.strand === 'reverse' ? info.isFeatureEnd : info.isFeatureStart
  const atHighCoordinate = info.strand === 'reverse' ? info.isFeatureStart : info.isFeatureEnd
  const hasLeft = (directionality === 'reverse' || directionality === 'both') && atLowCoordinate
  const hasRight = (directionality === 'forward' || directionality === 'both') && atHighCoordinate
  if (hasLeft && hasRight) return 'both'
  if (hasLeft) return 'reverse'
  if (hasRight) return 'forward'
  return 'none'
}

import type { FeatureSegment, SequenceFeature } from './types'

/** Humanized SnapGene-style type names used when no better qualifier applies. */
export const GENBANK_TYPE_DISPLAY_NAMES: Record<string, string> = {
  misc_feature: 'miscellaneous',
  mat_peptide: 'mature peptide',
  sig_peptide: 'signal peptide',
  precursor_RNA: 'precursor RNA',
  prim_transcript: 'primary transcript',
  transcript: 'transcript',
  exon: 'exon',
  intron: 'intron',
  rRNA: 'rRNA',
  tRNA: 'tRNA',
  tmRNA: 'tmRNA',
  mRNA: 'mRNA',
  ncRNA: 'ncRNA',
  gene: 'gene',
  CDS: 'CDS',
}

/** Structural / anatomy types: map title is the type display name (ignore /gene, /note). */
const TYPE_NAME_ONLY = new Set([
  'exon',
  'intron',
  'mat_peptide',
  'sig_peptide',
  'precursor_RNA',
  'rRNA',
  'tRNA',
  'tmRNA',
])

/** Transcript types named `{/gene} <suffix>` when /gene is present. */
const GENE_SUFFIX_TYPES: Record<string, string> = {
  mRNA: 'mRNA',
  prim_transcript: 'primary transcript',
  transcript: 'transcript',
}

export type GenBankNameQualifiers = {
  label?: string
  standard_name?: string
  gene?: string
  product?: string
  note?: string
  ncRNA_class?: string
}

export function firstGenBankQualifierValue(qualifiers: string, name: string): string | undefined {
  const quoted = qualifiers.match(new RegExp(`/${name}="([^"]*)"`, 'i'))
  if (quoted?.[1] != null) return quoted[1].replace(/\s+/g, ' ').trim() || undefined
  const bare = qualifiers.match(new RegExp(`/${name}=([^\\s";]+)`, 'i'))
  return bare?.[1]?.trim() || undefined
}

export function readGenBankNameQualifiers(qualifiers: string): GenBankNameQualifiers {
  return {
    label: firstGenBankQualifierValue(qualifiers, 'label'),
    standard_name: firstGenBankQualifierValue(qualifiers, 'standard_name'),
    gene: firstGenBankQualifierValue(qualifiers, 'gene'),
    product: firstGenBankQualifierValue(qualifiers, 'product'),
    note: firstGenBankQualifierValue(qualifiers, 'note'),
    ncRNA_class: firstGenBankQualifierValue(qualifiers, 'ncRNA_class'),
  }
}

export function genbankTypeDisplayName(type: string): string {
  return GENBANK_TYPE_DISPLAY_NAMES[type] ?? type
}

export function usableGenBankNote(note: string | undefined, maxLength = 30): string | undefined {
  const trimmed = note?.trim()
  if (!trimmed) return undefined
  return trimmed.length <= maxLength ? trimmed : undefined
}

export function rangesOverlap(
  a: Pick<FeatureSegment, 'start' | 'end'>,
  b: Pick<FeatureSegment, 'start' | 'end'>,
): boolean {
  return a.start < b.end && b.start < a.end
}

/** True when any segment of the feature overlaps any CDS segment. */
export function featureOverlapsCds(
  locations: Pick<FeatureSegment, 'start' | 'end'>[],
  cdsRanges: Pick<FeatureSegment, 'start' | 'end'>[],
): boolean {
  if (!locations.length || !cdsRanges.length) return false
  return locations.some((loc) => cdsRanges.some((cds) => rangesOverlap(loc, cds)))
}

/**
 * SnapGene-like GenBank → Feature Name mapping (empirical).
 *
 * Global: /label → /standard_name → type-specific → type display name
 */
export function resolveGenBankFeatureName(
  type: string,
  qualifiers: string | GenBankNameQualifiers,
  options: {
    locations?: Pick<FeatureSegment, 'start' | 'end'>[]
    cdsRanges?: Pick<FeatureSegment, 'start' | 'end'>[]
  } = {},
): string {
  const q = typeof qualifiers === 'string' ? readGenBankNameQualifiers(qualifiers) : qualifiers
  const note = usableGenBankNote(q.note)
  if (q.label) return q.label
  if (q.standard_name) return q.standard_name

  if (TYPE_NAME_ONLY.has(type)) return genbankTypeDisplayName(type)

  const geneSuffix = GENE_SUFFIX_TYPES[type]
  if (geneSuffix) {
    if (q.gene) return `${q.gene} ${geneSuffix}`
    return genbankTypeDisplayName(type)
  }

  if (type === 'ncRNA') {
    if (q.ncRNA_class) return q.ncRNA_class
    return genbankTypeDisplayName(type)
  }

  if (type === 'misc_feature') {
    const withinCds = featureOverlapsCds(options.locations ?? [], options.cdsRanges ?? [])
    if (!withinCds && note) return note
    return genbankTypeDisplayName(type)
  }

  if (type === 'gene' || type === 'CDS') {
    if (q.gene) return q.gene
    if (type === 'CDS' && q.product) return q.product
    if (note) return note
    return genbankTypeDisplayName(type)
  }

  // Default for other types: gene → product → note → type name
  if (q.gene) return q.gene
  if (q.product) return q.product
  if (note) return note
  return genbankTypeDisplayName(type)
}

/**
 * Display ladder after a feature is stored: stored name → /label → /gene → /note → type.
 */
export function featureDisplayName(feature: Pick<SequenceFeature, 'name' | 'type' | 'notes'>): string {
  const stored = feature.name?.trim()
  if (stored) return stored
  const q = readGenBankNameQualifiers(feature.notes ?? '')
  return q.label || q.gene || usableGenBankNote(q.note) || genbankTypeDisplayName(feature.type)
}

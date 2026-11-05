import { defaultFeatureTranslationOptions, translateFeature } from './geneticCode'
import { snapGeneTranslTableFromGeneticCode } from './snapgeneFeatureTranslation'
import { canSeedFeatureFromSelection, type SelectionIntent } from './selectionIntent'
import { coerceFeatureDirectionality, featureDirectionality, type FeatureDirectionality } from './featureDirectionality'
import type { FeatureTranslationOptions, SequenceFeature, Strand, Topology } from './types'

export type FeatureSelectionRange = { start: number; end: number }

/**
 * Only a DNA-range selection may seed a new feature. A selected feature has an
 * incidental range of its own, but inheriting it creates accidental whole-record
 * annotations when the source feature spans the construct.
 */
export function explicitDnaRangeForNewFeature(
  selection: FeatureSelectionRange | null,
  selectionIntent: SelectionIntent,
  hasCutSelection: boolean,
): FeatureSelectionRange | null {
  if (
    !canSeedFeatureFromSelection(selectionIntent)
    || hasCutSelection
    || !selection
    || selection.start < 0
    || selection.end <= selection.start
  ) return null
  return { start: selection.start, end: selection.end }
}

/** Safe visible starting span when Add Feature is invoked without a DNA selection. */
export function defaultRangeForNewFeature(sequenceLength: number): FeatureSelectionRange | null {
  if (!Number.isFinite(sequenceLength) || sequenceLength <= 0) return null
  const start = Math.max(0, Math.min(10, Math.trunc(sequenceLength) - 1))
  return { start, end: Math.min(Math.trunc(sequenceLength), start + 30) }
}

/** SnapGene / GenBank feature keys in display order (screenshot 2). */
export const SNAPGENE_FEATURE_TYPES = [
  "3'UTR",
  "5'UTR",
  '-10_signal',
  '-35_signal',
  'attenuator',
  'C_region',
  'CAAT_signal',
  'CDS',
  'conflict',
  'D-loop',
  'D_segment',
  'enhancer',
  'exon',
  'GC_signal',
  'gene',
  'iDNA',
  'intron',
  'J_segment',
  'LTR',
  'mat_peptide',
  'misc_binding',
  'misc_difference',
  'misc_feature',
  'misc_recomb',
  'misc_RNA',
  'misc_signal',
  'misc_structure',
  'mobile_element',
  'modified_base',
  'mRNA',
  'ncRNA',
  'N_region',
  'old_sequence',
  'operon',
  'oriT',
  'polyA_signal',
  'polyA_site',
  'precursor_RNA',
  'prim_transcript',
  'primer_bind',
  'promoter',
  'protein_bind',
  'RBS',
  'repeat_region',
  'rep_origin',
  'rRNA',
  'S_region',
  'sig_peptide',
  'source',
  'stem_loop',
  'STS',
  'TATA_signal',
  'terminator',
  'tmRNA',
  'transit_peptide',
  'tRNA',
  'unsure',
  'V_region',
  'V_segment',
  'variation',
] as const

/** CDS qualifiers from SnapGene (screenshot 3). */
export const CDS_QUALIFIERS = [
  'allele',
  'artificial_location',
  'citation',
  'codon',
  'codon_start',
  'db_xref',
  'EC_number',
  'exception',
  'experiment',
  'function',
  'gene',
  'gene_synonym',
  'inference',
  'label',
  'locus_tag',
  'map',
  'note',
  'number',
  'old_locus_tag',
  'operon',
  'product',
  'protein_id',
  'pseudo',
  'ribosomal_slippage',
  'standard_name',
  'trans_splicing',
  'transl_except',
  'transl_table',
  'translation',
] as const

/** Qualifiers that require translation to be enabled. */
export const TRANSLATION_DEPENDENT_QUALIFIERS = new Set(['citation', 'codon', 'codon_start', 'transl_except', 'transl_table', 'translation'])

/** Common qualifiers for non-CDS feature types. */
export const COMMON_QUALIFIERS = [
  'allele',
  'db_xref',
  'experiment',
  'function',
  'gene',
  'gene_synonym',
  'inference',
  'label',
  'locus_tag',
  'map',
  'note',
  'number',
  'old_locus_tag',
  'operon',
  'standard_name',
] as const

export type { FeatureDirectionality } from './featureDirectionality'

export type FeatureSegmentDraft = {
  start: number
  end: number
  strand: Strand
  color: string
  name: string
}

export type FeatureEditorState = {
  featureId: string
  name: string
  type: string
  color: string
  directionality: FeatureDirectionality
  translateInSequenceView: boolean
  translation: FeatureTranslationOptions
  prioritizeDisplay: boolean
  segments: FeatureSegmentDraft[]
  /** Absolute 0-based cleavage arrow positions (SnapGene cleavageArrows). */
  cleavageArrows: number[]
  qualifiers: Record<string, string>
  selectedQualifier: string
  /** DNA library member scope when editing a projected/native member feature. */
  libraryMemberId?: string | null
}

function normalizeTranslationOptions(
  options: FeatureTranslationOptions | undefined,
  segmentCount: number,
): FeatureTranslationOptions {
  const base = defaultFeatureTranslationOptions(segmentCount)
  if (!options) return base
  const segmentNumbering = Array.from({ length: Math.max(1, segmentCount) }, (_, index) => ({
    startAt: options.segmentNumbering[index]?.startAt ?? base.segmentNumbering[index]?.startAt ?? 1,
    skip: options.segmentNumbering[index]?.skip ?? false,
  }))
  return {
    geneticCode: options.geneticCode || base.geneticCode,
    firstCodonAsMet: options.firstCodonAsMet ?? false,
    readingFrame: options.readingFrame ?? 1,
    consecutiveNumbering: options.consecutiveNumbering ?? true,
    segmentNumbering,
  }
}

export function qualifiersForFeatureType(type: string): readonly string[] {
  if (type === 'CDS') return CDS_QUALIFIERS
  return COMMON_QUALIFIERS
}

export function featureQualifierValues(value: string | undefined): string[] {
  if (!value?.trim()) return []
  return value
    .split('\n')
    .map((part) => part.trim())
    .filter(Boolean)
}

function appendFeatureQualifierValue(result: Record<string, string>, key: string, value: string) {
  const trimmed = value.trim()
  if (!trimmed) return
  const existing = result[key]
  if (existing === undefined) {
    result[key] = trimmed
    return
  }
  const parts = featureQualifierValues(existing)
  if (parts.includes(trimmed)) return
  result[key] = [...parts, trimmed].join('\n')
}

export function parseFeatureQualifiers(notes: string | undefined): Record<string, string> {
  const result: Record<string, string> = {}
  if (!notes?.trim()) return result

  // SnapGene's HTML qualifiers contain slashes and quoted href attributes,
  // which otherwise look like qualifier delimiters to the plain-text parser.
  const htmlValues: string[] = []
  let marker = '__VIBEGENE_HTML_'
  while (notes.includes(marker)) marker += '_'
  const protectedNotes = notes.replace(/<html\b[^>]*>[\s\S]*?<\/html\s*>/gi, (html) => {
    const token = `${marker}${htmlValues.length}__`
    htmlValues.push(html)
    return token
  })

  const genbankKeys = new Set<string>()
  const genbankPattern = /\/([a-zA-Z0-9_-]+)="([^"]*)"/g
  let match: RegExpExecArray | null
  while ((match = genbankPattern.exec(protectedNotes)) !== null) {
    appendFeatureQualifierValue(result, match[1], match[2])
    genbankKeys.add(match[1])
  }

  const notesWithoutGenbank = protectedNotes.replace(/\/([a-zA-Z0-9_-]+)="([^"]*)"/g, ' ')
  const snapGenePattern = /([a-zA-Z0-9_-]+):\s*([^/]+?)(?=\s+[a-zA-Z0-9_-]+:|\/[a-zA-Z0-9_-]+=|$)/g
  while ((match = snapGenePattern.exec(notesWithoutGenbank)) !== null) {
    const key = match[1]
    if (genbankKeys.has(key)) continue
    appendFeatureQualifierValue(result, key, match[2])
  }

  for (const key of Object.keys(result)) {
    htmlValues.forEach((html, index) => { result[key] = result[key]!.replaceAll(`${marker}${index}__`, html) })
  }
  return result
}

export function serializeFeatureQualifiers(qualifiers: Record<string, string>): string {
  const parts: string[] = []
  for (const [key, value] of Object.entries(qualifiers)) {
    for (const part of featureQualifierValues(value)) {
      parts.push(`/${key}="${part.replace(/"/g, "'")}"`)
    }
  }
  return parts.join(' ')
}

/**
 * Keep `/translation` (and companion CDS translation qualifiers) in sync with the
 * live peptide for features that are translated in Sequence view. Clears `/translation`
 * when translation is off so feature parameters stay consistent with the toggle.
 */
export function syncTranslationQualifiers(
  qualifiers: Record<string, string>,
  feature: Pick<SequenceFeature, 'locations' | 'translateInSequenceView' | 'translation'>,
  sequence: string,
  topology: Topology = 'circular',
): Record<string, string> {
  const next = { ...qualifiers }
  if (!feature.translateInSequenceView || !feature.translation || !feature.locations.length) {
    delete next.translation
    return next
  }
  const peptide = translateFeature(feature, sequence, feature.translation, { topology })
  next.translation = peptide
  next.transl_table = String(snapGeneTranslTableFromGeneticCode(feature.translation.geneticCode))
  next.codon_start = next.codon_start?.trim() || '1'
  return next
}

export function syncFeatureTranslationNotes(
  feature: SequenceFeature,
  sequence: string,
  topology: Topology = 'circular',
): SequenceFeature {
  const hadTranslationQualifier = Boolean(parseFeatureQualifiers(feature.notes).translation)
  if (!feature.translateInSequenceView && !hadTranslationQualifier) return feature
  const qualifiers = syncTranslationQualifiers(parseFeatureQualifiers(feature.notes), feature, sequence, topology)
  const notes = serializeFeatureQualifiers(qualifiers)
  if (notes === (feature.notes ?? '')) return feature
  return { ...feature, notes }
}

export function syncTranslatedFeaturesNotes(
  features: SequenceFeature[],
  sequence: string,
  topology: Topology = 'circular',
): SequenceFeature[] {
  let changed = false
  const next = features.map((feature) => {
    const synced = syncFeatureTranslationNotes(feature, sequence, topology)
    if (synced !== feature) changed = true
    return synced
  })
  return changed ? next : features
}

export function directionalityFromFeature(feature: SequenceFeature): FeatureDirectionality {
  return featureDirectionality(feature)
}

export function strandFromDirectionality(directionality: FeatureDirectionality): Strand {
  if (directionality === 'reverse') return 'reverse'
  return 'forward'
}

export function featureEditorFromNewSelection(
  featureId: string,
  start: number,
  end: number,
  options?: { name?: string; geneticCode?: string },
): FeatureEditorState {
  const name = options?.name?.trim() || 'new feature'
  const color = '#993366'
  return {
    featureId,
    name,
    type: 'CDS',
    color,
    directionality: 'forward',
    translateInSequenceView: false,
    translation: {
      ...defaultFeatureTranslationOptions(1),
      geneticCode: options?.geneticCode ?? 'Standard',
    },
    prioritizeDisplay: false,
    segments: [
      {
        start,
        end,
        strand: 'forward',
        color,
        name,
      },
    ],
    cleavageArrows: [],
    qualifiers: {},
    selectedQualifier: 'product',
  }
}

export function featureEditorFromFeature(
  feature: SequenceFeature,
  sequence?: string,
  topology: Topology = 'circular',
): FeatureEditorState {
  let qualifiers = parseFeatureQualifiers(feature.notes)
  const translateInSequenceView = feature.translateInSequenceView ?? false
  const translation = normalizeTranslationOptions(feature.translation, feature.locations.length)
  if (sequence !== undefined) {
    qualifiers = syncTranslationQualifiers(
      qualifiers,
      {
        locations: feature.locations,
        translateInSequenceView,
        translation,
      },
      sequence,
      topology,
    )
  }
  const availableQualifiers = qualifiersForFeatureType(feature.type)
  const selectedQualifier = availableQualifiers.includes('product')
    ? 'product'
    : availableQualifiers.find((qualifier) => qualifier in qualifiers) ?? availableQualifiers[0] ?? 'note'

  return {
    featureId: feature.id,
    name: feature.name,
    type: feature.type,
    color: feature.color,
    directionality: coerceFeatureDirectionality(
      feature.type,
      directionalityFromFeature(feature),
      feature.locations[0]?.strand ?? 'forward',
    ),
    translateInSequenceView,
    translation,
    prioritizeDisplay: feature.prioritizeDisplay ?? false,
    segments: feature.locations.map((location, index) => ({
      start: location.start,
      end: location.end,
      strand: location.strand,
      color: feature.color,
      name: feature.locations.length === 1 ? feature.name : `${feature.name} (${index + 1})`,
    })),
    cleavageArrows: [...(feature.cleavageArrows ?? [])].sort((a, b) => a - b),
    qualifiers,
    selectedQualifier,
  }
}

export function featureFromEditor(
  draft: FeatureEditorState,
  sequence?: string,
  topology: Topology = 'circular',
): Pick<
  SequenceFeature,
  | 'name'
  | 'type'
  | 'color'
  | 'directionality'
  | 'notes'
  | 'locations'
  | 'prioritizeDisplay'
  | 'translateInSequenceView'
  | 'translation'
  | 'cleavageArrows'
> {
  const directionality = coerceFeatureDirectionality(
    draft.translateInSequenceView ? 'CDS' : draft.type,
    draft.directionality,
    draft.segments[0]?.strand ?? 'forward',
  )
  const strand = strandFromDirectionality(directionality)
  const type = draft.translateInSequenceView ? 'CDS' : draft.type
  const cleavageArrows = [...new Set(draft.cleavageArrows)]
    .filter((position) => Number.isFinite(position) && position >= 0)
    .sort((a, b) => a - b)
  const locations = draft.segments.map((segment) => ({
    start: segment.start,
    end: segment.end,
    strand: directionality === 'both' || directionality === 'none' ? segment.strand : strand,
  }))
  const translation = normalizeTranslationOptions(draft.translation, draft.segments.length)
  let qualifiers = { ...draft.qualifiers }
  if (sequence !== undefined) {
    qualifiers = syncTranslationQualifiers(
      qualifiers,
      {
        locations,
        translateInSequenceView: draft.translateInSequenceView,
        translation,
      },
      sequence,
      topology,
    )
  }
  return {
    name: draft.name.trim() || 'unnamed',
    type,
    color: draft.color,
    directionality,
    notes: serializeFeatureQualifiers(qualifiers),
    prioritizeDisplay: draft.prioritizeDisplay,
    translateInSequenceView: draft.translateInSequenceView,
    translation,
    locations,
    cleavageArrows: cleavageArrows.length ? cleavageArrows : undefined,
  }
}

export function segmentSizeBp(start: number, end: number, sequenceLength: number) {
  if (end >= start) return end - start
  return sequenceLength - start + end
}

export function totalFeatureBp(segments: FeatureSegmentDraft[], sequenceLength: number) {
  return segments.reduce((total, segment) => total + segmentSizeBp(segment.start, segment.end, sequenceLength), 0)
}

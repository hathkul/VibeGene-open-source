import {
  computeAnnotatedFeatureTranslationCells,
  computeFeatureTranslationCells,
  defaultFeatureTranslationOptions,
  type FeatureTranslationCell,
} from './geneticCode'
import type { CommonFeatureMatch, CommonFeatureTemplate } from './commonFeatures'
import { createId, featureBounds, sanitizeProtein } from './sequence'
import { dnaSequenceDigest } from './proteinTranslationProvenance'
import type {
  FeatureSegment,
  SequenceFeature,
  SequenceRecord,
} from './types'

/** Uppercase AA letters only (drop stop/gap markers) for identity checks. */
function normalizePeptide(sequence: string): string {
  return sanitizeProtein(sequence).replace(/\*/g, '').toUpperCase()
}

const DNA_FEATURE_TYPE_BY_PROTEIN: Record<string, string> = {
  'signal peptide': 'sig_peptide',
  'transit peptide': 'transit_peptide',
  repeat: 'repeat_region',
  'binding site': 'misc_binding',
  'protein bind': 'protein_bind',
}

export type ProteinToDnaSkip = {
  featureId: string
  featureName: string
  reason: string
}

export type ProteinToDnaMappedFeature = {
  proteinFeatureId: string
  dnaFeature: SequenceFeature
  residueStart: number
  residueEnd: number
}

export type MatchingTranslatedCds = {
  cds: SequenceFeature
  cells: FeatureTranslationCell[]
}

function dnaFeatureTypeFromProtein(type: string): string {
  const key = type.trim().toLowerCase()
  return DNA_FEATURE_TYPE_BY_PROTEIN[key] ?? 'misc_feature'
}

/** Contiguous genomic segments covering AA residues [start, end) on translation cells. */
export function segmentsForProteinResidues(
  cells: readonly FeatureTranslationCell[],
  start: number,
  end: number,
  strand: FeatureSegment['strand'],
): FeatureSegment[] {
  const lo = Math.max(0, Math.min(cells.length, Math.trunc(start)))
  const hi = Math.max(lo, Math.min(cells.length, Math.trunc(end)))
  const positions = [...new Set(cells.slice(lo, hi).flatMap((cell) => cell.positions))].sort((a, b) => a - b)
  const segments: FeatureSegment[] = []
  for (const position of positions) {
    const previous = segments.at(-1)
    if (previous && previous.end === position) previous.end = position + 1
    else segments.push({ start: position, end: position + 1, strand })
  }
  return segments
}

/**
 * Prefer annotated CDS cells; fall back to display translation cells so mapping
 * matches proteins opened via translateFeature when the CDS body omits a terminal stop.
 */
export function translationCellsMatchingProtein(
  cds: Pick<SequenceFeature, 'locations' | 'translation'>,
  dnaSequence: string,
  topology: SequenceRecord['topology'],
  proteinSequence: string,
): FeatureTranslationCell[] | null {
  if (!cds.locations.length || !dnaSequence.length) return null
  const protein = normalizePeptide(proteinSequence)
  if (!protein) return null
  const options = cds.translation ?? defaultFeatureTranslationOptions(cds.locations.length)
  const candidates = [
    computeAnnotatedFeatureTranslationCells(cds, dnaSequence, options),
    computeFeatureTranslationCells(cds, dnaSequence, options, { topology }),
  ]
  for (const raw of candidates) {
    const cells = raw.filter((cell) => cell.aa !== '*')
    const peptide = normalizePeptide(cells.map((cell) => cell.aa).join(''))
    if (peptide === protein) return cells
    if (protein.length > 0 && peptide.startsWith(protein)) return cells.slice(0, protein.length)
  }
  return null
}

function isLikelyCodingFeature(feature: SequenceFeature): boolean {
  const type = feature.type.trim().toUpperCase()
  return type === 'CDS' || Boolean(feature.translateInSequenceView)
}

/** Every CDS/translated feature whose peptide matches the protein sequence. */
export function findMatchingTranslatedCds(
  dnaRecord: SequenceRecord,
  proteinSequence: string,
): MatchingTranslatedCds[] {
  if (dnaRecord.molecule !== 'dna') return []
  const protein = normalizePeptide(proteinSequence)
  if (!protein) return []
  return dnaRecord.features.flatMap((feature) => {
    if (!isLikelyCodingFeature(feature)) return []
    const cells = translationCellsMatchingProtein(
      feature,
      dnaRecord.sequence,
      dnaRecord.topology,
      protein,
    )
    if (!cells) return []
    return [{ cds: feature, cells }]
  })
}

/**
 * Choose one CDS target for import: prefer provenance when it points at this DNA,
 * otherwise the unique peptide match (or the earliest CDS if several match).
 */
export function resolveProteinImportCds(
  protein: SequenceRecord,
  dnaRecord: SequenceRecord,
): MatchingTranslatedCds | null {
  const matches = findMatchingTranslatedCds(dnaRecord, protein.sequence)
  if (!matches.length) return null
  if (matches.length === 1) return matches[0]!

  const digest = dnaSequenceDigest(dnaRecord.sequence)
  const derivation = protein.protein?.translationDerivation
  if (derivation?.kind === 'translated-cds') {
    for (const source of derivation.sources) {
      if (source.sequenceDigest !== digest) continue
      if (source.projectId && source.projectId !== dnaRecord.id) continue
      const featureId = source.cds?.featureId
      if (featureId) {
        const preferred = matches.find((entry) => entry.cds.id === featureId)
        if (preferred) return preferred
      }
    }
  }

  const cdsTyped = matches.filter((entry) => entry.cds.type.trim().toUpperCase() === 'CDS')
  const pool = cdsTyped.length ? cdsTyped : matches
  return pool.toSorted(
    (a, b) => featureBounds(a.cds).start - featureBounds(b.cds).start || a.cds.name.localeCompare(b.cds.name),
  )[0] ?? null
}

function appendMappedNote(
  existing: string | undefined,
  proteinName: string,
  residueStart: number,
  residueEnd: number,
  cdsName: string,
): string {
  const tag = `/note="Imported from protein ${proteinName} (aa ${residueStart + 1}–${residueEnd}) onto CDS ${cdsName}"`
  const trimmed = existing?.trim() ?? ''
  if (!trimmed) return tag
  if (trimmed.includes('Imported from protein')) return trimmed
  return `${trimmed} ${tag}`
}

export function mapProteinFeatureOntoCds(
  proteinFeature: SequenceFeature,
  cells: readonly FeatureTranslationCell[],
  cdsStrand: FeatureSegment['strand'],
  options?: { cdsName?: string; proteinName?: string; featureId?: string },
): ProteinToDnaMappedFeature | ProteinToDnaSkip {
  const residueStart = Math.min(...proteinFeature.locations.map((location) => location.start))
  const residueEnd = Math.max(...proteinFeature.locations.map((location) => location.end))
  const locations = proteinFeature.locations.flatMap((location) => (
    segmentsForProteinResidues(cells, location.start, location.end, cdsStrand)
  ))
  if (!locations.length) {
    return {
      featureId: proteinFeature.id,
      featureName: proteinFeature.name,
      reason: 'No coding bases map to those amino-acid coordinates on the target CDS.',
    }
  }
  const dnaFeature: SequenceFeature = {
    ...proteinFeature,
    id: options?.featureId ?? createId('feature'),
    type: dnaFeatureTypeFromProtein(proteinFeature.type),
    locations,
    translation: undefined,
    translateInSequenceView: false,
    cleavageArrows: undefined,
    mapTrack: undefined,
    proteinNumberingStart: undefined,
    notes: appendMappedNote(
      proteinFeature.notes,
      options?.proteinName ?? 'annotation',
      residueStart,
      residueEnd,
      options?.cdsName ?? 'CDS',
    ),
  }
  return {
    proteinFeatureId: proteinFeature.id,
    dnaFeature,
    residueStart,
    residueEnd,
  }
}

export function mapProteinFeaturesOntoCds(
  proteinFeatures: readonly SequenceFeature[],
  cells: readonly FeatureTranslationCell[],
  cdsStrand: FeatureSegment['strand'],
  options?: { cdsName?: string; proteinName?: string },
): { mapped: ProteinToDnaMappedFeature[]; skipped: ProteinToDnaSkip[] } {
  const mapped: ProteinToDnaMappedFeature[] = []
  const skipped: ProteinToDnaSkip[] = []
  for (const feature of proteinFeatures) {
    const result = mapProteinFeatureOntoCds(feature, cells, cdsStrand, options)
    if ('reason' in result) skipped.push(result)
    else mapped.push(result)
  }
  return { mapped, skipped }
}

function isFeatureAlreadyPresent(dnaRecord: SequenceRecord, feature: SequenceFeature): boolean {
  const bounds = featureBounds(feature)
  return dnaRecord.features.some((existing) => {
    if (existing.name.trim().toLowerCase() !== feature.name.trim().toLowerCase()) return false
    if (existing.type.trim().toLowerCase() !== feature.type.trim().toLowerCase()) return false
    const existingBounds = featureBounds(existing)
    return existingBounds.start === bounds.start && existingBounds.end === bounds.end
  })
}

function templateFromProteinFeature(
  protein: SequenceRecord,
  feature: SequenceFeature,
): CommonFeatureTemplate {
  const bounds = featureBounds(feature)
  const aa = normalizePeptide(protein.sequence.slice(bounds.start, bounds.end)) || 'X'
  return {
    id: feature.id,
    fileName: protein.name,
    name: feature.name,
    type: dnaFeatureTypeFromProtein(feature.type),
    color: feature.color || '#64748b',
    sequence: aa,
    notes: feature.notes,
    qualifiers: [],
    locations: [{ start: 0, end: aa.length, strand: 'forward' }],
  }
}

/**
 * Map protein annotations onto a DNA CDS whose translation matches the protein,
 * producing selectable CommonFeaturesDetectDialog matches.
 */
export function buildProteinFeatureImportMatches(
  protein: SequenceRecord,
  dnaRecord: SequenceRecord,
): { matches: CommonFeatureMatch[]; cds: SequenceFeature; skipped: ProteinToDnaSkip[] } {
  if (protein.molecule !== 'protein') {
    throw new Error('Choose a protein file to map amino-acid annotations onto DNA.')
  }
  if (dnaRecord.molecule !== 'dna') {
    throw new Error('Protein annotations can only be imported into a DNA construct.')
  }

  const target = resolveProteinImportCds(protein, dnaRecord)
  if (!target) {
    throw new Error(
      `No CDS on ${dnaRecord.name} translates to the protein sequence of ${protein.name}. `
      + 'Add or enable a matching translated CDS on the consensus first.',
    )
  }

  const cdsStrand = target.cds.locations[0]?.strand ?? 'forward'
  const { mapped, skipped } = mapProteinFeaturesOntoCds(
    protein.features,
    target.cells,
    cdsStrand,
    { cdsName: target.cds.name, proteinName: protein.name },
  )

  const matches: CommonFeatureMatch[] = mapped.map((entry) => {
    const bounds = featureBounds(entry.dnaFeature)
    const proteinFeature = protein.features.find((feature) => feature.id === entry.proteinFeatureId)
    return {
      id: `protein-import:${entry.proteinFeatureId}:${bounds.start}`,
      templateId: entry.proteinFeatureId,
      template: proteinFeature
        ? templateFromProteinFeature(protein, proteinFeature)
        : {
            id: entry.proteinFeatureId,
            fileName: protein.name,
            name: entry.dnaFeature.name,
            type: entry.dnaFeature.type,
            color: entry.dnaFeature.color,
            sequence: 'X',
            notes: entry.dnaFeature.notes,
            qualifiers: [],
            locations: [{ start: 0, end: 1, strand: 'forward' }],
          },
      start: bounds.start,
      end: bounds.end,
      strand: cdsStrand,
      matchPercent: 100,
      matchedSegments: entry.dnaFeature.locations.map((location) => ({
        start: location.start,
        end: location.end,
      })),
      alreadyPresent: isFeatureAlreadyPresent(dnaRecord, entry.dnaFeature),
      feature: entry.dnaFeature,
    }
  })

  matches.sort((a, b) => a.start - b.start || a.end - b.end || a.template.name.localeCompare(b.template.name))
  return { matches, cds: target.cds, skipped }
}

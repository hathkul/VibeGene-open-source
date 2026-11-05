import { alignDnaToProtein } from './proteinAlignment'
import {
  computeFeatureTranslationCells,
  defaultFeatureTranslationOptions,
  translateFeature,
  type FeatureTranslationCell,
} from './geneticCode'
import {
  codingDnaForProjectedFeature,
} from './proteinComparisonFromLibrary'
import { segmentsForProteinResidues } from './proteinAnnotationToDna'
import { remapFeaturesToTrace } from './traceAnnotationView'
import { sanitizeProtein } from './sequence'
import type { ProteinGuidedAlignment } from './proteinAlignmentTypes'
import type { TraceFileRecord } from './traceTypes'
import type { SequenceFeature, SequenceRecord } from './types'

const PROTEIN_IMPORT_NOTE_RE = /(?:Mapped|Imported) from protein/i
/** Notes use 1-based inclusive ends: `aa 5–29` → half-open [4, 29). */
const PROTEIN_IMPORT_AA_RANGE_RE = /\baa\s+(\d+)\s*[–-]\s*(\d+)\b/i
/** Member-sourced imports pin AA ranges to that member's peptide, not consensus. */
const PROTEIN_IMPORT_LIBRARY_SOURCE_RE = /\blibrary-source=([^\s;"]+)/i

export function isProteinImportedFeature(feature: Pick<SequenceFeature, 'notes'>): boolean {
  return PROTEIN_IMPORT_NOTE_RE.test(feature.notes ?? '')
}

export function parseImportedProteinResidueRange(
  notes: string | undefined,
): { start: number; end: number } | null {
  const match = notes?.match(PROTEIN_IMPORT_AA_RANGE_RE)
  if (!match) return null
  const start = Number(match[1]) - 1
  const end = Number(match[2])
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start || start < 0) return null
  return { start, end }
}

export function parseLibrarySourceMemberId(notes: string | undefined): string | null {
  const match = notes?.match(PROTEIN_IMPORT_LIBRARY_SOURCE_RE)
  return match?.[1] ?? null
}

export function formatProteinImportNotes(options: {
  proteinName: string
  residueStart: number
  residueEnd: number
  cdsName: string
  librarySourceMemberId?: string | null
  existing?: string
}): string {
  const aa = `aa ${options.residueStart + 1}–${options.residueEnd}`
  const source = options.librarySourceMemberId
    ? `; library-source=${options.librarySourceMemberId}`
    : ''
  const tag = `/note="Imported from protein ${options.proteinName} (${aa}) onto CDS ${options.cdsName}${source}"`
  const trimmed = options.existing?.trim() ?? ''
  if (!trimmed) return tag
  if (trimmed.includes('Imported from protein')) return trimmed
  return `${trimmed} ${tag}`
}

function hasSourceResidue(column: ProteinGuidedAlignment['columns'][number]): boolean {
  const residue = column.sourceResidue
  return Boolean(residue && residue !== '–' && residue !== '-' && residue !== '.' && residue !== '·')
}

/**
 * Map a consensus (reference) AA range through a guided DNA→protein alignment to a
 * contiguous member AA span. Insertions whose referenceBoundary falls inside the
 * consensus range are included so CDR length variants stay one block.
 */
export function memberResidueRangeFromProteinAlignment(
  alignment: ProteinGuidedAlignment,
  residueStart: number,
  residueEnd: number,
): { start: number; end: number } | null {
  if (residueStart >= residueEnd) return null
  let sourceAa = 0
  let min = Number.POSITIVE_INFINITY
  let max = Number.NEGATIVE_INFINITY
  let saw = false
  for (const column of alignment.columns) {
    if (!hasSourceResidue(column)) continue
    const referenceIndex = column.referenceIndex
    const matched =
      referenceIndex !== null
      && referenceIndex >= residueStart
      && referenceIndex < residueEnd
    const insertionInside =
      referenceIndex === null
      && column.referenceBoundary > residueStart
      && column.referenceBoundary <= residueEnd
    if (matched || insertionInside) {
      saw = true
      min = Math.min(min, sourceAa)
      max = Math.max(max, sourceAa)
    }
    sourceAa += 1
  }
  if (!saw) return null
  return { start: min, end: max + 1 }
}

/**
 * Inverse of memberResidueRangeFromProteinAlignment: map a member (source) AA
 * range through the same guided alignment onto a contiguous consensus AA span.
 * Member-only insertions pin to the nearest reference boundary residue.
 */
export function consensusResidueRangeFromProteinAlignment(
  alignment: ProteinGuidedAlignment,
  memberStart: number,
  memberEnd: number,
): { start: number; end: number } | null {
  if (memberStart >= memberEnd) return null
  let sourceAa = 0
  let min = Number.POSITIVE_INFINITY
  let max = Number.NEGATIVE_INFINITY
  let saw = false
  for (const column of alignment.columns) {
    if (!hasSourceResidue(column)) continue
    if (sourceAa >= memberStart && sourceAa < memberEnd) {
      saw = true
      if (column.referenceIndex !== null) {
        min = Math.min(min, column.referenceIndex)
        max = Math.max(max, column.referenceIndex)
      } else {
        const boundary = column.referenceBoundary
        const pinned = boundary > 0 ? boundary - 1 : 0
        min = Math.min(min, pinned)
        max = Math.max(max, pinned)
      }
    }
    sourceAa += 1
  }
  if (!saw || !Number.isFinite(min) || !Number.isFinite(max)) return null
  return { start: min, end: max + 1 }
}

export function consensusPeptideForCds(
  cds: SequenceFeature,
  sequence: string,
  topology: SequenceRecord['topology'],
): string {
  const options = cds.translation ?? defaultFeatureTranslationOptions(cds.locations.length)
  return sanitizeProtein(
    translateFeature(cds, sequence, options, { topology }),
  ).replace(/\*/g, '').toUpperCase()
}

/** Peptide up to the first stop — safer alignment reference when consensus is truncated/frameshifted. */
export function cdsPeptideBeforeStop(
  cds: SequenceFeature,
  sequence: string,
  topology: SequenceRecord['topology'],
): string {
  const options = cds.translation ?? defaultFeatureTranslationOptions(cds.locations.length)
  const raw = translateFeature(cds, sequence, options, { topology })
  const stop = raw.indexOf('*')
  const before = stop >= 0 ? raw.slice(0, stop) : raw
  return sanitizeProtein(before).replace(/\*/g, '').toUpperCase()
}

function projectCdsOntoMember(
  cds: SequenceFeature,
  member: TraceFileRecord,
): SequenceFeature | null {
  if (!member.alignment || member.parseError) return null
  // Use min/max DNA remap (not codon-gapped) so member insertions inside the CDS
  // remain in the coding DNA that guided protein alignment sees.
  const projected = remapFeaturesToTrace([cds], member.alignment, { preserveCodons: false })[0]
  if (!projected) return null
  return {
    ...projected,
    translateInSequenceView: true,
    translation: projected.translation ?? cds.translation ?? defaultFeatureTranslationOptions(cds.locations.length),
  }
}

/** Prefer a member-local CDS copy; fall back to DNA-alignment projection from consensus. */
export function resolveMemberCdsFeature(
  cds: SequenceFeature,
  member: TraceFileRecord,
): SequenceFeature | null {
  const existing = member.features?.find((feature) => feature.id === cds.id)
    ?? member.features?.find((feature) => {
      const coding = feature.type.trim().toUpperCase() === 'CDS' || Boolean(feature.translateInSequenceView)
      return coding && feature.name.trim().toLowerCase() === cds.name.trim().toLowerCase()
    })
  if (existing?.locations.length) {
    return {
      ...existing,
      translateInSequenceView: true,
      translation: existing.translation
        ?? cds.translation
        ?? defaultFeatureTranslationOptions(existing.locations.length),
    }
  }
  return projectCdsOntoMember(cds, member)
}

export function memberCdsPeptide(
  cds: SequenceFeature,
  member: TraceFileRecord,
): string | null {
  const memberCds = resolveMemberCdsFeature(cds, member)
  if (!memberCds) return null
  return consensusPeptideForCds(memberCds, member.sequence, 'linear') || null
}

export type MemberProteinProjectionContext = {
  memberCds: SequenceFeature
  alignment: ProteinGuidedAlignment
  cells: FeatureTranslationCell[]
  /** Non-stop translation cells in peptide order (matches open-as-protein coordinates). */
  peptideCells: FeatureTranslationCell[]
}

/** Build guided alignment + translation cells once per member (reuse across features). */
export function buildMemberProteinProjectionContext(
  member: TraceFileRecord,
  context: {
    cds: SequenceFeature
    /** Reference peptide for guided alignment (consensus or library-source member). */
    consensusPeptide: string
    geneticCode?: string
  },
): MemberProteinProjectionContext | null {
  const memberCds = resolveMemberCdsFeature(context.cds, member)
  if (!memberCds) return null
  const codingDna = codingDnaForProjectedFeature(memberCds, member.sequence)
  if (!codingDna) return null
  const alignment = alignDnaToProtein(
    context.consensusPeptide,
    {
      id: member.id,
      name: member.fileName,
      fileName: member.fileName,
      kind: 'dna',
      sequence: codingDna,
      enabled: true,
      disabledFrameShiftKeys: [],
    },
    context.geneticCode ?? memberCds.translation?.geneticCode ?? 'Standard',
  )
  if (!alignment) return null
  const translation = memberCds.translation ?? defaultFeatureTranslationOptions(memberCds.locations.length)
  const cells = computeFeatureTranslationCells(memberCds, member.sequence, translation, { topology: 'linear' })
  if (!cells.length) return null
  const peptideCells = cells.filter((cell) => cell.aa !== '*')
  if (!peptideCells.length) return null
  return { memberCds, alignment, cells, peptideCells }
}

function resolveProjectionReferencePeptide(
  feature: SequenceFeature,
  members: readonly TraceFileRecord[],
  fallbackPeptide: string,
  cds: SequenceFeature,
): { peptide: string; sourceMemberId: string | null } {
  const sourceMemberId = parseLibrarySourceMemberId(feature.notes)
  if (!sourceMemberId) return { peptide: fallbackPeptide, sourceMemberId: null }
  const source = members.find((member) => member.id === sourceMemberId)
  if (!source) return { peptide: fallbackPeptide, sourceMemberId: null }
  const peptide = memberCdsPeptide(cds, source)
  if (!peptide) return { peptide: fallbackPeptide, sourceMemberId: null }
  return { peptide, sourceMemberId }
}

/**
 * Project one protein-imported consensus DNA feature onto a library member using
 * guided DNA→protein alignment (same engine as library protein comparison).
 */
export function projectProteinImportedFeatureOntoMember(
  feature: SequenceFeature,
  member: TraceFileRecord,
  context: {
    cds: SequenceFeature
    consensusPeptide: string
    consensusSequence: string
    topology: SequenceRecord['topology']
    geneticCode?: string
    /** When set, aa ranges in notes are relative to this member's peptide. */
    sourceMemberId?: string | null
  },
  cached?: MemberProteinProjectionContext | null,
): SequenceFeature | null {
  const residueRange = parseImportedProteinResidueRange(feature.notes)
  if (!residueRange) return null
  const projection = cached
    ?? buildMemberProteinProjectionContext(member, context)
  if (!projection) return null

  const strand = projection.memberCds.locations[0]?.strand ?? feature.locations[0]?.strand ?? 'forward'

  // Exact source member: map aa ranges straight onto its translation cells.
  if (context.sourceMemberId && member.id === context.sourceMemberId) {
    const locations = segmentsForProteinResidues(
      projection.peptideCells,
      residueRange.start,
      residueRange.end,
      strand,
    )
    if (!locations.length) return null
    return {
      ...feature,
      locations,
      translation: undefined,
      translateInSequenceView: false,
      cleavageArrows: undefined,
    }
  }

  let memberResidues = memberResidueRangeFromProteinAlignment(
    projection.alignment,
    residueRange.start,
    residueRange.end,
  )
  if (!memberResidues) return null

  if (projection.alignment.orientation === 'reverse') {
    const length = projection.peptideCells.length
    memberResidues = {
      start: length - memberResidues.end,
      end: length - memberResidues.start,
    }
    if (memberResidues.end <= memberResidues.start) return null
  }

  const locations = segmentsForProteinResidues(
    projection.peptideCells,
    memberResidues.start,
    memberResidues.end,
    strand,
  )
  if (!locations.length) return null

  return {
    ...feature,
    locations,
    translation: undefined,
    translateInSequenceView: false,
    cleavageArrows: undefined,
  }
}

export function tryProjectProteinImportedFeatureOntoMembers(
  feature: SequenceFeature,
  members: readonly TraceFileRecord[],
  context: {
    cds: SequenceFeature
    consensusPeptide: string
    consensusSequence: string
    topology: SequenceRecord['topology']
    geneticCode?: string
  } | null,
  cache?: Map<string, MemberProteinProjectionContext | null>,
): TraceFileRecord[] | null {
  if (!context || !isProteinImportedFeature(feature)) return null
  if (!parseImportedProteinResidueRange(feature.notes)) return null

  const { peptide: referencePeptide, sourceMemberId } = resolveProjectionReferencePeptide(
    feature,
    members,
    context.consensusPeptide,
    context.cds,
  )
  const projectionContext = {
    ...context,
    consensusPeptide: referencePeptide,
    sourceMemberId,
  }
  const cachePrefix = sourceMemberId ?? 'consensus'

  return members.map((member) => {
    const existing = (member.features ?? []).filter((entry) => entry.id !== feature.id)
    // DNA MSA is optional when the member already carries a CDS copy.
    if (member.parseError) {
      return { ...member, features: existing.length ? existing : undefined }
    }
    if (!member.alignment && !resolveMemberCdsFeature(context.cds, member)) {
      return { ...member, features: existing.length ? existing : undefined }
    }
    const cacheKey = `${cachePrefix}:${member.id}`
    let cached = cache?.get(cacheKey)
    if (cache && cached === undefined) {
      cached = buildMemberProteinProjectionContext(member, projectionContext)
      cache.set(cacheKey, cached)
    }
    const projected = projectProteinImportedFeatureOntoMember(
      feature,
      member,
      projectionContext,
      cached,
    )
    if (!projected) {
      return { ...member, features: existing.length ? existing : undefined }
    }
    return {
      ...member,
      features: [...existing, projected],
    }
  })
}

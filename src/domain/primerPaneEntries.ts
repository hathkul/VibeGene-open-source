import { isDnaLibraryRecord } from './dnaLibrary'
import { formatGuideScanEvidenceSourceLabel } from './guidescan/evidence'
import { formatGuideScanOffTargetSummary, guideScanNucleaseLabel } from './guidescan/mapping'
import { guideScanOffTargetCountsForDisplay } from './guidescan/mapping'
import type { GuideScanOffTargetCounts } from './guidescan/types'
import { buildPrimerTabRow, sortPrimerTabRows, type PrimerTabSortMode } from './primerExport'
import { groupSgRNAFeatures, isSgRNAFeature, type SgRNAAnnotation } from './sgrna'
import { isSgRnaCloningOligo } from './sgrnaOligoPrimers'
import type { PrimerHybridizationParams } from './primerHybridization'
import type { TraceFileRecord } from './traceTypes'
import type { Primer, SequenceFeature, SequenceRecord, Strand } from './types'

export type PrimerPaneHeading = {
  kind: 'heading'
  key: string
  label: string
  memberId: string | null
  level: 'document' | 'subgroup'
  /** Row subgroup for per-group table headers and visibility scopes. */
  group?: 'primer' | 'oligo' | 'sgrna'
}

export type SgRnaPaneSortMode =
  | 'name'
  | 'length'
  | 'binding'
  | 'orientation'
  | 'specificity'
  | 'cutting'
  | 'offtargets'
  | 'spacer'
  | 'nuclease'

export type PrimerPaneSortDirection = 'asc' | 'desc'

export type BuildPrimerPaneEntriesOptions = {
  hybridization: PrimerHybridizationParams
  primerSort: { mode: PrimerTabSortMode; direction: PrimerPaneSortDirection }
  oligoSort: { mode: PrimerTabSortMode; direction: PrimerPaneSortDirection }
  sgRnaSort: { mode: SgRnaPaneSortMode; direction: PrimerPaneSortDirection }
  warningsFor: (primer: Primer) => string
}

export type PrimerPanePrimerRow = {
  kind: 'primer'
  key: string
  memberId: string | null
  row: ReturnType<typeof buildPrimerTabRow>
}

export type PrimerPaneSgRnaRow = {
  kind: 'sgrna'
  key: string
  memberId: string | null
  annotation: SgRNAAnnotation
}

export type PrimerPaneEntry = PrimerPaneHeading | PrimerPanePrimerRow | PrimerPaneSgRnaRow

export function sgRnaPrimerPaneFields(annotation: SgRNAAnnotation): {
  name: string
  length: number
  annotatedLength: number
  ranges: Array<{ start: number; end: number }>
  strand: Strand
  sequence: string
  nuclease: string
  pam: string
} {
  return {
    name: annotation.guide.name,
    length: annotation.spacer.length || annotation.guide.locations.reduce((sum, location) => sum + location.end - location.start, 0),
    annotatedLength: annotation.guide.locations.reduce((sum, location) => sum + location.end - location.start, 0),
    ranges: annotation.guide.locations.map((location) => ({ start: location.start, end: location.end })),
    strand: annotation.guide.locations[0]?.strand ?? 'forward',
    sequence: annotation.spacer,
    nuclease: annotation.nuclease,
    pam: annotation.pam ? `${annotation.observedPam || 'PAM'} (${annotation.pamMotif})` : 'PAM not cloned',
  }
}

export type SgRnaGuideScanMetrics = {
  specificity: string
  cuttingEfficiency: string
  offTargets: string
  source: string
}

function formatGuideScanScore(value: number | null | undefined): string {
  return value == null || !Number.isFinite(value) ? '—' : value.toFixed(2)
}

/** GuideScan2 scores for a guide, or null when it has no found evidence for its current spacer. */
export function sgRnaGuideScanMetrics(annotation: Pick<SgRNAAnnotation, 'spacer' | 'guideScanEvidence'>): SgRnaGuideScanMetrics | null {
  const evidence = annotation.guideScanEvidence
  if (!evidence || evidence.outcome !== 'found') return null
  const query = (evidence.querySequence ?? '').trim().toUpperCase()
  const spacer = annotation.spacer.trim().toUpperCase()
  if (query && spacer && !query.includes(spacer)) return null
  return {
    specificity: formatGuideScanScore(evidence.specificity),
    cuttingEfficiency: formatGuideScanScore(evidence.cuttingEfficiency),
    offTargets: evidence.offTargetCounts ? formatGuideScanOffTargetSummary(evidence.offTargetCounts) : '—',
    source: `${formatGuideScanEvidenceSourceLabel(evidence)} by GuideScan2 · ${guideScanNucleaseLabel(evidence.enzyme)} · ${evidence.organism}`,
  }
}

/**
 * Show or hide sgRNA guides together with their PAMs. Limit to `guideIds` when given;
 * returns the input array unchanged when no sgRNA matches.
 */
export function withSgRnaVisibility(
  features: SequenceFeature[],
  visible: boolean,
  guideIds?: ReadonlySet<string>,
): SequenceFeature[] {
  const ids = new Set<string>()
  for (const annotation of groupSgRNAFeatures(features)) {
    if (guideIds && !guideIds.has(annotation.guide.id)) continue
    ids.add(annotation.guide.id)
    if (annotation.pam) ids.add(annotation.pam.id)
  }
  if (!ids.size) return features
  return features.map((feature) => (ids.has(feature.id) ? { ...feature, visible: visible ? undefined : false } : feature))
}

/**
 * Stored features drawn by map and sequence views. sgRNA guide/PAM features follow the
 * Primers sidebar toggle; every other feature follows the Features toggle.
 */
export function displayableRecordFeatures(
  features: readonly SequenceFeature[],
  options: { featuresVisible: boolean; sgRnasVisible: boolean; includeRulerTrack?: boolean },
): SequenceFeature[] {
  if (!options.featuresVisible && !options.sgRnasVisible) return []
  return features.filter((feature) => {
    if (feature.type === 'primer_bind' || feature.visible === false) return false
    if (!options.includeRulerTrack && feature.mapTrack === 'ruler') return false
    return isSgRNAFeature(feature) ? options.sgRnasVisible : options.featuresVisible
  })
}

function guideScanEvidenceForSort(annotation: SgRNAAnnotation) {
  return sgRnaGuideScanMetrics(annotation) ? annotation.guideScanEvidence ?? null : null
}

function finiteGuideScanScore(value: number | null | undefined): number | null {
  return value != null && Number.isFinite(value) ? value : null
}

function compareMissingLast(
  left: number | null,
  right: number | null,
  sign: number,
): number {
  const leftMissing = left === null
  const rightMissing = right === null
  if (leftMissing && rightMissing) return 0
  if (leftMissing) return 1
  if (rightMissing) return -1
  return sign * (left - right)
}

function compareOffTargetCountTuples(left: GuideScanOffTargetCounts, right: GuideScanOffTargetCounts): number {
  const a = guideScanOffTargetCountsForDisplay(left)
  const b = guideScanOffTargetCountsForDisplay(right)
  for (const key of ['distance0', 'distance1', 'distance2', 'distance3'] as const) {
    const cmp = a[key] - b[key]
    if (cmp !== 0) return cmp
  }
  return 0
}

function sgRnaBindingStart(annotation: SgRNAAnnotation): number {
  const locations = annotation.guide.locations
  if (!locations.length) return Number.POSITIVE_INFINITY
  return Math.min(...locations.map((location) => location.start))
}

function compareSgRnaNames(left: SgRNAAnnotation, right: SgRNAAnnotation): number {
  return left.guide.name.localeCompare(right.guide.name, undefined, { numeric: true, sensitivity: 'base' })
}

/** Sort sgRNA guide rows for the Primers tab pane. */
export function sortSgRnaPaneAnnotations(
  annotations: readonly SgRNAAnnotation[],
  mode: SgRnaPaneSortMode,
  direction: PrimerPaneSortDirection,
): SgRNAAnnotation[] {
  const sign = direction === 'asc' ? 1 : -1
  return [...annotations].sort((left, right) => {
    let cmp = 0
    if (mode === 'name') {
      cmp = compareSgRnaNames(left, right)
    } else if (mode === 'length') {
      cmp = sgRnaPrimerPaneFields(left).length - sgRnaPrimerPaneFields(right).length
    } else if (mode === 'binding') {
      cmp = sgRnaBindingStart(left) - sgRnaBindingStart(right)
    } else if (mode === 'orientation') {
      const leftStrand = left.guide.locations[0]?.strand ?? ''
      const rightStrand = right.guide.locations[0]?.strand ?? ''
      cmp = leftStrand.localeCompare(rightStrand)
    } else if (mode === 'specificity') {
      const leftEvidence = guideScanEvidenceForSort(left)
      const rightEvidence = guideScanEvidenceForSort(right)
      cmp = compareMissingLast(
        leftEvidence ? finiteGuideScanScore(leftEvidence.specificity) : null,
        rightEvidence ? finiteGuideScanScore(rightEvidence.specificity) : null,
        sign,
      )
    } else if (mode === 'cutting') {
      const leftEvidence = guideScanEvidenceForSort(left)
      const rightEvidence = guideScanEvidenceForSort(right)
      cmp = compareMissingLast(
        leftEvidence ? finiteGuideScanScore(leftEvidence.cuttingEfficiency) : null,
        rightEvidence ? finiteGuideScanScore(rightEvidence.cuttingEfficiency) : null,
        sign,
      )
    } else if (mode === 'offtargets') {
      const leftEvidence = guideScanEvidenceForSort(left)
      const rightEvidence = guideScanEvidenceForSort(right)
      const leftCounts = leftEvidence?.offTargetCounts
      const rightCounts = rightEvidence?.offTargetCounts
      if (leftCounts && rightCounts) {
        cmp = compareOffTargetCountTuples(leftCounts, rightCounts)
        if (cmp !== 0) cmp = sign * cmp
      } else if (leftCounts || rightCounts) {
        cmp = leftCounts ? -1 : 1
      }
    } else if (mode === 'spacer') {
      cmp = left.spacer.localeCompare(right.spacer)
    } else {
      const leftFields = sgRnaPrimerPaneFields(left)
      const rightFields = sgRnaPrimerPaneFields(right)
      cmp = leftFields.nuclease.localeCompare(rightFields.nuclease)
        || leftFields.pam.localeCompare(rightFields.pam)
    }
    if (mode === 'specificity' || mode === 'cutting' || mode === 'offtargets') {
      return cmp || compareSgRnaNames(left, right)
    }
    return sign * cmp || compareSgRnaNames(left, right)
  })
}

/** Group native Primer records and virtual guide rows for consensus and library members. */
export function buildPrimerPaneEntries(
  record: SequenceRecord,
  members: readonly TraceFileRecord[],
  options: BuildPrimerPaneEntriesOptions,
): PrimerPaneEntry[] {
  const { hybridization, primerSort, oligoSort, sgRnaSort, warningsFor } = options
  const entries: PrimerPaneEntry[] = []
  const appendGroups = (
    sequence: string,
    primers: readonly Primer[],
    features: readonly SequenceFeature[],
    memberId: string | null,
  ) => {
    const prefix = memberId ?? 'consensus'
    const addPrimers = (
      label: string,
      group: 'primer' | 'oligo',
      selected: Primer[],
      sort: { mode: PrimerTabSortMode; direction: PrimerPaneSortDirection },
    ) => {
      if (!selected.length) return
      entries.push({
        kind: 'heading',
        key: `${prefix}:heading:${group}`,
        label: `${label} (${selected.length})`,
        memberId,
        level: 'subgroup',
        group,
      })
      for (const row of sortPrimerTabRows(
        selected.map((primer) => buildPrimerTabRow(sequence, primer, hybridization, warningsFor(primer))),
        sort.mode,
        sort.direction,
      )) {
        entries.push({ kind: 'primer', key: `${prefix}:primer:${row.primer.id}`, memberId, row })
      }
    }
    addPrimers('Regular primers', 'primer', primers.filter((primer) => !isSgRnaCloningOligo(primer)), primerSort)
    addPrimers('sgRNA cloning oligos', 'oligo', primers.filter(isSgRnaCloningOligo), oligoSort)
    const annotations = groupSgRNAFeatures(features)
    if (annotations.length) {
      entries.push({
        kind: 'heading',
        key: `${prefix}:heading:sgrna`,
        label: `sgRNAs (${annotations.length})`,
        memberId,
        level: 'subgroup',
        group: 'sgrna',
      })
      for (const annotation of sortSgRnaPaneAnnotations(annotations, sgRnaSort.mode, sgRnaSort.direction)) {
        entries.push({ kind: 'sgrna', key: `${prefix}:sgrna:${annotation.id}`, memberId, annotation })
      }
    }
  }
  if (!isDnaLibraryRecord(record)) {
    appendGroups(record.sequence, record.primers, record.features, null)
    return entries
  }
  if (record.primers.length || groupSgRNAFeatures(record.features).length) {
    entries.push({ kind: 'heading', key: 'heading:consensus', label: 'Consensus', memberId: null, level: 'document' })
    appendGroups(record.sequence, record.primers, record.features, null)
  }
  for (const member of members) {
    if (!(member.primers?.length || groupSgRNAFeatures(member.features ?? []).length)) continue
    entries.push({ kind: 'heading', key: `heading:${member.id}`, label: member.fileName, memberId: member.id, level: 'document' })
    appendGroups(member.sequence, member.primers ?? [], member.features ?? [], member.id)
  }
  return entries
}

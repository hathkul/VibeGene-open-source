import { createId, gcContent, normalizeDna } from './sequence'
import type { Primer, Strand } from './types'
import type { PrimerHybridizationParams } from './primerHybridization'
import type { SgRNAAnnotation } from './sgrna'
import { primerDescriptionForDisplay } from './sgrnaOligoPrimers'
import {
  primerConstructAnnealSequence,
  primerHasDisplayableBinding,
  resolveCandidateLayoutsForPrimer,
  resolveDisplayableLayoutsForPrimer,
} from './primerSequenceLayout'
import { calculateAnnealTemperature } from './primerThermodynamics'
import { primerDuplexTmForLayout, type PrimerDuplexTmResult } from './primerDuplexThermodynamics'

export type PrimerListEntry = {
  name: string
  sequence: string
  color?: string
  description?: string
}

export type PrimerImportCandidate = {
  id: string
  name: string
  sequence: string
  length: number
  start: number
  end: number
  strand: Strand
  tmC: number | null
  tmLabel: string
  gcPercent: number
  massDa: number
  alreadyPresent: boolean
  primer: Primer
}

/** Tab-separated primer export: name then sequence, one primer per line. */
export function exportPrimerDataTsv(primers: Primer[]): string {
  if (!primers.length) return ''
  return primers.map((primer) => `${primer.name}\t${primer.sequence}`).join('\n')
}

/** Tab-separated sgRNA export in the primer list format: guide name then spacer, one per line. */
export function exportSgRnaDataTsv(guides: readonly Pick<SgRNAAnnotation, 'guide' | 'spacer'>[]): string {
  return guides.map((entry) => `${entry.guide.name}\t${entry.spacer}`).join('\n')
}

/**
 * Parse name/sequence primer lists (tab-separated, one primer per line).
 * Also accepts a single space or comma between name and sequence when no tab is present,
 * unless `requireTab` is set (folder import / Sync to database use that for `.txt` files).
 *
 * With `requireTab`, each content line must be exactly `name<tab>sequence` (optional
 * trailing empty tab columns are allowed). The sequence column must be DNA letters only.
 */
export function parsePrimerDataTsv(
  text: string,
  options?: { requireTab?: boolean },
): PrimerListEntry[] {
  const requireTab = options?.requireTab === true
  const entries: PrimerListEntry[] = []
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/\r$/, '')
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue

    let name: string
    let sequence: string
    if (requireTab) {
      const parsed = parseStrictPrimerTabLine(line)
      if (!parsed) continue
      entries.push(parsed)
      continue
    }

    if (line.includes('\t')) {
      const tab = line.indexOf('\t')
      name = line.slice(0, tab).trim()
      sequence = line.slice(tab + 1).trim()
    } else {
      const match = line.match(/^(.+?)[\s,]+([A-Za-z]+)\s*$/)
      if (!match) continue
      name = match[1]!.trim()
      sequence = match[2]!.trim()
    }

    const normalized = normalizeDna(sequence)
    if (!name || !normalized) continue
    entries.push({ name, sequence: normalized })
  }
  return entries
}

/** Minimum oligo length for folder `.txt` primer lists (rejects feature/metadata false positives). */
const STRICT_PRIMER_TAB_MIN_LENGTH = 8

const STRICT_PRIMER_SEQUENCE = /^[ACGTRYSWKMBDHVNacgtryswkmbdhvn]+$/

/**
 * Strict primer list line: `name<tab>sequence` with DNA-only sequence column.
 * Extra non-empty columns (e.g. feature exports) are rejected.
 */
export function parseStrictPrimerTabLine(line: string): PrimerListEntry | null {
  if (!line.includes('\t')) return null
  const parts = line.replace(/\r$/, '').split('\t')
  const name = (parts[0] ?? '').trim()
  const sequenceRaw = (parts[1] ?? '').trim()
  if (!name || !sequenceRaw) return null
  if (parts.slice(2).some((part) => part.trim() !== '')) return null
  if (!STRICT_PRIMER_SEQUENCE.test(sequenceRaw)) return null
  if (sequenceRaw.length < STRICT_PRIMER_TAB_MIN_LENGTH) return null
  return { name, sequence: sequenceRaw.toUpperCase() }
}

/**
 * True when every non-empty, non-comment line is a strict `name<tab>sequence` primer row.
 * Used so folder import / Sync to database only treat real primer lists as Common primers.
 */
export function isPrimerListTabText(text: string): boolean {
  let contentLines = 0
  let primerLines = 0
  for (const rawLine of text.split(/\r?\n/)) {
    const trimmed = rawLine.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    contentLines += 1
    if (parseStrictPrimerTabLine(rawLine)) primerLines += 1
  }
  return contentLines > 0 && primerLines === contentLines
}

/** SnapGene-style binding range label: `123 .... 145`. */
export function formatPrimerBindingSite(start: number, end: number) {
  return `${start + 1} .... ${end}`
}

/** Approximate anhydrous ssDNA oligo mass (5′-OH), Daltons. */
export function dnaOligoMassDa(sequence: string): number {
  const normalized = normalizeDna(sequence)
  if (!normalized) return 0
  const masses: Record<string, number> = { A: 313.2, C: 289.2, G: 329.2, T: 304.2 }
  let mass = 0
  for (const base of normalized) {
    mass += masses[base] ?? 308.9
  }
  return mass - 61.0
}

function formatConstructTmLabel(tmC: number | null) {
  if (tmC === null || !Number.isFinite(tmC)) return '—'
  return `${tmC.toFixed(1)} °C`
}

export type PrimerTabSortMode =
  | 'name'
  | 'description'
  | 'length'
  | 'binding'
  | 'orientation'
  | 'tm'
  | 'gc'
  | 'mass'
  | 'sequence'
  | 'warnings'

export type PrimerTabRow = {
  primer: Primer
  length: number
  bindingLabel: string
  bindingStart: number
  strand: Strand | null
  tmC: number | null
  tmLabel: string
  duplexTm?: PrimerDuplexTmResult
  bindingIsCandidate?: boolean
  gcPercent: number
  massDa: number
  warnings: string
}

export function buildPrimerTabRow(
  template: string,
  primer: Primer,
  hybridization: PrimerHybridizationParams,
  warningsText: string,
): PrimerTabRow {
  const layouts = resolveDisplayableLayoutsForPrimer(template, primer, hybridization)
  const candidates = layouts.length ? [] : resolveCandidateLayoutsForPrimer(template, primer, hybridization)
  const best = pickBestLayout(template, layouts.length ? layouts : candidates)
  let tmC: number | null = null
  let tmLabel = '—'
  if (best) {
    const terminal = primerConstructAnnealSequence(template, best)
    const thermo = calculateAnnealTemperature(terminal)
    tmC = thermo.tmC ?? thermo.tmMinC
    tmLabel = formatConstructTmLabel(tmC !== null && Number.isFinite(tmC) ? tmC : null)
  }
  return {
    primer,
    length: primer.sequence.length,
    bindingLabel: layouts.length
      ? layouts.map((layout) => formatPrimerBindingSite(layout.templateStart, layout.templateEnd)).join(', ')
      : best ? `Candidate: ${formatPrimerBindingSite(best.templateStart, best.templateEnd)}` : '—',
    bindingStart: best?.templateStart ?? Number.POSITIVE_INFINITY,
    strand: best?.strand ?? null,
    tmC: tmC !== null && Number.isFinite(tmC) ? tmC : null,
    tmLabel,
    duplexTm: best ? primerDuplexTmForLayout(template, best, primer.sequence) : undefined,
    bindingIsCandidate: !layouts.length && !!best,
    gcPercent: gcContent(primer.sequence),
    massDa: dnaOligoMassDa(primer.sequence),
    warnings: [warningsText, !layouts.length && best ? 'Candidate site below display Tm threshold' : ''].filter(Boolean).join('; '),
  }
}

export function sortPrimerTabRows(
  rows: PrimerTabRow[],
  mode: PrimerTabSortMode,
  direction: 'asc' | 'desc',
): PrimerTabRow[] {
  const sign = direction === 'asc' ? 1 : -1
  return [...rows].sort((left, right) => {
    let cmp: number
    if (mode === 'name') cmp = left.primer.name.localeCompare(right.primer.name)
    else if (mode === 'description') cmp = primerDescriptionForDisplay(left.primer).localeCompare(primerDescriptionForDisplay(right.primer))
    else if (mode === 'length') cmp = left.length - right.length
    else if (mode === 'binding') cmp = left.bindingStart - right.bindingStart
    else if (mode === 'orientation') cmp = (left.strand ?? '').localeCompare(right.strand ?? '')
    else if (mode === 'tm') cmp = (left.tmC ?? -Infinity) - (right.tmC ?? -Infinity)
    else if (mode === 'gc') cmp = left.gcPercent - right.gcPercent
    else if (mode === 'mass') cmp = left.massDa - right.massDa
    else if (mode === 'sequence') cmp = left.primer.sequence.localeCompare(right.primer.sequence)
    else cmp = left.warnings.localeCompare(right.warnings)
    return sign * cmp || left.primer.name.localeCompare(right.primer.name)
  })
}

export function findPrimerSearchHits(primers: Primer[], query: string): string[] {
  const trimmed = query.trim()
  if (!trimmed) return []
  const nameNeedle = trimmed.toLowerCase()
  const sequenceNeedle = normalizeDna(trimmed)
  return primers
    .filter((primer) => {
      if (primer.name.toLowerCase().includes(nameNeedle)) return true
      if (sequenceNeedle && normalizeDna(primer.sequence).includes(sequenceNeedle)) return true
      return false
    })
    .map((primer) => primer.id)
}

function pickBestLayout(
  template: string,
  layouts: ReturnType<typeof resolveDisplayableLayoutsForPrimer>,
) {
  let best: (typeof layouts)[number] | null = null
  let bestTm = Number.NEGATIVE_INFINITY
  for (const layout of layouts) {
    const terminal = primerConstructAnnealSequence(template, layout)
    const thermo = calculateAnnealTemperature(terminal)
    const tm = thermo.tmC ?? thermo.tmMinC ?? Number.NEGATIVE_INFINITY
    if (
      tm > bestTm ||
      (tm === bestTm &&
        best &&
        (layout.templateStart < best.templateStart ||
          (layout.templateStart === best.templateStart && layout.strand === 'forward')))
    ) {
      best = layout
      bestTm = tm
    } else if (!best) {
      best = layout
      bestTm = tm
    }
  }
  return best
}

export type PrimerImportTemplateOptions = {
  /**
   * Extra DNA templates to accept a hit against (e.g. DNA library members).
   * Consensus remains `template`; a primer is kept if it anneals to consensus or any of these.
   */
  additionalTemplates?: readonly string[]
  /** Sequences already present on members (or other scopes) for alreadyPresent checks. */
  additionalExistingPrimers?: readonly Primer[]
}

function candidateFromHit(
  probe: Primer,
  entry: PrimerListEntry,
  hitTemplate: string,
  layouts: NonNullable<Primer['bindings']>,
  alreadyPresent: boolean,
): PrimerImportCandidate | null {
  const layout = pickBestLayout(hitTemplate, layouts)
  if (!layout) return null
  const terminal = primerConstructAnnealSequence(hitTemplate, layout)
  const thermo = calculateAnnealTemperature(terminal)
  const tmC = thermo.tmC ?? thermo.tmMinC
  return {
    id: probe.id,
    name: entry.name,
    sequence: entry.sequence,
    length: entry.sequence.length,
    start: layout.templateStart,
    end: layout.templateEnd,
    strand: layout.strand,
    tmC: tmC !== null && Number.isFinite(tmC) ? tmC : null,
    tmLabel: formatConstructTmLabel(tmC !== null && Number.isFinite(tmC) ? tmC : null),
    gcPercent: gcContent(entry.sequence),
    massDa: dnaOligoMassDa(entry.sequence),
    alreadyPresent,
    primer: { ...probe, bindings: layouts },
  }
}

export function resolvePrimerImportCandidates(
  template: string,
  entries: PrimerListEntry[],
  existingPrimers: Primer[],
  hybridization: PrimerHybridizationParams,
  options?: PrimerImportTemplateOptions,
): { candidates: PrimerImportCandidate[]; skipped: number } {
  const existingSequences = new Set(
    [...existingPrimers, ...(options?.additionalExistingPrimers ?? [])]
      .map((primer) => normalizeDna(primer.sequence))
      .filter(Boolean),
  )
  const extraTemplates = (options?.additionalTemplates ?? [])
    .map((sequence) => normalizeDna(sequence))
    .filter(Boolean)
  const candidates: PrimerImportCandidate[] = []
  let skipped = 0

  for (const entry of entries) {
    const probe: Primer = {
      id: createId('primer'),
      name: entry.name,
      sequence: entry.sequence,
      color: entry.color?.trim() || '#7c3aed',
      description: entry.description ?? '',
    }
    const alreadyPresent = existingSequences.has(normalizeDna(entry.sequence))
    const consensusLayouts = resolveDisplayableLayoutsForPrimer(template, probe, hybridization)
    if (consensusLayouts.length) {
      const candidate = candidateFromHit(probe, entry, template, consensusLayouts, alreadyPresent)
      if (candidate) {
        candidates.push(candidate)
        continue
      }
    }

    let memberHit: PrimerImportCandidate | null = null
    for (const memberTemplate of extraTemplates) {
      const layouts = resolveDisplayableLayoutsForPrimer(memberTemplate, probe, hybridization)
      if (!layouts.length) continue
      memberHit = candidateFromHit(probe, entry, memberTemplate, layouts, alreadyPresent)
      if (memberHit) break
    }
    if (memberHit) {
      // Consensus may not anneal (e.g. degenerate oligos vs synthetic consensus). Keep the oligo
      // without consensus bindings; members receive native anneals on distribute.
      candidates.push({
        ...memberHit,
        primer: { ...probe, bindings: undefined },
      })
      continue
    }
    skipped += 1
  }

  return { candidates, skipped }
}

/** Keep only primers that have a displayable anneal under the given hybridization rules. */
export function retainHybridizingPrimers(
  template: string,
  primers: Primer[],
  hybridization: PrimerHybridizationParams,
): { kept: Primer[]; dropped: number } {
  return retainHybridizingPrimersAgainstAny([template], primers, hybridization)
}

/**
 * Keep primers that anneal to at least one template (consensus and/or library members).
 * Consensus bindings are refreshed when the first template hits; otherwise bindings are cleared.
 */
export function retainHybridizingPrimersAgainstAny(
  templates: readonly string[],
  primers: Primer[],
  hybridization: PrimerHybridizationParams,
): { kept: Primer[]; dropped: number } {
  const normalized = templates.map((sequence) => normalizeDna(sequence)).filter(Boolean)
  const kept: Primer[] = []
  let dropped = 0
  for (const primer of primers) {
    let consensusLayouts: ReturnType<typeof resolveDisplayableLayoutsForPrimer> | undefined
    let anyHit = false
    for (let index = 0; index < normalized.length; index += 1) {
      const layouts = resolveDisplayableLayoutsForPrimer(normalized[index]!, primer, hybridization)
      if (!layouts.length) continue
      anyHit = true
      if (index === 0) consensusLayouts = layouts
      break
    }
    if (!anyHit) {
      dropped += 1
      continue
    }
    kept.push({
      ...primer,
      bindings: consensusLayouts?.length ? consensusLayouts : undefined,
    })
  }
  return { kept, dropped }
}

/** @deprecated Prefer resolvePrimerImportCandidates for the import dialog. */
export function primersFromListThatHybridize(
  template: string,
  entries: PrimerListEntry[],
  hybridization: PrimerHybridizationParams,
): { imported: Primer[]; skipped: number } {
  const imported: Primer[] = []
  let skipped = 0
  for (const entry of entries) {
    if (!primerHasDisplayableBinding(template, entry.sequence, hybridization)) {
      skipped += 1
      continue
    }
    imported.push({
      id: createId('primer'),
      name: entry.name,
      sequence: entry.sequence,
      color: '#7c3aed',
      description: '',
    })
  }
  return { imported, skipped }
}

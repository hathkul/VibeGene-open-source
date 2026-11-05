import { normalizeConstructProperties } from './constructProperties'
import { alignPrimerToTemplate, type PrimerAnnealResult } from './primerAnnealAlignment'
import {
  defaultPrimerHybridizationParams,
  normalizePrimerHybridizationParams,
  type PrimerHybridizationParams,
} from './primerHybridization'
import {
  buildPrimerFrameDisplay,
  hasDisplayablePrimerAnneal,
  primerConstructAnnealSequence,
  refreshExactPrimerBindings,
} from './primerSequenceLayout'
import { calculateAnnealTemperature } from './primerThermodynamics'
import {
  addOperation,
  applySequenceReplacementAnnotations,
  createId,
  normalizeDna,
  nowIso,
} from './sequence'
import { snapshotParentalHistoryNode } from './snapgeneHistoryExport'
import type {
  HistoryFeature,
  HistoryNode,
  Primer,
  PrimerBindingLayout,
  SequenceFeature,
  SequenceRecord,
} from './types'

export type MutagenesisStatus =
  | 'needs-primer'
  | 'no-anneal'
  | 'five-prime'
  | 'no-mismatch'
  | 'ready'

export type MutagenesisPrimerGlyph = {
  char: string
  role: 'match' | 'mismatch' | 'insert'
}

export type MutagenesisAnalysis = {
  oligo: string
  primerName: string
  anneal: PrimerAnnealResult
  /** Primer bases 5′→3′ for the oligo picker strip. */
  glyphs: MutagenesisPrimerGlyph[]
  fivePrimeAnneals: boolean
  mismatchCount: number
  deletedBp: number
  insertedBp: number
  annealedCount: number
  tmC: number | null
  status: MutagenesisStatus
  message: string
  detailLines: string[]
}

/** True when the written oligo's 5′ base is part of the annealed duplex. */
function fivePrimeAnneals(mask: boolean[]) {
  return mask.length > 0 && mask[0] === true
}

function buildGlyphs(
  template: string,
  layout: PrimerBindingLayout,
  oligo: string,
  primerName: string,
): MutagenesisPrimerGlyph[] {
  const primer: Primer = {
    id: 'mutagenesis-analysis',
    name: primerName,
    sequence: oligo,
    color: '#7c3aed',
    bindings: [layout],
  }
  const display = buildPrimerFrameDisplay(primer, template, layout)
  return display.glyphs
    .filter((glyph) => glyph.kind !== 'template-gap')
    .map((glyph) => {
      if (glyph.kind === 'annealed') {
        return { char: glyph.char.toLowerCase(), role: 'match' as const }
      }
      if (glyph.kind === 'mismatch') {
        return { char: glyph.char.toUpperCase(), role: 'mismatch' as const }
      }
      return { char: glyph.char.toUpperCase(), role: 'insert' as const }
    })
}

/**
 * Count only mutagenized bases: substitutions, template deletions, and internal inserts.
 * Terminal 5′/3′ adapter overhangs are excluded.
 */
function countMutagenicChanges(
  template: string,
  layout: PrimerBindingLayout,
  oligo: string,
  primerName: string,
): { mismatchCount: number; deletedBp: number; insertedBp: number } {
  const primer: Primer = {
    id: 'mutagenesis-changes',
    name: primerName,
    sequence: oligo,
    color: '#7c3aed',
    bindings: [layout],
  }
  const glyphs = buildPrimerFrameDisplay(primer, template, layout).glyphs
  let firstDuplex = -1
  let lastDuplex = -1
  for (let index = 0; index < glyphs.length; index += 1) {
    const kind = glyphs[index]!.kind
    if (kind === 'annealed' || kind === 'mismatch') {
      if (firstDuplex < 0) firstDuplex = index
      lastDuplex = index
    }
  }
  if (firstDuplex < 0) return { mismatchCount: 0, deletedBp: 0, insertedBp: 0 }

  let mismatchCount = 0
  let deletedBp = 0
  let insertedBp = 0
  for (let index = firstDuplex; index <= lastDuplex; index += 1) {
    const kind = glyphs[index]!.kind
    if (kind === 'mismatch') mismatchCount += 1
    else if (kind === 'template-gap') deletedBp += 1
    else if (kind === 'overhang') insertedBp += 1
  }
  return { mismatchCount, deletedBp, insertedBp }
}

function hasAnnealedFlanks(layout: PrimerBindingLayout, glyphs: MutagenesisPrimerGlyph[]) {
  if (glyphs.length === 0) return false
  const firstMismatch = glyphs.findIndex((glyph) => glyph.role !== 'match')
  if (firstMismatch < 0) return false
  let lastMismatch = -1
  for (let index = glyphs.length - 1; index >= 0; index -= 1) {
    if (glyphs[index]!.role !== 'match') {
      lastMismatch = index
      break
    }
  }
  const leftFlank = glyphs.slice(0, firstMismatch).some((glyph) => glyph.role === 'match')
  const rightFlank = glyphs.slice(lastMismatch + 1).some((glyph) => glyph.role === 'match')
  const annealed = layout.components.filter((component) => component.templateStart !== undefined)
  if (annealed.length >= 2 && layout.components.some((component) => component.templateStart === undefined)) {
    return true
  }
  return leftFlank && rightFlank
}

function annealResultFromPreferredLayout(
  template: string,
  oligo: string,
  preferredLayout: PrimerBindingLayout,
): PrimerAnnealResult | null {
  const aligned = alignPrimerToTemplate(template, oligo, preferredLayout.strand)
  if (!aligned) return null
  const terminalSequence =
    primerConstructAnnealSequence(template, preferredLayout) || aligned.terminalSequence
  return {
    layout: preferredLayout,
    // Mask is always oligo 5′→3′ from the aligner — correct even when reverse component
    // order is template-ascending (where components[0] is the 3′ end).
    mask: aligned.mask,
    annealedCount: aligned.mask.filter(Boolean).length,
    terminalSequence,
    score: aligned.score,
  }
}

function pickBestAnneal(
  template: string,
  oligo: string,
  preferredLayout: PrimerBindingLayout | null | undefined,
  hybridization: PrimerHybridizationParams,
): PrimerAnnealResult | null {
  const params = normalizePrimerHybridizationParams(hybridization)
  // Prefer the construct's stored binding so the sequence pane matches the main window.
  if (preferredLayout && hasDisplayablePrimerAnneal(template, preferredLayout, params)) {
    const fromPreferred = annealResultFromPreferredLayout(template, oligo, preferredLayout)
    if (fromPreferred) return fromPreferred
  }
  if (preferredLayout) {
    const preferred = alignPrimerToTemplate(template, oligo, preferredLayout.strand)
    if (preferred && hasDisplayablePrimerAnneal(template, preferred.layout, params)) return preferred
  }
  const forward = alignPrimerToTemplate(template, oligo, 'forward')
  const reverse = alignPrimerToTemplate(template, oligo, 'reverse')
  const candidates = [forward, reverse].filter((entry): entry is PrimerAnnealResult => Boolean(entry))
  const displayable = candidates.filter((entry) =>
    hasDisplayablePrimerAnneal(template, entry.layout, params),
  )
  const pool = displayable.length > 0 ? displayable : candidates
  if (pool.length === 0) return null
  return pool.reduce((best, entry) => (entry.score > best.score ? entry : best))
}

/**
 * Analyze whether an oligo (construct primer or linear PCR product) can mutagenize
 * the template: 5′ must anneal, mutagenic changes sit between annealed flanks.
 */
export function analyzeMutagenesis(
  template: SequenceRecord,
  oligo: string,
  primerName = 'Mutagenic primer',
  preferredLayout?: PrimerBindingLayout | null,
  hybridization: PrimerHybridizationParams = defaultPrimerHybridizationParams,
): MutagenesisAnalysis | null {
  const sequence = normalizeDna(oligo)
  if (!sequence) return null

  const anneal = pickBestAnneal(template.sequence, sequence, preferredLayout, hybridization)
  if (!anneal) {
    return {
      oligo: sequence,
      primerName,
      anneal: {
        layout: {
          strand: 'forward',
          templateStart: 0,
          templateEnd: 0,
          components: [{ primerBases: sequence }],
        },
        mask: sequence.split('').map(() => false),
        annealedCount: 0,
        terminalSequence: '',
        score: 0,
      },
      glyphs: sequence.split('').map((char) => ({ char: char.toLowerCase(), role: 'match' as const })),
      fivePrimeAnneals: false,
      mismatchCount: 0,
      deletedBp: 0,
      insertedBp: 0,
      annealedCount: 0,
      tmC: null,
      status: 'no-anneal',
      message: 'The primer does not anneal to the template.',
      detailLines: [],
    }
  }

  const glyphs = buildGlyphs(template.sequence, anneal.layout, sequence, primerName)
  const fivePrimeOk = fivePrimeAnneals(anneal.mask)
  const changes = countMutagenicChanges(template.sequence, anneal.layout, sequence, primerName)
  const flanksOk = hasAnnealedFlanks(anneal.layout, glyphs)
  const tm = calculateAnnealTemperature(anneal.terminalSequence || sequence)
  const changeCount = changes.mismatchCount + changes.deletedBp + changes.insertedBp

  let status: MutagenesisStatus
  let message: string
  const detailLines: string[] = []

  if (!fivePrimeOk) {
    status = 'five-prime'
    message = "The 5′ end of the primer must anneal to the matrix."
  } else if (changeCount <= 0) {
    status = 'no-mismatch'
    message = 'No mutagenesis will occur — no mismatches in primer.'
  } else if (!flanksOk) {
    status = 'no-anneal'
    message = 'Mutagenic bases must be flanked by annealed primer arms.'
  } else {
    status = 'ready'
    message = 'Ready to Mutagenize'
    if (changes.deletedBp > 0) {
      detailLines.push(`${changes.deletedBp.toLocaleString()} bp will be deleted`)
    }
    if (changes.insertedBp > 0) {
      detailLines.push(`${changes.insertedBp.toLocaleString()} bp will be inserted`)
    }
  }

  return {
    oligo: sequence,
    primerName,
    anneal,
    glyphs,
    fivePrimeAnneals: fivePrimeOk,
    mismatchCount: changes.mismatchCount,
    deletedBp: changes.deletedBp,
    insertedBp: changes.insertedBp,
    annealedCount: anneal.annealedCount,
    tmC: tm.tmC,
    status,
    message,
    detailLines,
  }
}

function topStrandReplacement(layout: PrimerBindingLayout) {
  // Forward components store top-strand bases; reverse components are already RC'd to top strand.
  return normalizeDna(layout.components.map((component) => component.primerBases).join(''))
}

function spliceCircular(sequence: string, start: number, end: number, insertion: string) {
  const length = sequence.length
  if (length <= 0) return insertion
  const s = ((start % length) + length) % length
  const e = ((end % length) + length) % length
  if (s <= e) return sequence.slice(0, s) + insertion + sequence.slice(e)
  // Wrap-around replacement: drop suffix from s and prefix before e.
  return insertion + sequence.slice(e, s)
}

function historyFileName(name: string) {
  return name.toLowerCase().endsWith('.dna') ? name : `${name}.dna`
}

function historyFeaturesFromProduct(features: SequenceFeature[]): HistoryFeature[] {
  return features.map((feature) => ({
    name: feature.name,
    type: feature.type,
    color: feature.color,
    strand: feature.locations[0]?.strand ?? 'forward',
    segments: feature.locations.map((location) => ({ start: location.start, end: location.end })),
  }))
}

function parentalHistoryNode(record: SequenceRecord): HistoryNode {
  return snapshotParentalHistoryNode(record)
}

/**
 * Apply the mutagenic oligo to the template: replace the annealed template span with
 * the primer-encoded top-strand sequence (mismatches and indels included).
 */
export function assembleMutagenesisProduct(input: {
  template: SequenceRecord
  analysis: MutagenesisAnalysis
  productName: string
  constructOverrides?: Partial<SequenceRecord['construct']>
}): SequenceRecord {
  const { template, analysis, productName } = input
  const layout = analysis.anneal.layout
  const start = layout.templateStart
  const end = layout.templateEnd
  const insertion = topStrandReplacement(layout)
  const circular = template.topology !== 'linear'

  let nextSequence: string
  if (circular && (start > end || (start === end && insertion.length !== 0 && end === 0))) {
    nextSequence = spliceCircular(template.sequence, start, end, insertion)
  } else if (circular && start > end) {
    nextSequence = spliceCircular(template.sequence, start, end, insertion)
  } else {
    nextSequence = template.sequence.slice(0, start) + insertion + template.sequence.slice(end)
  }
  nextSequence = normalizeDna(nextSequence)

  const annotations = applySequenceReplacementAnnotations(
    template,
    start,
    circular && start > end ? template.sequence.length : end,
    insertion.length,
  )
  // Wrap-around edits are rare for mutagenesis primers; feature shifting above covers the
  // common non-wrapping case. For wrap-around, fall back to parental features unchanged
  // when start > end on a circular molecule.
  const features =
    circular && start > end
      ? template.features
      : annotations.features
  const primers =
    circular && start > end
      ? template.primers
      : annotations.primers

  const name = productName.replace(/\.dna$/i, '') || 'Mutagenized'
  let record: SequenceRecord = {
    id: createId('seq'),
    name,
    description: 'Site-directed mutagenesis product',
    molecule: 'dna',
    topology: template.topology,
    sequence: nextSequence,
    features,
    primers: refreshExactPrimerBindings(primers, nextSequence),
    operations: [],
    dnaEnds: template.dnaEnds,
    construct: normalizeConstructProperties({
      ...template.construct,
      syntheticDna: true,
      ...input.constructOverrides,
    }),
    createdAt: nowIso(),
    updatedAt: nowIso(),
  }

  const history: HistoryNode = {
    id: createId('history'),
    name: historyFileName(name),
    seqLen: record.sequence.length,
    circular: record.topology === 'circular',
    operation: 'mutate',
    resurrectable: false,
    hideHistory: false,
    oligos: [{ name: analysis.primerName, sequence: analysis.oligo }],
    regeneratedSites: [],
    inputSummaries: [
      {
        manipulation: 'mutate',
        name1: analysis.primerName,
        val1: String(start + 1),
        val2: String(Math.max(start + 1, end)),
      },
    ],
    features: historyFeaturesFromProduct(record.features),
    sequence: record.sequence,
    primers: record.primers,
    children: [parentalHistoryNode(template)],
  }
  record = { ...record, history }
  return addOperation(
    record,
    'mutagenesis',
    `${analysis.message}${analysis.detailLines.length ? ` (${analysis.detailLines.join('; ')})` : ''}`,
  )
}

/** Preview record used in the mutagenesis dialog sequence pane. */
export function mutagenesisPreviewRecord(
  template: SequenceRecord,
  analysis: MutagenesisAnalysis,
): SequenceRecord {
  const primer: Primer = {
    id: 'mutagenesis-primer',
    name: analysis.primerName,
    sequence: analysis.oligo,
    color: '#7c3aed',
    bindings: analysis.annealedCount > 0 ? [analysis.anneal.layout] : [],
    visible: true,
  }
  return {
    ...template,
    id: `${template.id}-mutagenesis-preview`,
    // Sequence pane should show only the current mutagenic oligo / PCR fragment.
    primers: [primer],
  }
}

import type {
  DnaEndModification,
  DnaEnds,
  DnaEndsProvenance,
  DnaEndState,
  SequenceFeature,
  SequenceRecord,
  Strand,
} from './types'
import { complementDnaBase, createId, nowIso, reverseComplement, sanitizeDna } from './sequence'

export type { DnaEndModification, DnaEnds, DnaEndState }

export type DnaEndSide = 'upstream' | 'downstream'

export type DnaTerminalEndDetail = {
  side: DnaEndSide
  provenance: DnaEndsProvenance | 'not-recorded'
  polarity: "5'" | "3'" | 'blunt' | 'unknown'
  length: number | null
  protrudingStrand: 'top' | 'bottom' | null
  /** Sequence of the protruding physical strand, written 5′→3′. */
  bases5to3: string | null
  modification: DnaEndModification | null
  enzymeName: string | null
}

/** SnapGene stores overhang bases in the top sequence, even when only the bottom strand protrudes. */
export function dnaTerminalEndDetail(
  record: Pick<SequenceRecord, 'sequence' | 'dnaEnds' | 'dnaEndsProvenance'>,
  side: DnaEndSide,
): DnaTerminalEndDetail {
  const provenance = record.dnaEndsProvenance ?? 'not-recorded'
  const state = provenance !== 'not-recorded' ? record.dnaEnds?.[side] : undefined
  if (!state) return {
    side, provenance: 'not-recorded', polarity: 'unknown', length: null,
    protrudingStrand: null, bases5to3: null, modification: null, enzymeName: null,
  }
  const length = Math.abs(Math.trunc(state.stickiness))
  const polarity = state.stickiness > 0 ? "5'" : state.stickiness < 0 ? "3'" : 'blunt'
  const protrudingStrand = length === 0 ? null
    : side === 'upstream'
      ? state.stickiness > 0 ? 'top' : 'bottom'
      : state.stickiness > 0 ? 'bottom' : 'top'
  const sequence = record.sequence.toUpperCase()
  const terminal = side === 'upstream' ? sequence.slice(0, length) : sequence.slice(-length)
  const bases5to3 = length === 0 ? null
    : length <= sequence.length && /^[ACGT]+$/.test(terminal)
      ? protrudingStrand === 'top' ? terminal : reverseComplement(terminal)
      : null
  return {
    side, provenance, polarity, length, protrudingStrand, bases5to3,
    modification: state.modification, enzymeName: state.enzymeName ?? null,
  }
}

export const DNA_ENDS_TERMINAL_BASES = 20

const SNAPGENE_MODIFICATION: Record<DnaEndModification, string> = {
  unmodified: 'Unmodified',
  fivePrimePhosphorylated: 'FivePrimePhosphorylated',
  covalentlyClosed: 'CovalentlyClosed',
}

const FROM_SNAPGENE_MODIFICATION: Record<string, DnaEndModification> = {
  Unmodified: 'unmodified',
  FivePrimePhosphorylated: 'fivePrimePhosphorylated',
  CovalentlyClosed: 'covalentlyClosed',
}

export function defaultDnaEnds(): DnaEnds {
  return {
    upstream: { modification: 'fivePrimePhosphorylated', stickiness: 0 },
    downstream: { modification: 'fivePrimePhosphorylated', stickiness: 0 },
  }
}

export function normalizeDnaEnds(ends?: DnaEnds | null): DnaEnds {
  const fallback = defaultDnaEnds()
  if (!ends) return fallback
  return {
    upstream: normalizeDnaEndState(ends.upstream, fallback.upstream),
    downstream: normalizeDnaEndState(ends.downstream, fallback.downstream),
  }
}

function normalizeDnaEndState(state: DnaEndState | undefined, fallback: DnaEndState): DnaEndState {
  if (!state) return { ...fallback }
  const modification =
    state.modification === 'unmodified' ||
    state.modification === 'fivePrimePhosphorylated' ||
    state.modification === 'covalentlyClosed'
      ? state.modification
      : fallback.modification
  const stickiness = Number.isFinite(state.stickiness) ? Math.trunc(state.stickiness) : 0
  const enzymeName = state.enzymeName?.trim() || undefined
  return { modification, stickiness, ...(enzymeName ? { enzymeName } : {}) }
}

export function resolveDnaEnds(record: Pick<SequenceRecord, 'dnaEnds'>): DnaEnds {
  return normalizeDnaEnds(record.dnaEnds)
}

export function hasNonDefaultDnaEnds(ends: DnaEnds): boolean {
  return [ends.upstream, ends.downstream].some((side) =>
    side.stickiness !== 0 || side.modification !== 'fivePrimePhosphorylated' || Boolean(side.enzymeName))
}

/** Sequence-pane edits retain imported chemistry only when the recorded terminal overhangs survive unchanged. */
export function dnaEndsProvenanceAfterSequenceReplacement(
  record: Pick<SequenceRecord, 'sequence' | 'dnaEnds' | 'dnaEndsProvenance'>,
  replaceStart: number,
  replaceEnd: number,
  insertedLength: number,
  nextEnds: DnaEnds,
): DnaEndsProvenance | undefined {
  const source = record.dnaEndsProvenance
  if (!source) return undefined
  const previous = resolveDnaEnds(record)
  if (previous.upstream.stickiness !== nextEnds.upstream.stickiness
    || previous.downstream.stickiness !== nextEnds.downstream.stickiness) return 'user-defined'
  const leftLength = Math.abs(previous.upstream.stickiness)
  const rightLength = Math.abs(previous.downstream.stickiness)
  const length = record.sequence.length
  const touchesLeft = leftLength > 0 && replaceStart < leftLength
    && (replaceEnd > 0 || insertedLength > 0)
  const touchesRight = rightLength > 0 && (
    (replaceEnd > length - rightLength && replaceStart < length)
    || (insertedLength > 0 && replaceStart >= length - rightLength && replaceStart <= length)
  )
  return touchesLeft || touchesRight ? 'user-defined' : source
}

export function parseSnapGeneModification(value: string | null | undefined): DnaEndModification {
  if (!value) return 'fivePrimePhosphorylated'
  return FROM_SNAPGENE_MODIFICATION[value] ?? 'fivePrimePhosphorylated'
}

export function parseSnapGeneStickiness(value: string | null | undefined): number {
  const parsed = Number.parseInt(value ?? '0', 10)
  return Number.isFinite(parsed) ? parsed : 0
}

/** A block 8 packet may contain other properties without documenting both physical DNA ends. */
export function snapGeneBlock8HasExplicitDnaEnds(xml: string): boolean {
  return /<UpstreamStickiness>-?\d+<\/UpstreamStickiness>/.test(xml)
    && /<DownstreamStickiness>-?\d+<\/DownstreamStickiness>/.test(xml)
    && /<UpstreamModification>(?:Unmodified|FivePrimePhosphorylated|CovalentlyClosed)<\/UpstreamModification>/.test(xml)
    && /<DownstreamModification>(?:Unmodified|FivePrimePhosphorylated|CovalentlyClosed)<\/DownstreamModification>/.test(xml)
}

export function parseSnapGeneBlock8DnaEnds(xml: string): DnaEnds {
  const upstreamMod = xml.match(/<UpstreamModification>([^<]*)<\/UpstreamModification>/)?.[1]
  const downstreamMod = xml.match(/<DownstreamModification>([^<]*)<\/DownstreamModification>/)?.[1]
  const upstreamStickiness = xml.match(/<UpstreamStickiness>(-?\d+)<\/UpstreamStickiness>/)?.[1]
  const downstreamStickiness = xml.match(/<DownstreamStickiness>(-?\d+)<\/DownstreamStickiness>/)?.[1]
  const upstreamEnzyme = xml.match(/<UpstreamEnzymeName>([^<]*)<\/UpstreamEnzymeName>/)?.[1]
  const downstreamEnzyme = xml.match(/<DownstreamEnzymeName>([^<]*)<\/DownstreamEnzymeName>/)?.[1]
  return normalizeDnaEnds({
    upstream: {
      modification: parseSnapGeneModification(upstreamMod),
      stickiness: parseSnapGeneStickiness(upstreamStickiness),
      enzymeName: upstreamEnzyme?.trim() || undefined,
    },
    downstream: {
      modification: parseSnapGeneModification(downstreamMod),
      stickiness: parseSnapGeneStickiness(downstreamStickiness),
      enzymeName: downstreamEnzyme?.trim() || undefined,
    },
  })
}

export function exportSnapGeneBlock8Xml(ends: DnaEnds): string {
  const normalized = normalizeDnaEnds(ends)
  const parts = ['<AdditionalSequenceProperties>']
  if (normalized.upstream.enzymeName) {
    parts.push(`<UpstreamEnzymeName>${normalized.upstream.enzymeName}</UpstreamEnzymeName>`)
  }
  if (normalized.downstream.enzymeName) {
    parts.push(`<DownstreamEnzymeName>${normalized.downstream.enzymeName}</DownstreamEnzymeName>`)
  }
  parts.push(
    `<UpstreamStickiness>${normalized.upstream.stickiness}</UpstreamStickiness>`,
    `<DownstreamStickiness>${normalized.downstream.stickiness}</DownstreamStickiness>`,
    `<UpstreamModification>${SNAPGENE_MODIFICATION[normalized.upstream.modification]}</UpstreamModification>`,
    `<DownstreamModification>${SNAPGENE_MODIFICATION[normalized.downstream.modification]}</DownstreamModification>`,
    '</AdditionalSequenceProperties>',
  )
  return parts.join('')
}

export function modificationLabel(modification: DnaEndModification): string {
  switch (modification) {
    case 'unmodified':
      return 'Unmodified'
    case 'fivePrimePhosphorylated':
      return "5' Phosphorylated"
    case 'covalentlyClosed':
      return 'Covalently Closed'
  }
}

/**
 * Whether a base at `position` should render on `strand` given sticky ends.
 * Overhang bases remain in the sequence string; stickiness only hides one strand.
 */
export function isDnaEndBaseVisible(
  position: number,
  strand: Strand,
  ends: DnaEnds,
  sequenceLength: number,
): boolean {
  if (sequenceLength <= 0 || position < 0 || position >= sequenceLength) return false
  const upstreamAbs = Math.abs(ends.upstream.stickiness)
  if (upstreamAbs > 0 && position < upstreamAbs) {
    // Upstream +N: 5′ overhang (top protrudes). Upstream −N: 3′ overhang (bottom protrudes).
    return ends.upstream.stickiness > 0 ? strand === 'forward' : strand === 'reverse'
  }
  const downstreamAbs = Math.abs(ends.downstream.stickiness)
  if (downstreamAbs > 0 && position >= sequenceLength - downstreamAbs) {
    // Downstream +N: 5′ overhang (bottom protrudes at right). Downstream −N: 3′ (top protrudes).
    return ends.downstream.stickiness > 0 ? strand === 'reverse' : strand === 'forward'
  }
  return true
}

/** Contiguous bp ranges where `strand` is present given sticky-end overhangs. */
export function dnaStrandVisibleRanges(
  strand: Strand,
  ends: DnaEnds,
  sequenceLength: number,
): Array<{ start: number; end: number }> {
  if (sequenceLength <= 0) return []
  const ranges: Array<{ start: number; end: number }> = []
  let runStart: number | null = null
  for (let position = 0; position < sequenceLength; position += 1) {
    const visible = isDnaEndBaseVisible(position, strand, ends, sequenceLength)
    if (visible) {
      if (runStart == null) runStart = position
      continue
    }
    if (runStart != null) {
      ranges.push({ start: runStart, end: position })
      runStart = null
    }
  }
  if (runStart != null) ranges.push({ start: runStart, end: sequenceLength })
  return ranges
}

export function terminalRange(
  side: DnaEndSide,
  sequenceLength: number,
  count = DNA_ENDS_TERMINAL_BASES,
): { start: number; end: number } {
  if (sequenceLength <= 0) return { start: 0, end: 0 }
  const width = Math.min(count, sequenceLength)
  if (side === 'upstream') return { start: 0, end: width }
  return { start: sequenceLength - width, end: sequenceLength }
}

export type DnaEndsEditorSelection = {
  side: DnaEndSide
  strand: Strand
  start: number
  end: number
}

export type DnaEndsEditorDraft = {
  sequence: string
  features: SequenceFeature[]
  dnaEnds: DnaEnds
  selection: DnaEndsEditorSelection | null
}

function clampStickiness(value: number, sequenceLength: number): number {
  if (sequenceLength <= 0) return 0
  const max = Math.max(0, sequenceLength)
  return Math.max(-max, Math.min(max, Math.trunc(value)))
}

function shiftFeatures(features: SequenceFeature[], insertAt: number, delta: number): SequenceFeature[] {
  if (delta === 0) return features
  return features.map((feature) => ({
    ...feature,
    locations: feature.locations.map((location) => {
      let { start, end } = location
      if (start >= insertAt) start += delta
      if (end > insertAt) end += delta
      if (end < start) end = start
      return { ...location, start: Math.max(0, start), end: Math.max(0, end) }
    }),
  }))
}

/** Add a single 3′ base at the chosen DNA end (SnapGene “Add a single 3′”). */
export function addThreePrimeBase(draft: DnaEndsEditorDraft, side: DnaEndSide, base: string): DnaEndsEditorDraft {
  const letter = sanitizeDna(base).slice(0, 1).toUpperCase()
  if (!letter || !/^[ACGT]$/i.test(letter)) return draft
  const dnaEnds = normalizeDnaEnds(draft.dnaEnds)

  if (side === 'upstream') {
    // Bottom-strand 3′ (left): store top-strand complement so reverse display shows `letter`.
    const topBase = complementDnaBase(letter)
    const sequence = topBase + draft.sequence
    const stickiness = dnaEnds.upstream.stickiness
    const nextStickiness = clampStickiness(stickiness > 0 ? -1 : stickiness - 1, sequence.length)
    return {
      sequence,
      features: shiftFeatures(draft.features, 0, 1),
      dnaEnds: {
        ...dnaEnds,
        upstream: { ...dnaEnds.upstream, stickiness: nextStickiness },
      },
      selection: null,
    }
  }

  const sequence = draft.sequence + letter
  const stickiness = dnaEnds.downstream.stickiness
  const nextStickiness = clampStickiness(stickiness > 0 ? -1 : stickiness - 1, sequence.length)
  return {
    sequence,
    features: draft.features,
    dnaEnds: {
      ...dnaEnds,
      downstream: { ...dnaEnds.downstream, stickiness: nextStickiness },
    },
    selection: null,
  }
}

function selectionTouchesSide(selection: DnaEndsEditorSelection, sequenceLength: number): DnaEndSide | null {
  const upstream = terminalRange('upstream', sequenceLength)
  const downstream = terminalRange('downstream', sequenceLength)
  const overlapsUpstream = selection.start < upstream.end && selection.end > upstream.start
  const overlapsDownstream = selection.start < downstream.end && selection.end > downstream.start
  if (selection.side === 'upstream' && overlapsUpstream) return 'upstream'
  if (selection.side === 'downstream' && overlapsDownstream) return 'downstream'
  if (overlapsUpstream && !overlapsDownstream) return 'upstream'
  if (overlapsDownstream && !overlapsUpstream) return 'downstream'
  return selection.side
}

/**
 * Desired signed stickiness after hiding `strand` for `overhangLen` bases from a blunt end.
 * Upstream: forward → negative (3′ overhang). Downstream: forward → positive (5′ overhang).
 */
function stickinessForStrandHide(side: DnaEndSide, strand: Strand, overhangLen: number): number {
  if (side === 'upstream') return strand === 'forward' ? -overhangLen : overhangLen
  return strand === 'forward' ? overhangLen : -overhangLen
}

/** Which strand is currently protruding at this end, or null if blunt. */
function protrudingStrand(side: DnaEndSide, stickiness: number): Strand | null {
  if (stickiness === 0) return null
  if (side === 'upstream') return stickiness > 0 ? 'forward' : 'reverse'
  return stickiness > 0 ? 'reverse' : 'forward'
}

function removeUpstreamBases(draft: DnaEndsEditorDraft, removeCount: number, nextUpstreamStickiness: number): DnaEndsEditorDraft {
  const dnaEnds = normalizeDnaEnds(draft.dnaEnds)
  if (removeCount <= 0) {
    return {
      ...draft,
      dnaEnds: {
        ...dnaEnds,
        upstream: {
          ...dnaEnds.upstream,
          stickiness: clampStickiness(nextUpstreamStickiness, draft.sequence.length),
        },
      },
      selection: draft.selection ? { ...draft.selection, start: 0, end: 0 } : null,
    }
  }
  const sequence = draft.sequence.slice(removeCount)
  return {
    sequence,
    features: shiftFeatures(draft.features, 0, -removeCount)
      .map((feature) => ({
        ...feature,
        locations: feature.locations.filter((location) => location.end > location.start),
      }))
      .filter((feature) => feature.locations.length > 0),
    dnaEnds: {
      ...dnaEnds,
      upstream: {
        ...dnaEnds.upstream,
        stickiness: clampStickiness(nextUpstreamStickiness, sequence.length),
      },
    },
    selection: draft.selection ? { ...draft.selection, start: 0, end: 0 } : null,
  }
}

function removeDownstreamBases(
  draft: DnaEndsEditorDraft,
  removeCount: number,
  nextDownstreamStickiness: number,
): DnaEndsEditorDraft {
  const length = draft.sequence.length
  const dnaEnds = normalizeDnaEnds(draft.dnaEnds)
  if (removeCount <= 0) {
    return {
      ...draft,
      dnaEnds: {
        ...dnaEnds,
        downstream: {
          ...dnaEnds.downstream,
          stickiness: clampStickiness(nextDownstreamStickiness, length),
        },
      },
      selection: draft.selection
        ? { ...draft.selection, start: length, end: length }
        : null,
    }
  }
  const newLength = length - removeCount
  const sequence = draft.sequence.slice(0, newLength)
  return {
    sequence,
    features: draft.features
      .map((feature) => ({
        ...feature,
        locations: feature.locations
          .map((location) => {
            if (location.start >= newLength) return { ...location, start: newLength, end: newLength }
            return {
              ...location,
              end: Math.min(location.end, newLength),
            }
          })
          .filter((location) => location.end > location.start),
      }))
      .filter((feature) => feature.locations.length > 0),
    dnaEnds: {
      ...dnaEnds,
      downstream: {
        ...dnaEnds.downstream,
        stickiness: clampStickiness(nextDownstreamStickiness, sequence.length),
      },
    },
    selection: draft.selection
      ? {
          ...draft.selection,
          start: sequence.length,
          end: sequence.length,
        }
      : null,
  }
}

/**
 * Hide selected bases on one strand from that base through the pane terminus.
 * Deleting the protruding overhang removes sequence bases (never flips stickiness to
 * resurrect the previously hidden strand). Upstream and downstream overhangs are independent.
 */
export function deleteSingleStrand(draft: DnaEndsEditorDraft): DnaEndsEditorDraft {
  const selection = draft.selection
  if (!selection || selection.end <= selection.start) return draft
  const length = draft.sequence.length
  const side = selection.side || selectionTouchesSide(selection, length)
  if (!side) return draft
  const term = terminalRange(side, length)
  if (selection.end <= term.start || selection.start >= term.end) return draft
  const dnaEnds = normalizeDnaEnds(draft.dnaEnds)

  if (side === 'upstream') {
    // From the selected base through the left terminus.
    const wantLen = Math.min(length, Math.max(1, selection.end))
    const current = dnaEnds.upstream.stickiness
    const abs = Math.abs(current)
    const protruding = protrudingStrand('upstream', current)

    if (current === 0) {
      return {
        ...draft,
        dnaEnds: {
          ...dnaEnds,
          upstream: {
            ...dnaEnds.upstream,
            stickiness: clampStickiness(stickinessForStrandHide('upstream', selection.strand, wantLen), length),
          },
        },
        selection: { ...selection, start: 0, end: 0 },
      }
    }

    if (protruding !== selection.strand) {
      // Recessed strand: only extend how far it is hidden (through the terminus).
      const nextLen = Math.max(abs, wantLen)
      return {
        ...draft,
        dnaEnds: {
          ...dnaEnds,
          upstream: {
            ...dnaEnds.upstream,
            stickiness: clampStickiness(stickinessForStrandHide('upstream', selection.strand, nextLen), length),
          },
        },
        selection: { ...selection, start: 0, end: 0 },
      }
    }

    // Protruding strand: remove tip bases through the selection.
    // wantLen is the count from the terminus through the selection.
    if (wantLen < abs) {
      // Trim tip only; keep the remaining overhang.
      return removeUpstreamBases(draft, wantLen, Math.sign(current) * (abs - wantLen))
    }
    if (wantLen === abs) {
      // Remove the entire ss overhang → blunt.
      return removeUpstreamBases(draft, abs, 0)
    }
    // Deleting further into duplex: remove the ss overhang DNA, then hide this strand
    // for the extra bases so an overhang remains (difference of the two deletions).
    return removeUpstreamBases(
      draft,
      abs,
      stickinessForStrandHide('upstream', selection.strand, wantLen - abs),
    )
  }

  const wantLen = Math.min(length, Math.max(1, length - selection.start))
  const current = dnaEnds.downstream.stickiness
  const abs = Math.abs(current)
  const protruding = protrudingStrand('downstream', current)

  if (current === 0) {
    return {
      ...draft,
      dnaEnds: {
        ...dnaEnds,
        downstream: {
          ...dnaEnds.downstream,
          stickiness: clampStickiness(stickinessForStrandHide('downstream', selection.strand, wantLen), length),
        },
      },
      selection: { ...selection, start: length, end: length },
    }
  }

  if (protruding !== selection.strand) {
    const nextLen = Math.max(abs, wantLen)
    return {
      ...draft,
      dnaEnds: {
        ...dnaEnds,
        downstream: {
          ...dnaEnds.downstream,
          stickiness: clampStickiness(stickinessForStrandHide('downstream', selection.strand, nextLen), length),
        },
      },
      selection: { ...selection, start: length, end: length },
    }
  }

  if (wantLen < abs) {
    return removeDownstreamBases(draft, wantLen, Math.sign(current) * (abs - wantLen))
  }
  if (wantLen === abs) {
    return removeDownstreamBases(draft, abs, 0)
  }
  return removeDownstreamBases(
    draft,
    abs,
    stickinessForStrandHide('downstream', selection.strand, wantLen - abs),
  )
}

/** Fill in the missing strand for the selected overhang region (blunt that end). */
export function makeDoubleStranded(draft: DnaEndsEditorDraft): DnaEndsEditorDraft {
  const selection = draft.selection
  if (!selection) return draft
  const length = draft.sequence.length
  const side = selection.side || selectionTouchesSide(selection, length)
  if (!side) return draft
  const dnaEnds = normalizeDnaEnds(draft.dnaEnds)
  if (side === 'upstream' && dnaEnds.upstream.stickiness === 0) return draft
  if (side === 'downstream' && dnaEnds.downstream.stickiness === 0) return draft
  return {
    ...draft,
    dnaEnds: {
      upstream: side === 'upstream' ? { ...dnaEnds.upstream, stickiness: 0 } : dnaEnds.upstream,
      downstream: side === 'downstream' ? { ...dnaEnds.downstream, stickiness: 0 } : dnaEnds.downstream,
    },
    selection: selection.start === selection.end ? selection : { ...selection, end: selection.start },
  }
}

export function canDeleteSingleStrand(draft: DnaEndsEditorDraft): boolean {
  const selection = draft.selection
  if (!selection || selection.end <= selection.start) return false
  const length = draft.sequence.length
  const side = selection.side || selectionTouchesSide(selection, length)
  if (!side) return false
  const term = terminalRange(side, length)
  // Any non-empty selection inside that end's terminal window can become an overhang.
  return selection.start < term.end && selection.end > term.start
}

export function canMakeDoubleStranded(draft: DnaEndsEditorDraft): boolean {
  const selection = draft.selection
  if (!selection) return false
  const length = draft.sequence.length
  const side = selection.side || selectionTouchesSide(selection, length)
  if (!side) return false
  const dnaEnds = normalizeDnaEnds(draft.dnaEnds)
  return side === 'upstream' ? dnaEnds.upstream.stickiness !== 0 : dnaEnds.downstream.stickiness !== 0
}

/** Collapsed caret (start === end) or empty selection is not a range. */
export function hasRangeSelection(draft: DnaEndsEditorDraft): boolean {
  const selection = draft.selection
  return Boolean(selection && selection.end > selection.start)
}

/**
 * Classify a collapsed caret on one strand at a DNA end.
 * - `extend`: add bases on this strand's overhang (protruding, or blunt→new overhang)
 * - `fill`: reveal recessed bases for an existing overhang (toward blunt); no sequence change
 */
function terminusCaretPlan(
  side: DnaEndSide,
  strand: Strand,
  stickiness: number,
  caret: number,
  length: number,
): { kind: 'extend' | 'fill'; storeComplement: boolean; at: number } | null {
  if (length <= 0) return null
  const abs = Math.abs(stickiness)
  const protruding = protrudingStrand(side, stickiness)
  const storeComplement = strand === 'reverse'

  if (side === 'upstream') {
    if (abs > 0 && caret <= abs) {
      // Inside overhang or at the nick after it.
      if (protruding && strand !== protruding) return { kind: 'fill', storeComplement, at: caret }
      if (protruding === strand) return { kind: 'extend', storeComplement, at: caret === 0 ? 0 : caret }
    }
    // Blunt tip.
    if (caret === 0) return { kind: 'extend', storeComplement, at: 0 }
    return null
  }

  // Downstream
  if (abs > 0 && caret > length - abs && caret <= length) {
    // Strictly inside overhang (not the duplex nick at length-abs).
    if (protruding && strand !== protruding) return { kind: 'fill', storeComplement, at: caret }
    if (protruding === strand) {
      return { kind: 'extend', storeComplement, at: caret >= length ? length : caret }
    }
  }
  if (abs > 0 && caret === length - abs) {
    // Nick between duplex and overhang: recessed fills the innermost overhang base;
    // protruding extends from the nick into the overhang.
    if (protruding && strand !== protruding) return { kind: 'fill', storeComplement, at: caret }
    if (protruding === strand) return { kind: 'extend', storeComplement, at: caret }
  }
  // Blunt tip (caret after last base, or on last base).
  if (abs === 0 && caret >= length - 1) {
    return { kind: 'extend', storeComplement, at: length }
  }
  if (caret >= length) return { kind: 'extend', storeComplement, at: length }
  return null
}

function applyFillBases(
  draft: DnaEndsEditorDraft,
  side: DnaEndSide,
  strand: Strand,
  count: number,
): { draft: DnaEndsEditorDraft; filled: number } {
  if (count <= 0) return { draft, filled: 0 }
  const dnaEnds = normalizeDnaEnds(draft.dnaEnds)
  const stickiness = side === 'upstream' ? dnaEnds.upstream.stickiness : dnaEnds.downstream.stickiness
  const abs = Math.abs(stickiness)
  if (abs === 0) return { draft, filled: 0 }
  const protruding = protrudingStrand(side, stickiness)
  if (!protruding || protruding === strand) return { draft, filled: 0 }

  const filled = Math.min(count, abs)
  const nextAbs = abs - filled
  const nextStickiness = nextAbs === 0 ? 0 : Math.sign(stickiness) * nextAbs
  const length = draft.sequence.length
  return {
    filled,
    draft: {
      ...draft,
      dnaEnds: {
        ...dnaEnds,
        [side]: {
          ...dnaEnds[side],
          stickiness: clampStickiness(nextStickiness, length),
        },
      },
      selection: {
        ...draft.selection!,
        // After filling, caret stays so the user can keep typing on this strand.
        start: draft.selection!.start,
        end: draft.selection!.start,
      },
    },
  }
}

function applyExtendBases(
  draft: DnaEndsEditorDraft,
  side: DnaEndSide,
  storeComplement: boolean,
  at: number,
  bases: string,
): DnaEndsEditorDraft {
  if (!bases || !draft.selection) return draft
  const dnaEnds = normalizeDnaEnds(draft.dnaEnds)
  const stickiness = side === 'upstream' ? dnaEnds.upstream.stickiness : dnaEnds.downstream.stickiness
  const stored = storeComplement ? bases.split('').map((base) => complementDnaBase(base)).join('') : bases
  const delta = storeComplement
    ? side === 'upstream'
      ? -bases.length
      : bases.length
    : side === 'upstream'
      ? bases.length
      : -bases.length

  if (side === 'upstream') {
    const insertAt = Math.max(0, Math.min(at, draft.sequence.length))
    // Tip extend for upstream always prepends when at the left tip.
    const useTip = insertAt === 0
    const sequence = useTip
      ? stored + draft.sequence
      : draft.sequence.slice(0, insertAt) + stored + draft.sequence.slice(insertAt)
    const nextStickiness =
      stickiness === 0 ? delta : Math.sign(stickiness || delta) * (Math.abs(stickiness) + bases.length)
    const nextCaret = useTip && storeComplement ? 0 : (useTip ? 0 : insertAt) + bases.length
    return {
      sequence,
      features: shiftFeatures(draft.features, useTip ? 0 : insertAt, bases.length),
      dnaEnds: {
        ...dnaEnds,
        upstream: {
          ...dnaEnds.upstream,
          stickiness: clampStickiness(nextStickiness, sequence.length),
        },
      },
      selection: { ...draft.selection, start: nextCaret, end: nextCaret },
    }
  }

  const length = draft.sequence.length
  const insertAt = Math.max(0, Math.min(at, length))
  const sequence = draft.sequence.slice(0, insertAt) + stored + draft.sequence.slice(insertAt)
  const nextStickiness =
    stickiness === 0 ? delta : Math.sign(stickiness || delta) * (Math.abs(stickiness) + bases.length)
  return {
    sequence,
    features: insertAt < length ? shiftFeatures(draft.features, insertAt, bases.length) : draft.features,
    dnaEnds: {
      ...dnaEnds,
      downstream: {
        ...dnaEnds.downstream,
        stickiness: clampStickiness(nextStickiness, sequence.length),
      },
    },
    selection: {
      ...draft.selection,
      start: insertAt + bases.length,
      end: insertAt + bases.length,
    },
  }
}

/**
 * Insert DNA at the caret (or replace a range). At DNA ends, each strand is independent:
 * typing on the protruding strand extends that overhang; typing on the recessed strand
 * fills complementary bases (reduces stickiness toward blunt) without adding sequence.
 */
export function insertBasesAtSelection(draft: DnaEndsEditorDraft, rawBases: string): DnaEndsEditorDraft {
  const bases = sanitizeDna(rawBases).toUpperCase()
  if (!bases || !draft.selection) return draft
  const selection = draft.selection
  const length = draft.sequence.length
  const dnaEnds = normalizeDnaEnds(draft.dnaEnds)
  const insertAt = selection.start
  const deleteEnd = Math.max(selection.start, selection.end)

  if (selection.start === selection.end) {
    const side = selection.side
    const stickiness = side === 'upstream' ? dnaEnds.upstream.stickiness : dnaEnds.downstream.stickiness
    const plan = terminusCaretPlan(side, selection.strand, stickiness, insertAt, length)
    if (plan) {
      let remaining = bases
      let current: DnaEndsEditorDraft = { ...draft, dnaEnds }
      if (plan.kind === 'fill') {
        const filled = applyFillBases(current, side, selection.strand, remaining.length)
        current = filled.draft
        remaining = remaining.slice(filled.filled)
        if (!remaining) return current
        // Fully blunted; further keystrokes extend this strand as a new overhang.
        const extendAt = side === 'upstream' ? 0 : current.sequence.length
        return applyExtendBases(
          { ...current, selection: { ...selection, start: extendAt, end: extendAt } },
          side,
          selection.strand === 'reverse',
          extendAt,
          remaining,
        )
      }
      return applyExtendBases(current, side, plan.storeComplement, plan.at, remaining)
    }
  }

  const sequence = draft.sequence.slice(0, insertAt) + bases + draft.sequence.slice(deleteEnd)
  const inserted = bases.length
  const deleted = deleteEnd - insertAt
  const nextEnds = adjustDnaEndsForSequenceReplacement(dnaEnds, insertAt, deleteEnd, inserted, length)
  return {
    sequence,
    features: shiftFeatures(
      deleted > 0
        ? draft.features.map((feature) => ({
            ...feature,
            locations: feature.locations
              .map((location) => {
                let { start, end } = location
                if (end <= insertAt) return location
                if (start >= deleteEnd) return { ...location, start: start - deleted, end: end - deleted }
                start = Math.min(start, insertAt)
                end = Math.max(insertAt, end - deleted)
                return { ...location, start, end }
              })
              .filter((location) => location.end > location.start),
          }))
        : draft.features,
      insertAt,
      inserted,
    ),
    dnaEnds: nextEnds,
    selection: { ...selection, start: insertAt + inserted, end: insertAt + inserted },
  }
}

/**
 * Keep sticky-end stickiness in sync when the underlying sequence is shortened or
 * lengthened (e.g. deleting a top-strand overhang in the Sequence pane). Without this,
 * deleting overhang bases leaves the old stickiness magnitude on the new terminus and
 * hides the complementary strand across what used to be duplex DNA.
 */
export function adjustDnaEndsForSequenceReplacement(
  dnaEnds: DnaEnds | undefined | null,
  replaceStart: number,
  replaceEnd: number,
  insertedLength: number,
  oldLength: number,
): DnaEnds {
  const ends = normalizeDnaEnds(dnaEnds)
  if (oldLength <= 0) {
    return {
      upstream: { ...ends.upstream, stickiness: 0 },
      downstream: { ...ends.downstream, stickiness: 0 },
    }
  }

  const deleted = Math.max(0, replaceEnd - replaceStart)
  const upAbs = Math.abs(ends.upstream.stickiness)
  const downAbs = Math.abs(ends.downstream.stickiness)
  const overlap = (a0: number, a1: number, b0: number, b1: number) =>
    Math.max(0, Math.min(a1, b1) - Math.max(a0, b0))

  // Upstream overhang occupies [0, upAbs).
  const removedUp = overlap(replaceStart, replaceEnd, 0, upAbs)
  let nextUpAbs = upAbs - removedUp
  if (upAbs > 0 && deleted === 0 && insertedLength > 0 && replaceStart <= upAbs) {
    // Insert into/at the upstream overhang: grow it.
    nextUpAbs = upAbs + insertedLength
  }

  // Downstream overhang occupies [oldLength - downAbs, oldLength).
  const downStart = oldLength - downAbs
  const removedDown = overlap(replaceStart, replaceEnd, downStart, oldLength)
  let nextDownAbs = downAbs - removedDown
  if (downAbs > 0 && deleted === 0 && insertedLength > 0 && replaceStart >= downStart) {
    nextDownAbs = downAbs + insertedLength
  }

  const newLength = oldLength - deleted + insertedLength
  const nextUp =
    nextUpAbs <= 0 || ends.upstream.stickiness === 0
      ? 0
      : Math.sign(ends.upstream.stickiness) * nextUpAbs
  const nextDown =
    nextDownAbs <= 0 || ends.downstream.stickiness === 0
      ? 0
      : Math.sign(ends.downstream.stickiness) * nextDownAbs

  return {
    upstream: {
      ...ends.upstream,
      stickiness: clampStickiness(nextUp, newLength),
    },
    downstream: {
      ...ends.downstream,
      stickiness: clampStickiness(nextDown, newLength),
    },
  }
}

/**
 * Delete exactly one base on the active strand at the caret.
 * - Protruding overhang base: remove it from the sequence and shrink stickiness by 1
 * - Duplex base: hide this strand for that one position (grow/create overhang)
 * - Recessed (already hidden): no-op
 * Range selections still use deleteSingleStrand (through-terminus).
 */
export function deleteAtSelection(draft: DnaEndsEditorDraft, backspace: boolean): DnaEndsEditorDraft {
  const selection = draft.selection
  if (!selection) return draft
  const length = draft.sequence.length

  if (selection.end > selection.start) {
    return deleteSingleStrand(draft)
  }

  const caret = selection.start
  if (backspace && caret <= 0) return draft
  if (!backspace && caret >= length) return draft
  const target = backspace ? caret - 1 : caret

  const side = selection.side || selectionTouchesSide(selection, length)
  if (!side) return draft
  const dnaEnds = normalizeDnaEnds(draft.dnaEnds)
  const stickiness = side === 'upstream' ? dnaEnds.upstream.stickiness : dnaEnds.downstream.stickiness
  const abs = Math.abs(stickiness)
  const protruding = protrudingStrand(side, stickiness)
  const inOverhang =
    side === 'upstream' ? target < abs : abs > 0 && target >= length - abs

  // Recessed strand on an overhang position: nothing to delete on that strand.
  if (inOverhang && protruding && selection.strand !== protruding) {
    return draft
  }

  // Protruding overhang base: remove exactly that one sequence base.
  if (inOverhang && protruding === selection.strand) {
    const nextAbs = abs - 1
    const nextStickiness = nextAbs === 0 ? 0 : Math.sign(stickiness) * nextAbs
    if (side === 'upstream') {
      // Remove target base; for a tip stack this is usually index 0 when backspacing from 1,
      // but always remove `target` so caret semantics stay consistent.
      const sequence = draft.sequence.slice(0, target) + draft.sequence.slice(target + 1)
      const nextLen = sequence.length
      return {
        sequence,
        features: shiftFeatures(draft.features, target, -1)
          .map((feature) => ({
            ...feature,
            locations: feature.locations.filter((location) => location.end > location.start),
          }))
          .filter((feature) => feature.locations.length > 0),
        dnaEnds: {
          ...dnaEnds,
          upstream: {
            ...dnaEnds.upstream,
            stickiness: clampStickiness(nextStickiness, nextLen),
          },
        },
        selection: { ...selection, start: target, end: target },
      }
    }
    const sequence = draft.sequence.slice(0, target) + draft.sequence.slice(target + 1)
    const nextLen = sequence.length
    return {
      sequence,
      features: draft.features
        .map((feature) => ({
          ...feature,
          locations: feature.locations
            .map((location) => {
              if (location.start >= nextLen) return { ...location, start: nextLen, end: nextLen }
              return { ...location, end: Math.min(location.end, nextLen) }
            })
            .filter((location) => location.end > location.start),
        }))
        .filter((feature) => feature.locations.length > 0),
      dnaEnds: {
        ...dnaEnds,
        downstream: {
          ...dnaEnds.downstream,
          stickiness: clampStickiness(nextStickiness, nextLen),
        },
      },
      selection: { ...selection, start: target, end: target },
    }
  }

  // Duplex (or blunt) base: hide only this strand for this one position.
  return deleteSingleStrand({
    ...draft,
    selection: { ...selection, start: target, end: target + 1 },
  })
}

export function setEndModification(
  draft: DnaEndsEditorDraft,
  side: DnaEndSide,
  modification: DnaEndModification,
): DnaEndsEditorDraft {
  const dnaEnds = normalizeDnaEnds(draft.dnaEnds)
  return {
    ...draft,
    dnaEnds: {
      ...dnaEnds,
      [side]: { ...dnaEnds[side], modification },
    },
  }
}

export function dnaEndsEqual(a: DnaEnds, b: DnaEnds): boolean {
  const left = normalizeDnaEnds(a)
  const right = normalizeDnaEnds(b)
  return (
    left.upstream.modification === right.upstream.modification &&
    left.upstream.stickiness === right.upstream.stickiness &&
    (left.upstream.enzymeName ?? '') === (right.upstream.enzymeName ?? '') &&
    left.downstream.modification === right.downstream.modification &&
    left.downstream.stickiness === right.downstream.stickiness &&
    (left.downstream.enzymeName ?? '') === (right.downstream.enzymeName ?? '')
  )
}

export function applyDnaEndsEditorResult(
  record: SequenceRecord,
  draft: Pick<DnaEndsEditorDraft, 'sequence' | 'features' | 'dnaEnds'>,
): SequenceRecord {
  return {
    ...record,
    sequence: sanitizeDna(draft.sequence),
    features: draft.features,
    dnaEnds: normalizeDnaEnds(draft.dnaEnds),
    dnaEndsProvenance: 'user-defined',
    updatedAt: nowIso(),
  }
}

export function dnaEndsEditSummary(before: DnaEnds, after: DnaEnds, sequenceChanged: boolean): string {
  const parts: string[] = []
  if (before.upstream.modification !== after.upstream.modification) {
    parts.push(`left ${modificationLabel(after.upstream.modification)}`)
  }
  if (before.downstream.modification !== after.downstream.modification) {
    parts.push(`right ${modificationLabel(after.downstream.modification)}`)
  }
  if (before.upstream.stickiness !== after.upstream.stickiness) {
    parts.push(`left stickiness ${after.upstream.stickiness}`)
  }
  if (before.downstream.stickiness !== after.downstream.stickiness) {
    parts.push(`right stickiness ${after.downstream.stickiness}`)
  }
  if (sequenceChanged && parts.length === 0) parts.push('terminal sequence')
  return parts.length ? `Edited DNA ends (${parts.join(', ')})` : 'Edited DNA ends'
}

export function createDnaEndsEditOperation(summary: string) {
  return {
    id: createId('op'),
    type: 'editDNAEnds',
    summary,
    createdAt: nowIso(),
  }
}

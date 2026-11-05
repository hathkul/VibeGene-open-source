import type { HistoryInputSummary, HistoryNode } from './types'

/** SnapGene InputSummary coordinates are 1-based; convert to 0-based for drawing. */
export function summaryPosition(value: string | undefined, seqLen: number): number | null {
  if (value === undefined) return null
  const pos1 = Number(value)
  if (!Number.isFinite(pos1)) return null
  return Math.max(0, Math.min(seqLen, Math.round(pos1) - 1))
}

export function enzymeLabel(name: string | undefined, fallback: string): string {
  if (name && !name.startsWith('<')) return name
  return fallback
}

/** True when a history label is a real enzyme name (not a position or oligo-end marker). */
export function isNamedEnzyme(name: string): boolean {
  const trimmed = name.trim()
  if (!trimmed || trimmed.startsWith('<')) return false
  if (/^[\d,.\s]+$/.test(trimmed)) return false
  // SnapGene labels oligo sticky-end insertion points as Start/End — not REs.
  if (/^(start|end)$/i.test(trimmed)) return false
  return true
}

/** Named restriction enzymes from a parent InputSummary (not PCR primer ends). */
export function digestEnzymeNamesFromHistorySummary(summary?: HistoryInputSummary): string[] {
  if (!summary?.manipulation) return []
  if (summary.manipulation === 'gibson') {
    const linearization = summary.assemblyPart?.linearization
    return linearization?.method === 'restriction'
      ? [...new Set([linearization.leftEnzyme, linearization.rightEnzyme].filter(isNamedEnzyme))]
      : []
  }
  if (summary.manipulation === 'amplify' || summary.manipulation === 'overlapAndAmplify') return []
  const names: string[] = []
  const seen = new Set<string>()
  for (const raw of [summary.name1, summary.name2]) {
    const name = enzymeLabel(raw, '')
    if (!isNamedEnzyme(name) || seen.has(name)) continue
    seen.add(name)
    names.push(name)
  }
  return names
}

export type HistoryCutSite = {
  name: string
  /** 0-based position on the parent construct. */
  position: number
}

export type HistoryRegion = {
  start: number
  end: number
  kind: 'vector' | 'insert' | 'template' | 'fragment' | 'other'
}

/** Cut sites + excised/amplified span implied by one parent's InputSummary. */
export function contributionGeometry(
  summary: HistoryInputSummary | undefined,
  seqLen: number,
): { sites: HistoryCutSite[]; region: HistoryRegion | null; role: HistoryRegion['kind'] | null } {
  if (!summary?.manipulation) return { sites: [], region: null, role: null }
  // Gibson summaries use val1 for the part order, not a sequence coordinate.
  if (summary.manipulation === 'gibson') {
    return { sites: [], region: null, role: summary.assemblyPart?.role ?? null }
  }

  const p1 = summaryPosition(summary.val1, seqLen)
  const p2 = summaryPosition(summary.val2, seqLen)
  const sites: HistoryCutSite[] = []
  if (p1 !== null) {
    sites.push({
      name: enzymeLabel(summary.name1, Number(summary.val1).toLocaleString()),
      position: p1,
    })
  }
  if (p2 !== null) {
    sites.push({
      name: enzymeLabel(summary.name2, Number(summary.val2).toLocaleString()),
      position: p2,
    })
  }

  switch (summary.manipulation) {
    case 'replace': {
      // Vector cut: replaced span runs name2→name1 (val2→val1).
      if (p1 === null || p2 === null) return { sites, region: null, role: 'vector' }
      return { sites, region: { start: p2, end: p1, kind: 'vector' }, role: 'vector' }
    }
    case 'insert':
    case 'flipAndInsert': {
      if (p1 === null || p2 === null) return { sites, region: null, role: 'insert' }
      return { sites, region: { start: p1, end: p2, kind: 'insert' }, role: 'insert' }
    }
    case 'insertAt':
      // Recipient linearized at one site (SnapGene unique-cutter cloning), not an insert fragment.
      return { sites, region: null, role: 'vector' }
    case 'choose': {
      if (p1 === null || p2 === null) return { sites, region: null, role: 'fragment' }
      return { sites, region: { start: p1, end: p2, kind: 'fragment' }, role: 'fragment' }
    }
    case 'amplify':
    case 'overlapAndAmplify': {
      if (p1 === null || p2 === null) return { sites, region: null, role: 'template' }
      return { sites, region: { start: p1, end: p2, kind: 'template' }, role: 'template' }
    }
    case 'remove': {
      if (p1 === null || p2 === null) return { sites, region: null, role: 'other' }
      return { sites, region: { start: p1, end: p2, kind: 'other' }, role: 'other' }
    }
    default:
      return { sites, region: null, role: 'other' }
  }
}

export function parentSummaries(node: HistoryNode): Array<HistoryInputSummary | undefined> {
  const summaries = node.inputSummaries.filter((summary) => Boolean(summary.manipulation))
  return node.children.map((_, index) => summaries[index])
}

export function roleLabel(role: HistoryRegion['kind'] | null): string | null {
  switch (role) {
    case 'vector':
      return 'vector'
    case 'insert':
      return 'insert'
    case 'template':
      return 'template'
    case 'fragment':
      return 'fragment'
    default:
      return null
  }
}

/** Inclusive-exclusive span length along a circular or linear parent. */
export function regionSpanLength(start: number, end: number, seqLen: number): number {
  if (seqLen <= 0) return 0
  if (end >= start) return end - start
  return seqLen - start + end
}

/**
 * Length of the fragment contributed by this parent:
 * - vector (replace): backbone kept after excising the span between cut sites
 * - insert / fragment / template: the span between the two ends
 * - insertAt / single-site vector: no excised span; caller should use the parent length
 */
export function contributedFragmentLength(
  role: HistoryRegion['kind'] | null,
  region: HistoryRegion | null,
  seqLen: number,
): number | null {
  if (!region || !role) return null
  const between = regionSpanLength(region.start, region.end, seqLen)
  if (role === 'vector') return Math.max(0, seqLen - between)
  return between
}

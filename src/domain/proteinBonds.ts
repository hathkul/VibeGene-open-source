import type { ProteinBond, RestrictionSite } from './types'

export type ProteinBondRowSegment = {
  bond: ProteinBond
  start: number
  end: number
  localEndpointCount: 1 | 2
  continuesBefore: boolean
  continuesAfter: boolean
}

export function localProteinBondResidues(bond: ProteinBond): number[] {
  return bond.endpoints
    .filter((endpoint) => !endpoint.chainId)
    .map((endpoint) => endpoint.residue)
    .sort((left, right) => left - right)
}

/** Keep local protein-bond endpoints aligned with an inline sequence replacement. */
export function adjustProteinBondsForReplacement(
  bonds: readonly ProteinBond[],
  start: number,
  end: number,
  insertedLength: number,
): ProteinBond[] {
  const delta = insertedLength - (end - start)
  return bonds.flatMap((bond) => {
    if (bond.endpoints.some((endpoint) => !endpoint.chainId && endpoint.residue >= start && endpoint.residue < end)) {
      return []
    }
    const endpoints = bond.endpoints.map((endpoint) => (
      !endpoint.chainId && endpoint.residue >= end
        ? { ...endpoint, residue: endpoint.residue + delta }
        : { ...endpoint }
    )) as ProteinBond['endpoints']
    return [{ ...bond, endpoints }]
  })
}

export function defaultProteinBondResidues(
  sequenceLength: number,
  selection?: { start: number; end: number } | null,
): [number, number] {
  const lastResidue = Math.max(0, sequenceLength - 1)
  if (selection && selection.end > selection.start) {
    const start = Math.max(0, Math.min(lastResidue, Math.trunc(selection.start)))
    const end = Math.max(start, Math.min(lastResidue, Math.trunc(selection.end) - 1))
    return [start, end]
  }
  return [0, Math.min(1, lastResidue)]
}

export function proteinBondSegmentsForRow(
  bonds: readonly ProteinBond[],
  rowStart: number,
  rowEnd: number,
): ProteinBondRowSegment[] {
  const segments: ProteinBondRowSegment[] = []
  for (const bond of bonds) {
    const local = localProteinBondResidues(bond)
    if (!local.length) continue
    if (local.length === 1) {
      const residue = local[0]!
      if (residue >= rowStart && residue < rowEnd) {
        segments.push({
          bond,
          start: residue,
          end: residue + 1,
          localEndpointCount: 1,
          continuesBefore: false,
          continuesAfter: true,
        })
      }
      continue
    }
    const firstEndpoint = local[0]!
    const secondEndpoint = local[1]!
    const start = Math.max(rowStart, firstEndpoint)
    const end = Math.min(rowEnd, secondEndpoint + 1)
    if (end > start) {
      segments.push({
        bond,
        start,
        end,
        localEndpointCount: 2,
        continuesBefore: firstEndpoint < rowStart,
        continuesAfter: secondEndpoint >= rowEnd,
      })
    }
  }
  return segments.sort((left, right) =>
    left.start - right.start
      || right.end - left.end
      || left.bond.id.localeCompare(right.bond.id),
  )
}

/** Pack arbitrary annotation spans into the first non-overlapping lane. */
export function assignProteinAnnotationLanes<Item extends { start: number; end: number }>(
  items: readonly Item[],
): Array<Item & { lane: number }> {
  const laneSpans: Array<Array<{ start: number; end: number }>> = []
  return items.map((item) => {
    let lane = laneSpans.findIndex((spans) =>
      spans.every((span) => item.end <= span.start || item.start >= span.end),
    )
    if (lane < 0) {
      lane = laneSpans.length
      laneSpans.push([])
    }
    laneSpans[lane]!.push({ start: item.start, end: item.end })
    return { ...item, lane }
  })
}

/** Pack overlapping row bond segments into lanes (0-based). */
export function assignProteinBondLanes(
  segments: readonly ProteinBondRowSegment[],
): Array<ProteinBondRowSegment & { lane: number }> {
  return assignProteinAnnotationLanes(segments)
}

/** Local residue X centers of vertical risers drawn for a row segment. */
export function proteinBondVerticalXs(
  segment: ProteinBondRowSegment,
  rowStart: number,
): number[] {
  const localStart = segment.start - rowStart
  const localEnd = segment.end - rowStart
  const span = Math.max(1, localEnd - localStart)
  const xs: number[] = []
  if (!segment.continuesBefore) xs.push(localStart + 0.5)
  if (segment.localEndpointCount === 2 && !segment.continuesAfter) xs.push(localStart + span - 0.5)
  return xs
}

/**
 * Shift bond labels sideways (residue-cell units from span center) so they clear
 * other bonds' vertical risers. Returns a map of bondId → center offset.
 */
export function proteinBondLabelCenterOffsets(
  segments: ReadonlyArray<ProteinBondRowSegment & { lane: number }>,
  rowStart: number,
  rowLength: number,
  options: {
    fontSizePx: number
    cellWidthPx: number
    clearancePx?: number
  },
): Map<string, number> {
  const cellWidthPx = Math.max(1, options.cellWidthPx)
  const clearance = (options.clearancePx ?? 4) / cellWidthPx
  const obstacles: number[] = []
  for (const segment of segments) {
    for (const x of proteinBondVerticalXs(segment, rowStart)) obstacles.push(x)
  }

  const offsets = new Map<string, number>()
  for (const segment of segments) {
    if (segment.continuesBefore || segment.bond.showLabel === false) {
      offsets.set(segment.bond.id, 0)
      continue
    }
    const localStart = segment.start - rowStart
    const localEnd = segment.end - rowStart
    const spanCenter = (localStart + localEnd) / 2
    const label = proteinBondDisplayLabel(segment.bond)
    const widthCells = Math.max(0.8, (label.length * options.fontSizePx * 0.58 + 8) / cellWidthPx)
    const half = widthCells / 2
    const ownVerticals = new Set(proteinBondVerticalXs(segment, rowStart).map((x) => x.toFixed(3)))
    const foreign = obstacles.filter((x) => !ownVerticals.has(x.toFixed(3)))

    const overlaps = (center: number) => {
      const left = center - half
      const right = center + half
      return foreign.some((x) => x >= left - clearance && x <= right + clearance)
    }

    const minCenter = half
    const maxCenter = Math.max(minCenter, rowLength - half)
    const best = Math.min(maxCenter, Math.max(minCenter, spanCenter))
    if (!overlaps(best)) {
      offsets.set(segment.bond.id, best - spanCenter)
      continue
    }

    const maxShift = Math.max(rowLength, spanCenter + half + 2)
    let found: number | null = null
    for (let step = 1; step <= maxShift * 4; step += 1) {
      const delta = step * 0.25
      for (const sign of [-1, 1] as const) {
        const candidate = Math.min(maxCenter, Math.max(minCenter, spanCenter + sign * delta))
        if (!overlaps(candidate)) {
          found = candidate
          break
        }
      }
      if (found != null) break
    }
    offsets.set(segment.bond.id, (found ?? best) - spanCenter)
  }
  return offsets
}

/** Lane pitch with equal bar→name and name→next-bar gaps (label fully reserved). */
export function proteinBondLaneMetrics(bondSpacingPx: number, labelFontSizePx: number) {
  const raw = Math.round(bondSpacingPx)
  // Older builds stored full lane heights (8–28). Those are not gaps — use a moderate default.
  const gapPx = Math.max(2, Math.min(8, raw >= 8 ? 3 : raw))
  const labelHeightPx = Math.max(8, Math.ceil(labelFontSizePx) + 2)
  // Reserve the full label band so the next bar cannot sit on the previous name.
  const laneHeightPx = gapPx + labelHeightPx + gapPx
  return {
    gapPx,
    labelHeightPx,
    laneHeightPx,
    /** Distance from lane top to the horizontal bar center. */
    barOffsetPx: 1.25,
    /** Distance from lane top to the label top (equals the bar→name gap). */
    labelTopPx: gapPx,
  }
}

/** Minimum horizontal gap between a map bond's vertical leader and its label attach edge. */
export const PROTEIN_MAP_BOND_LABEL_LEADER_GAP_PX = 6

/**
 * Snap a map bond label attach X so it clears the vertical leader by at least
 * {@link PROTEIN_MAP_BOND_LABEL_LEADER_GAP_PX}, keeping any larger router offset.
 */
export function proteinMapBondLabelAttachX(
  riseX: number,
  preferredAttachX: number,
  side: 'left' | 'right',
  minGapPx = PROTEIN_MAP_BOND_LABEL_LEADER_GAP_PX,
): number {
  const gap = Math.max(0, minGapPx)
  if (side === 'left') {
    // Label sits left of the leader; attach is the label's right edge.
    return Math.min(preferredAttachX, riseX - gap)
  }
  // Label sits right of the leader; attach is the label's left edge.
  return Math.max(preferredAttachX, riseX + gap)
}

export function proteinBondTypeLabel(type: ProteinBond['type']): string {
  if (type === 'cross-link') return 'Cross-link'
  return type.charAt(0).toUpperCase() + type.slice(1)
}

export function defaultProteinBondColor(type: ProteinBond['type']): string {
  if (type === 'thioether') return '#6d28d9'
  if (type === 'thiolester') return '#be185d'
  if (type === 'cross-link') return '#0e7490'
  if (type === 'other') return '#475569'
  return '#b45309'
}

export const DEFAULT_PROTEIN_BOND_STROKE_WIDTH = 1.5
export const MIN_PROTEIN_BOND_STROKE_WIDTH = 0.5
export const MAX_PROTEIN_BOND_STROKE_WIDTH = 8

export function proteinBondStrokeWidth(bond: Pick<ProteinBond, 'strokeWidth'>): number {
  const value = bond.strokeWidth
  if (typeof value !== 'number' || !Number.isFinite(value)) return DEFAULT_PROTEIN_BOND_STROKE_WIDTH
  return Math.max(MIN_PROTEIN_BOND_STROKE_WIDTH, Math.min(MAX_PROTEIN_BOND_STROKE_WIDTH, value))
}

export function proteinBondDisplayLabel(bond: ProteinBond): string {
  const label = bond.name.trim() || 'Bond'
  return bond.showTypeLabel ? `${label} (${proteinBondTypeLabel(bond.type)})` : label
}

export function proteinBondDescription(bond: ProteinBond): string {
  const endpoint = (index: number) => {
    const value = bond.endpoints[index]!
    return `${value.chainId ? `${value.chainId}:` : ''}${value.residue + 1}`
  }
  return `${proteinBondTypeLabel(bond.type)} · ${endpoint(0)} ↔ ${endpoint(1)}`
}

/** Midpoint residue used as the map callout leader anchor. */
export function proteinBondAnchorResidue(bond: ProteinBond): number | null {
  const local = localProteinBondResidues(bond)
  if (!local.length) return null
  if (local.length === 1) return local[0]!
  return Math.floor((local[0]! + local[1]!) / 2)
}

/** Restriction-site stand-in so protein bond labels reuse the linear DNA callout router. */
export function proteinBondToCalloutSite(bond: ProteinBond, index: number): RestrictionSite | null {
  const anchor = proteinBondAnchorResidue(bond)
  if (anchor == null) return null
  const label = proteinBondDisplayLabel(bond)
  return {
    enzyme: {
      name: label,
      notation: '',
      recognition: '',
      cutTop: anchor,
      cutBottom: anchor,
      type: 'II',
      overhang: { type: 'blunt' as const, sequence: null, length: 0 },
      manufacturers: [],
      notes: [],
    },
    start: anchor,
    end: anchor + 1,
    match: `__bond_callout__${bond.id}:${index}`,
    cutTop: anchor,
    cutBottom: anchor,
  }
}

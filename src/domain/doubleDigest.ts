import {
  buildInferredActivityTable,
  type InferredActivityTableModel,
  type InferredActivityTableRow,
} from './inferredBufferActivityTable'
import type { EnzymeBufferCode, EnzymeManufacturerId, RestrictionEnzyme } from './types'

export type ParsedDigestActivity = { lowerBound: number; guaranteedAbove70: boolean }

export type DoubleDigestSelection = {
  enzyme: RestrictionEnzyme
  manufacturerId: EnzymeManufacturerId
}

export type DoubleDigestCandidate = {
  vendorId: EnzymeManufacturerId
  buffer: EnzymeBufferCode
  bufferLabel: string
  bufferTitle: string
  first: InferredActivityTableRow
  second: InferredActivityTableRow
  minimumActivity: number
  totalActivity: number
  vendorNative: boolean
}

export type DoubleDigestRecommendation = {
  kind: 'simultaneous' | 'sequential'
  best: DoubleDigestCandidate | null
  alternatives: DoubleDigestCandidate[]
  warnings: string[]
  reason: string
}

export type InferredTableBuilder = (
  enzyme: RestrictionEnzyme,
  preferredVendorId: EnzymeManufacturerId,
) => InferredActivityTableModel | null

const confidenceRank: Record<InferredActivityTableRow['confidence'], number> = {
  Measured: 5,
  High: 4,
  Medium: 3,
  Low: 2,
  'Double, low': 1,
  Unknown: 0,
}

/** Parse displayed activity conservatively for the strict >70% rule. */
export function parseDigestActivity(activity: string): ParsedDigestActivity | null {
  const normalized = activity.trim().replace(/%/g, '').replace(/[–—]/g, '-').replace(/\*/g, '')
  if (!normalized || /^(?:—|-|NR|N\/A|NA|none)$/i.test(normalized)) return null
  if (/^</.test(normalized)) return null

  const greaterThan = normalized.match(/^>\s*(\d+(?:\.\d+)?)$/)
  if (greaterThan) {
    const value = Number(greaterThan[1])
    return Number.isFinite(value) ? { lowerBound: value, guaranteedAbove70: value >= 70 } : null
  }

  const range = normalized.match(/^(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)$/)
  if (range) {
    const lowerBound = Number(range[1])
    return Number.isFinite(lowerBound) ? { lowerBound, guaranteedAbove70: lowerBound > 70 } : null
  }

  if (!/^\d+(?:\.\d+)?$/.test(normalized)) return null
  const lowerBound = Number(normalized)
  return Number.isFinite(lowerBound) ? { lowerBound, guaranteedAbove70: lowerBound > 70 } : null
}

function candidateConfidence(candidate: DoubleDigestCandidate) {
  return Math.min(confidenceRank[candidate.first.confidence], confidenceRank[candidate.second.confidence])
}

export function compareDoubleDigestCandidates(left: DoubleDigestCandidate, right: DoubleDigestCandidate) {
  if (left.vendorNative !== right.vendorNative) return left.vendorNative ? -1 : 1
  if (left.minimumActivity !== right.minimumActivity) return right.minimumActivity - left.minimumActivity
  if (left.totalActivity !== right.totalActivity) return right.totalActivity - left.totalActivity
  const confidenceDifference = candidateConfidence(right) - candidateConfidence(left)
  if (confidenceDifference) return confidenceDifference
  return `${left.vendorId}:${left.buffer}`.localeCompare(`${right.vendorId}:${right.buffer}`)
}

function rowKey(row: InferredActivityTableRow) {
  return `${row.vendorId}:${row.buffer}`
}

function selectedProfile(selection: DoubleDigestSelection) {
  return selection.enzyme.manufacturers.find((profile) => profile.id === selection.manufacturerId) ?? null
}

function warningList(
  firstSelection: DoubleDigestSelection,
  secondSelection: DoubleDigestSelection,
  best: DoubleDigestCandidate | null,
) {
  const warnings: string[] = []
  const firstProfile = selectedProfile(firstSelection)
  const secondProfile = selectedProfile(secondSelection)
  if (firstSelection.enzyme.name === secondSelection.enzyme.name) {
    warnings.push('The same restriction enzyme is selected twice; a double digest normally uses two different enzymes.')
  }
  if (firstProfile && secondProfile && firstProfile.incubationC !== secondProfile.incubationC) {
    warnings.push(
      `Incubation temperatures differ (${firstProfile.incubationC}°C and ${secondProfile.incubationC}°C); sequential digestion may still be preferable.`,
    )
  }
  if (best?.first.needsAdditive || best?.second.needsAdditive) {
    warnings.push('At least one enzyme needs an enzyme-specific additive that is not assumed in the generic buffer.')
  }
  if (best?.first.starRisk || best?.second.starRisk) {
    warnings.push('The recommended condition has a reported or inferred star-activity risk for at least one enzyme.')
  }
  if (best && (best.first.kind !== 'measured' || best.second.kind !== 'measured')) {
    warnings.push('At least one activity value is inferred rather than measured in the manufacturer’s native chart.')
  }
  return warnings
}

export function recommendDoubleDigest(
  firstSelection: DoubleDigestSelection,
  secondSelection: DoubleDigestSelection,
  tableBuilder: InferredTableBuilder = buildInferredActivityTable,
): DoubleDigestRecommendation {
  if (!selectedProfile(firstSelection) || !selectedProfile(secondSelection)) {
    return {
      kind: 'sequential',
      best: null,
      alternatives: [],
      warnings: [],
      reason: 'Choose a manufacturer that supplies each selected enzyme.',
    }
  }

  const firstTable = tableBuilder(firstSelection.enzyme, firstSelection.manufacturerId)
  const secondTable = tableBuilder(secondSelection.enzyme, secondSelection.manufacturerId)
  if (!firstTable || !secondTable) {
    return {
      kind: 'sequential',
      best: null,
      alternatives: [],
      warnings: warningList(firstSelection, secondSelection, null),
      reason: 'The activity table is incomplete for this pair, so a reliable common buffer cannot be identified.',
    }
  }

  const allowedVendors = new Set<EnzymeManufacturerId>([
    firstSelection.manufacturerId,
    secondSelection.manufacturerId,
  ])
  const secondRows = new Map(secondTable.rows.map((row) => [rowKey(row), row]))
  const candidates: DoubleDigestCandidate[] = []

  for (const first of firstTable.rows) {
    if (!allowedVendors.has(first.vendorId)) continue
    const second = secondRows.get(rowKey(first))
    if (!second) continue
    const firstActivity = parseDigestActivity(first.activity)
    const secondActivity = parseDigestActivity(second.activity)
    if (!firstActivity?.guaranteedAbove70 || !secondActivity?.guaranteedAbove70) continue
    const vendorNative =
      firstSelection.manufacturerId === secondSelection.manufacturerId &&
      first.vendorId === firstSelection.manufacturerId &&
      first.kind === 'measured' &&
      second.kind === 'measured'
    candidates.push({
      vendorId: first.vendorId,
      buffer: first.buffer,
      bufferLabel: first.bufferLabel,
      bufferTitle: first.bufferTitle,
      first,
      second,
      minimumActivity: Math.min(firstActivity.lowerBound, secondActivity.lowerBound),
      totalActivity: firstActivity.lowerBound + secondActivity.lowerBound,
      vendorNative,
    })
  }

  candidates.sort(compareDoubleDigestCandidates)
  const best = candidates[0] ?? null
  if (!best) {
    return {
      kind: 'sequential',
      best: null,
      alternatives: [],
      warnings: warningList(firstSelection, secondSelection, null),
      reason: 'No buffer from the selected manufacturer(s) guarantees more than 70% activity for both enzymes.',
    }
  }

  return {
    kind: 'simultaneous',
    best,
    alternatives: candidates.slice(1),
    warnings: warningList(firstSelection, secondSelection, best),
    reason: best.vendorNative
      ? 'Both values come from the selected manufacturer’s native activity table.'
      : 'This is the strongest common condition supported by the measured and inferred activity tables.',
  }
}

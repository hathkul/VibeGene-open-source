import {
  catalogBufferColumns,
  catalogBufferLabel,
  catalogManufacturerOrder,
  manufacturerShortLabel,
} from './enzymeCatalog'
import { manufacturerLabel } from './enzymePreferences'
import {
  compositionFor,
  formatBufferRecipe,
  inferEnzyme,
  nativeObservedPoints,
  profileNeedsAdditive,
  starInLowSalt,
  type BufferComposition,
  type InferredTarget,
  type ProprietarySkip,
  type SourceInference,
} from './crossVendorBufferActivity'
import { inferDoubleProprietaryActivity } from './proprietaryBufferComposition'
import type { EnzymeBufferCode, EnzymeManufacturer, EnzymeManufacturerId, RestrictionEnzyme } from './types'

export type InferredActivityConfidenceLabel = 'Measured' | 'High' | 'Medium' | 'Low' | 'Double, low' | 'Unknown'
export type InferredActivityKind = 'measured' | 'inferred' | 'double' | 'unknown'

export type InferredActivityTableRow = {
  vendorId: EnzymeManufacturerId
  manufacturerShort: string
  manufacturerFull: string
  buffer: EnzymeBufferCode
  bufferLabel: string
  bufferTitle: string
  activity: string
  kind: InferredActivityKind
  confidence: InferredActivityConfidenceLabel
  rationale: string
  needsAdditive: boolean
  starRisk: boolean
  flagsTitle: string
}

export type InferredActivityTableModel = {
  enzymeName: string
  source: EnzymeManufacturer
  sourceShort: string
  sourceFull: string
  caption: string
  doubleInferenceNote: string
  rows: InferredActivityTableRow[]
}

export type FormattedActivityCell = {
  activity: string
  starRisk: boolean
  needsAdditive: boolean
}

const ADDITIVE_RE = /\b(oligo|sam|dtt|ddt)\b/i

function hasAdditiveMark(raw: string): boolean {
  return ADDITIVE_RE.test(raw) || /\(\s*\+/.test(raw)
}

function normalizeActivitySource(raw: string): string {
  let text = raw
    .replace(/\*/g, '')
    .replace(/[–—]/g, '-')
    .replace(/%/g, '')
    .replace(/\+/g, ' ')
    .trim()
  text = text.replace(/\(\s*(\d+(?:\s*-\s*\d+)?)\s*\)/g, '$1')
  text = text.replace(/\([^)]*\)/g, ' ')
  return text.replace(/\s+/g, ' ').trim()
}

/** Display-only formatter: one trailing % on numbers, never * / + in the activity text. */
export function formatActivityCell(value: number | string): FormattedActivityCell {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return { activity: '—', starRisk: false, needsAdditive: false }
    return { activity: `${value}%`, starRisk: false, needsAdditive: false }
  }

  const raw = value.trim()
  const starRisk = raw.includes('*')
  const needsAdditive = hasAdditiveMark(raw)
  const text = normalizeActivitySource(raw)

  if (!text || /^(none|n\/a|na|-|—)$/i.test(text)) {
    return { activity: '—', starRisk, needsAdditive }
  }
  if (/^nr\b/i.test(text)) {
    return { activity: 'NR', starRisk, needsAdditive }
  }

  const lessThan = text.match(/^<\s*(\d+(?:\.\d+)?)\s*$/)
  if (lessThan) return { activity: `<${lessThan[1]}%`, starRisk, needsAdditive }

  const greaterThan = text.match(/^>\s*(\d+(?:\.\d+)?)\s*$/)
  if (greaterThan) return { activity: `>${greaterThan[1]}%`, starRisk, needsAdditive }

  const range = text.match(/^(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)\s*$/)
  if (range) return { activity: `${range[1]}–${range[2]}%`, starRisk, needsAdditive }

  const exact = text.match(/^(\d+(?:\.\d+)?)\s*$/)
  if (exact) return { activity: `${exact[1]}%`, starRisk, needsAdditive }

  // SibEnzyme charts occasionally store "0-10" as "-10".
  const truncatedRange = text.match(/^-(\d+(?:\.\d+)?)\s*$/)
  if (truncatedRange) return { activity: `0–${truncatedRange[1]}%`, starRisk, needsAdditive }

  return { activity: text.replace(/-/g, '–'), starRisk, needsAdditive }
}

function formatInferredActivity(lo: number, hi: number): string {
  return formatActivityCell(lo === hi ? lo : `${lo}-${hi}`).activity
}

function confidenceLabel(value: InferredTarget['confidence']): InferredActivityConfidenceLabel {
  if (value === 'high') return 'High'
  if (value === 'medium') return 'Medium'
  return 'Low'
}

function nativeRaw(
  enzyme: RestrictionEnzyme,
  vendorId: EnzymeManufacturerId,
  buffer: EnzymeBufferCode,
): number | string | null {
  const profile = enzyme.manufacturers.find((entry) => entry.id === vendorId)
  if (!profile) return null
  const value = profile.bufferActivity[buffer]
  if (value === null || value === undefined || value === '') return null
  if (typeof value === 'string' && /^(none|n\/a|na)$/i.test(value.trim())) return null
  return value
}

function skipFor(source: SourceInference, vendorId: EnzymeManufacturerId, buffer: string): ProprietarySkip | undefined {
  const exact = source.skipped.find((item) => item.targetVendor === vendorId && item.buffer === buffer)
  if (exact) return exact
  const composition = compositionFor(vendorId, buffer)
  if (!composition?.skipReason) return undefined
  return source.skipped.find((item) => item.targetVendor === vendorId && item.rationale === composition.skipReason)
}

function bufferTitleFor(
  kind: InferredActivityKind,
  composition: BufferComposition | undefined,
  bufferLabel: string,
): string {
  if (kind === 'double' || !composition?.known || composition.proprietary) return bufferLabel
  return formatBufferRecipe(composition) || bufferLabel
}

function flagsTitle(needsAdditive: boolean, starRisk: boolean, rationale: string): string {
  const parts: string[] = []
  if (needsAdditive) parts.push('Needs oligo/SAM or enzyme-specific additive not assumed in this generic buffer.')
  if (starRisk) parts.push('Star-activity risk in this salt window.')
  if (rationale) parts.push(rationale)
  return parts.join(' ')
}

export function chooseInferenceSource(
  enzyme: RestrictionEnzyme,
  preferredVendorId: EnzymeManufacturerId,
): EnzymeManufacturer | null {
  const preferred = enzyme.manufacturers.find((entry) => entry.id === preferredVendorId)
  if (preferred && nativeObservedPoints(preferred).length >= 2) return preferred
  for (const id of catalogManufacturerOrder) {
    const manufacturer = enzyme.manufacturers.find((entry) => entry.id === id)
    if (manufacturer && nativeObservedPoints(manufacturer).length >= 2) return manufacturer
  }
  return null
}

function listingName(enzyme: RestrictionEnzyme, vendorId: EnzymeManufacturerId): string {
  return enzyme.manufacturers.find((entry) => entry.id === vendorId)?.name ?? manufacturerLabel(vendorId)
}

export function buildInferredActivityTable(
  enzyme: RestrictionEnzyme,
  preferredVendorId: EnzymeManufacturerId,
): InferredActivityTableModel | null {
  const source = chooseInferenceSource(enzyme, preferredVendorId)
  if (!source) return null
  const { entry } = inferEnzyme(enzyme)
  const sourceInference = entry.sources.find((item) => item.vendor === source.id)
  if (!sourceInference) return null

  const inferredByKey = new Map(
    sourceInference.inferred.map((item) => [`${item.targetVendor}:${item.buffer}`, item] as const),
  )
  const rows: InferredActivityTableRow[] = []
  for (const vendorId of catalogManufacturerOrder) {
    for (const buffer of catalogBufferColumns(vendorId)) {
      const native = nativeRaw(enzyme, vendorId, buffer)
      const inferred = inferredByKey.get(`${vendorId}:${buffer}`)
      const skip = skipFor(sourceInference, vendorId, buffer)
      const composition = compositionFor(vendorId, buffer)
      const manufacturerShort = manufacturerShortLabel(vendorId)
      const manufacturerFull = listingName(enzyme, vendorId)
      const bufferLabel = catalogBufferLabel(vendorId, buffer)

      if (native !== null) {
        const formatted = formatActivityCell(native)
        const rationale = 'Native vendor chart; not overwritten by inference.'
        rows.push({
          vendorId,
          manufacturerShort,
          manufacturerFull,
          buffer,
          bufferLabel,
          bufferTitle: bufferTitleFor('measured', composition, bufferLabel),
          activity: formatted.activity,
          kind: 'measured',
          confidence: 'Measured',
          rationale,
          needsAdditive: formatted.needsAdditive,
          starRisk: formatted.starRisk,
          flagsTitle: flagsTitle(formatted.needsAdditive, formatted.starRisk, rationale),
        })
        continue
      }

      if (inferred?.measuredIfAny) {
        const formatted = formatActivityCell(inferred.measuredIfAny)
        const needsAdditive = formatted.needsAdditive || Boolean(inferred.needsAdditive)
        const starRisk = formatted.starRisk || Boolean(inferred.starRisk)
        rows.push({
          vendorId,
          manufacturerShort,
          manufacturerFull,
          buffer,
          bufferLabel,
          bufferTitle: bufferTitleFor('measured', composition, bufferLabel),
          activity: formatted.activity,
          kind: 'measured',
          confidence: 'Measured',
          rationale: inferred.rationale,
          needsAdditive,
          starRisk,
          flagsTitle: flagsTitle(needsAdditive, starRisk, inferred.rationale),
        })
        continue
      }

      if (inferred) {
        rows.push({
          vendorId,
          manufacturerShort,
          manufacturerFull,
          buffer,
          bufferLabel,
          bufferTitle: bufferTitleFor('inferred', composition, bufferLabel),
          activity: formatInferredActivity(inferred.inferredLo, inferred.inferredHi),
          kind: 'inferred',
          confidence: confidenceLabel(inferred.confidence),
          rationale: inferred.rationale,
          needsAdditive: Boolean(inferred.needsAdditive),
          starRisk: Boolean(inferred.starRisk),
          flagsTitle: flagsTitle(Boolean(inferred.needsAdditive), Boolean(inferred.starRisk), inferred.rationale),
        })
        continue
      }

      const observed = nativeObservedPoints(source)
      const double = inferDoubleProprietaryActivity(
        observed,
        {
          needsAdditive: profileNeedsAdditive(source),
          starInLowSalt: starInLowSalt(source, observed, enzyme.notes),
          preferredIsSpecific: source.preferredBuffer === 'specific',
        },
        vendorId,
        buffer,
      )
      if (double) {
        const rationale = double.rationale
        rows.push({
          vendorId,
          manufacturerShort,
          manufacturerFull,
          buffer,
          bufferLabel,
          bufferTitle: bufferTitleFor('double', composition, bufferLabel),
          activity: formatInferredActivity(double.inferredLo, double.inferredHi),
          kind: 'double',
          confidence: 'Double, low',
          rationale,
          needsAdditive: double.needsAdditive,
          starRisk: double.starRisk,
          flagsTitle: flagsTitle(double.needsAdditive, double.starRisk, rationale),
        })
        continue
      }

      const rationale =
        skip?.rationale ?? composition?.skipReason ?? composition?.notes ?? 'Proprietary or unpublished composition.'
      rows.push({
        vendorId,
        manufacturerShort,
        manufacturerFull,
        buffer,
        bufferLabel,
        bufferTitle: bufferTitleFor('unknown', composition, bufferLabel),
        activity: '—',
        kind: 'unknown',
        confidence: 'Unknown',
        rationale,
        needsAdditive: false,
        starRisk: false,
        flagsTitle: rationale,
      })
    }
  }

  const sourceShort = manufacturerShortLabel(source.id)
  const sourceFull = source.name
  const doubleNote = rows.some((row) => row.kind === 'double')
    ? 'ROSE and ONE activity uses double inference: unpublished 1X composition was fitted first, then this enzyme’s chart was interpolated. Combined confidence is low.'
    : ''
  return {
    enzymeName: enzyme.name,
    source,
    sourceShort,
    sourceFull,
    caption: `Inferred activity for ${enzyme.name} from ${sourceShort} chart`,
    doubleInferenceNote: doubleNote,
    rows,
  }
}

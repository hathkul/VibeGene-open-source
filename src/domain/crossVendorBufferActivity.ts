/**
 * Cross-vendor restriction-buffer activity inference.
 *
 * Native `bufferActivity` charts are empirical vs that vendor's own 1X set.
 * Those points constrain salt / pH / Mg / anion / BSA-reductant tolerance.
 * This module maps those windows onto published 1X compositions of *other*
 * vendors' buffers with nearest-neighbor / piecewise-linear interpolation in
 * salt×pH×anion space (not a fitted black-box model).
 *
 * Rules of thumb:
 * - Never overwrite a vendor's own measured chart.
 * - Proprietary chemistry (ROSE, Jena UB, EURx ONE / Sau3AI) is not invented.
 * - Acetate universals (Tango / Y / rCutSmart / Roche A / Takara T / V5 / B5)
 *   prefer a native acetate prior, then salt-adjust.
 * - Low-Mg and pH≥8.5 targets widen the range and drop confidence when the
 *   native set has no analog.
 * - Oligo / SAM / enzyme-specific additives cap claims in generic foreign buffers.
 */

import type { EnzymeBufferCode, EnzymeManufacturer, EnzymeManufacturerId, RestrictionEnzyme } from './types.ts'

export type ActivityConfidence = 'high' | 'medium' | 'low' | 'none'
export type Anion = 'chloride' | 'acetate' | 'mixed' | 'unknown'
export type ProteinCarrier = 'none' | 'BSA' | 'rAlbumin'
export type Reductant = 'none' | 'DTT' | 'DTE' | 'BME'

export type ParsedActivity = {
  raw: string
  interpolatable: boolean
  nr: boolean
  lo: number | null
  hi: number | null
  mid: number | null
  star: boolean
  additives: string[]
}

export type BufferComposition = {
  vendor: EnzymeManufacturerId
  buffer: EnzymeBufferCode | string
  known: boolean
  proprietary: boolean
  partial: boolean
  extra?: boolean
  compositionSource?: 'high' | 'medium' | 'low'
  skipReason?: string
  monovalentSalt_mM: number | null
  mg_mM: number | null
  pH: number | null
  anion: Anion
  proteinCarrier: ProteinCarrier
  reductant: Reductant
  unusual: string[]
  notes?: string
}

export type ObservedPoint = {
  vendor: EnzymeManufacturerId
  buffer: string
  activity: ParsedActivity
  composition: BufferComposition
}

export type InferredTarget = {
  targetVendor: EnzymeManufacturerId
  buffer: string
  inferredLo: number
  inferredHi: number
  confidence: Exclude<ActivityConfidence, 'none'>
  rationale: string
  measuredIfAny: string | null
  needsAdditive?: boolean
  starRisk?: boolean
  extra?: boolean
}

export type ProprietarySkip = {
  targetVendor: EnzymeManufacturerId
  buffer: string
  confidence: 'none'
  rationale: string
}

export type SourceInference = {
  vendor: EnzymeManufacturerId
  nativeInterpolatable: number
  inferred: InferredTarget[]
  skipped: ProprietarySkip[]
}

export type EnzymeInference = {
  enzyme: string
  sources: SourceInference[]
}

export type ValidationResidual = {
  enzyme: string
  fromVendor: EnzymeManufacturerId
  toVendor: EnzymeManufacturerId
  buffer: string
  inferredMid: number
  measuredMid: number
  residual: number
}

export type InferenceSummary = {
  catalogEnzymes: number
  manufacturerProfiles: number
  profilesWithEnoughPoints: number
  inferenceCount: number
  proprietarySkipCount: number
  absentCompositionSkipCount: number
  validation: {
    comparedPoints: number
    mae: number | null
    pctWithin20: number | null
    medianAbsResidual: number | null
  }
  knownFailureModes: string[]
}

export type CatalogInferenceResult = {
  enzymes: EnzymeInference[]
  residuals: ValidationResidual[]
  summary: InferenceSummary
}

const ADDITIVE_TOKENS = ['oligo', 'sam', 'dtt', 'bsa', 'triton', 'detergent', 'atp'] as const

function buf(
  vendor: EnzymeManufacturerId,
  buffer: string,
  fields: Omit<BufferComposition, 'vendor' | 'buffer'>,
): BufferComposition {
  return { vendor, buffer, ...fields }
}

function knownChloride(args: {
  vendor: EnzymeManufacturerId
  buffer: string
  salt: number
  mg?: number
  pH: number
  carrier?: ProteinCarrier
  reductant?: Reductant
  unusual?: string[]
  extra?: boolean
  notes?: string
}): BufferComposition {
  const unusual = [...(args.unusual ?? [])]
  if ((args.mg ?? 10) < 8) unusual.push('lowMg')
  if (args.pH >= 8.5) unusual.push('highpH')
  return buf(args.vendor, args.buffer, {
    known: true,
    proprietary: false,
    partial: false,
    extra: args.extra,
    compositionSource: 'high',
    monovalentSalt_mM: args.salt,
    mg_mM: args.mg ?? 10,
    pH: args.pH,
    anion: 'chloride',
    proteinCarrier: args.carrier ?? 'none',
    reductant: args.reductant ?? 'none',
    unusual,
    notes: args.notes,
  })
}

function knownAcetate(args: {
  vendor: EnzymeManufacturerId
  buffer: string
  salt: number
  mg?: number
  pH: number
  carrier?: ProteinCarrier
  reductant?: Reductant
  unusual?: string[]
  extra?: boolean
  compositionSource?: 'high' | 'medium' | 'low'
  notes?: string
}): BufferComposition {
  const unusual = [...(args.unusual ?? [])]
  if ((args.mg ?? 10) < 8) unusual.push('lowMg')
  return buf(args.vendor, args.buffer, {
    known: true,
    proprietary: false,
    partial: false,
    extra: args.extra,
    compositionSource: args.compositionSource ?? 'high',
    monovalentSalt_mM: args.salt,
    mg_mM: args.mg ?? 10,
    pH: args.pH,
    anion: 'acetate',
    proteinCarrier: args.carrier ?? 'none',
    reductant: args.reductant ?? 'none',
    unusual,
    notes: args.notes,
  })
}

function proprietary(vendor: EnzymeManufacturerId, buffer: string, reason: string): BufferComposition {
  return buf(vendor, buffer, {
    known: false,
    proprietary: true,
    partial: false,
    compositionSource: 'low',
    skipReason: reason,
    monovalentSalt_mM: null,
    mg_mM: null,
    pH: null,
    anion: 'unknown',
    proteinCarrier: 'none',
    reductant: 'none',
    unusual: [],
  })
}

function absent(vendor: EnzymeManufacturerId, buffer: string, reason: string): BufferComposition {
  return buf(vendor, buffer, {
    known: false,
    proprietary: false,
    partial: false,
    skipReason: reason,
    monovalentSalt_mM: null,
    mg_mM: null,
    pH: null,
    anion: 'unknown',
    proteinCarrier: 'none',
    reductant: 'none',
    unusual: [],
  })
}

function scaleUb(factor: number): BufferComposition {
  const salt = 100 * factor
  const mg = 10 * factor
  const unusual = ['ubMediumConfidenceSource']
  if (mg < 8) unusual.push('lowMg')
  if (salt >= 150) unusual.push('highSalt')
  return buf('vivantis', factor === 1 ? 'ub' : factor === 0.5 ? 'ub05' : factor === 1.5 ? 'ub15' : 'ub2', {
    known: true,
    proprietary: false,
    partial: false,
    compositionSource: 'medium',
    monovalentSalt_mM: salt,
    mg_mM: mg,
    pH: 7.6,
    anion: 'acetate',
    proteinCarrier: 'BSA',
    reductant: 'BME',
    unusual,
    notes: 'UB 1X from single-page evidence; scaled ions at 0.5x/1.5x/2.0x',
  })
}

/** Published 1X working-strength compositions used for inference. */
export const BUFFER_COMPOSITIONS: BufferComposition[] = [
  knownChloride({ vendor: 'neb', buffer: 'r1.1', salt: 0, pH: 7.0, carrier: 'rAlbumin' }),
  knownChloride({ vendor: 'neb', buffer: 'r2.1', salt: 50, pH: 7.9, carrier: 'rAlbumin' }),
  knownChloride({ vendor: 'neb', buffer: 'r3.1', salt: 100, pH: 7.9, carrier: 'rAlbumin', unusual: ['highTris'] }),
  knownAcetate({ vendor: 'neb', buffer: 'cutSmart', salt: 50, pH: 7.9, carrier: 'rAlbumin' }),

  knownChloride({ vendor: 'thermo', buffer: 'b', salt: 0, pH: 7.5, carrier: 'BSA' }),
  knownChloride({ vendor: 'thermo', buffer: 'g', salt: 50, pH: 7.5, carrier: 'BSA' }),
  knownChloride({ vendor: 'thermo', buffer: 'o', salt: 100, pH: 7.5, carrier: 'BSA', unusual: ['highTris'] }),
  knownChloride({ vendor: 'thermo', buffer: 'r', salt: 100, pH: 8.5, carrier: 'BSA' }),
  knownAcetate({ vendor: 'thermo', buffer: 'tango', salt: 66, pH: 7.9, carrier: 'BSA' }),

  knownChloride({ vendor: 'sibenzyme', buffer: 'b', salt: 0, pH: 7.6, reductant: 'DTT' }),
  knownChloride({ vendor: 'sibenzyme', buffer: 'g', salt: 50, pH: 7.6, reductant: 'DTT' }),
  knownChloride({ vendor: 'sibenzyme', buffer: 'o', salt: 100, pH: 7.6, reductant: 'DTT', unusual: ['highTris'] }),
  knownChloride({ vendor: 'sibenzyme', buffer: 'w', salt: 100, pH: 8.5, reductant: 'DTT' }),
  knownAcetate({ vendor: 'sibenzyme', buffer: 'y', salt: 66, pH: 7.9, reductant: 'DTT' }),
  proprietary('sibenzyme', 'rose', 'ROSE chemistry unpublished; ROSE+ only adds BSA'),

  knownAcetate({ vendor: 'usb', buffer: 'a', salt: 66, pH: 7.9, carrier: 'BSA' }),
  knownChloride({ vendor: 'usb', buffer: 'b', salt: 0, pH: 7.5, carrier: 'BSA' }),
  knownChloride({ vendor: 'usb', buffer: 'c', salt: 50, pH: 7.5, carrier: 'BSA' }),
  knownChloride({ vendor: 'usb', buffer: 'd', salt: 100, pH: 7.5, carrier: 'BSA', unusual: ['highTris'] }),
  knownChloride({
    vendor: 'usb',
    buffer: 'e',
    salt: 100,
    pH: 8.5,
    carrier: 'BSA',
    notes: 'Default Thermo R; MssI sheet conflicts',
  }),
  ...(['f', 'g', 'h', 'j', 'k', 'l'] as const).map((code) =>
    absent('usb', code, 'USB buffers F–L composition not found'),
  ),

  knownChloride({ vendor: 'vivantis', buffer: 'v1', salt: 0, pH: 7.5, carrier: 'BSA' }),
  knownChloride({ vendor: 'vivantis', buffer: 'v2', salt: 50, pH: 7.5, carrier: 'BSA' }),
  knownChloride({ vendor: 'vivantis', buffer: 'v3', salt: 100, pH: 7.5, carrier: 'BSA', unusual: ['highTris'] }),
  knownChloride({ vendor: 'vivantis', buffer: 'v4', salt: 100, pH: 8.5, carrier: 'BSA' }),
  knownAcetate({ vendor: 'vivantis', buffer: 'v5', salt: 60, pH: 7.9, carrier: 'BSA' }),
  scaleUb(0.5),
  scaleUb(1),
  scaleUb(1.5),
  scaleUb(2),
  absent('vivantis', 'specific', 'enzyme-specific named buffer; composition not invented'),

  knownAcetate({ vendor: 'roche', buffer: 'a', salt: 66, pH: 7.9, reductant: 'DTT' }),
  knownChloride({
    vendor: 'roche',
    buffer: 'b',
    salt: 100,
    mg: 5,
    pH: 8.0,
    reductant: 'BME',
    unusual: ['lowMg'],
  }),
  knownChloride({ vendor: 'roche', buffer: 'l', salt: 0, pH: 7.5, reductant: 'DTE' }),
  knownChloride({ vendor: 'roche', buffer: 'm', salt: 50, pH: 7.5, reductant: 'DTE' }),
  knownChloride({ vendor: 'roche', buffer: 'h', salt: 100, pH: 7.5, reductant: 'DTE', unusual: ['highTris'] }),

  knownChloride({ vendor: 'takara', buffer: 'l', salt: 0, pH: 7.5, reductant: 'DTT' }),
  knownChloride({ vendor: 'takara', buffer: 'm', salt: 50, pH: 7.5, reductant: 'DTT' }),
  knownChloride({ vendor: 'takara', buffer: 'h', salt: 100, pH: 7.5, reductant: 'DTT', unusual: ['highTris'] }),
  knownChloride({ vendor: 'takara', buffer: 'k', salt: 100, pH: 8.5, reductant: 'DTT' }),
  knownAcetate({ vendor: 'takara', buffer: 't', salt: 66, pH: 7.9, carrier: 'BSA', reductant: 'DTT' }),
  absent('takara', 'basal', 'enzyme-specific basal buffer; not one composition'),

  knownChloride({ vendor: 'promega', buffer: 'a', salt: 6, mg: 6, pH: 7.5, reductant: 'DTT', unusual: ['lowMg'] }),
  knownChloride({ vendor: 'promega', buffer: 'b', salt: 50, mg: 6, pH: 7.5, reductant: 'DTT', unusual: ['lowMg'] }),
  knownChloride({ vendor: 'promega', buffer: 'c', salt: 50, pH: 7.9, reductant: 'DTT' }),
  knownChloride({ vendor: 'promega', buffer: 'd', salt: 150, mg: 6, pH: 7.9, reductant: 'DTT', unusual: ['lowMg'] }),
  knownChloride({ vendor: 'promega', buffer: 'e', salt: 100, mg: 6, pH: 7.5, reductant: 'DTT', unusual: ['lowMg'] }),
  knownChloride({ vendor: 'promega', buffer: 'h', salt: 50, pH: 7.5, unusual: ['highTris'] }),
  knownAcetate({ vendor: 'promega', buffer: 'multicore', salt: 100, pH: 7.5, reductant: 'DTT' }),
  knownChloride({ vendor: 'promega', buffer: 'f', salt: 100, pH: 8.5, reductant: 'DTT', extra: true }),
  knownChloride({
    vendor: 'promega',
    buffer: 'g',
    salt: 0,
    mg: 5,
    pH: 8.2,
    unusual: ['lowMg', 'highTris'],
    extra: true,
  }),
  knownChloride({
    vendor: 'promega',
    buffer: 'j',
    salt: 50,
    mg: 7,
    pH: 7.5,
    reductant: 'DTT',
    unusual: ['lowMg'],
    extra: true,
  }),
  knownChloride({
    vendor: 'promega',
    buffer: 'k',
    salt: 150,
    pH: 7.4,
    notes: 'DTT disputed (HTML none, PDF 1 mM)',
    extra: true,
  }),
  knownChloride({
    vendor: 'promega',
    buffer: 'l',
    salt: 100,
    mg: 3,
    pH: 9.0,
    unusual: ['lowMg', 'highpH'],
    extra: true,
  }),

  knownChloride({ vendor: 'jena', buffer: 'b1', salt: 0, pH: 7.9, carrier: 'BSA' }),
  knownChloride({ vendor: 'jena', buffer: 'b2', salt: 50, pH: 7.9, carrier: 'BSA' }),
  knownChloride({ vendor: 'jena', buffer: 'b3', salt: 100, pH: 7.9, carrier: 'BSA', unusual: ['highTris'] }),
  knownChloride({ vendor: 'jena', buffer: 'b4', salt: 150, pH: 7.9, carrier: 'BSA' }),
  knownAcetate({ vendor: 'jena', buffer: 'b5', salt: 50, pH: 7.9, carrier: 'BSA' }),
  proprietary('jena', 'ub', 'Jena UB chemistry unpublished'),
  proprietary('jena', 'ub05', 'Jena UB chemistry unpublished'),
  proprietary('jena', 'ub2', 'Jena UB chemistry unpublished'),

  proprietary('eurx', 'one', 'EURx ONE chemistry unpublished'),
  buf('eurx', 'cviJI', {
    known: true,
    proprietary: false,
    partial: false,
    compositionSource: 'high',
    monovalentSalt_mM: 50,
    mg_mM: 10,
    pH: 8.5,
    anion: 'acetate',
    proteinCarrier: 'none',
    reductant: 'DTT',
    unusual: ['DMSO', 'highpH'],
    notes: 'glycylglycine-KOH + 10% DMSO',
  }),
  buf('eurx', 'cviJIStar', {
    known: true,
    proprietary: false,
    partial: false,
    compositionSource: 'high',
    monovalentSalt_mM: 50,
    mg_mM: 10,
    pH: 8.5,
    anion: 'acetate',
    proteinCarrier: 'none',
    reductant: 'DTT',
    unusual: ['DMSO', 'ATP', 'highpH'],
    notes: 'CviJI* = CviJI + 0.1 mM ATP + 30% DMSO',
  }),
  buf('eurx', 'tspGWI', {
    known: true,
    proprietary: false,
    partial: true,
    compositionSource: 'low',
    monovalentSalt_mM: 0,
    mg_mM: 10,
    pH: 8.5,
    anion: 'chloride',
    proteinCarrier: 'none',
    reductant: 'DTT',
    unusual: ['highpH', 'unknownEnhancers'],
    notes: 'partial: unknown enhancers',
  }),
  buf('eurx', 'tspDTI', {
    known: true,
    proprietary: false,
    partial: true,
    compositionSource: 'low',
    monovalentSalt_mM: 0,
    mg_mM: 10,
    pH: 8.5,
    anion: 'chloride',
    proteinCarrier: 'none',
    reductant: 'DTT',
    unusual: ['highpH', 'unknownEnhancers'],
    notes: 'partial: unknown enhancers',
  }),
  proprietary('eurx', 'sau3AI', 'EURx Sau3AI unpublished + BSA + detergent'),
  absent('eurx', 'specific', 'enzyme-specific buffer; composition not invented'),
]

const compositionByKey = new Map(BUFFER_COMPOSITIONS.map((entry) => [`${entry.vendor}:${entry.buffer}`, entry]))

export function compositionFor(vendor: EnzymeManufacturerId, buffer: string): BufferComposition | undefined {
  return compositionByKey.get(`${vendor}:${buffer}`)
}

/** Compact published 1X recipe for hover; omits null salt/pH/Mg rather than inventing values. */
export function formatBufferRecipe(composition: BufferComposition): string {
  const parts: string[] = []
  if (composition.monovalentSalt_mM != null) {
    if (composition.anion === 'chloride' || composition.anion === 'acetate') {
      parts.push(`${composition.monovalentSalt_mM} mM ${composition.anion}`)
    } else {
      parts.push(`${composition.monovalentSalt_mM} mM`)
    }
  }
  if (composition.pH != null) parts.push(`pH ${composition.pH}`)
  if (composition.mg_mM != null) parts.push(`${composition.mg_mM} mM Mg`)
  if (parts.length === 0 && !composition.notes) return ''
  const carrier = composition.proteinCarrier === 'none' ? 'none' : composition.proteinCarrier
  const reductant = composition.reductant === 'none' ? 'no reductant' : composition.reductant
  parts.push(carrier, reductant)
  let text = `1X: ${parts.join(', ')}`
  if (composition.notes) text += `; ${composition.notes}`
  return text
}

export function parseActivity(value: number | string | null | undefined): ParsedActivity | null {
  if (value === null || value === undefined || value === '') return null
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return null
    const clamped = Math.max(0, value)
    return {
      raw: String(value),
      interpolatable: true,
      nr: false,
      lo: Math.min(100, clamped),
      hi: Math.min(100, clamped),
      mid: Math.min(100, clamped),
      star: false,
      additives: [],
    }
  }

  const raw = value.trim()
  if (!raw) return null
  const star = /\*/.test(raw)
  const additives = detectAdditives(raw)
  let text = raw.replace(/\*/g, '').replace(/–/g, '-').replace(/%/g, '').trim()

  const parenAdditive = text.match(/\(([^)]+)\)/g) ?? []
  let parentheticalNumber: number | null = null
  for (const chunk of parenAdditive) {
    const inner = chunk.slice(1, -1).trim()
    if (/^\d+(?:-\d+)?$/.test(inner) && !inner.includes('-')) {
      parentheticalNumber = Number(inner)
    }
    text = text.replace(chunk, ' ').trim()
  }
  text = text.replace(/\s+/g, ' ').trim()

  if (!text && parentheticalNumber !== null) {
    return {
      raw,
      interpolatable: true,
      nr: false,
      lo: clampPct(parentheticalNumber - 10),
      hi: clampPct(parentheticalNumber + 10),
      mid: clampPct(parentheticalNumber),
      star,
      additives,
    }
  }

  if (!text || /^nr\b/i.test(text)) {
    return {
      raw,
      interpolatable: false,
      nr: true,
      lo: null,
      hi: null,
      mid: null,
      star,
      additives,
    }
  }

  const lessThan = text.match(/^<\s*(\d+)/)
  if (lessThan) {
    const hi = Number(lessThan[1])
    return {
      raw,
      interpolatable: true,
      nr: false,
      lo: 0,
      hi,
      mid: hi / 2,
      star,
      additives,
    }
  }

  const greaterThan = text.match(/^>\s*(\d+)/)
  if (greaterThan) {
    const lo = Number(greaterThan[1])
    return {
      raw,
      interpolatable: true,
      nr: false,
      lo,
      hi: 100,
      mid: (lo + 100) / 2,
      star,
      additives,
    }
  }

  const range = text.match(/^(\d+)\s*-\s*(\d+)/)
  if (range) {
    const lo = Number(range[1])
    const hi = Number(range[2])
    return {
      raw,
      interpolatable: true,
      nr: false,
      lo,
      hi,
      mid: (lo + hi) / 2,
      star,
      additives,
    }
  }

  const exact = text.match(/^(\d+(?:\.\d+)?)/)
  if (exact) {
    const valueNum = Number(exact[1])
    return {
      raw,
      interpolatable: true,
      nr: false,
      lo: valueNum,
      hi: valueNum,
      mid: valueNum,
      star,
      additives,
    }
  }

  return {
    raw,
    interpolatable: false,
    nr: false,
    lo: null,
    hi: null,
    mid: null,
    star,
    additives,
  }
}

function detectAdditives(text: string): string[] {
  const lower = text.toLowerCase()
  const found: string[] = []
  for (const token of ADDITIVE_TOKENS) {
    if (lower.includes(token)) found.push(token)
  }
  return found
}

function clampPct(value: number) {
  return Math.max(0, Math.min(100, value))
}

function roundPct(value: number) {
  return clampPct(Math.round(value / 5) * 5)
}

function notesBlob(profile: EnzymeManufacturer): string {
  return [...(profile.catalogNotes ?? []), profile.suppliedBuffer ?? '', profile.enzymeSpecificBuffer ?? '', profile.bsa ?? '', profile.tango2x ?? '']
    .join(' ')
    .toLowerCase()
}

export function profileNeedsAdditive(profile: EnzymeManufacturer): string[] {
  const required = new Set<string>()
  const blob = notesBlob(profile)
  if (/\+?\s*oligo/.test(blob) || /\boligo\b/.test(blob)) required.add('oligo')
  if (/\bsam\b/.test(blob)) required.add('SAM')
  if (/triton/.test(blob)) required.add('Triton')
  const activities = Object.values(profile.bufferActivity)
    .map((value) => parseActivity(value))
    .filter((entry): entry is ParsedActivity => Boolean(entry?.interpolatable))
  if (activities.length > 0 && activities.every((entry) => entry.additives.includes('oligo'))) required.add('oligo')
  if (activities.length > 0 && activities.every((entry) => entry.additives.includes('sam'))) required.add('SAM')
  if (profile.preferredBuffer === 'specific') required.add('enzyme-specific buffer')
  return [...required]
}

function tango2xComposition(): BufferComposition {
  return knownAcetate({
    vendor: 'thermo',
    buffer: 'tango2x',
    salt: 132,
    mg: 20,
    pH: 7.9,
    carrier: 'BSA',
    unusual: ['highSalt', '2xIons'],
  })
}

export function nativeObservedPoints(profile: EnzymeManufacturer): ObservedPoint[] {
  const points: ObservedPoint[] = []
  for (const [buffer, value] of Object.entries(profile.bufferActivity)) {
    const activity = parseActivity(value)
    if (!activity?.interpolatable) continue
    const composition = compositionFor(profile.id, buffer)
    if (!composition?.known) continue
    points.push({ vendor: profile.id, buffer, activity, composition })
  }
  if (profile.id === 'thermo' && profile.tango2x) {
    const activity = parseActivity(profile.tango2x)
    if (activity?.interpolatable) {
      points.push({
        vendor: 'thermo',
        buffer: 'tango2x',
        activity,
        composition: tango2xComposition(),
      })
    }
  }
  return points
}

type Band = { lo: number; hi: number; mid: number }

function lerpBand(a: Band, b: Band, t: number): Band {
  const u = Math.max(0, Math.min(1, t))
  return {
    lo: a.lo + (b.lo - a.lo) * u,
    hi: a.hi + (b.hi - a.hi) * u,
    mid: a.mid + (b.mid - a.mid) * u,
  }
}

function bandOf(point: ObservedPoint): Band {
  return {
    lo: point.activity.lo ?? point.activity.mid ?? 0,
    hi: point.activity.hi ?? point.activity.mid ?? 0,
    mid: point.activity.mid ?? 0,
  }
}

function interpolateBySalt(points: ObservedPoint[], salt: number): { band: Band; used: ObservedPoint[]; method: string } | null {
  if (points.length === 0) return null
  const sorted = [...points].toSorted((a, b) => (a.composition.monovalentSalt_mM ?? 0) - (b.composition.monovalentSalt_mM ?? 0))
  if (sorted.length === 1) {
    return { band: bandOf(sorted[0]!), used: sorted, method: 'nearest-salt' }
  }
  if (salt <= (sorted[0]!.composition.monovalentSalt_mM ?? 0)) {
    return { band: bandOf(sorted[0]!), used: [sorted[0]!], method: 'floor-salt' }
  }
  const last = sorted[sorted.length - 1]!
  if (salt >= (last.composition.monovalentSalt_mM ?? 0)) {
    return { band: bandOf(last), used: [last], method: 'ceil-salt' }
  }
  for (let i = 0; i < sorted.length - 1; i += 1) {
    const left = sorted[i]!
    const right = sorted[i + 1]!
    const s0 = left.composition.monovalentSalt_mM ?? 0
    const s1 = right.composition.monovalentSalt_mM ?? 0
    if (salt >= s0 && salt <= s1) {
      const t = s1 === s0 ? 0 : (salt - s0) / (s1 - s0)
      return { band: lerpBand(bandOf(left), bandOf(right), t), used: [left, right], method: 'lerp-salt' }
    }
  }
  return { band: bandOf(last), used: [last], method: 'nearest-salt' }
}

function featureDistance(from: BufferComposition, to: BufferComposition): number {
  const saltA = from.monovalentSalt_mM ?? 50
  const saltB = to.monovalentSalt_mM ?? 50
  const pHa = from.pH ?? 7.9
  const pHb = to.pH ?? 7.9
  const mgA = from.mg_mM ?? 10
  const mgB = to.mg_mM ?? 10
  const anionPenalty = from.anion === to.anion ? 0 : from.anion === 'unknown' || to.anion === 'unknown' ? 2 : 1.4
  return Math.abs(saltA - saltB) / 50 + Math.abs(pHa - pHb) / 0.5 + Math.abs(mgA - mgB) / 5 + anionPenalty
}

function nearest(points: ObservedPoint[], target: BufferComposition): ObservedPoint | null {
  if (points.length === 0) return null
  return [...points].toSorted((a, b) => featureDistance(a.composition, target) - featureDistance(b.composition, target))[0] ?? null
}

function hasHighPhAnalog(points: ObservedPoint[]) {
  return points.some((point) => (point.composition.pH ?? 0) >= 8.4)
}

function hasLowMgAnalog(points: ObservedPoint[]) {
  return points.some((point) => (point.composition.mg_mM ?? 10) < 8)
}

function saltClass(points: ObservedPoint[]): 'sensitive' | 'requiring' | 'tolerant' | 'unknown' {
  const chloride = points
    .filter((point) => point.composition.anion === 'chloride')
    .toSorted((a, b) => (a.composition.monovalentSalt_mM ?? 0) - (b.composition.monovalentSalt_mM ?? 0))
  if (chloride.length < 2) return 'unknown'
  const first = chloride[0]!.activity.mid ?? 0
  const last = chloride[chloride.length - 1]!.activity.mid ?? 0
  if (first - last >= 25) return 'sensitive'
  if (last - first >= 25) return 'requiring'
  return 'tolerant'
}

function widenDown(band: Band, delta: number): Band {
  return { lo: clampPct(band.lo - delta), hi: band.hi, mid: clampPct((Math.max(0, band.lo - delta) + band.hi) / 2) }
}

function applyCarrierReductant(band: Band, fromPoints: ObservedPoint[], target: BufferComposition): { band: Band; note: string | null } {
  const donors = fromPoints
  const donorCarriers = new Set(donors.map((point) => point.composition.proteinCarrier))
  const donorReductants = new Set(donors.map((point) => point.composition.reductant))
  let next = band
  const notes: string[] = []
  const donorHasCarrier = [...donorCarriers].some((value) => value !== 'none')
  if (donorHasCarrier && target.proteinCarrier === 'none') {
    next = widenDown(next, 10)
    notes.push('no protein carrier')
  }
  const donorHasReductant = [...donorReductants].some((value) => value !== 'none')
  const targetHasReductant = target.reductant !== 'none'
  if (donorHasReductant !== targetHasReductant) {
    next = { lo: clampPct(next.lo - 5), hi: clampPct(next.hi + 5), mid: next.mid }
    notes.push('reductant mismatch')
  }
  return { band: next, note: notes.length ? notes.join('; ') : null }
}

function confidenceRank(value: ActivityConfidence) {
  if (value === 'high') return 3
  if (value === 'medium') return 2
  if (value === 'low') return 1
  return 0
}

function minConfidence(a: ActivityConfidence, b: ActivityConfidence): ActivityConfidence {
  return confidenceRank(a) <= confidenceRank(b) ? a : b
}

export function inferTargetActivity(
  observed: ObservedPoint[],
  target: BufferComposition,
  extras: {
    needsAdditive: string[]
    starInLowSalt: boolean
    preferredIsSpecific: boolean
  },
): Omit<InferredTarget, 'targetVendor' | 'buffer' | 'measuredIfAny' | 'extra'> | { confidence: 'none'; rationale: string } {
  if (!target.known || target.proprietary) {
    return { confidence: 'none', rationale: target.skipReason ?? 'unknown chemistry' }
  }
  if (observed.length < 2) {
    return { confidence: 'none', rationale: 'need ≥2 numeric native points' }
  }

  const sameAnion = observed.filter((point) => point.composition.anion === target.anion)
  const chloride = observed.filter((point) => point.composition.anion === 'chloride')
  const acetate = observed.filter((point) => point.composition.anion === 'acetate')
  const targetSalt = target.monovalentSalt_mM ?? 50
  const targetPh = target.pH ?? 7.9
  const saltKind = saltClass(observed)

  let band: Band
  let conf: ActivityConfidence = 'high'
  const reasons: string[] = []

  if (target.anion === 'acetate') {
    const acetateFit = interpolateBySalt(acetate, targetSalt)
    if (acetateFit) {
      band = acetateFit.band
      reasons.push(`acetate prior ${acetateFit.method} @ ${targetSalt} mM`)
      if (Math.abs(targetSalt - 66) >= 30) conf = minConfidence(conf, 'medium')
    } else {
      const chlorideFit = interpolateBySalt(chloride, targetSalt)
      if (!chlorideFit) {
        const neighbor = nearest(observed, target)
        if (!neighbor) return { confidence: 'none', rationale: 'no usable native analog' }
        band = bandOf(neighbor)
        reasons.push(`nn ${neighbor.buffer} (no acetate prior)`)
      } else {
        band = chlorideFit.band
        reasons.push(`chloride→acetate ${chlorideFit.method}`)
      }
      conf = 'low'
    }
  } else {
    const pHMatched = chloride.filter((point) => Math.abs((point.composition.pH ?? 7.5) - targetPh) <= 0.6)
    const highPh = chloride.filter((point) => (point.composition.pH ?? 0) >= 8.4)
    const pool =
      targetPh >= 8.4 && highPh.length > 0 ? highPh : pHMatched.length >= 2 ? pHMatched : chloride.length >= 2 ? chloride : observed
    const fit = interpolateBySalt(pool, targetSalt)
    if (fit) {
      band = fit.band
      reasons.push(`${target.anion} ${fit.method} @ ${targetSalt} mM`)
      if (pool !== chloride && pool !== pHMatched && target.anion === 'chloride' && sameAnion.length === 0) {
        conf = minConfidence(conf, 'low')
      }
    } else {
      const neighbor = nearest(observed, target)
      if (!neighbor) return { confidence: 'none', rationale: 'no usable native analog' }
      band = bandOf(neighbor)
      reasons.push(`nn ${neighbor.buffer}`)
      conf = minConfidence(conf, 'medium')
    }
    if (targetPh >= 8.4 && !hasHighPhAnalog(observed)) {
      band = widenDown(band, 20)
      conf = minConfidence(conf, 'low')
      reasons.push('no native pH≥8.5')
    } else if (targetPh >= 8.4) {
      reasons.push('native high-pH analog')
    }
  }

  if ((target.mg_mM ?? 10) < 8 && !hasLowMgAnalog(observed)) {
    const deficit = 10 - (target.mg_mM ?? 10)
    band = widenDown(band, 10 + deficit * 4)
    conf = minConfidence(conf, 'low')
    reasons.push(`low Mg ${target.mg_mM} mM, no native analog`)
  }

  if (target.partial) {
    band = widenDown(band, 15)
    conf = minConfidence(conf, 'low')
    reasons.push('partial composition')
  }
  if (target.compositionSource === 'medium') {
    conf = minConfidence(conf, 'medium')
    reasons.push('medium-confidence composition')
  }
  if (target.unusual.includes('DMSO') && !observed.some((point) => point.composition.unusual.includes('DMSO'))) {
    band = widenDown(band, 25)
    conf = minConfidence(conf, 'low')
    reasons.push('DMSO not in native set')
  }

  const adjusted = applyCarrierReductant(band, sameAnion.length ? sameAnion : observed, target)
  band = adjusted.band
  if (adjusted.note) {
    conf = minConfidence(conf, 'medium')
    reasons.push(adjusted.note)
  }

  if (observed.length < 3) conf = minConfidence(conf, 'medium')

  if (saltKind === 'sensitive' && targetSalt >= 100 && band.mid > 40) {
    reasons.push('salt-sensitive')
  }
  if (saltKind === 'requiring' && targetSalt <= 10 && band.mid > 40) {
    reasons.push('salt-requiring')
  }

  let needsAdditive = extras.needsAdditive.length > 0
  if (extras.preferredIsSpecific) needsAdditive = true
  if (needsAdditive) {
    band = { lo: Math.min(band.lo, 20), hi: Math.min(band.hi, 50), mid: Math.min(band.mid, 35) }
    conf = minConfidence(conf, 'low')
    reasons.push(`needs ${extras.needsAdditive.join('/') || 'specific buffer'}`)
  }

  const starRisk =
    extras.starInLowSalt && targetSalt <= 20 && band.mid >= 50 && !target.unusual.includes('2xIons')

  if (conf === 'none') {
    return { confidence: 'none', rationale: reasons.join('; ') || 'unconstrained' }
  }

  const lo = roundPct(Math.min(band.lo, band.hi))
  const hi = roundPct(Math.max(band.lo, band.hi))
  return {
    inferredLo: lo,
    inferredHi: hi,
    confidence: conf,
    rationale: reasons.join('; ').slice(0, 160),
    needsAdditive: needsAdditive || undefined,
    starRisk: starRisk || undefined,
  }
}

function measuredRaw(profile: EnzymeManufacturer | undefined, buffer: string): string | null {
  if (!profile) return null
  const value = profile.bufferActivity[buffer as EnzymeBufferCode]
  if (value === null || value === undefined || value === '') return null
  return String(value)
}

export function starInLowSalt(profile: EnzymeManufacturer, observed: ObservedPoint[], enzymeNotes: string[]): boolean {
  const blob = `${notesBlob(profile)} ${enzymeNotes.join(' ')}`.toLowerCase()
  if (/star activity/.test(blob) && /low salt|non-optimal|glycerol/.test(blob)) return true
  return observed.some(
    (point) => point.activity.star && (point.composition.monovalentSalt_mM ?? 100) <= 50 && (point.activity.mid ?? 0) >= 50,
  )
}

const FAILURE_MODES = [
  'Same-named enzymes from different vendors are not always the same protein prep; validation residuals capture that.',
  'pH is reported at 25°C, 30°C, or 37°C depending on vendor; not overfit.',
  'ROSE, Jena UB, EURx ONE, and EURx Sau3AI are proprietary — not interpolated.',
  'USB F–L compositions were not found; USB E defaults to Thermo R (MssI sheet conflict).',
  'Vivantis UB 1X is medium-confidence single-page evidence; 0.5x/1.5x/2.0x are scaled ions.',
  'Oligo/SAM/enzyme-specific additives are not assumed present in foreign generic buffers.',
  'Star activity is flagged, not quantified.',
  'Low-Mg Promega/Roche buffers widen the range downward when the native chart has no low-Mg point.',
]

export function inferEnzyme(enzyme: RestrictionEnzyme): { entry: EnzymeInference; residuals: ValidationResidual[] } {
  const residuals: ValidationResidual[] = []
  const sources: SourceInference[] = []
  const profiles = enzyme.manufacturers

  for (const profile of profiles) {
    const observed = nativeObservedPoints(profile)
    if (observed.length < 2) continue
    const additives = profileNeedsAdditive(profile)
    const extras = {
      needsAdditive: additives,
      starInLowSalt: starInLowSalt(profile, observed, enzyme.notes),
      preferredIsSpecific: profile.preferredBuffer === 'specific',
    }
    const inferred: InferredTarget[] = []
    const skipped: ProprietarySkip[] = []
    const nativeKeys = new Set(
      Object.entries(profile.bufferActivity)
        .filter(([, value]) => value !== null && value !== undefined && value !== '')
        .map(([buffer]) => buffer),
    )

    for (const target of BUFFER_COMPOSITIONS) {
      const sameVendorMeasured = target.vendor === profile.id && nativeKeys.has(target.buffer)
      if (sameVendorMeasured) continue

      const prediction = inferTargetActivity(observed, target, extras)
      if (prediction.confidence === 'none') {
        if (target.proprietary || target.skipReason) {
          skipped.push({
            targetVendor: target.vendor,
            buffer: target.buffer,
            confidence: 'none',
            rationale: prediction.rationale,
          })
        }
        continue
      }

      const targetProfile = profiles.find((entry) => entry.id === target.vendor)
      const measured = measuredRaw(targetProfile, target.buffer)
      inferred.push({
        targetVendor: target.vendor,
        buffer: target.buffer,
        inferredLo: prediction.inferredLo,
        inferredHi: prediction.inferredHi,
        confidence: prediction.confidence,
        rationale: prediction.rationale,
        measuredIfAny: measured,
        needsAdditive: prediction.needsAdditive,
        starRisk: prediction.starRisk,
        extra: target.extra,
      })

      const measuredParsed = parseActivity(measured)
      if (measuredParsed?.interpolatable && measuredParsed.mid !== null) {
        const inferredMid = (prediction.inferredLo + prediction.inferredHi) / 2
        residuals.push({
          enzyme: enzyme.name,
          fromVendor: profile.id,
          toVendor: target.vendor,
          buffer: target.buffer,
          inferredMid,
          measuredMid: measuredParsed.mid,
          residual: inferredMid - measuredParsed.mid,
        })
      }
    }

    sources.push({
      vendor: profile.id,
      nativeInterpolatable: observed.length,
      inferred,
      skipped: collapseSkips(skipped),
    })
  }

  return { entry: { enzyme: enzyme.name, sources }, residuals }
}

function collapseSkips(skipped: ProprietarySkip[]): ProprietarySkip[] {
  const seen = new Set<string>()
  const out: ProprietarySkip[] = []
  for (const item of skipped) {
    const key = `${item.targetVendor}:${item.rationale}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push(item)
  }
  return out
}

function median(values: number[]): number | null {
  if (values.length === 0) return null
  const sorted = [...values].toSorted((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  if (sorted.length % 2 === 0) return (sorted[mid - 1]! + sorted[mid]!) / 2
  return sorted[mid]!
}

export function inferCatalog(enzymes: RestrictionEnzyme[]): CatalogInferenceResult {
  const entries: EnzymeInference[] = []
  const residuals: ValidationResidual[] = []
  let manufacturerProfiles = 0
  let profilesWithEnoughPoints = 0
  let inferenceCount = 0
  let proprietarySkipCount = 0
  let absentCompositionSkipCount = 0

  for (const enzyme of enzymes) {
    manufacturerProfiles += enzyme.manufacturers.length
    const { entry, residuals: enzymeResiduals } = inferEnzyme(enzyme)
    profilesWithEnoughPoints += entry.sources.length
    for (const source of entry.sources) {
      inferenceCount += source.inferred.length
      for (const skip of source.skipped) {
        if (/unpublished|proprietary|ROSE|ONE|Sau3AI/i.test(skip.rationale)) proprietarySkipCount += 1
        else absentCompositionSkipCount += 1
      }
    }
    if (entry.sources.length > 0) entries.push(entry)
    residuals.push(...enzymeResiduals)
  }

  const abs = residuals.map((row) => Math.abs(row.residual))
  const mae = abs.length ? abs.reduce((sum, value) => sum + value, 0) / abs.length : null
  const pctWithin20 = abs.length ? (100 * abs.filter((value) => value <= 20).length) / abs.length : null

  return {
    enzymes: entries,
    residuals,
    summary: {
      catalogEnzymes: enzymes.length,
      manufacturerProfiles,
      profilesWithEnoughPoints,
      inferenceCount,
      proprietarySkipCount,
      absentCompositionSkipCount,
      validation: {
        comparedPoints: residuals.length,
        mae: mae === null ? null : Math.round(mae * 10) / 10,
        pctWithin20: pctWithin20 === null ? null : Math.round(pctWithin20 * 10) / 10,
        medianAbsResidual: median(abs) === null ? null : Math.round(median(abs)! * 10) / 10,
      },
      knownFailureModes: FAILURE_MODES,
    },
  }
}

function compactInferred(target: InferredTarget) {
  return {
    targetVendor: target.targetVendor,
    buffer: target.buffer,
    inferredLo: target.inferredLo,
    inferredHi: target.inferredHi,
    confidence: target.confidence,
    rationale: target.rationale,
    ...(target.measuredIfAny ? { measuredIfAny: target.measuredIfAny } : {}),
    ...(target.needsAdditive ? { needsAdditive: true } : {}),
    ...(target.starRisk ? { starRisk: true } : {}),
    ...(target.extra ? { extra: true } : {}),
  }
}

export function compactCatalogOutput(result: CatalogInferenceResult) {
  const proprietary = new Map<string, ProprietarySkip>()
  for (const enzyme of result.enzymes) {
    for (const source of enzyme.sources) {
      for (const skip of source.skipped) {
        proprietary.set(`${skip.targetVendor}:${skip.buffer}`, skip)
      }
    }
  }
  return {
    generatedAt: new Date().toISOString(),
    model: 'salt-ph-anion nearest-neighbor / piecewise interpolation',
    proprietarySkips: [...proprietary.values()],
    enzymes: result.enzymes.map((enzyme) => ({
      enzyme: enzyme.enzyme,
      sources: enzyme.sources.map((source) => ({
        vendor: source.vendor,
        nativeInterpolatable: source.nativeInterpolatable,
        inferred: source.inferred.map(compactInferred),
      })),
    })),
  }
}

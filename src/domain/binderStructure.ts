import { detectDarpin, type DarpinDetection } from './darpinDetection'
import {
  detectImmunoglobulinNumbering,
  type ImmunoglobulinChainSelection,
  type ImmunoglobulinNumbering,
  type ImmunoglobulinNumberingScheme,
} from './immunoglobulinNumbering'
import { detectScfv, type ScfvDetection } from './scfvDetection'
import {
  detectTcrNumbering,
  tcrStructureLabel,
  type TcrChain,
  type TcrChainSelection,
  type TcrNumbering,
} from './tcrNumbering'
import { detectVnar, type VnarDetection } from './vnarDetection'

export type BinderKind = 'immunoglobulin' | 'scfv' | 'darpin' | 'tcr' | 'vnar'

export type BinderTypeOptionId =
  | 'scfv'
  | 'immunoglobulin'
  | 'VH'
  | 'VHH'
  | 'VL'
  | 'tcr'
  | 'TCR-AB'
  | 'TCR-GD'
  | 'TCR-A'
  | 'TCR-B'
  | 'TCR-G'
  | 'TCR-D'
  | 'vnar'
  | 'darpin'

export type BinderTypeOption = {
  id: BinderTypeOptionId
  label: string
  kind: BinderKind
  immunoglobulinChain?: Exclude<ImmunoglobulinChainSelection, 'auto'>
  tcrChain?: TcrChainSelection
}

/** Recognized binder types offered for manual structure selection. */
export const BINDER_TYPE_OPTIONS: readonly BinderTypeOption[] = [
  { id: 'scfv', label: 'scFv', kind: 'scfv' },
  { id: 'immunoglobulin', label: 'Immunoglobulin', kind: 'immunoglobulin' },
  { id: 'VH', label: 'VH', kind: 'immunoglobulin', immunoglobulinChain: 'H' },
  { id: 'VHH', label: 'VHH', kind: 'immunoglobulin', immunoglobulinChain: 'VHH' },
  { id: 'VL', label: 'VL', kind: 'immunoglobulin', immunoglobulinChain: 'light' },
  { id: 'tcr', label: 'TCR', kind: 'tcr', tcrChain: 'auto' },
  { id: 'TCR-AB', label: 'TCR α/β', kind: 'tcr', tcrChain: 'AB' },
  { id: 'TCR-GD', label: 'TCR γ/δ', kind: 'tcr', tcrChain: 'GD' },
  { id: 'TCR-A', label: 'TCR α', kind: 'tcr', tcrChain: 'A' },
  { id: 'TCR-B', label: 'TCR β', kind: 'tcr', tcrChain: 'B' },
  { id: 'TCR-G', label: 'TCR γ', kind: 'tcr', tcrChain: 'G' },
  { id: 'TCR-D', label: 'TCR δ', kind: 'tcr', tcrChain: 'D' },
  { id: 'vnar', label: 'VNAR / IgNAR', kind: 'vnar' },
  { id: 'darpin', label: 'DARPin', kind: 'darpin' },
]

export type BinderNumberingSchemeId = ImmunoglobulinNumberingScheme | 'darpin' | 'vnar'

export type BinderNumberingScheme = {
  id: BinderNumberingSchemeId
  label: string
}

export type BinderStructure = {
  kind: BinderKind
  label: string
  confidence: number
  detail: string
  /** True when the user picked this binder type instead of auto-detect. */
  manual?: boolean
  /** Chain constraint used when applying immunoglobulin numbering. */
  immunoglobulinChain?: Exclude<ImmunoglobulinChainSelection, 'auto'>
  /** Chain constraint used when applying TCR numbering. */
  tcrChain?: TcrChainSelection
}

export type BinderNumbering =
  | {
    kind: 'immunoglobulin'
    schemeId: ImmunoglobulinNumberingScheme
    schemeLabel: string
    positions: Array<string | null>
    data: ImmunoglobulinNumbering
  }
  | {
    kind: 'scfv'
    schemeId: ImmunoglobulinNumberingScheme
    schemeLabel: string
    positions: Array<string | null>
    data: ScfvDetection
  }
  | {
    kind: 'tcr'
    schemeId: 'imgt'
    schemeLabel: string
    positions: Array<string | null>
    data: TcrNumbering
  }
  | {
    kind: 'vnar'
    schemeId: 'vnar'
    schemeLabel: string
    positions: Array<string | null>
    data: VnarDetection
  }
  | {
    kind: 'darpin'
    schemeId: 'darpin'
    schemeLabel: string
    positions: Array<string | null>
    data: DarpinDetection
  }

export function isBinderNumberingForSequence(numbering: BinderNumbering | null | undefined, sequence: string): numbering is BinderNumbering {
  return Boolean(numbering && numbering.positions.length === sequence.length && numbering.positions.some(Boolean))
}

export function numberingSchemesForBinder(kind: BinderKind): BinderNumberingScheme[] {
  if (kind === 'darpin') return [{ id: 'darpin', label: 'Module' }]
  if (kind === 'vnar') return [{ id: 'vnar', label: 'VNAR' }]
  if (kind === 'tcr') return [{ id: 'imgt', label: 'IMGT' }]
  return [
    { id: 'imgt', label: 'IMGT' },
    { id: 'kabat', label: 'Kabat' },
  ]
}

export function defaultNumberingSchemeId(kind: BinderKind): BinderNumberingSchemeId {
  return numberingSchemesForBinder(kind)[0].id
}

export function binderSchemeLabel(schemeId: BinderNumberingSchemeId) {
  if (schemeId === 'imgt') return 'IMGT'
  if (schemeId === 'kabat') return 'Kabat'
  if (schemeId === 'vnar') return 'VNAR'
  return 'Module'
}

function immunoglobulinStructureLabel(numbering: ImmunoglobulinNumbering) {
  if (numbering.vhh?.subtype === 'VHH') return 'VHH'
  if (numbering.chain === 'H') return 'VH'
  if (numbering.chain === 'L') return 'VL (λ)'
  return 'VL (κ)'
}

function immunoglobulinChainSelection(
  numbering: ImmunoglobulinNumbering,
): Exclude<ImmunoglobulinChainSelection, 'auto'> {
  if (numbering.vhh?.subtype === 'VHH') return 'VHH'
  if (numbering.chain === 'K' || numbering.chain === 'L') return numbering.chain
  return numbering.chain
}

function tcrChainSelectionFromDetected(chain: TcrChain): TcrChainSelection {
  return chain
}

function structureFromScfv(detection: ScfvDetection, manual = false): BinderStructure {
  return {
    kind: 'scfv',
    label: `scFv ${detection.orientation}`,
    confidence: detection.confidence,
    detail: `${detection.format}; linker ${detection.linkerEnd - detection.linkerStart} aa`,
    manual,
  }
}

function structureFromDarpin(detection: DarpinDetection, manual = false): BinderStructure {
  return {
    kind: 'darpin',
    label: `DARPin ${detection.format}`,
    confidence: detection.confidence,
    detail: `${detection.modules.filter((module) => module.kind === 'internal').length} internal repeats`,
    manual,
  }
}

function structureFromVnar(detection: VnarDetection, manual = false): BinderStructure {
  return {
    kind: 'vnar',
    label: `VNAR type ${detection.vnarType}`,
    confidence: detection.confidence,
    detail: `IgNAR V-domain; ${detection.regions.length} annotated loops/frameworks`,
    manual,
  }
}

function structureFromImmunoglobulin(
  numbering: ImmunoglobulinNumbering,
  chain: Exclude<ImmunoglobulinChainSelection, 'auto'> | undefined,
  manual = false,
): BinderStructure {
  return {
    kind: 'immunoglobulin',
    label: immunoglobulinStructureLabel(numbering),
    confidence: numbering.confidence,
    detail: numbering.vhh
      ? `${numbering.vhh.subtype}; ${Math.round(numbering.vhh.confidence * 100)}% VHH evidence`
      : `${numbering.chain} chain`,
    manual,
    immunoglobulinChain: chain ?? immunoglobulinChainSelection(numbering),
  }
}

function structureFromTcr(
  numbering: TcrNumbering,
  chain: TcrChainSelection | undefined,
  manual = false,
): BinderStructure {
  return {
    kind: 'tcr',
    label: tcrStructureLabel(numbering.chain),
    confidence: numbering.confidence,
    detail: `TR${numbering.chain}; ${Math.round(numbering.confidence * 100)}% numbering confidence`,
    manual,
    tcrChain: chain ?? tcrChainSelectionFromDetected(numbering.chain),
  }
}

async function tryDetect(
  label: string,
  run: () => Promise<BinderStructure> | BinderStructure,
): Promise<{ ok: true; value: BinderStructure } | { ok: false; error: string }> {
  try {
    return { ok: true, value: await run() }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : `Could not detect ${label}.`,
    }
  }
}

/**
 * Auto-detect the binder class for a protein sequence.
 * Prefers scFv over a single Ig/TCR/VNAR domain when both are present.
 */
export async function detectBinderStructure(sequenceInput: string): Promise<BinderStructure> {
  const sequence = sequenceInput.replace(/[^A-Za-z*]/g, '').toUpperCase()
  if (!sequence) throw new Error('The protein sequence is empty.')

  const [scfvResult, darpinResult, vnarResult, igResult, tcrResult] = await Promise.all([
    tryDetect('scFv', async () => structureFromScfv(await detectScfv(sequence, 'imgt'))),
    tryDetect('DARPin', () => structureFromDarpin(detectDarpin(sequence))),
    tryDetect('VNAR', () => structureFromVnar(detectVnar(sequence))),
    tryDetect('immunoglobulin', async () => (
      structureFromImmunoglobulin(await detectImmunoglobulinNumbering(sequence, 'imgt', 'auto'), undefined)
    )),
    tryDetect('TCR', async () => (
      structureFromTcr(await detectTcrNumbering(sequence, 'imgt', 'auto'), undefined)
    )),
  ])

  if (scfvResult.ok) return scfvResult.value

  // Prefer a confident VNAR call over immunoglobulin — VNARs can weakly match Ig HMMs.
  if (vnarResult.ok && vnarResult.value.confidence >= 0.7) {
    if (!igResult.ok || vnarResult.value.confidence >= igResult.value.confidence - 0.05) {
      return vnarResult.value
    }
  }

  const ranked = [darpinResult, vnarResult, igResult, tcrResult]
    .filter((result): result is { ok: true; value: BinderStructure } => result.ok)
    .sort((left, right) => right.value.confidence - left.value.confidence)
  if (ranked.length) return ranked[0].value

  throw new Error(
    'No binder structure was detected (tried scFv, immunoglobulin, TCR, VNAR, and DARPin).',
  )
}

/** Force detection as a specific recognized binder type. */
export async function selectBinderStructure(
  sequenceInput: string,
  optionId: BinderTypeOptionId,
): Promise<BinderStructure> {
  const sequence = sequenceInput.replace(/[^A-Za-z*]/g, '').toUpperCase()
  if (!sequence) throw new Error('The protein sequence is empty.')
  const option = BINDER_TYPE_OPTIONS.find((candidate) => candidate.id === optionId)
  if (!option) throw new Error(`Unknown binder type: ${optionId}`)

  if (option.kind === 'scfv') {
    return structureFromScfv(await detectScfv(sequence, 'imgt'), true)
  }
  if (option.kind === 'darpin') {
    return structureFromDarpin(detectDarpin(sequence), true)
  }
  if (option.kind === 'vnar') {
    return structureFromVnar(detectVnar(sequence), true)
  }
  if (option.kind === 'tcr') {
    const chain = option.tcrChain ?? 'auto'
    const numbering = await detectTcrNumbering(sequence, 'imgt', chain)
    return structureFromTcr(numbering, chain === 'auto' ? numbering.chain : chain, true)
  }

  const chain = option.immunoglobulinChain ?? 'auto'
  const numbering = await detectImmunoglobulinNumbering(sequence, 'imgt', chain)
  return structureFromImmunoglobulin(
    numbering,
    option.immunoglobulinChain ?? immunoglobulinChainSelection(numbering),
    true,
  )
}

/** Apply a numbering scheme appropriate for a previously detected binder structure. */
export async function applyBinderNumbering(
  sequenceInput: string,
  structure: BinderStructure,
  schemeId: BinderNumberingSchemeId = defaultNumberingSchemeId(structure.kind),
): Promise<BinderNumbering> {
  const sequence = sequenceInput.replace(/[^A-Za-z*]/g, '').toUpperCase()
  if (!sequence) throw new Error('The protein sequence is empty.')

  if (structure.kind === 'darpin') {
    if (schemeId !== 'darpin') {
      throw new Error('DARPin numbering only supports the module scheme.')
    }
    const data = detectDarpin(sequence)
    return {
      kind: 'darpin',
      schemeId: 'darpin',
      schemeLabel: 'Module',
      positions: data.positions,
      data,
    }
  }

  if (structure.kind === 'vnar') {
    if (schemeId !== 'vnar') {
      throw new Error('VNAR numbering only supports the VNAR region scheme.')
    }
    const data = detectVnar(sequence)
    return {
      kind: 'vnar',
      schemeId: 'vnar',
      schemeLabel: 'VNAR',
      positions: data.positions,
      data,
    }
  }

  if (structure.kind === 'tcr') {
    if (schemeId !== 'imgt') {
      throw new Error('TCR numbering currently supports IMGT only.')
    }
    const data = await detectTcrNumbering(sequence, 'imgt', structure.tcrChain ?? 'auto')
    return {
      kind: 'tcr',
      schemeId: 'imgt',
      schemeLabel: 'IMGT',
      positions: data.positions,
      data,
    }
  }

  if (schemeId !== 'imgt' && schemeId !== 'kabat') {
    throw new Error(`${structure.label} numbering requires IMGT or Kabat.`)
  }

  if (structure.kind === 'scfv') {
    const data = await detectScfv(sequence, schemeId)
    return {
      kind: 'scfv',
      schemeId,
      schemeLabel: binderSchemeLabel(schemeId),
      positions: data.positions,
      data,
    }
  }

  const data = await detectImmunoglobulinNumbering(
    sequence,
    schemeId,
    structure.immunoglobulinChain ?? 'auto',
  )
  return {
    kind: 'immunoglobulin',
    schemeId,
    schemeLabel: binderSchemeLabel(schemeId),
    positions: data.positions,
    data,
  }
}

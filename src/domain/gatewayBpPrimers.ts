import {
  ATTB_ADAPTER_TAILS,
  ATTB_MOTIFS,
  attBPrimerSubtypesFromDonor,
  formatAttBSiteLabel,
  resolveAttBMotif,
  type GatewayCloningMethod,
  type GatewayInsertConfig,
  type GatewayPrimerDraft,
  type ResolvedGatewayDonor,
} from './gatewayBpCloning'
import { designPcrPrimerPair } from './pcr'
import { exportPrimerDataTsv } from './primerExport'
import { refreshExactPrimerBindings } from './primerSequenceLayout'
import { createId, sanitizeDna } from './sequence'
import type { Primer, SequenceRecord } from './types'

export const MIN_GATEWAY_AMPLIFY_BP = 60

export type GatewayAmplifyRange = {
  start: number
  end: number
}

export type GatewayPrimerDesignOptions = {
  method: GatewayCloningMethod
  geneTmC: number
  /** Donor-order vs flipped attB overhangs. */
  siteOrientation: 'forward' | 'reverse'
  useAdapterPrimers: boolean
  /** Left/right attB subtypes matched to the selected donor attP pair. */
  leftSubtype: string
  rightSubtype: string
}

export type GatewayPrimerDesignResult = {
  amplifyRange: GatewayAmplifyRange
  insertForward: GatewayPrimerDraft
  insertReverse: GatewayPrimerDraft
  insertPrimers: Primer[]
  message: string
}

export type GatewayPrimerTarget = {
  label: string
  config: GatewayInsertConfig
  amplifyRange: GatewayAmplifyRange
}

export function minGatewayAmplifyBp() {
  return MIN_GATEWAY_AMPLIFY_BP
}

export function uniquifyGatewayPrimerName(name: string, taken: Set<string>): string {
  if (!taken.has(name)) return name
  const match = /^(.*)_(F|R)$/.exec(name)
  if (!match) {
    let version = 2
    while (taken.has(`${name}_v${version}`)) version += 1
    return `${name}_v${version}`
  }
  const stem = match[1]!
  const suffix = match[2]!
  let version = 2
  while (taken.has(`${stem}_v${version}_${suffix}`)) version += 1
  return `${stem}_v${version}_${suffix}`
}

function primerName(recordName: string, subtype: string, suffix: 'F' | 'R') {
  const base = (recordName || 'attB Insert').replace(/\.[^.]+$/, '').trim() || 'attB Insert'
  return `${base}_${formatAttBSiteLabel(subtype)}_${suffix}`
}

function draftFromSequence(name: string, sequence: string, color: string): GatewayPrimerDraft {
  return {
    sourcePrimerId: null,
    name,
    sequence: sanitizeDna(sequence),
    phosphorylated: false,
    color,
  }
}

function attBOverhang(subtype: string, useAdapterPrimers: boolean): string {
  return resolveAttBMotif(subtype, useAdapterPrimers)
}

export function normalizeGatewayAmplifyRange(
  record: SequenceRecord,
  range: GatewayAmplifyRange,
): GatewayAmplifyRange | null {
  const length = record.sequence.length
  if (length <= 0) return null
  const start = Math.max(0, Math.min(length - 1, Math.floor(range.start)))
  const end = Math.max(1, Math.min(length, Math.floor(range.end)))
  if (end <= start) return null
  if (end - start < minGatewayAmplifyBp()) return null
  return { start, end }
}

export function canOfferGatewayPrimerDesign(input: {
  insertRecord: SequenceRecord | null | undefined
  amplifyRange: GatewayAmplifyRange | null | undefined
  assemblyReady: boolean
  allowWhenAssemblyReady?: boolean
}): boolean {
  if (input.assemblyReady && !input.allowWhenAssemblyReady) return false
  if (!input.insertRecord?.sequence || !input.amplifyRange) return false
  return Boolean(normalizeGatewayAmplifyRange(input.insertRecord, input.amplifyRange))
}

export function listGatewayPrimerTargets(input: {
  insert: GatewayInsertConfig
  insertReady: boolean
  assemblyReady: boolean
  includeReadyInsert?: boolean
}): GatewayPrimerTarget[] {
  const includeReady = Boolean(input.includeReadyInsert)
  if (
    !canOfferGatewayPrimerDesign({
      insertRecord: input.insert.record,
      amplifyRange: input.insert.selectedRange,
      assemblyReady: input.assemblyReady,
      allowWhenAssemblyReady: includeReady,
    })
  ) {
    return []
  }
  if (input.insertReady && !includeReady) return []
  const amplifyRange = normalizeGatewayAmplifyRange(input.insert.record!, input.insert.selectedRange!)
  if (!amplifyRange) return []
  return [
    {
      label: 'attB Insert',
      config: input.insert,
      amplifyRange,
    },
  ]
}

export function defaultGatewayPrimerDesignOptions(
  method: GatewayCloningMethod,
  insert: GatewayInsertConfig,
  donor?: ResolvedGatewayDonor | null,
): GatewayPrimerDesignOptions {
  const fromDonor = donor ? attBPrimerSubtypesFromDonor(donor) : null
  return {
    method,
    geneTmC: 60,
    siteOrientation: insert.siteOrientation === 'reverse' ? 'reverse' : 'forward',
    useAdapterPrimers: insert.useAdapterPrimers,
    leftSubtype: fromDonor?.left || insert.attBLeftSubtype || '1',
    rightSubtype: fromDonor?.right || insert.attBRightSubtype || '2',
  }
}

/** Design gene-specific primers with 5′ attB (or adapter-tail) overhangs. */
export function designGatewayAttBPrimers(input: {
  insertRecord: SequenceRecord
  amplifyRange: GatewayAmplifyRange
  options: GatewayPrimerDesignOptions
}): GatewayPrimerDesignResult | null {
  const range = normalizeGatewayAmplifyRange(input.insertRecord, input.amplifyRange)
  if (!range) return null

  const anneal = designPcrPrimerPair(
    input.insertRecord,
    range.start,
    range.end,
    input.options.geneTmC,
  )

  const fivePrimeSubtype =
    input.options.siteOrientation === 'forward'
      ? input.options.leftSubtype
      : input.options.rightSubtype
  const threePrimeSubtype =
    input.options.siteOrientation === 'forward'
      ? input.options.rightSubtype
      : input.options.leftSubtype

  const forwardOverhang = attBOverhang(fivePrimeSubtype, input.options.useAdapterPrimers)
  const reverseOverhang = attBOverhang(threePrimeSubtype, input.options.useAdapterPrimers)

  const taken = new Set(input.insertRecord.primers.map((primer) => primer.name))
  const forwardName = uniquifyGatewayPrimerName(
    primerName(input.insertRecord.name, fivePrimeSubtype, 'F'),
    taken,
  )
  taken.add(forwardName)
  const reverseName = uniquifyGatewayPrimerName(
    primerName(input.insertRecord.name, threePrimeSubtype, 'R'),
    taken,
  )

  const forwardDraft = draftFromSequence(
    forwardName,
    `${forwardOverhang}${anneal.forward.sequence}`,
    '#2563eb',
  )
  const reverseDraft = draftFromSequence(
    reverseName,
    `${reverseOverhang}${anneal.reverse.sequence}`,
    '#db2777',
  )

  const forwardId = createId('primer')
  const reverseId = createId('primer')
  const raw: Primer[] = [
    {
      id: forwardId,
      name: forwardDraft.name,
      sequence: forwardDraft.sequence,
      color: forwardDraft.color || '#2563eb',
    },
    {
      id: reverseId,
      name: reverseDraft.name,
      sequence: reverseDraft.sequence,
      color: reverseDraft.color || '#db2777',
    },
  ]
  const primers = refreshExactPrimerBindings(raw, input.insertRecord.sequence)
  const leftLabel = formatAttBSiteLabel(input.options.leftSubtype)
  const rightLabel = formatAttBSiteLabel(input.options.rightSubtype)

  return {
    amplifyRange: range,
    insertForward: {
      ...forwardDraft,
      sourcePrimerId: forwardId,
      color: primers[0]?.color ?? forwardDraft.color,
    },
    insertReverse: {
      ...reverseDraft,
      sourcePrimerId: reverseId,
      color: primers[1]?.color ?? reverseDraft.color,
    },
    insertPrimers: primers,
    message: input.options.useAdapterPrimers
      ? `Designed gene-specific primers with ${leftLabel}/${rightLabel} adapter tails.`
      : `Designed ${leftLabel}/${rightLabel} PCR primers.`,
  }
}

export function mergeGatewayDesignedPrimersOntoRecord(
  record: SequenceRecord,
  primers: Primer[],
): SequenceRecord {
  const existing = record.primers.filter(
    (primer) => !primers.some((designed) => designed.name === primer.name),
  )
  return {
    ...record,
    primers: refreshExactPrimerBindings([...existing, ...primers], record.sequence),
  }
}

export function listGatewayAssemblySelectedPrimers(insert: GatewayInsertConfig): Primer[] {
  const drafts = [insert.forwardPrimer, insert.reversePrimer]
  return drafts
    .filter((draft) => draft.sequence.trim().length > 0)
    .map((draft) => ({
      id: draft.sourcePrimerId || createId('primer'),
      name: draft.name,
      sequence: sanitizeDna(draft.sequence),
      color: draft.color || '#2563eb',
    }))
}

export function exportGatewaySelectedPrimersTsv(insert: GatewayInsertConfig) {
  return exportPrimerDataTsv(listGatewayAssemblySelectedPrimers(insert))
}

/** Re-export motif tables for tests. */
export { ATTB_MOTIFS, ATTB_ADAPTER_TAILS }

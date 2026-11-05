import {
  taGcMethodLabel,
  type TaGcCloningMethod,
  type TaGcInsertConfig,
  type TaGcPrimerDraft,
} from './taGcCloning'
import { designPcrPrimerPair } from './pcr'
import { exportPrimerDataTsv } from './primerExport'
import { refreshExactPrimerBindings } from './primerSequenceLayout'
import { createId, normalizeDna, sanitizeDna } from './sequence'
import type { Primer, SequenceRecord } from './types'

/** Soft minimum amplify stretch for TA/GC insert PCR primer design. */
export const MIN_TAGC_AMPLIFY_BP = 60

export type TaGcAmplifyRange = {
  start: number
  end: number
}

export type TaGcPrimerDesignOptions = {
  method: TaGcCloningMethod
  geneTmC: number
}

export type TaGcPrimerDesignResult = {
  amplifyRange: TaGcAmplifyRange
  insertForward: TaGcPrimerDraft
  insertReverse: TaGcPrimerDraft
  insertPrimers: Primer[]
  message: string
}

export type TaGcPrimerTarget = {
  label: string
  config: TaGcInsertConfig
  amplifyRange: TaGcAmplifyRange
}

export function minTaGcAmplifyBp() {
  return MIN_TAGC_AMPLIFY_BP
}

export function taGcPrimerMethodTag(method: TaGcCloningMethod): 'TA' | 'GC' {
  return method === 'gc' ? 'GC' : 'TA'
}

export function uniquifyTaGcPrimerName(name: string, taken: Set<string>): string {
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

function primerName(recordName: string, suffix: 'F' | 'R', method: TaGcCloningMethod) {
  const base = (recordName || 'Insert').replace(/\.[^.]+$/, '').trim() || 'Insert'
  return `${base}_${taGcPrimerMethodTag(method)}_${suffix}`
}

function draftFromSequence(name: string, sequence: string, color: string): TaGcPrimerDraft {
  return {
    sourcePrimerId: null,
    name,
    sequence: sanitizeDna(sequence),
    phosphorylated: false,
    color,
  }
}

export function normalizeTaGcAmplifyRange(
  record: SequenceRecord,
  range: TaGcAmplifyRange,
): TaGcAmplifyRange | null {
  const length = record.sequence.length
  if (length <= 0) return null
  const start = Math.max(0, Math.min(length - 1, Math.floor(range.start)))
  const end = Math.max(1, Math.min(length, Math.floor(range.end)))
  if (end <= start) return null
  if (end - start < minTaGcAmplifyBp()) return null
  return { start, end }
}

export function canOfferTaGcPrimerDesign(input: {
  insertRecord: SequenceRecord | null | undefined
  amplifyRange: TaGcAmplifyRange | null | undefined
  assemblyReady: boolean
  allowWhenAssemblyReady?: boolean
}): boolean {
  if (input.assemblyReady && !input.allowWhenAssemblyReady) return false
  if (!input.insertRecord?.sequence || !input.amplifyRange) return false
  return Boolean(normalizeTaGcAmplifyRange(input.insertRecord, input.amplifyRange))
}

/**
 * Product-sidebar targets for Choose (unfinished) or Regenerate (include ready).
 * TA/GC only designs primers for the insert amplify stretch.
 */
export function listTaGcPrimerTargets(input: {
  insert: TaGcInsertConfig
  insertReady: boolean
  assemblyReady: boolean
  includeReadyInsert?: boolean
}): TaGcPrimerTarget[] {
  const includeReady = Boolean(input.includeReadyInsert)
  if (
    !canOfferTaGcPrimerDesign({
      insertRecord: input.insert.record,
      amplifyRange: input.insert.selectedRange,
      assemblyReady: input.assemblyReady,
      allowWhenAssemblyReady: includeReady,
    })
  ) {
    return []
  }
  if (input.insertReady && !includeReady) return []
  const amplifyRange = normalizeTaGcAmplifyRange(input.insert.record!, input.insert.selectedRange!)
  if (!amplifyRange) return []
  return [
    {
      label: 'Insert',
      config: input.insert,
      amplifyRange,
    },
  ]
}

export function defaultTaGcPrimerDesignOptions(method: TaGcCloningMethod): TaGcPrimerDesignOptions {
  return {
    method,
    geneTmC: 60,
  }
}

/** Anneal-only PCR primers for the insert stretch; A/G overhangs come from polymerase. */
export function designTaGcPrimersForInsert(input: {
  insertRecord: SequenceRecord
  amplifyRange: TaGcAmplifyRange
  options: TaGcPrimerDesignOptions
}): TaGcPrimerDesignResult | null {
  const range = normalizeTaGcAmplifyRange(input.insertRecord, input.amplifyRange)
  if (!range) return null

  const anneal = designPcrPrimerPair(
    input.insertRecord,
    range.start,
    range.end,
    input.options.geneTmC,
  )
  const taken = new Set(input.insertRecord.primers.map((primer) => primer.name))
  const forwardName = uniquifyTaGcPrimerName(
    primerName(input.insertRecord.name, 'F', input.options.method),
    taken,
  )
  taken.add(forwardName)
  const reverseName = uniquifyTaGcPrimerName(
    primerName(input.insertRecord.name, 'R', input.options.method),
    taken,
  )

  const forwardDraft = draftFromSequence(forwardName, anneal.forward.sequence, '#2563eb')
  const reverseDraft = draftFromSequence(reverseName, anneal.reverse.sequence, '#db2777')

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
  const methodLabel = taGcMethodLabel(input.options.method)

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
    message: `Designed ${methodLabel} PCR primers for Insert (${(range.end - range.start).toLocaleString()} bp).`,
  }
}

/** Append designed primers onto the insert template; prior primers are kept. */
export function mergeTaGcDesignedPrimersOntoRecord(
  record: SequenceRecord,
  designed: Primer[],
): SequenceRecord {
  const existingIds = new Set(record.primers.map((primer) => primer.id))
  const additions = designed.filter((primer) => !existingIds.has(primer.id))
  return {
    ...record,
    primers: refreshExactPrimerBindings([...record.primers, ...additions], record.sequence),
  }
}

/** PCR insert primers currently selected for cloning (for Export). */
export function listTaGcAssemblySelectedPrimers(insert: TaGcInsertConfig): Primer[] {
  if (insert.mode !== 'pcr') return []
  const out: Primer[] = []
  const seen = new Set<string>()
  for (const draft of [insert.forwardPrimer, insert.reversePrimer]) {
    const sequence = normalizeDna(draft.sequence)
    if (!sequence) continue
    const name = (draft.name || 'Primer').trim() || 'Primer'
    const key = `${name}\t${sequence}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push({
      id: draft.sourcePrimerId ?? createId('primer'),
      name,
      sequence,
      color: draft.color ?? '#0ea5e9',
    })
  }
  return out
}

export function exportTaGcSelectedPrimersTsv(insert: TaGcInsertConfig): string {
  return exportPrimerDataTsv(listTaGcAssemblySelectedPrimers(insert))
}

import {
  defaultGibsonPartConfig,
  resolveGibsonPart,
  type GibsonPartConfig,
  type GibsonPrimerDraft,
  type ResolvedGibsonPart,
} from './gibsonAssembly'
import {
  designGibsonOverlapPrimersForAssembly,
  mergeGibsonDesignedPrimersOntoRecord,
  uniquifyGibsonPrimerName,
  type GibsonOverlapLengthMode,
  type GibsonOverlapPrimerDesignOptions,
} from './gibsonOverlapPrimers'
import { exportPrimerDataTsv } from './primerExport'
import type { PcrPrimerInput } from './pcr'
import { createId, normalizeDna } from './sequence'
import type { Primer, SequenceRecord } from './types'

/** Soft minimum amplify stretch for OE fragment primer design. */
export const MIN_BRIDGE_AMPLIFY_BP = 60

export type BridgeAmplifyRange = {
  start: number
  end: number
}

export type BridgeFragmentPrimerInput = {
  index: number
  template: SequenceRecord
  selectedRange: BridgeAmplifyRange | null
  forwardPrimer: PcrPrimerInput & { sourcePrimerId?: string | null }
  reversePrimer: PcrPrimerInput & { sourcePrimerId?: string | null }
  /** True when this fragment already resolves to a PCR product. */
  ready: boolean
}

export type BridgeOverlapPrimerDesignOptions = {
  geneTmC: number
  overlapMode: GibsonOverlapLengthMode
  fixedOverlapBp: number
  overlapMinBp: number
  overlapMaxBp: number
  overlapTargetTmC: number
}

export type BridgeOverlapPrimerTarget = {
  fragmentIndex: number
  label: string
  amplifyRange: BridgeAmplifyRange
  template: SequenceRecord
}

export type BridgeOverlapFragmentDesign = {
  fragmentIndex: number
  label: string
  amplifyRange: BridgeAmplifyRange
  insertForward: GibsonPrimerDraft
  insertReverse: GibsonPrimerDraft
  insertPrimers: Primer[]
}

export type BridgeOverlapAssemblyDesignResult = {
  overlapBp: number
  fragments: BridgeOverlapFragmentDesign[]
  message: string
}

export function minBridgeAmplifyBp() {
  return MIN_BRIDGE_AMPLIFY_BP
}

export function defaultBridgeOverlapPrimerOptions(): BridgeOverlapPrimerDesignOptions {
  // OE / SOE typically uses ~15–25 bp overlaps; default fixed 20 bp.
  return {
    geneTmC: 60,
    overlapMode: 'fixed',
    fixedOverlapBp: 20,
    overlapMinBp: 15,
    overlapMaxBp: 25,
    overlapTargetTmC: 50,
  }
}

export function normalizeBridgeAmplifyRange(
  record: SequenceRecord,
  range: BridgeAmplifyRange,
): BridgeAmplifyRange | null {
  const length = record.sequence.length
  if (length <= 0) return null
  const start = Math.max(0, Math.min(length - 1, Math.floor(range.start)))
  const end = Math.max(1, Math.min(length, Math.floor(range.end)))
  if (end <= start) return null
  if (end - start < minBridgeAmplifyBp()) return null
  return { start, end }
}

export function canOfferBridgeOverlapPrimerDesign(input: {
  template: SequenceRecord | null | undefined
  amplifyRange: BridgeAmplifyRange | null | undefined
  fusionReady: boolean
  allowWhenFusionReady?: boolean
}): boolean {
  if (input.fusionReady && !input.allowWhenFusionReady) return false
  if (!input.template?.sequence || !input.amplifyRange) return false
  return Boolean(normalizeBridgeAmplifyRange(input.template, input.amplifyRange))
}

/**
 * Choose = unfinished amplify fragments; Regenerate = include PCR-ready ones.
 * Requires ≥2 fragments in the OE chain so neighbor homology can be designed.
 */
export function listBridgeOverlapPrimerTargets(input: {
  fragments: BridgeFragmentPrimerInput[]
  fusionReady: boolean
  includeReadyFragments?: boolean
}): BridgeOverlapPrimerTarget[] {
  const includeReady = Boolean(input.includeReadyFragments)
  if (input.fragments.length < 2) return []
  const targets: BridgeOverlapPrimerTarget[] = []
  for (const fragment of input.fragments) {
    if (
      !canOfferBridgeOverlapPrimerDesign({
        template: fragment.template,
        amplifyRange: fragment.selectedRange,
        fusionReady: input.fusionReady,
        allowWhenFusionReady: includeReady,
      })
    ) {
      continue
    }
    if (fragment.ready && !includeReady) continue
    const amplifyRange = normalizeBridgeAmplifyRange(fragment.template, fragment.selectedRange!)
    if (!amplifyRange) continue
    targets.push({
      fragmentIndex: fragment.index,
      label: `Fragment ${fragment.index + 1}`,
      amplifyRange,
      template: fragment.template,
    })
  }
  return targets
}

function toGibsonOptions(options: BridgeOverlapPrimerDesignOptions): GibsonOverlapPrimerDesignOptions {
  return {
    method: 'nebuilder-hifi',
    geneTmC: options.geneTmC,
    overlapMode: options.overlapMode,
    fixedOverlapBp: options.fixedOverlapBp,
    overlapMinBp: options.overlapMinBp,
    overlapMaxBp: options.overlapMaxBp,
    overlapTargetTmC: options.overlapTargetTmC,
    amplifyVectorWithoutExtensions: true,
    regenerateEnzymeSites: false,
  }
}

function retagOePrimerName(name: string, taken: Set<string>): string {
  const retagged = name
    .replace(/_HiFi_/g, '_OE_')
    .replace(/_Gibson_/g, '_OE_')
    .replace(/_InFusion_/g, '_OE_')
  return uniquifyGibsonPrimerName(retagged.includes('_OE_') ? retagged : name.replace(/_(F|R)$/, '_OE_$1'), taken)
}

function retagDraft(draft: GibsonPrimerDraft, taken: Set<string>): GibsonPrimerDraft {
  const name = retagOePrimerName(draft.name, taken)
  taken.add(name)
  return { ...draft, name }
}

/**
 * Design OE fragment primers with linear-chain homology: half/half at junctions,
 * anneal-only on free ends (same architecture as linear Gibson).
 */
export function designBridgeOverlapPrimersForFragments(input: {
  fragments: BridgeFragmentPrimerInput[]
  options: BridgeOverlapPrimerDesignOptions
  includeReadyFragments?: boolean
}): BridgeOverlapAssemblyDesignResult | null {
  if (input.fragments.length < 2) return null
  const ordered = [...input.fragments].sort((a, b) => a.index - b.index)
  const primaryInput = ordered[0]!
  const restInputs = ordered.slice(1)

  const primaryConfig: GibsonPartConfig = {
    ...defaultGibsonPartConfig('fragment', primaryInput.template),
    amplifyRange: primaryInput.selectedRange,
    linearizationMode: 'pcr',
    forwardPrimer: {
      sourcePrimerId: primaryInput.forwardPrimer.sourcePrimerId ?? null,
      name: primaryInput.forwardPrimer.name,
      sequence: primaryInput.forwardPrimer.sequence,
      phosphorylated: Boolean(primaryInput.forwardPrimer.phosphorylated),
    },
    reversePrimer: {
      sourcePrimerId: primaryInput.reversePrimer.sourcePrimerId ?? null,
      name: primaryInput.reversePrimer.name,
      sequence: primaryInput.reversePrimer.sequence,
      phosphorylated: Boolean(primaryInput.reversePrimer.phosphorylated),
    },
  }
  const fragmentConfigs: GibsonPartConfig[] = restInputs.map((fragment) => ({
    ...defaultGibsonPartConfig('fragment', fragment.template),
    amplifyRange: fragment.selectedRange,
    linearizationMode: 'pcr',
    forwardPrimer: {
      sourcePrimerId: fragment.forwardPrimer.sourcePrimerId ?? null,
      name: fragment.forwardPrimer.name,
      sequence: fragment.forwardPrimer.sequence,
      phosphorylated: Boolean(fragment.forwardPrimer.phosphorylated),
    },
    reversePrimer: {
      sourcePrimerId: fragment.reversePrimer.sourcePrimerId ?? null,
      name: fragment.reversePrimer.name,
      sequence: fragment.reversePrimer.sequence,
      phosphorylated: Boolean(fragment.reversePrimer.phosphorylated),
    },
  }))

  const resolvedPrimary = resolveGibsonPart(primaryConfig, 0, 0, 0)
  const resolvedRest: ResolvedGibsonPart[] = fragmentConfigs.map((config, index) =>
    resolveGibsonPart(config, index, index + 1, index + 1),
  )

  const designed = designGibsonOverlapPrimersForAssembly({
    mode: 'linear',
    vector: resolvedPrimary,
    primaryConfig,
    fragments: fragmentConfigs,
    fragmentOrder: fragmentConfigs.map((_, index) => index),
    resolvedFragments: resolvedRest,
    options: toGibsonOptions(input.options),
    // Match Gibson: callers pass false for Choose, true for Regenerate.
    includeReadyInserts: input.includeReadyFragments !== false,
  })
  if (!designed || designed.inserts.length === 0) return null

  const fragments: BridgeOverlapFragmentDesign[] = []
  for (const entry of designed.inserts) {
    const fragmentIndex = entry.fragmentIndex === null ? primaryInput.index : restInputs[entry.fragmentIndex!]!.index
    const template =
      entry.fragmentIndex === null ? primaryInput.template : restInputs[entry.fragmentIndex!]!.template
    const taken = new Set(template.primers.map((primer) => primer.name))
    const forward = retagDraft(entry.insertForward, taken)
    const reverse = retagDraft(entry.insertReverse, taken)
    const renamedPrimers = entry.insertPrimers.map((primer, index) => {
      const name = index === 0 ? forward.name : reverse.name
      return { ...primer, name }
    })
    fragments.push({
      fragmentIndex,
      label: `Fragment ${fragmentIndex + 1}`,
      amplifyRange: entry.amplifyRange,
      insertForward: forward,
      insertReverse: reverse,
      insertPrimers: renamedPrimers,
    })
  }

  return {
    overlapBp: designed.overlapBp,
    fragments,
    message: `Designed OE PCR primers for ${fragments.length} fragment${
      fragments.length === 1 ? '' : 's'
    } with ${designed.overlapBp} bp overlaps.`,
  }
}

export const mergeBridgeDesignedPrimersOntoRecord = mergeGibsonDesignedPrimersOntoRecord

export function listBridgeAssemblySelectedPrimers(
  fragments: Array<{
    forwardPrimer: PcrPrimerInput & { sourcePrimerId?: string | null; color?: string }
    reversePrimer: PcrPrimerInput & { sourcePrimerId?: string | null; color?: string }
  }>,
): Primer[] {
  const out: Primer[] = []
  const seen = new Set<string>()
  for (const fragment of fragments) {
    for (const draft of [fragment.forwardPrimer, fragment.reversePrimer]) {
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
  }
  return out
}

export function exportBridgeSelectedPrimersTsv(
  fragments: Array<{
    forwardPrimer: PcrPrimerInput & { sourcePrimerId?: string | null; color?: string }
    reversePrimer: PcrPrimerInput & { sourcePrimerId?: string | null; color?: string }
  }>,
): string {
  return exportPrimerDataTsv(listBridgeAssemblySelectedPrimers(fragments))
}

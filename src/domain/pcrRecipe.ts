import { formatRecipeQuantity, parseRecipeNumber } from './cloningRecipe'
import {
  primerConstructAnnealSequence,
  resolveDisplayableLayoutsForPrimer,
} from './primerSequenceLayout'
import { defaultPrimerHybridizationParams } from './primerHybridization'
import {
  formatStructureDeltaG,
  formatStructureTm,
  predictPrimerPairStructures,
  type PrimerSecondaryStructure,
} from './primerSecondaryStructure'
import { calculateAnnealTemperature } from './primerThermodynamics'
import { normalizeDna } from './sequence'
import type { HistoryNode, HistoryOligo, Primer } from './types'

export const PCR_RECIPE_OPERATIONS = new Set([
  'amplifyFragment',
  'overlapAndAmplify',
  'overlapFragments',
])

export const DEFAULT_PCR_VOLUME_UL = 20
export const DEFAULT_PRIMER_STOCK_UM = 10
export const DEFAULT_REACTION_COUNT = 1
export const DEFAULT_HF_PRIMER_FINAL_UM = 0.5
export const DEFAULT_TAQ_PRIMER_FINAL_UM = 0.2
export const DEFAULT_PCR_CYCLES = 30
export const DEFAULT_BUFFER_FOLD = 10
export const DEFAULT_DNTP_STOCK_MM = 10
export const DEFAULT_DNTP_FINAL_MM = 0.2
export const DEFAULT_POLYMERASE_UL = 0.5
export const DEFAULT_TEMPLATE_UL = 1

export type PcrMixSettings = {
  reactionVolumeUl: number
  primerStockuM: number
  primerFinalTaquM: number
  primerFinalHfuM: number
  /** Stock buffer fold, e.g. 10 for 10×. */
  bufferFold: number
  dntpStockmM: number
  dntpFinalmM: number
  /** Polymerase volume per reaction (µl), not scaled with reaction volume. */
  polymeraseUl: number
  /** Template DNA volume per reaction (µl), not scaled with reaction volume. */
  templateUl: number
  cycles: number
}

export const DEFAULT_PCR_MIX_SETTINGS: PcrMixSettings = {
  reactionVolumeUl: DEFAULT_PCR_VOLUME_UL,
  primerStockuM: DEFAULT_PRIMER_STOCK_UM,
  primerFinalTaquM: DEFAULT_TAQ_PRIMER_FINAL_UM,
  primerFinalHfuM: DEFAULT_HF_PRIMER_FINAL_UM,
  bufferFold: DEFAULT_BUFFER_FOLD,
  dntpStockmM: DEFAULT_DNTP_STOCK_MM,
  dntpFinalmM: DEFAULT_DNTP_FINAL_MM,
  polymeraseUl: DEFAULT_POLYMERASE_UL,
  templateUl: DEFAULT_TEMPLATE_UL,
  cycles: DEFAULT_PCR_CYCLES,
}

function clampPcrNumber(value: unknown, fallback: number, min: number, max: number): number {
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, n))
}

export function normalizePcrMixSettings(partial?: Partial<PcrMixSettings> | null): PcrMixSettings {
  return {
    reactionVolumeUl: clampPcrNumber(partial?.reactionVolumeUl, DEFAULT_PCR_VOLUME_UL, 1, 200),
    primerStockuM: clampPcrNumber(partial?.primerStockuM, DEFAULT_PRIMER_STOCK_UM, 0.1, 1000),
    primerFinalTaquM: clampPcrNumber(partial?.primerFinalTaquM, DEFAULT_TAQ_PRIMER_FINAL_UM, 0.01, 10),
    primerFinalHfuM: clampPcrNumber(partial?.primerFinalHfuM, DEFAULT_HF_PRIMER_FINAL_UM, 0.01, 10),
    bufferFold: clampPcrNumber(partial?.bufferFold, DEFAULT_BUFFER_FOLD, 1, 50),
    dntpStockmM: clampPcrNumber(partial?.dntpStockmM, DEFAULT_DNTP_STOCK_MM, 0.1, 100),
    dntpFinalmM: clampPcrNumber(partial?.dntpFinalmM, DEFAULT_DNTP_FINAL_MM, 0.01, 5),
    polymeraseUl: clampPcrNumber(partial?.polymeraseUl, DEFAULT_POLYMERASE_UL, 0.01, 10),
    templateUl: clampPcrNumber(partial?.templateUl, DEFAULT_TEMPLATE_UL, 0, 50),
    cycles: Math.round(clampPcrNumber(partial?.cycles, DEFAULT_PCR_CYCLES, 1, 60)),
  }
}

export type PcrEnzymeFamily = 'taq' | 'high-fidelity'

export type PcrRecipePrimer = {
  id: string
  name: string
  sequence: string
  length: number
  annealSequence: string
  annealLength: number
  tmC: number | null
  tmFromFullOligo: boolean
}

export type PcrProgramStep = {
  id: string
  label: string
  temperatureC: number
  durationSeconds: number | null
  inCycle: boolean
}

export type PcrMixComponent = {
  id: string
  name: string
  stock: string
  ulPerReaction: number | null
}

export type PcrRecipeNote = {
  severity: 'info' | 'warning'
  text: string
}

export type PcrRecipeContext = {
  productName: string
  productLengthBp: number
  productGcPercent: number | null
  enzymeFamily: PcrEnzymeFamily
  polymeraseLabel: string | null
  primers: PcrRecipePrimer[]
  twoStep: boolean
  annealingC: number
  extensionSeconds: number
  cycles: number
  program: PcrProgramStep[]
  notes: PcrRecipeNote[]
  primerFinaluM: number
  /** Primary amplicon reactions that precede an overlap-extension fusion PCR. */
  primaryReactions?: PcrRecipeContext[]
}

export function historyNodeHasPcrRecipe(node: HistoryNode): boolean {
  return PCR_RECIPE_OPERATIONS.has(node.operation)
}

export function pcrEnzymeFamily(polymeraseLabel?: string): PcrEnzymeFamily {
  const text = (polymeraseLabel ?? '').toLowerCase()
  if (
    text.includes('a overhang') ||
    text.includes("3' a") ||
    text.includes('taq')
  ) {
    return 'taq'
  }
  return 'high-fidelity'
}

export function defaultPrimerFinaluM(family: PcrEnzymeFamily, mix: PcrMixSettings = DEFAULT_PCR_MIX_SETTINGS): number {
  return family === 'taq' ? mix.primerFinalTaquM : mix.primerFinalHfuM
}

export function pcrRecipeContextFromHistory(
  node: HistoryNode,
  mix: PcrMixSettings = DEFAULT_PCR_MIX_SETTINGS,
): PcrRecipeContext | null {
  if (!historyNodeHasPcrRecipe(node)) return null

  const recipe = pcrRecipeContextForNode(node, mix)
  if (!recipe) return null
  if (node.operation !== 'overlapAndAmplify' && node.operation !== 'overlapFragments') return recipe

  const primaryReactions = node.children.flatMap((child) => {
    if (child.operation !== 'amplifyFragment') return []
    const primary = pcrRecipeContextForNode(child, mix)
    return primary ? [primary] : []
  })
  return primaryReactions.length ? { ...recipe, primaryReactions } : recipe
}

function pcrRecipeContextForNode(
  node: HistoryNode,
  mix: PcrMixSettings,
): PcrRecipeContext | null {
  if (!historyNodeHasPcrRecipe(node)) return null

  const settings = normalizePcrMixSettings(mix)
  const enzymeFamily = pcrEnzymeFamily(node.polymerase)
  const templates = templateSequencesForPcr(node)
  const oligos = node.oligos.length
    ? node.oligos
    : [
        { name: 'Forward primer', sequence: '' },
        { name: 'Reverse primer', sequence: '' },
      ]
  const primers = oligos.map((oligo, index) => analyzePcrRecipePrimer(oligo, index, templates))
  const productSequence = typeof node.sequence === 'string' ? normalizeDna(node.sequence) : ''
  const productGcPercent = productSequence.length > 0 ? gcPercent(productSequence) : null
  const structures = pairStructures(primers)
  const programPlan = suggestPcrProgram({
    productLengthBp: Math.max(1, node.seqLen),
    productGcPercent,
    enzymeFamily,
    primers,
    structures,
    cycles: settings.cycles,
  })

  return {
    productName: node.name.replace(/\.dna$/i, '') || 'PCR product',
    productLengthBp: Math.max(0, node.seqLen),
    productGcPercent,
    enzymeFamily,
    polymeraseLabel: node.polymerase ?? null,
    primers,
    twoStep: programPlan.twoStep,
    annealingC: programPlan.annealingC,
    extensionSeconds: programPlan.extensionSeconds,
    cycles: programPlan.cycles,
    program: programPlan.steps,
    notes: programPlan.notes,
    primerFinaluM: defaultPrimerFinaluM(enzymeFamily, settings),
  }
}

export function primerVolumeUl(
  reactionVolumeUl: number,
  stockuM: number,
  finaluM: number,
): number | null {
  if (
    !Number.isFinite(reactionVolumeUl) ||
    !Number.isFinite(stockuM) ||
    !Number.isFinite(finaluM) ||
    reactionVolumeUl < 0 ||
    stockuM <= 0 ||
    finaluM < 0
  ) {
    return null
  }
  return (finaluM / stockuM) * reactionVolumeUl
}

export function bufferVolumeUl(reactionVolumeUl: number, bufferFold: number): number | null {
  if (!Number.isFinite(reactionVolumeUl) || !Number.isFinite(bufferFold) || reactionVolumeUl < 0 || bufferFold <= 0) {
    return null
  }
  return reactionVolumeUl / bufferFold
}

export function dntpVolumeUl(reactionVolumeUl: number, stockmM: number, finalmM: number): number | null {
  return primerVolumeUl(reactionVolumeUl, stockmM, finalmM)
}

export function pcrMixComponents(input: {
  volumeUl: number
  enzymeFamily: PcrEnzymeFamily
  primerNames: string[]
  primerStockuM: number
  primerFinaluM: number
  bufferFold?: number
  dntpStockmM?: number
  dntpFinalmM?: number
  polymeraseUl?: number
  templateUl?: number
}): PcrMixComponent[] {
  const volume = input.volumeUl
  const bufferFold = input.bufferFold ?? DEFAULT_BUFFER_FOLD
  const dntpStockmM = input.dntpStockmM ?? DEFAULT_DNTP_STOCK_MM
  const dntpFinalmM = input.dntpFinalmM ?? DEFAULT_DNTP_FINAL_MM
  const polymeraseUl = input.polymeraseUl ?? DEFAULT_POLYMERASE_UL
  const templateUl = input.templateUl ?? DEFAULT_TEMPLATE_UL
  const bufferUl = bufferVolumeUl(volume, bufferFold)
  const dntpUl = dntpVolumeUl(volume, dntpStockmM, dntpFinalmM)
  const primerUl = primerVolumeUl(volume, input.primerStockuM, input.primerFinaluM)
  const primerRows: PcrMixComponent[] = (input.primerNames.length ? input.primerNames : ['Forward primer', 'Reverse primer']).map(
    (name, index) => ({
      id: `primer:${index}`,
      name,
      stock: Number.isFinite(input.primerStockuM) ? `${formatRecipeQuantity(input.primerStockuM)} µM` : '—',
      ulPerReaction: primerUl === null ? null : roundUl(primerUl),
    }),
  )
  const bufferName = input.enzymeFamily === 'taq' ? 'PCR buffer' : 'HF PCR buffer'
  const fixed: PcrMixComponent[] = [
    {
      id: 'buffer',
      name: bufferName,
      stock: Number.isFinite(bufferFold) ? `${formatRecipeQuantity(bufferFold)}×` : '—',
      ulPerReaction: bufferUl === null ? null : roundUl(bufferUl),
    },
    {
      id: 'dntp',
      name: 'dNTPs',
      stock: Number.isFinite(dntpStockmM) ? `${formatRecipeQuantity(dntpStockmM)} mM` : '—',
      ulPerReaction: dntpUl === null ? null : roundUl(dntpUl),
    },
    ...primerRows,
    {
      id: 'template',
      name: 'Template DNA',
      stock: '—',
      ulPerReaction: Number.isFinite(templateUl) && templateUl >= 0 ? roundUl(templateUl) : null,
    },
    {
      id: 'pol',
      name: input.enzymeFamily === 'taq' ? 'Taq polymerase' : 'High-fidelity polymerase',
      stock: '—',
      ulPerReaction: Number.isFinite(polymeraseUl) && polymeraseUl >= 0 ? roundUl(polymeraseUl) : null,
    },
  ]
  const used = fixed.reduce((sum, row) => sum + (row.ulPerReaction ?? 0), 0)
  const water = Number.isFinite(volume) ? roundUl(volume - used) : null
  return [
    ...fixed,
    { id: 'water', name: 'Nuclease-free water', stock: '—', ulPerReaction: water },
  ]
}

export function mixVolumeForReactions(ulPerReaction: number | null, reactions: number): number | null {
  if (ulPerReaction === null || !Number.isFinite(ulPerReaction) || !Number.isFinite(reactions) || reactions < 0) {
    return null
  }
  return ulPerReaction * reactions
}

export function formatPcrTemperature(celsius: number): string {
  return `${Math.round(celsius)} °C`
}

export function formatPcrDuration(seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds)) return '∞'
  if (seconds < 60) return `${Math.round(seconds)} s`
  const minutes = Math.floor(seconds / 60)
  const rest = Math.round(seconds - minutes * 60)
  if (rest <= 0) return `${minutes} min`
  return `${minutes} min ${rest} s`
}

export function formatPcrTm(tmC: number | null): string {
  if (tmC === null || !Number.isFinite(tmC)) return '—'
  return `${tmC.toFixed(1)} °C`
}

export { formatRecipeQuantity, parseRecipeNumber }

function templateSequencesForPcr(node: HistoryNode): string[] {
  const sequences: string[] = []
  const seen = new Set<string>()
  const push = (raw: string | undefined) => {
    const sequence = typeof raw === 'string' ? normalizeDna(raw) : ''
    if (!sequence || seen.has(sequence)) return
    seen.add(sequence)
    sequences.push(sequence)
  }
  for (const child of node.children) push(child.sequence)
  return sequences
}

function analyzePcrRecipePrimer(oligo: HistoryOligo, index: number, templates: string[]): PcrRecipePrimer {
  const sequence = normalizeDna(oligo.sequence)
  const name = oligo.name.trim() || (index === 0 ? 'Forward primer' : index === 1 ? 'Reverse primer' : `Primer ${index + 1}`)
  const anneal = annealingSequence(sequence, templates)
  const tm = anneal.sequence ? calculateAnnealTemperature(anneal.sequence).tmC : null
  return {
    id: `${name}:${index}`,
    name,
    sequence,
    length: sequence.length,
    annealSequence: anneal.sequence,
    annealLength: anneal.sequence.length,
    tmC: tm !== null && Number.isFinite(tm) ? tm : null,
    tmFromFullOligo: anneal.fromFullOligo,
  }
}

function annealingSequence(sequence: string, templates: string[]): { sequence: string; fromFullOligo: boolean } {
  if (!sequence) return { sequence: '', fromFullOligo: true }
  const primer: Primer = { id: 'pcr-recipe', name: 'primer', sequence, color: '#2563eb' }
  let best = ''
  for (const template of templates) {
    const layouts = resolveDisplayableLayoutsForPrimer(template, primer, defaultPrimerHybridizationParams)
    for (const layout of layouts) {
      const terminal = primerConstructAnnealSequence(template, layout)
      if (terminal.length > best.length) best = terminal
    }
  }
  if (best.length >= 8) return { sequence: best, fromFullOligo: false }
  return { sequence, fromFullOligo: true }
}

function pairStructures(primers: PcrRecipePrimer[]): PrimerSecondaryStructure[] {
  const withSequence = primers.filter((primer) => primer.sequence.length >= 8)
  if (withSequence.length === 0) return []
  if (withSequence.length === 1) {
    return predictPrimerPairStructures(withSequence[0]!.sequence, withSequence[0]!.sequence, {
      forward: withSequence[0]!.name,
      reverse: withSequence[0]!.name,
    }).filter((structure) => structure.kind !== 'hetero-dimer')
  }
  return predictPrimerPairStructures(withSequence[0]!.sequence, withSequence[1]!.sequence, {
    forward: withSequence[0]!.name,
    reverse: withSequence[1]!.name,
  })
}

function suggestPcrProgram(input: {
  productLengthBp: number
  productGcPercent: number | null
  enzymeFamily: PcrEnzymeFamily
  primers: PcrRecipePrimer[]
  structures: PrimerSecondaryStructure[]
  cycles?: number
}): {
  twoStep: boolean
  annealingC: number
  extensionSeconds: number
  cycles: number
  steps: PcrProgramStep[]
  notes: PcrRecipeNote[]
} {
  const notes: PcrRecipeNote[] = []
  const tms = input.primers.map((primer) => primer.tmC).filter((tm): tm is number => tm !== null)
  const minTm = tms.length ? Math.min(...tms) : null
  const maxTm = tms.length ? Math.max(...tms) : null
  const twoStep =
    minTm !== null &&
    ((input.enzymeFamily === 'high-fidelity' && minTm >= 68) || (input.enzymeFamily === 'taq' && minTm >= 72))
  let annealingC =
    minTm === null ? 60 : twoStep ? 72 : input.enzymeFamily === 'taq' ? minTm - 5 : minTm
  annealingC = Math.round(clamp(annealingC, input.enzymeFamily === 'taq' ? 48 : 55, 72))

  if (minTm !== null && maxTm !== null && maxTm - minTm >= 5) {
    notes.push({
      severity: 'warning',
      text: `Primer Tms differ by ${(maxTm - minTm).toFixed(1)} °C. Annealing uses the lower Tm.`,
    })
  }
  if (input.primers.some((primer) => primer.tmFromFullOligo && primer.sequence)) {
    notes.push({
      severity: 'info',
      text: 'Tm is from the full oligo because the parental template sequence is not in history.',
    })
  } else if (input.primers.some((primer) => primer.annealLength > 0 && primer.annealLength < primer.length)) {
    notes.push({
      severity: 'info',
      text: 'Tm is the 3′ annealing stretch (not 5′ overhangs).',
    })
  }

  const dimer = worstStructure(input.structures, (structure) => structure.kind !== 'hairpin')
  const hairpin = worstStructure(input.structures, (structure) => structure.kind === 'hairpin')
  if (dimer && (dimer.dG37 <= -8 || (dimer.tmC !== null && dimer.tmC >= annealingC - 12))) {
    notes.push({
      severity: 'warning',
      text: `${dimer.label} (${formatStructureDeltaG(dimer.dG37)}, Tm ${formatStructureTm(dimer.tmC)}). Consider raising Ta 2 °C, 0.2 µM primers, or a hot-start mix.`,
    })
  }
  if (hairpin && (hairpin.dG37 <= -6 || (hairpin.tmC !== null && hairpin.tmC >= annealingC - 8))) {
    notes.push({
      severity: 'warning',
      text: `${hairpin.source}: ${hairpin.label} (${formatStructureDeltaG(hairpin.dG37)}, Tm ${formatStructureTm(hairpin.tmC)}). Use 98 °C denaturation; 2–5% DMSO if yield is low.`,
    })
  }

  const gcRich = input.productGcPercent !== null && input.productGcPercent >= 65
  if (gcRich) {
    notes.push({
      severity: 'warning',
      text: `Amplicon is ${input.productGcPercent!.toFixed(0)}% GC. Keep 98 °C denaturation; add 2–5% DMSO or a GC enhancer if needed.`,
    })
  }

  const extensionSeconds = extensionTimeSeconds(input.productLengthBp, input.enzymeFamily)
  const denatureC = input.enzymeFamily === 'taq' && !gcRich ? 95 : 98
  const initialDenatureSeconds = input.enzymeFamily === 'taq' ? 120 : gcRich ? 45 : 30
  const cycleDenatureSeconds = input.enzymeFamily === 'taq' ? 20 : 10
  const annealSeconds = input.enzymeFamily === 'taq' ? 30 : 15
  const finalExtension = input.enzymeFamily === 'taq' ? 300 : 120
  const cycles = Math.round(clamp(input.cycles ?? DEFAULT_PCR_CYCLES, 1, 60))

  if (twoStep) {
    notes.push({
      severity: 'info',
      text: 'Primer Tm is high enough for two-step PCR (anneal and extend together at 72 °C).',
    })
  }

  const steps: PcrProgramStep[] = [
    {
      id: 'init-denature',
      label: 'Initial denaturation',
      temperatureC: denatureC,
      durationSeconds: initialDenatureSeconds,
      inCycle: false,
    },
  ]
  if (twoStep) {
    steps.push(
      {
        id: 'cycle-denature',
        label: 'Denaturation',
        temperatureC: denatureC,
        durationSeconds: cycleDenatureSeconds,
        inCycle: true,
      },
      {
        id: 'anneal-extend',
        label: 'Anneal / extend',
        temperatureC: 72,
        durationSeconds: Math.max(extensionSeconds, annealSeconds),
        inCycle: true,
      },
    )
  } else {
    steps.push(
      {
        id: 'cycle-denature',
        label: 'Denaturation',
        temperatureC: denatureC,
        durationSeconds: cycleDenatureSeconds,
        inCycle: true,
      },
      {
        id: 'anneal',
        label: 'Annealing',
        temperatureC: annealingC,
        durationSeconds: annealSeconds,
        inCycle: true,
      },
      {
        id: 'extend',
        label: 'Extension',
        temperatureC: 72,
        durationSeconds: extensionSeconds,
        inCycle: true,
      },
    )
  }
  steps.push({
    id: 'final-extend',
    label: 'Final extension',
    temperatureC: 72,
    durationSeconds: finalExtension,
    inCycle: false,
  })

  return { twoStep, annealingC, extensionSeconds, cycles, steps, notes }
}

export function extensionTimeSeconds(productLengthBp: number, family: PcrEnzymeFamily): number {
  const kb = Math.max(productLengthBp, 1) / 1000
  if (family === 'taq') return Math.max(30, Math.ceil(kb) * 60)
  const seconds = Math.ceil(kb * 20)
  return Math.max(15, Math.ceil(seconds / 5) * 5)
}

function worstStructure(
  structures: PrimerSecondaryStructure[],
  predicate: (structure: PrimerSecondaryStructure) => boolean,
): PrimerSecondaryStructure | null {
  return structures.filter(predicate).sort((a, b) => a.dG37 - b.dG37)[0] ?? null
}

function gcPercent(sequence: string): number {
  if (!sequence) return 0
  return ((sequence.match(/[GC]/g)?.length ?? 0) / sequence.length) * 100
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function roundUl(value: number): number {
  return Math.round(value * 1000) / 1000
}

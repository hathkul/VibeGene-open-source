import {
  complementaryPrimerPair,
  partnerForCloningOligo,
  sgRnaOligoDirectionFromName,
} from '../../domain/annealedOligos'
import type { HistoryOligo, HistorySgRnaCloning, Primer } from '../../domain/types'

export type SgRnaRecipeGuide = HistorySgRnaCloning['guides'][number]

/**
 * Which library member an editor/delete command targets, if any. Editing stays on the
 * consensus record while browsing alignment members unless the Primers tab (or a
 * non-alignment view) makes the member the explicit editing target.
 */
export function primerEditingMemberId(input: {
  activeTab: string
  alignmentsVisible: boolean
  isLibrary: boolean
  selectedAlignmentTraceId: string | null
}): string | null {
  return input.selectedAlignmentTraceId
    && input.isLibrary
    && (input.activeTab === 'Primers' || !input.alignmentsVisible)
    ? input.selectedAlignmentTraceId
    : null
}

/** Default editor name for a new primer: `Primer N`, or `Forward|Reverse primer N` from a range. */
export function newPrimerEditorName(strand: 'forward' | 'reverse' | null, existingPrimerCount: number): string {
  const base = strand ? (strand === 'forward' ? 'Forward primer' : 'Reverse primer') : 'Primer'
  return `${base} ${existingPrimerCount + 1}`
}

/** Resolve the sense/antisense pair behind the current primer menu selection, if any. */
export function annealedOligoPairForSelection(
  selected: readonly Primer[],
  sourcePrimers: readonly Primer[],
): { sense: Primer; antisense: Primer } | null {
  if (selected.length === 2) return complementaryPrimerPair(selected)
  if (selected.length === 1) return partnerForCloningOligo(selected[0]!, sourcePrimers)
  return null
}

/** Find the cloning-recipe guide whose sense oligo matches the given sequence. */
export function sgRnaRecipeGuideForSenseSequence(
  recipe: HistorySgRnaCloning | undefined,
  senseSequence: string,
): SgRnaRecipeGuide | undefined {
  return recipe?.guides.find((guide) =>
    recipe.oligos.some((oligo) =>
      oligo.guideId === guide.sourceGuideId
      && oligo.sequence.toUpperCase() === senseSequence.toUpperCase()))
}

/** Resolve a history guide's sense and antisense cloning oligos; null when either is missing. */
export function sgRnaGuideOligoPair(
  recipe: HistorySgRnaCloning | undefined,
  guideId: string,
): { guide: SgRnaRecipeGuide; sense: HistoryOligo; antisense: HistoryOligo } | null {
  const guide = recipe?.guides.find((entry) => entry.sourceGuideId === guideId)
  const oligos = recipe?.oligos.filter((oligo) => oligo.guideId === guideId) ?? []
  const sense = oligos.find((oligo) => sgRnaOligoDirectionFromName(oligo.name) === 'sense')
  const antisense = oligos.find((oligo) => sgRnaOligoDirectionFromName(oligo.name) === 'antisense')
  if (!guide || !sense || !antisense) return null
  return { guide, sense, antisense }
}

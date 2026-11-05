import { matchesMobileShellViewport } from './mobileShellMedia'

export const MOBILE_SEQUENCE_TOUCH_HINT =
  'Drag bases to select · Tap two sites or primers to select a pair'

export const MOBILE_PROTEIN_MAP_TOUCH_HINT =
  'Drag the backbone to select · Drag empty map to pan'

export const MOBILE_PROTEIN_MAP_ZOOMED_TOUCH_HINT =
  'Drag the backbone to select · Drag empty map to pan/move view'

export const MOBILE_PROTEIN_SEQUENCE_TOUCH_HINT =
  'Drag residues to select · Swipe the ruler or tracks to scroll'

export type MobilePairSelectionAnchor = {
  kind: 'base' | 'primer' | 'feature' | 'enzyme' | string
} | null

export function pointerModifierExtend(
  event: Pick<KeyboardEvent | MouseEvent, 'shiftKey' | 'ctrlKey' | 'metaKey'>,
): boolean {
  return event.shiftKey || event.ctrlKey || event.metaKey
}

/** Second tap on a different cut site pairs fragments on touch phones (Shift/Ctrl on desktop). */
export function resolveMobileEnzymeCutPairExtend(
  extendFromModifier: boolean,
  cutSelectionAnchor: unknown | null,
  nextSiteKey: string,
  anchorSiteKey: string | null,
): boolean {
  if (extendFromModifier) return true
  if (!matchesMobileShellViewport()) return false
  if (!cutSelectionAnchor || !anchorSiteKey) return false
  return nextSiteKey !== anchorSiteKey
}

/** Second tap on another primer adds to primer selection on touch phones. */
export function resolveMobilePrimerPairExtend(
  extendFromModifier: boolean,
  selectionAnchor: MobilePairSelectionAnchor,
  selectionFocus: string,
): boolean {
  if (extendFromModifier) return true
  if (!matchesMobileShellViewport()) return false
  return selectionAnchor?.kind === 'primer' && selectionFocus === 'primer'
}

export function mobileEnzymeCutAnchorStatus(enzymeName: string, cutTop: number, cutBottom: number): string {
  return `Cut anchor ${enzymeName}: top ${cutTop + 1}, bottom ${cutBottom + 1}. Tap another cut site to select the fragment between cuts.`
}

export function mobilePrimerAnchorStatus(primerName: string, rangeLabel?: string): string {
  const lead = rangeLabel
    ? `Selected primer ${primerName}: ${rangeLabel}.`
    : `Selected primer ${primerName}.`
  return `${lead} Tap another primer to add a pair or PCR amplicon.`
}

export function desktopEnzymeCutAnchorStatus(enzymeName: string, cutTop: number, cutBottom: number): string {
  return `Cut anchor ${enzymeName}: top ${cutTop + 1}, bottom ${cutBottom + 1}. Shift/Ctrl-click another site to select the fragment.`
}

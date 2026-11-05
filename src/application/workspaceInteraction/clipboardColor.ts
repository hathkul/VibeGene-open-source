type SelectionRange = { start: number; end: number }

export type ClipboardStrands = { top: SelectionRange; bottom: SelectionRange }

export function clipboardStrands(
  selectedRange: SelectionRange | null,
  cutStrandSelection: { forward: SelectionRange; reverse: SelectionRange } | null,
  hasStickyFragmentSelection: boolean,
): ClipboardStrands | null {
  if (cutStrandSelection && hasStickyFragmentSelection) {
    return { top: cutStrandSelection.forward, bottom: cutStrandSelection.reverse }
  }
  if (selectedRange && selectedRange.start !== selectedRange.end) {
    return { top: selectedRange, bottom: selectedRange }
  }
  return null
}

export function shouldHandleProteinSequenceEditorKey(
  editing: boolean,
  selectedFeatureId: string | null,
  selectedBondId: string | null,
): boolean {
  return editing && selectedFeatureId === null && selectedBondId === null
}

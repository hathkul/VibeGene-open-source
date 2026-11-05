import { reverseComplementChromatogram } from '../domain/dnaLibrary'
import { reverseComplement } from '../domain/sequence'
import type { TraceFileRecord } from '../domain/traceTypes'
export { isTraceDocumentFileName } from '../domain/traceDocumentFile'

export type TraceDocumentDirection = 'forward' | 'reverse'

/** Keep the original file name visible while the trace is being inspected. */
export function traceDocumentTitleName(fileName: string | null | undefined, fallback: string): string {
  return fileName?.trim() || fallback
}

/** TraceViewer is a direct child of the sequence grid, so it must span it. */
export function traceDocumentSequenceLayoutClass(isTraceDocument: boolean): string {
  return isTraceDocument ? ' is-sequence-only' : ''
}

/** Trace inspection owns the entire workspace without changing the saved panel preference. */
export function traceDocumentDescriptionPanelVisible(preferenceVisible: boolean, isTraceDocument: boolean): boolean {
  return preferenceVisible && !isTraceDocument
}

/**
 * Commands that would alter the shell sequence record, its annotations, or
 * persist the raw read. View, tools, settings, help, and File → Open remain
 * available while inspecting a trace document.
 */
export function isTraceDocumentMutationAction(action: string): boolean {
  return (
    action.startsWith('enzymes.') ||
    action.startsWith('features.') ||
    action.startsWith('primers.') ||
    action.startsWith('crispr.') ||
    action.startsWith('actions.') ||
    action.startsWith('file.save') ||
    action === 'file.rename' ||
    action === 'file.convert-to-library' ||
    action === 'file.new-from-selection' ||
    action === 'edit.undo' ||
    action === 'edit.redo' ||
    action === 'edit.crop-library' ||
    action === 'edit.uppercase' ||
    action === 'edit.lowercase' ||
    action === 'edit.set-dna-color' ||
    action === 'edit.toggle-topology' ||
    action === 'edit.flip-sequence' ||
    action === 'edit.edit-dna-ends' ||
    action === 'edit.set-origin-caret' ||
    action === 'view.edit-map-label' ||
    action.startsWith('protein.')
  )
}

/** Keep native drop paths attached when a mixed drop is partitioned by type. */
export function pairDroppedFiles<T>(
  files: readonly T[],
  localPaths?: readonly (string | undefined)[],
): Array<{ file: T; path: string | undefined }> {
  return files.map((file, index) => ({ file, path: localPaths?.[index] }))
}

/**
 * Prepare the raw read for a new editable linear construct. The reverse path
 * flips both called bases and signal channels so the aligned chromatogram is
 * still physically oriented with the new forward template.
 */
export function traceForSequenceConversion(
  trace: TraceFileRecord,
  direction: TraceDocumentDirection,
): TraceFileRecord {
  if (direction === 'forward') {
    return { ...trace, alignment: null, expanded: true, showAnnotations: false }
  }
  return {
    ...trace,
    sequence: reverseComplement(trace.sequence),
    chromatogram: reverseComplementChromatogram(trace.chromatogram),
    alignment: null,
    expanded: true,
    showAnnotations: false,
  }
}

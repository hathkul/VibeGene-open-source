import { applyHistoryRetention, type HistoryRetentionPolicy } from '../../domain/historyRetention'
import { previewHistoryTrim, type HistoryTrimRemovalCounts } from '../../domain/historyRetentionPreview'
import type { SequenceRecord } from '../../domain/types'

export function planManagedNativeHistoryTrimStatus(removed: HistoryTrimRemovalCounts): string {
  return `Trimmed history: removed ${removed.nativeHistoryNodes} node${removed.nativeHistoryNodes === 1 ? '' : 's'}, ${removed.nativeDecodedSequenceBases.toLocaleString()} decoded base${removed.nativeDecodedSequenceBases === 1 ? '' : 's'}, and ${removed.nativeAncestorTraces} embedded trace${removed.nativeAncestorTraces === 1 ? '' : 's'}. Use Undo to restore it.`
}

export function planManagedProteinSourceHistoryTrimStatus(removed: HistoryTrimRemovalCounts): string {
  return `Trimmed protein source DNA: removed ${removed.embeddedDnaSources} embedded source${removed.embeddedDnaSources === 1 ? '' : 's'}, ${removed.embeddedHistoryNodes} history node${removed.embeddedHistoryNodes === 1 ? '' : 's'}, and ${removed.embeddedAncestorTraces} trace${removed.embeddedAncestorTraces === 1 ? '' : 's'}. Use Undo to restore it.`
}

export type ManagedHistoryRetentionHistoryPorts = {
  updateRecord: (updater: (current: SequenceRecord) => SequenceRecord) => void
  setStatus: (status: string) => void
}

export type ManagedNativeHistoryRetentionDialogPorts = {
  closeHistoryManager: () => void
}

export type ManagedProteinSourceHistoryRetentionDialogPorts = {
  closeProteinSourceHistoryManager: () => void
}

/** Preview on the live record, then push undo snapshot and apply trim via updateRecord. */
export function executeManagedNativeHistoryRetention(
  record: SequenceRecord,
  policy: HistoryRetentionPolicy,
  dialog: ManagedNativeHistoryRetentionDialogPorts,
  history: ManagedHistoryRetentionHistoryPorts,
): void {
  const preview = previewHistoryTrim(record, policy)
  history.updateRecord((current) => applyHistoryRetention(current, policy))
  dialog.closeHistoryManager()
  history.setStatus(planManagedNativeHistoryTrimStatus(preview.removed))
}

export function executeManagedProteinSourceHistoryRetention(
  record: SequenceRecord,
  policy: HistoryRetentionPolicy,
  dialog: ManagedProteinSourceHistoryRetentionDialogPorts,
  history: ManagedHistoryRetentionHistoryPorts,
): void {
  const preview = previewHistoryTrim(record, policy)
  history.updateRecord((current) => applyHistoryRetention(current, policy))
  dialog.closeProteinSourceHistoryManager()
  history.setStatus(planManagedProteinSourceHistoryTrimStatus(preview.removed))
}

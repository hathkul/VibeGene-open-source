import { formatSequenceLength } from '../../domain/moleculeCapabilities'
import type { SequenceRecord } from '../../domain/types'

export const NEW_FILE_FROM_SELECTION_MISSING_STATUS =
  'Select a sequence range or a two-enzyme cut fragment first.'

export type NewFileFromSelectionDraftPlan =
  | { kind: 'missing-selection'; status: string }
  | { kind: 'pending'; record: SequenceRecord }

export function planNewFileFromSelectionDraft(
  next: SequenceRecord | null,
): NewFileFromSelectionDraftPlan {
  if (!next) {
    return { kind: 'missing-selection', status: NEW_FILE_FROM_SELECTION_MISSING_STATUS }
  }
  return { kind: 'pending', record: next }
}

export function planNewFileFromSelectionConfirm(
  pending: SequenceRecord,
  normalizedName: string,
): { record: SequenceRecord; status: string } {
  const ext = pending.molecule === 'protein' ? 'prot' : 'dna'
  const record: SequenceRecord = {
    ...pending,
    name: normalizedName,
    history: pending.history
      ? { ...pending.history, name: `${normalizedName}.${ext}` }
      : pending.history,
  }
  return {
    record,
    status: `Opened new file from selection: ${record.name} (${formatSequenceLength(record.sequence.length, record.molecule)}).`,
  }
}

export function planNewDnaFileCreatedStatus(record: SequenceRecord): string {
  return `Created ${record.name}.dna (${record.topology}, ${record.sequence.length} bp).`
}

export function planNewProteinFileCreatedStatus(record: SequenceRecord): string {
  return `Created ${record.name} (${formatSequenceLength(record.sequence.length, record.molecule)}).`
}

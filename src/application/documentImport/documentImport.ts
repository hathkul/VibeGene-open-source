import { formatSequenceLength } from '../../domain/moleculeCapabilities'
import { isDnaLibraryRecord } from '../../domain/dnaLibrary'
import { defaultDnaEnds } from '../../domain/dnaEnds'
import type { SequenceRecord } from '../../domain/types'

export type ImportedRecordSelectionPlan = {
  selection: { kind: 'neutral' }
  showLibraryAlignments: boolean
  status: string
}

export function planImportedRecordSelection(record: SequenceRecord, fileName: string): ImportedRecordSelectionPlan {
  return {
    selection: { kind: 'neutral' },
    showLibraryAlignments: isDnaLibraryRecord(record),
    status: `Imported ${fileName} (${formatSequenceLength(record.sequence.length, record.molecule)}, ${record.topology}).`,
  }
}

export function planUnsavedDownloadedRecordSelection(record: SequenceRecord) {
  return {
    selection: { kind: 'neutral' },
    showLibraryAlignments: isDnaLibraryRecord(record),
  }
}

export function importedTraceSequenceName(fileName: string, fallback: string): string {
  return fileName.replace(/\.ab1$/i, '') || fallback
}

export function applyImportedTopology(record: SequenceRecord, topology: SequenceRecord['topology']): SequenceRecord {
  return {
    ...record,
    topology,
    dnaEnds: topology === 'linear' ? record.dnaEnds ?? defaultDnaEnds() : undefined,
    dnaEndsProvenance: topology === 'linear' ? record.dnaEndsProvenance : undefined,
  }
}

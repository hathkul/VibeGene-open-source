import { isDnaLibraryRecord } from '../../domain/dnaLibrary'
import type { SequenceRecord } from '../../domain/types'

export function canConvertConstructToLibrary(record: SequenceRecord): boolean {
  return record.molecule === 'dna'
    && !isDnaLibraryRecord(record)
    && record.sequence.trim().length > 0
}

export function convertToLibraryPickerBlockedStatus(record: SequenceRecord): string {
  return isDnaLibraryRecord(record)
    ? 'This file is already a DNA library.'
    : 'Open a DNA construct with a sequence to convert it to a library.'
}

export function libraryCollapseStatusMessage(remainingMemberCount: number): string {
  return remainingMemberCount === 1
    ? 'Converted back to a DNA construct (one member left).'
    : 'Converted back to a DNA construct (no members left).'
}

export function createdDnaLibraryStatusMessage(record: SequenceRecord): string {
  const memberCount = record.traceFiles?.length ?? 0
  return `Created DNA library “${record.name}” (${memberCount.toLocaleString()} member${
    memberCount === 1 ? '' : 's'
  }, ${record.sequence.length.toLocaleString()} bp consensus).`
}

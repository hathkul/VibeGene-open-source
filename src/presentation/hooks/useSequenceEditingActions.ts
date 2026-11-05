import { useCallback } from 'react'
import { isDnaLibraryRecord } from '../../domain/dnaLibrary'
import { sanitizeDna } from '../../domain/sequence'
import { replaceSequenceRange, planCaretDeletion, type SelectionRange } from '../../application/selectionEditing/selectionEditing'
import type { RichClipboardFragment } from '../../domain/richClipboard'
import type { SequenceRecord } from '../../domain/types'
import type { TraceFileRecord } from '../../domain/traceTypes'

type SequenceEditReplacement = { start: number; end: number; insertedLength: number }

type SequenceEditingActionsOptions = {
  record: SequenceRecord
  traceFiles: TraceFileRecord[]
  selectedRange: SelectionRange | null
  selectionFocus: 'dna' | 'feature' | 'primer' | 'bond'
  cutStrandSelection: unknown | null
  selectedAlignmentTraceId: string | null
  alignmentsVisible: boolean
  applyMemberSequenceEdit: (nextRange: SelectionRange, replacement: SequenceEditReplacement, insert: string) => boolean
  applySequenceEdit: (nextSequence: string, nextRange: SelectionRange, replacement: SequenceEditReplacement, richFragment?: RichClipboardFragment | null) => void
  setStatus: (message: string) => void
}

export function useSequenceEditingActions({
  record,
  traceFiles,
  selectedRange,
  selectionFocus,
  cutStrandSelection,
  selectedAlignmentTraceId,
  alignmentsVisible,
  applyMemberSequenceEdit,
  applySequenceEdit,
  setStatus,
}: SequenceEditingActionsOptions) {
  const deleteSequenceSelection = useCallback(() => {
    if (selectionFocus !== 'dna' || !selectedRange || cutStrandSelection || selectedRange.start === selectedRange.end) return false
    const deleteStart = selectedRange.start
    const deleteEnd = selectedRange.end
    if (selectedAlignmentTraceId && (alignmentsVisible || isDnaLibraryRecord(record))) {
      return applyMemberSequenceEdit({ start: deleteStart, end: deleteStart }, { start: deleteStart, end: deleteEnd, insertedLength: 0 }, '')
    }
    applySequenceEdit(replaceSequenceRange(record.sequence, deleteStart, deleteEnd, ''), { start: deleteStart, end: deleteStart }, { start: deleteStart, end: deleteEnd, insertedLength: 0 })
    setStatus(`Deleted ${deleteEnd - deleteStart} bp.`)
    return true
  }, [alignmentsVisible, applyMemberSequenceEdit, applySequenceEdit, cutStrandSelection, record, selectedAlignmentTraceId, selectedRange, selectionFocus, setStatus])

  const deleteSequenceAtCaret = useCallback((backspace: boolean) => {
    if (selectionFocus !== 'dna' || !selectedRange || cutStrandSelection || selectedRange.start !== selectedRange.end) return false
    const caret = selectedRange.start
    const browseMember = !alignmentsVisible && selectedAlignmentTraceId && isDnaLibraryRecord(record)
      ? traceFiles.find((trace) => trace.id === selectedAlignmentTraceId)
      : null
    const sequenceLength = browseMember?.sequence.length ?? record.sequence.length
    const deletion = planCaretDeletion(caret, sequenceLength, backspace)
    if (!deletion) return false
    if (selectedAlignmentTraceId && (alignmentsVisible || isDnaLibraryRecord(record))) {
      return applyMemberSequenceEdit(deletion.nextRange, { start: deletion.start, end: deletion.end, insertedLength: 0 }, '')
    }
    applySequenceEdit(replaceSequenceRange(record.sequence, deletion.start, deletion.end, ''), deletion.nextRange, { start: deletion.start, end: deletion.end, insertedLength: 0 })
    setStatus('Deleted 1 bp.')
    return true
  }, [alignmentsVisible, applyMemberSequenceEdit, applySequenceEdit, cutStrandSelection, record, selectedAlignmentTraceId, selectedRange, selectionFocus, setStatus, traceFiles])

  const insertSequenceBases = useCallback((insert: string, richFragment?: RichClipboardFragment | null) => {
    const sanitizedInsert = sanitizeDna(insert)
    if (!sanitizedInsert || cutStrandSelection || record.molecule === 'protein') return false
    const browseMember = !alignmentsVisible && selectedAlignmentTraceId && isDnaLibraryRecord(record)
      ? traceFiles.find((trace) => trace.id === selectedAlignmentTraceId)
      : null
    const sequenceLength = browseMember?.sequence.length ?? record.sequence.length
    const start = selectedRange?.start ?? sequenceLength
    const end = selectedRange?.end ?? start
    if (selectedAlignmentTraceId && (alignmentsVisible || isDnaLibraryRecord(record))) {
      return applyMemberSequenceEdit({ start: start + sanitizedInsert.length, end: start + sanitizedInsert.length }, { start, end, insertedLength: sanitizedInsert.length }, sanitizedInsert)
    }
    const nextCaret = start + sanitizedInsert.length
    applySequenceEdit(replaceSequenceRange(record.sequence, start, end, sanitizedInsert), { start: nextCaret, end: nextCaret }, { start, end, insertedLength: sanitizedInsert.length }, richFragment)
    const annotationParts = [
      richFragment && richFragment.features.length ? `${richFragment.features.length} feature${richFragment.features.length === 1 ? '' : 's'}` : '',
      richFragment && richFragment.primers.length ? `${richFragment.primers.length} primer${richFragment.primers.length === 1 ? '' : 's'}` : '',
    ].filter(Boolean)
    const annotationNote = annotationParts.length ? ` with ${annotationParts.join(' and ')}` : ''
    setStatus(`Inserted ${sanitizedInsert.length} bp${annotationNote}.`)
    return true
  }, [alignmentsVisible, applyMemberSequenceEdit, applySequenceEdit, cutStrandSelection, record, selectedAlignmentTraceId, selectedRange, setStatus, traceFiles])

  return { deleteSequenceSelection, deleteSequenceAtCaret, insertSequenceBases }
}

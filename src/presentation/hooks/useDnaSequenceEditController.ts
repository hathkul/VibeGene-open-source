import { useCallback } from 'react'
import { isDnaLibraryRecord } from '../../domain/dnaLibrary'
import type { DnaSequenceEditPorts } from '../../application/ports/sequenceEditPorts'
import {
  computeMemberSequenceEdit,
  memberSequenceEditErrorMessage,
  planMemberSequenceEditStatus,
  planReferenceReplacementFromTrace,
  planSequenceEditProfilerDetail,
  resolveMemberSequenceEditContext,
} from '../../application/selectionEditing/sequenceEditCommitPlan'
import {
  applySequenceEditTransition,
  type SequenceEditReplacement,
} from '../../application/selectionEditing/sequenceEditTransition'
import type { RichClipboardFragment } from '../../domain/richClipboard'
import type { SequenceRecord } from '../../domain/types'
import type { TraceFileRecord } from '../../domain/traceTypes'
import type { SelectionRange } from '../../application/selectionEditing/selectionEditing'

export type DnaSequenceEditControllerOptions = {
  record: SequenceRecord
  traceFiles: TraceFileRecord[]
  selectedAlignmentTraceId: string | null
  alignmentsVisible: boolean
  ports: DnaSequenceEditPorts
}

/** Owns main-record and library-member DNA sequence edit commits; composes selection-editing strict plans with injected history/scroll ports. */
export function useDnaSequenceEditController(options: DnaSequenceEditControllerOptions) {
  const { ports } = options

  const applySequenceEdit = useCallback((
    nextSequence: string,
    nextRange: SelectionRange,
    replacement: SequenceEditReplacement,
    richFragment?: RichClipboardFragment | null,
    editOptions?: { recordHistory?: boolean },
  ) => {
    const editDetail = planSequenceEditProfilerDetail(replacement)
    ports.profiler.markSequenceEditStart(nextSequence, editDetail)
    ports.profiler.actionProfileSync(
      'applySequenceEdit',
      'edit',
      () => {
        ports.history.updateRecord(
          (current) => applySequenceEditTransition(current, { nextSequence, replacement, richFragment }),
          { recordHistory: editOptions?.recordHistory },
        )
      },
      editDetail,
    )
    ports.selection.setSequenceRange(nextRange, { collapsed: nextRange.start === nextRange.end })
  }, [ports])

  const applyMemberSequenceEdit = useCallback((
    nextRange: SelectionRange,
    replacement: SequenceEditReplacement,
    insert: string,
  ): boolean => {
    const context = resolveMemberSequenceEditContext({
      selectedAlignmentTraceId: options.selectedAlignmentTraceId,
      traceFiles: options.traceFiles,
      alignmentsVisible: options.alignmentsVisible,
      recordIsDnaLibrary: isDnaLibraryRecord(options.record),
    })
    if (context.kind !== 'ready') return false

    try {
      const edited = computeMemberSequenceEdit(context, replacement, insert, options.record)
      ports.history.pushDocumentHistorySnapshot()
      ports.traces.onTraceFilesChange((current) =>
        current.map((trace) => (trace.id === context.member.id ? edited : trace)),
      )
      ports.selection.setSequenceRange(nextRange, {
        collapsed: nextRange.start === nextRange.end,
        sequenceLength: edited.sequence.length,
      })
      ports.status.setStatus(planMemberSequenceEditStatus(context.member.fileName, replacement))
      return true
    } catch (error) {
      ports.status.setStatus(memberSequenceEditErrorMessage(error))
      return false
    }
  }, [options.alignmentsVisible, options.record, options.selectedAlignmentTraceId, options.traceFiles, ports])

  const applyReferenceReplacementFromTrace = useCallback((
    templateStart: number,
    templateEnd: number,
    replacement: string,
  ) => {
    const plan = planReferenceReplacementFromTrace({
      consensusSequence: options.record.sequence,
      templateStart,
      templateEnd,
      replacement,
    })
    if (plan.kind === 'noop') return
    applySequenceEdit(plan.nextSequence, plan.nextRange, plan.replacement)
    ports.status.setStatus(plan.status)
  }, [applySequenceEdit, options.record.sequence, ports])

  return { applySequenceEdit, applyMemberSequenceEdit, applyReferenceReplacementFromTrace }
}

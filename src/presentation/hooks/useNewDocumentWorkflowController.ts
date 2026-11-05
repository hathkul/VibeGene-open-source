import { useCallback, useState } from 'react'
import {
  planNewDnaFileCreatedStatus,
  planNewFileFromSelectionConfirm,
  planNewFileFromSelectionDraft,
  planNewProteinFileCreatedStatus,
} from '../../application/newDocument/newDocumentWorkflow'
import { createRecordFromSelection, type NewFileFromSelectionInput } from '../../domain/newFileFromSelection'
import type { SequenceRecord } from '../../domain/types'
import type { NewDnaFileResult } from '../../domain/newDnaFile'
import type { NewProteinFileResult } from '../../domain/newProteinFile'
import type { OpenRecordOptions } from './useDocumentHandoffController'

type NewDocumentWorkflowInput = Pick<
  NewFileFromSelectionInput,
  'selectedRange' | 'cutStrandSelection' | 'cutEnzymes'
> & {
  record: SequenceRecord
}

type NewDocumentWorkflowPorts = {
  normalizeConstructFileName: (raw: string) => string
  createDnaRecord: (result: NewDnaFileResult) => SequenceRecord
  createProteinRecord: (result: NewProteinFileResult) => SequenceRecord
  openRecordInNewTab: (source: SequenceRecord, options?: OpenRecordOptions) => void
  setStatus: (status: string) => void
}

/** New-file-from-selection naming dialog and new DNA/protein document commands. */
export function useNewDocumentWorkflowController(
  input: NewDocumentWorkflowInput,
  ports: NewDocumentWorkflowPorts,
) {
  const [newDnaFileOpen, setNewDnaFileOpen] = useState(false)
  const [newProteinFileOpen, setNewProteinFileOpen] = useState(false)
  const [pendingNewFileFromSelection, setPendingNewFileFromSelection] = useState<SequenceRecord | null>(null)

  const handleNewFileFromSelection = useCallback(() => {
    const next = createRecordFromSelection({
      source: input.record,
      selectedRange: input.selectedRange,
      cutStrandSelection: input.cutStrandSelection,
      cutEnzymes: input.cutEnzymes,
    })
    const plan = planNewFileFromSelectionDraft(next)
    if (plan.kind === 'missing-selection') {
      ports.setStatus(plan.status)
      return
    }
    setPendingNewFileFromSelection({
      ...plan.record,
      name: ports.normalizeConstructFileName(plan.record.name),
    })
  }, [
    input.cutEnzymes,
    input.cutStrandSelection,
    input.record,
    input.selectedRange,
    ports,
  ])

  const confirmNewFileFromSelection = useCallback((name: string) => {
    const pending = pendingNewFileFromSelection
    if (!pending) return
    setPendingNewFileFromSelection(null)
    const normalizedName = ports.normalizeConstructFileName(name)
    const { record, status } = planNewFileFromSelectionConfirm(pending, normalizedName)
    ports.openRecordInNewTab(record, { initiallyUnsaved: true })
    ports.setStatus(status)
  }, [pendingNewFileFromSelection, ports])

  const handleCreateNewDnaFile = useCallback((result: NewDnaFileResult) => {
    const next = ports.createDnaRecord(result)
    setNewDnaFileOpen(false)
    ports.openRecordInNewTab(next, { initiallyUnsaved: true })
    ports.setStatus(planNewDnaFileCreatedStatus(next))
  }, [ports])

  const handleCreateNewProteinFile = useCallback((result: NewProteinFileResult) => {
    const next = ports.createProteinRecord(result)
    setNewProteinFileOpen(false)
    ports.openRecordInNewTab(next, { initiallyUnsaved: true })
    ports.setStatus(planNewProteinFileCreatedStatus(next))
  }, [ports])

  return {
    newDnaFileOpen,
    setNewDnaFileOpen,
    newProteinFileOpen,
    setNewProteinFileOpen,
    pendingNewFileFromSelection,
    setPendingNewFileFromSelection,
    handleNewFileFromSelection,
    confirmNewFileFromSelection,
    handleCreateNewDnaFile,
    handleCreateNewProteinFile,
  }
}

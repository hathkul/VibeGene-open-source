import { isDnaLibraryRecord } from '../../domain/dnaLibrary'
import { exportSgRnaDataTsv } from '../../domain/primerExport'
import type { PrimerHybridizationParams } from '../../domain/primerHybridization'
import type { SgRNAAnnotation } from '../../domain/sgrna'
import type { Primer, SequenceRecord } from '../../domain/types'
import type { TraceFileRecord } from '../../domain/traceTypes'
import {
  libraryPrimerImportOptions as planLibraryPrimerImportOptions,
  sgRnaExportPlan,
} from '../../application/primerWorkflow/primerImportExport'
import type {
  PrimerWorkflowContext,
  PrimerWorkflowResult,
} from '../../application/primerWorkflow/primerWorkflow'
import type { SelectionRange } from '../sequence'
import type {
  PrimerImportDialogState,
  PrimerWorkflowActionPorts,
} from './usePrimerManagementController'

export type PrimerImportExportPorts = {
  getTraceFiles: () => TraceFileRecord[]
  getSelectedPrimers: () => Primer[]
  getSelectedSgRnas: () => SgRNAAnnotation[]
  hybridization: PrimerHybridizationParams
  selectedRange: SelectionRange | null
  setPrimerImportDialog: (state: PrimerImportDialogState | null) => void
  setPickPrimersRange: (range: SelectionRange | null) => void
  context: (hybridization?: PrimerHybridizationParams) => PrimerWorkflowContext
  apply: (result: PrimerWorkflowResult) => void
  setStatus: (status: string) => void
  setSelectedPrimerId: (id: string | null) => void
  setSelectedPrimerIds: (ids: string[]) => void
  setSelectionFocus: (focus: 'dna' | 'feature' | 'primer' | 'bond') => void
  download: (fileName: string, contents: string, mimeType: string) => void
  readFileText: (file: File) => Promise<string>
  importPrimerListCommand: (
    text: string,
    input: {
      template: string
      existing: readonly Primer[]
      hybridization: PrimerHybridizationParams
      options?: {
        additionalTemplates?: readonly string[]
        additionalExistingPrimers?: readonly Primer[]
      }
    },
    ports: {
      setStatus: (status: string) => void
      openDialog: (state: PrimerImportDialogState) => void
    },
  ) => void
  addImportedPrimerCommand: (
    primers: readonly Primer[],
    ports: PrimerWorkflowActionPorts & { closeDialog: () => void },
  ) => void
  addPickedPrimerCommand: (
    primers: readonly Primer[],
    ports: PrimerWorkflowActionPorts & { closePicker: () => void },
  ) => void
  exportPrimerCommand: (
    primers: readonly Primer[],
    recordName: string,
    ports: {
      setStatus: (status: string) => void
      download: (fileName: string, contents: string, mimeType: string) => void
    },
  ) => void
}

/**
 * Owns the primer import/export/pick orchestration: list-file import with library-aware
 * hybridization options, import-dialog confirm, pick-from-range open/confirm, and
 * primer/sgRNA selection export through an injected download adapter.
 */
export function usePrimerImportExportController(
  record: SequenceRecord,
  ports: PrimerImportExportPorts,
) {
  function libraryPrimerImportOptions() {
    return planLibraryPrimerImportOptions(isDnaLibraryRecord(record), ports.getTraceFiles())
  }

  async function importPrimersFromListFile(file: File) {
    try {
      const text = await ports.readFileText(file)
      ports.importPrimerListCommand(text, {
        template: record.sequence,
        existing: record.primers,
        hybridization: ports.hybridization,
        options: libraryPrimerImportOptions(),
      }, {
        setStatus: ports.setStatus,
        openDialog: ({ candidates, skipped }) => ports.setPrimerImportDialog({ candidates, skipped }),
      })
    } catch (error) {
      ports.setStatus(`Could not import primers: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  function addImportedPrimers(primers: Primer[]) {
    ports.addImportedPrimerCommand(primers, {
      context: ports.context,
      apply: ports.apply,
      setStatus: ports.setStatus,
      closeDialog: () => ports.setPrimerImportDialog(null),
      select: (added) => {
        ports.setSelectedPrimerId(added[0]!.id)
        ports.setSelectedPrimerIds(added.map((primer) => primer.id))
        ports.setSelectionFocus('primer')
      },
    })
  }

  function exportSelectedPrimers() {
    ports.exportPrimerCommand(ports.getSelectedPrimers(), record.name, {
      setStatus: ports.setStatus,
      download: ports.download,
    })
  }

  function exportSelectedSgRnas() {
    const guides = ports.getSelectedSgRnas()
    const plan = sgRnaExportPlan(guides, record.name)
    if (!plan) {
      ports.setStatus('Select an sgRNA to export.')
      return
    }
    ports.download(plan.fileName, exportSgRnaDataTsv(guides), 'text/plain')
    ports.setStatus(plan.status)
  }

  function openPickPrimers() {
    if (ports.selectedRange && ports.selectedRange.end !== ports.selectedRange.start) {
      ports.setPickPrimersRange(ports.selectedRange)
    } else {
      ports.setStatus('Select a DNA stretch to pick primers from.')
    }
  }

  function addPickedPrimers(primers: Primer[]) {
    ports.addPickedPrimerCommand(primers, {
      context: ports.context,
      apply: ports.apply,
      setStatus: ports.setStatus,
      closePicker: () => ports.setPickPrimersRange(null),
      select: (added) => {
        ports.setSelectedPrimerId(added[0]!.id)
        ports.setSelectedPrimerIds(added.map((primer) => primer.id))
        ports.setSelectionFocus('primer')
      },
    })
  }

  return {
    libraryPrimerImportOptions,
    importPrimersFromListFile,
    addImportedPrimers,
    exportSelectedPrimers,
    exportSelectedSgRnas,
    openPickPrimers,
    addPickedPrimers,
  }
}

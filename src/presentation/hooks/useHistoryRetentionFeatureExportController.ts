import { useCallback } from 'react'
import {
  executeManagedNativeHistoryRetention,
  executeManagedProteinSourceHistoryRetention,
} from '../../application/documentHistory/managedHistoryRetentionPlan'
import {
  executeFeatureDataExportConfirm,
  planFeatureDataExport,
  resolveFeatureDataExportLength,
} from '../../application/featureExport/featureDataExportPlan'
import type { FeatureExportField } from '../../domain/featureExport'
import type { HistoryRetentionPolicy } from '../../domain/historyRetention'
import type { SequenceFeature, SequenceRecord } from '../../domain/types'
import type { TraceFileRecord } from '../../domain/traceTypes'

export type HistoryRetentionFeatureExportInput = {
  record: SequenceRecord
  traceFiles: TraceFileRecord[]
  selectedFeatures: SequenceFeature[]
  featureTabSelectionMemberId: string | null
}

export type HistoryRetentionFeatureExportPorts = {
  download: (fileName: string, contents: string, mimeType: string) => void
  updateRecord: (updater: (current: SequenceRecord) => SequenceRecord) => void
  setStatus: (status: string) => void
  setHistoryManagerOpen: (open: boolean) => void
  setProteinSourceHistoryManagerOpen: (open: boolean) => void
  setExportFeatureDataOpen: (open: boolean) => void
}

/** Managed native/protein-source history retention apply and selected feature-data export confirm. */
export function useHistoryRetentionFeatureExportController(
  input: HistoryRetentionFeatureExportInput,
  ports: HistoryRetentionFeatureExportPorts,
) {
  const applyManagedHistoryRetention = useCallback((policy: HistoryRetentionPolicy) => {
    executeManagedNativeHistoryRetention(
      input.record,
      policy,
      { closeHistoryManager: () => ports.setHistoryManagerOpen(false) },
      { updateRecord: ports.updateRecord, setStatus: ports.setStatus },
    )
  }, [input.record, ports])

  const applyManagedProteinSourceRetention = useCallback((policy: HistoryRetentionPolicy) => {
    executeManagedProteinSourceHistoryRetention(
      input.record,
      policy,
      { closeProteinSourceHistoryManager: () => ports.setProteinSourceHistoryManagerOpen(false) },
      { updateRecord: ports.updateRecord, setStatus: ports.setStatus },
    )
  }, [input.record, ports])

  const confirmExportFeatureData = useCallback((fields: FeatureExportField[]) => {
    const exportLength = resolveFeatureDataExportLength(
      input.record.sequence.length,
      input.featureTabSelectionMemberId,
      input.traceFiles,
    )
    const plan = planFeatureDataExport(
      input.record.name,
      input.selectedFeatures,
      fields,
      exportLength,
    )
    executeFeatureDataExportConfirm(plan, {
      download: ports.download,
      setStatus: ports.setStatus,
      closeExportDialog: () => ports.setExportFeatureDataOpen(false),
    })
  }, [input.featureTabSelectionMemberId, input.record.name, input.record.sequence.length, input.selectedFeatures, input.traceFiles, ports])

  return {
    applyManagedHistoryRetention,
    applyManagedProteinSourceRetention,
    confirmExportFeatureData,
  }
}

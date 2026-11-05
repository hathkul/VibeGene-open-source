import type { SequenceRecord } from '../../domain/types'
import type { HistoryRetentionPolicy } from '../../domain/historyRetention'
import { HistoryManagerDialog } from '../../HistoryManagerDialog'
import { ProteinSourceHistoryDialog } from '../../ProteinSourceHistoryDialog'

export type HistoryDialogsHostProps = {
  record: SequenceRecord
  historyManagerOpen: boolean
  setHistoryManagerOpen: (open: boolean) => void
  onApplyHistoryRetention: (policy: HistoryRetentionPolicy) => void
  proteinSourceHistoryManagerOpen: boolean
  setProteinSourceHistoryManagerOpen: (open: boolean) => void
  onLoadProject: (projectId: string) => Promise<SequenceRecord | null>
  onApplyProteinSourceRetention: (policy: HistoryRetentionPolicy) => void
}

/** Hosts construct-history retention and translated-protein source history dialogs. */
export function HistoryDialogsHost(props: HistoryDialogsHostProps) {
  return (
    <>
      {props.historyManagerOpen && props.record.molecule !== 'protein' && <HistoryManagerDialog record={props.record} onCancel={() => props.setHistoryManagerOpen(false)} onApply={props.onApplyHistoryRetention} />}
      {props.proteinSourceHistoryManagerOpen && props.record.molecule === 'protein' && (props.record.protein?.translationDerivation?.sources.length ?? 0) > 0 && <ProteinSourceHistoryDialog record={props.record} onLoadProject={props.onLoadProject} onCancel={() => props.setProteinSourceHistoryManagerOpen(false)} onApply={props.onApplyProteinSourceRetention} />}
    </>
  )
}

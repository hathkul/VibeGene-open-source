import type { ComponentProps } from 'react'
import type { SequenceRecord } from '../../domain/types'
import type { SelectionRange } from '../sequence'
import { TopologyChoiceDialog } from '../../TopologyChoiceDialog'
import { SelectRangeDialog, TranslationOptionsDialog } from '../dnaViewControls'
import { EditMapLabelDialog } from '../documentMenus'

export type SelectionTranslationDialogsHostProps = {
  record: SequenceRecord
  pendingTopologyImport: { fileName: string; record: SequenceRecord; localPath?: string } | null
  setPendingTopologyImport: (value: SelectionTranslationDialogsHostProps['pendingTopologyImport']) => void
  onCancelTopology: () => void
  onChooseTopology: ComponentProps<typeof TopologyChoiceDialog>['onChoose']
  selectRangeOpen: boolean
  setSelectRangeOpen: (open: boolean) => void
  selectedRange: SelectionRange | null
  onApplySelectRange: (start: number, end: number) => void
  editMapLabelOpen: boolean
  setEditMapLabelOpen: (open: boolean) => void
  onApplyMapLabel: ComponentProps<typeof EditMapLabelDialog>['onConfirm']
  translationOptionsDraft: ComponentProps<typeof TranslationOptionsDialog>['draft'] | null
  setTranslationOptionsDraft: (value: SelectionTranslationDialogsHostProps['translationOptionsDraft']) => void
  onTranslationDraftChange: ComponentProps<typeof TranslationOptionsDialog>['onDraftChange']
  onConfirmTranslationOptions: ComponentProps<typeof TranslationOptionsDialog>['onConfirm']
}

/** Hosts selection range, topology, map-label, and translation option dialogs. */
export function SelectionTranslationDialogsHost(props: SelectionTranslationDialogsHostProps) {
  return (
    <>
      {props.pendingTopologyImport && <TopologyChoiceDialog fileName={props.pendingTopologyImport.fileName} onCancel={props.onCancelTopology} onChoose={props.onChooseTopology} />}
      {props.selectRangeOpen && <SelectRangeDialog sequenceLength={props.record.sequence.length} initialStart={props.selectedRange ? Math.min(props.selectedRange.start, props.selectedRange.end) + 1 : 1} initialEnd={props.selectedRange ? Math.max(props.selectedRange.start, props.selectedRange.end) : Math.min(props.record.sequence.length, 1)} onCancel={() => props.setSelectRangeOpen(false)} onConfirm={props.onApplySelectRange} />}
      {props.editMapLabelOpen && <EditMapLabelDialog fileName={props.record.name} currentLabel={props.record.mapLabel?.trim() ? props.record.mapLabel : null} onCancel={() => props.setEditMapLabelOpen(false)} onConfirm={props.onApplyMapLabel} />}
      {props.translationOptionsDraft && <TranslationOptionsDialog draft={props.translationOptionsDraft} onDraftChange={props.onTranslationDraftChange} onCancel={() => props.setTranslationOptionsDraft(null)} onConfirm={props.onConfirmTranslationOptions} />}
    </>
  )
}

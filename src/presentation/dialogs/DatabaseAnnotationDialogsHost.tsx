import type { ComponentProps } from 'react'
import type { SequenceRecord } from '../../domain/types'
import type { SelectionRange } from '../sequence'
import { ProteinUniProtAnnotationDialog } from '../../ProteinUniProtAnnotationDialog'
import { DnaDatabaseAnnotationDialog } from '../../DnaDatabaseAnnotationDialog'
import { TranslatedOrfAnnotationDialog } from '../../TranslatedOrfAnnotationDialog'

export type DatabaseAnnotationDialogsHostProps = {
  record: SequenceRecord
  proteinUniProtAnnotationRange: SelectionRange | null
  setProteinUniProtAnnotationRange: (value: SelectionRange | null) => void
  onApplyProteinAnnotations: ComponentProps<typeof ProteinUniProtAnnotationDialog>['onApply']
  onApplyProteinInterPro: ComponentProps<typeof ProteinUniProtAnnotationDialog>['onApplyInterPro']
  onOpenExternal: (url: string) => void
  dnaDatabaseAnnotationRange: SelectionRange | null
  setDnaDatabaseAnnotationRange: (value: SelectionRange | null) => void
  onApplyDnaAnnotations: ComponentProps<typeof DnaDatabaseAnnotationDialog>['onApply']
  onApplyTranslatedOrfs: ComponentProps<typeof TranslatedOrfAnnotationDialog>['onApply']
  translatedOrfAnnotationRange: SelectionRange | null
  setTranslatedOrfAnnotationRange: (value: SelectionRange | null) => void
}

/** Hosts external database and translated-ORF annotation dialogs. */
export function DatabaseAnnotationDialogsHost(props: DatabaseAnnotationDialogsHostProps) {
  return (
    <>
      {props.proteinUniProtAnnotationRange && props.record.molecule === 'protein' && <ProteinUniProtAnnotationDialog recordName={props.record.name} sequence={props.record.sequence} queryRange={props.proteinUniProtAnnotationRange} onCancel={() => props.setProteinUniProtAnnotationRange(null)} onApply={props.onApplyProteinAnnotations} onApplyInterPro={props.onApplyProteinInterPro} onOpenExternal={props.onOpenExternal} />}
      {props.dnaDatabaseAnnotationRange && props.record.molecule === 'dna' && <DnaDatabaseAnnotationDialog recordName={props.record.name} sequence={props.record.sequence} queryRange={props.dnaDatabaseAnnotationRange} onCancel={() => props.setDnaDatabaseAnnotationRange(null)} onApply={props.onApplyDnaAnnotations} onOpenExternal={props.onOpenExternal} />}
      {props.translatedOrfAnnotationRange && props.record.molecule === 'dna' && <TranslatedOrfAnnotationDialog recordName={props.record.name} sequence={props.record.sequence} queryRange={props.translatedOrfAnnotationRange} onCancel={() => props.setTranslatedOrfAnnotationRange(null)} onApply={props.onApplyTranslatedOrfs} />}
    </>
  )
}

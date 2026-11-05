import type { ReactNode } from 'react'
import type { SequenceRecord } from '../../domain/types'
import type { TraceFileRecord } from '../../domain/traceTypes'
import type { SelectionFocus, SelectionRange } from '../sequence'
import type { SgRnaDraft } from '../../SgRnaDialog'
import type { SgRNAAnnotation } from '../../domain/sgrna'
import type { GuideScanAddPayload } from '../../GuideScanDesignPanel'
import type { GuideScanDesignCacheEntry } from '../../domain/guidescan/designCache'
import type { CommonPrimerMatch } from '../../domain/commonPrimers'
import type { LibraryPrimer } from '../../domain/libraryPrimer'
import { sequenceRecordFromLibraryMember } from '../../domain/libraryMemberRecord'
import { groupSgRNAFeatures } from '../../domain/sgrna'
import { SgRnaDialog } from '../../SgRnaDialog'
import { SgRNACloningDialog } from '../../SgRNACloningDialog'
import { CommonPrimersDetectDialog } from '../../CommonPrimersDetectDialog'
import { guideScanDesignCacheMatchesRecord } from '../../domain/guidescan/designCache'
import { guideScanDesignRegionSelectionForWorkspace } from '../../domain/guidescan/designRegionSelection'
import { lazyDialog } from '../../ui/lazyDialog'
import type { CloningWorkspaceRenderArgs } from '../../cloningWorkspaceTypes'

const LazyGuideScanDesignDialog = lazyDialog(
  () => import('../../GuideScanDesignDialog'),
  (module) => module.GuideScanDesignDialog,
)

export type CrisprWorkflowDialogsHostProps = {
  record: SequenceRecord
  traceFiles: TraceFileRecord[]
  sgRnaDialog: { memberId: string | null; editingId: string | null; selection: SelectionRange | null } | null
  setSgRnaDialog: (value: CrisprWorkflowDialogsHostProps['sgRnaDialog']) => void
  onSaveSgRna: (draft: SgRnaDraft) => void
  sgRnaCloningSnapshot: { source: SequenceRecord; guides: SgRNAAnnotation[] } | null
  currentTabId: string
  setSgRnaCloningSnapshot: (value: CrisprWorkflowDialogsHostProps['sgRnaCloningSnapshot']) => void
  onOpenAnnealedInsert: (insert: SequenceRecord) => void
  onCloneSgRna: (products: SequenceRecord[]) => void
  renderWorkspace: (args: CloningWorkspaceRenderArgs) => ReactNode
  guideScanDesignDialog: { memberId: string | null } | null
  setGuideScanDesignDialog: (value: CrisprWorkflowDialogsHostProps['guideScanDesignDialog']) => void
  selectionFocus: SelectionFocus
  selectedFeatureId: string | null
  selectedRange: SelectionRange | null
  onPersistGuideScanCache: (entry: GuideScanDesignCacheEntry) => void
  onAddGuideScanSelected: (payload: GuideScanAddPayload) => void
  setStatus: (status: string) => void
  commonPrimerMatches: CommonPrimerMatch<{ name: string; sequence: string; color?: string; description?: string }>[] | null
  setCommonPrimerMatches: (value: CrisprWorkflowDialogsHostProps['commonPrimerMatches']) => void
  onAddDatabasePrimers: (primers: LibraryPrimer[]) => void
}

/** Hosts CRISPR guide editing/design, sgRNA cloning, and common-primer detection dialogs. */
export function CrisprWorkflowDialogsHost(props: CrisprWorkflowDialogsHostProps) {
  const guide = props.sgRnaDialog
  const guideMember = guide?.memberId ? props.traceFiles.find((trace) => trace.id === guide.memberId) : null
  const guideRecord = guideMember ? sequenceRecordFromLibraryMember(guideMember) : props.record
  const editing = guide?.editingId ? groupSgRNAFeatures(guideRecord.features).find((entry) => entry.id === guide.editingId) : null
  const design = props.guideScanDesignDialog
  const designMember = design?.memberId ? props.traceFiles.find((trace) => trace.id === design.memberId) : null
  const designRecord = designMember ? sequenceRecordFromLibraryMember(designMember) : props.record
  const persistedCache = design && guideScanDesignCacheMatchesRecord(props.record.dna?.guideScanDesignCache, designRecord)
    ? props.record.dna?.guideScanDesignCache
    : undefined
  const designSelection = designMember ? null : design ? guideScanDesignRegionSelectionForWorkspace({ record: props.record, selectionFocus: props.selectionFocus, selectedFeatureId: props.selectedFeatureId, selectedRange: props.selectedRange }) : null
  return (
    <>
      {guide && <SgRnaDialog key={`${guideRecord.id}:${guide.editingId ?? 'new'}`} record={guideRecord} selection={guide.selection} editing={editing} onCancel={() => props.setSgRnaDialog(null)} onSave={props.onSaveSgRna} />}
      {props.sgRnaCloningSnapshot && <SgRNACloningDialog source={props.sgRnaCloningSnapshot.source} currentTabId={props.currentTabId} guides={props.sgRnaCloningSnapshot.guides} onCancel={() => props.setSgRnaCloningSnapshot(null)} onOpenAnnealedInsert={props.onOpenAnnealedInsert} onClone={props.onCloneSgRna} renderWorkspace={props.renderWorkspace} />}
      {design && <LazyGuideScanDesignDialog key={`guidescan:${designRecord.id}`} record={designRecord} designSelection={designSelection} persistedCache={persistedCache} onPersistDesignCache={props.onPersistGuideScanCache} onCancel={() => props.setGuideScanDesignDialog(null)} onAddSelected={props.onAddGuideScanSelected} onLoadError={() => { props.setGuideScanDesignDialog(null); props.setStatus('Could not load the GuideScan design dialog.') }} />}
      {props.commonPrimerMatches && <CommonPrimersDetectDialog recordName={props.record.name.endsWith('.dna') ? props.record.name : `${props.record.name}.dna`} matches={props.commonPrimerMatches} onCancel={() => props.setCommonPrimerMatches(null)} onAdd={(primers) => { props.onAddDatabasePrimers(primers); props.setCommonPrimerMatches(null) }} />}
    </>
  )
}

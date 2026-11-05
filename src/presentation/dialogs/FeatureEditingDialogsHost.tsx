import type { ComponentProps } from 'react'
import type { SequenceFeature, SequenceRecord, ProteinBond, RestrictionSite } from '../../domain/types'
import type { SelectionRange } from '../sequence'
import type { FeatureExportField } from '../../domain/featureExport'
import { formatSequenceLength } from '../../domain/moleculeCapabilities'
import { ExportFeatureDataDialog } from '../../ExportFeatureDataDialog'
import { DnaEndsEditorDialog } from '../../DnaEndsEditorDialog'
import { NewDnaFileDialog } from '../../NewDnaFileDialog'
import { NewProteinFileDialog } from '../../NewProteinFileDialog'
import { ProteinBondPropertiesDialog } from '../../ProteinBondPropertiesDialog'
import { NameNewFileDialog } from '../../NameNewFileDialog'
import { FeatureSegmentTargetDialog, FeatureMergeTemplateDialog, CleavageSiteFeatureDialog } from '../documentMenus/DocumentDialogs'

type CleavageChooser = { position: number; mode: 'add' | 'remove'; features: SequenceFeature[] }

export type FeatureEditingDialogsHostProps = {
  record: SequenceRecord
  exportFeatureDataOpen: boolean
  selectedFeatureCount: number
  setExportFeatureDataOpen: (open: boolean) => void
  onConfirmFeatureExport: (fields: FeatureExportField[]) => void
  segmentTargetDialog: { range: SelectionRange; mode: 'split' | 'assign'; features: SequenceFeature[] } | null
  setSegmentTargetDialog: (value: FeatureEditingDialogsHostProps['segmentTargetDialog']) => void
  onCreateSegment: (featureId: string, range: SelectionRange) => void
  featureMergeTemplateDialog: SequenceFeature[] | null
  setFeatureMergeTemplateDialog: (value: SequenceFeature[] | null) => void
  onOpenFeatureMergeEditor: (templateId: string) => void
  cleavageChooser: CleavageChooser | null
  setCleavageChooser: (value: CleavageChooser | null) => void
  onAddCleavage: (featureId: string, position: number) => void
  onRemoveCleavage: (featureId: string, position: number) => void
  dnaEndsEditorOpen: boolean
  displayedRestrictionSites: RestrictionSite[]
  cachedOrfFeatures: SequenceFeature[]
  setDnaEndsEditorOpen: (open: boolean) => void
  onSaveDnaEnds: ComponentProps<typeof DnaEndsEditorDialog>['onSave']
  newDnaFileOpen: boolean
  setNewDnaFileOpen: (open: boolean) => void
  onCreateDnaFile: ComponentProps<typeof NewDnaFileDialog>['onCreate']
  newProteinFileOpen: boolean
  setNewProteinFileOpen: (open: boolean) => void
  onCreateProteinFile: ComponentProps<typeof NewProteinFileDialog>['onCreate']
  proteinBondEditor: ProteinBond | null
  setProteinBondEditor: (value: ProteinBond | null) => void
  onSaveProteinBond: (bond: ProteinBond) => void
  onDeleteProteinBond?: () => void
  pendingNewFileFromSelection: SequenceRecord | null
  setPendingNewFileFromSelection: (value: SequenceRecord | null) => void
  onConfirmNewFileFromSelection: (name: string) => void
  convertToLibrarySourceOpen: boolean
  setConvertToLibrarySourceOpen: (open: boolean) => void
  onConvertFromFiles: () => void
  onConvertFromDatabase: () => void
}

/** Hosts feature export/editing, sequence/file creation, and library conversion dialogs. */
export function FeatureEditingDialogsHost(props: FeatureEditingDialogsHostProps) {
  const cleavage = props.cleavageChooser
  return (
    <>
      {props.exportFeatureDataOpen && <ExportFeatureDataDialog featureCount={props.selectedFeatureCount} onCancel={() => props.setExportFeatureDataOpen(false)} onConfirm={props.onConfirmFeatureExport} />}
      {props.segmentTargetDialog && <FeatureSegmentTargetDialog range={props.segmentTargetDialog.range} features={props.segmentTargetDialog.features} mode={props.segmentTargetDialog.mode} onCancel={() => props.setSegmentTargetDialog(null)} onSelect={(featureId) => { props.onCreateSegment(featureId, props.segmentTargetDialog!.range); props.setSegmentTargetDialog(null) }} />}
      {props.featureMergeTemplateDialog && <FeatureMergeTemplateDialog features={props.featureMergeTemplateDialog} onCancel={() => props.setFeatureMergeTemplateDialog(null)} onSelect={props.onOpenFeatureMergeEditor} />}
      {cleavage && <CleavageSiteFeatureDialog position={cleavage.position} mode={cleavage.mode} features={cleavage.features} onCancel={() => props.setCleavageChooser(null)} onSelect={(featureId) => { if (cleavage.mode === 'add') props.onAddCleavage(featureId, cleavage.position); else props.onRemoveCleavage(featureId, cleavage.position); props.setCleavageChooser(null) }} />}
      {props.dnaEndsEditorOpen && props.record.topology === 'linear' && <DnaEndsEditorDialog record={props.record} restrictionSites={props.displayedRestrictionSites} orfFeatures={props.cachedOrfFeatures} onCancel={() => props.setDnaEndsEditorOpen(false)} onSave={props.onSaveDnaEnds} />}
      {props.newDnaFileOpen && <NewDnaFileDialog onCancel={() => props.setNewDnaFileOpen(false)} onCreate={props.onCreateDnaFile} />}
      {props.newProteinFileOpen && <NewProteinFileDialog onCancel={() => props.setNewProteinFileOpen(false)} onCreate={props.onCreateProteinFile} />}
      {props.proteinBondEditor && props.record.molecule === 'protein' && <ProteinBondPropertiesDialog bond={props.proteinBondEditor} sequenceLength={props.record.sequence.length} onCancel={() => props.setProteinBondEditor(null)} onSave={props.onSaveProteinBond} onDelete={props.onDeleteProteinBond} />}
      {props.pendingNewFileFromSelection && <NameNewFileDialog title="New file from selection" initialName={props.pendingNewFileFromSelection.name} detail={`${formatSequenceLength(props.pendingNewFileFromSelection.sequence.length, props.pendingNewFileFromSelection.molecule)} linear fragment`} confirmLabel="Create" onCancel={() => props.setPendingNewFileFromSelection(null)} onConfirm={props.onConfirmNewFileFromSelection} />}
      {props.convertToLibrarySourceOpen && <div className="translation-dialog-backdrop" role="presentation" onPointerDown={() => props.setConvertToLibrarySourceOpen(false)}><div className="translation-dialog" role="dialog" aria-modal="true" aria-labelledby="convert-to-library-source-title" onPointerDown={(event) => event.stopPropagation()}><h3 id="convert-to-library-source-title">Convert to library</h3><p className="muted">Add at least one peer sequence from files or Database. The current construct becomes the consensus and first member.</p><div className="translation-actions"><button type="button" onClick={() => props.setConvertToLibrarySourceOpen(false)}>Cancel</button><button type="button" onClick={props.onConvertFromFiles}>From files…</button><button type="button" className="primary" onClick={props.onConvertFromDatabase}>From Database…</button></div></div></div>}
    </>
  )
}

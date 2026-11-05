import type { Dispatch, SetStateAction } from 'react'
import type { PrimerImportCandidate } from '../../domain/primerExport'
import type { PrimerHybridizationParams } from '../../domain/primerHybridization'
import type { PrimerMerge, PrimerNameConflict } from '../../domain/primerNames'
import type { PrimerPropertiesPayload } from '../../application/ports/hybridWindows'
import type { Primer, SequenceRecord, Topology } from '../../domain/types'
import type { PrimerEditorState, SelectionRange } from '../sequence'
import { PrimerEditorDialog } from '../primers/PrimerEditorDialog'
import { PrimerPropertiesDialog } from '../../PrimerPropertiesDialog'
import { PrimerOrientationDialog } from '../../PrimerOrientationDialog'
import { PrimerColorPickerDialog } from '../../PrimerColorPickerDialog'
import { HybridizationParametersDialog } from '../../HybridizationParametersDialog'
import { lazyDialog } from '../../ui/lazyDialog'
import { PrimersImportDialog } from '../../PrimersImportDialog'
import { PrimersImportFromFileDialog } from '../../PrimersImportFromFileDialog'

const LazyPickPrimersDialog = lazyDialog(
  () => import('../../PickPrimersDialog'),
  (module) => module.PickPrimersDialog,
)

export type PrimerImportDialogState = {
  candidates: PrimerImportCandidate[]
  skipped: number
}

export type PrimerDialogsHostProps = {
  record: SequenceRecord
  primerEditor: PrimerEditorState | null
  onSavePrimerEditor: (draft: PrimerEditorState) => void
  onPrimerSpecificityChange?: (value: Primer['specificity']) => void
  setPrimerEditor: Dispatch<SetStateAction<PrimerEditorState | null>>
  primerMergeNotice: PrimerMerge[] | null
  setPrimerMergeNotice: Dispatch<SetStateAction<PrimerMerge[] | null>>
  primerNameWarning: PrimerNameConflict[] | null
  setPrimerNameWarning: Dispatch<SetStateAction<PrimerNameConflict[] | null>>
  libraryPrimer: PrimerPropertiesPayload | null
  setLibraryPrimer: Dispatch<SetStateAction<PrimerPropertiesPayload | null>>
  primerOrientationOpen: boolean
  setPrimerOrientationOpen: (open: boolean) => void
  openPrimerEditorFromSelection: (strand: 'forward' | 'reverse') => void
  primerColorPickerOpen: boolean
  setPrimerColorPickerOpen: (open: boolean) => void
  selectedPrimer: Primer | null
  applyPrimerColor: (color: string) => void
  hybridizationParamsOpen: boolean
  setHybridizationParamsOpen: (open: boolean) => void
  hybridization: PrimerHybridizationParams
  saveHybridizationParameters: (params: PrimerHybridizationParams) => void
  pickPrimersRange: SelectionRange | null
  setPickPrimersRange: Dispatch<SetStateAction<SelectionRange | null>>
  addPickedPrimers: (primers: Primer[]) => void
  setStatus: (status: string) => void
  primerImportDialog: PrimerImportDialogState | null
  setPrimerImportDialog: Dispatch<SetStateAction<PrimerImportDialogState | null>>
  addImportedPrimers: (primers: Primer[]) => void
  primersImportFromFileOpen: boolean
  otherOpenTabs: Array<{ tabId: string; name: string; molecule: SequenceRecord['molecule'] }>
  onLoadOpenTab: (tabId: string) => Promise<SequenceRecord | null>
  libraryMemberSequences?: readonly string[]
  libraryMemberPrimers?: readonly Primer[]
  setPrimersImportFromFileOpen: (open: boolean) => void
}

/** Hosts the primer editor, primer metadata, visibility, import, and hybridization dialogs. */
export function PrimerDialogsHost(props: PrimerDialogsHostProps) {
  const {
    record,
    primerEditor,
    setPrimerEditor,
    primerMergeNotice,
    setPrimerMergeNotice,
    primerNameWarning,
    setPrimerNameWarning,
    libraryPrimer,
    setLibraryPrimer,
    primerOrientationOpen,
    setPrimerOrientationOpen,
    openPrimerEditorFromSelection,
    primerColorPickerOpen,
    setPrimerColorPickerOpen,
    selectedPrimer,
    applyPrimerColor,
    hybridizationParamsOpen,
    setHybridizationParamsOpen,
    hybridization,
    saveHybridizationParameters,
    pickPrimersRange,
    setPickPrimersRange,
    addPickedPrimers,
    primerImportDialog,
    setPrimerImportDialog,
    addImportedPrimers,
  } = props
  return (
    <>
      {primerEditor && (
        <PrimerEditorDialog draft={primerEditor} record={record} onCancel={() => setPrimerEditor(null)} onSave={props.onSavePrimerEditor} onSpecificityChange={props.onPrimerSpecificityChange} />
      )}
      {primerMergeNotice && (
        <div className="translation-dialog-backdrop primer-merge-backdrop" role="presentation" onPointerDown={() => setPrimerMergeNotice(null)}>
          <div className="translation-dialog vg-dialog primer-merge-dialog" role="dialog" aria-modal="true" aria-labelledby="primer-merge-title" onPointerDown={(event) => event.stopPropagation()}>
            <h3 id="primer-merge-title">Merged duplicate primers</h3>
            <p>VibeGene combined identical primer entries in this file. Each retained primer keeps all of the distinct binding locations from the merged entries.</p>
            <ul className="primer-merge-list">
              {primerMergeNotice.map((merge) => (
                <li key={`${merge.name}\0${merge.sequence}`}><strong>{merge.name}</strong><code title={merge.sequence}>{merge.sequence}</code><span>{merge.mergedCount} duplicate{merge.mergedCount === 1 ? '' : 's'} merged</span></li>
              ))}
            </ul>
            <div className="translation-dialog-footer"><span /><button type="button" className="primary" onClick={() => setPrimerMergeNotice(null)}>OK</button></div>
          </div>
        </div>
      )}
      {primerNameWarning && (
        <div className="translation-dialog-backdrop" role="presentation" onPointerDown={() => setPrimerNameWarning(null)}>
          <div className="translation-dialog vg-dialog primer-name-conflict-dialog" role="dialog" aria-modal="true" aria-labelledby="primer-name-conflict-title" onPointerDown={(event) => event.stopPropagation()}>
            <h3 id="primer-name-conflict-title">Primer names need attention</h3>
            <p>This file contains primers with the same name but different sequences. Rename one primer in each group so every primer name is unambiguous.</p>
            <ul className="primer-name-conflict-list">
              {primerNameWarning.map((conflict) => <li key={conflict.name.toLocaleLowerCase()}><strong>{conflict.name}</strong><ul>{conflict.primers.map((primer) => <li key={primer.id}><code title={primer.sequence}>{primer.sequence}</code></li>)}</ul></li>)}
            </ul>
            <div className="translation-dialog-footer"><span /><button type="button" className="primary" onClick={() => setPrimerNameWarning(null)}>Close</button></div>
          </div>
        </div>
      )}
      {libraryPrimer && (
        <PrimerPropertiesDialog
          key={`${libraryPrimer.name}:${libraryPrimer.sequence}`}
          primer={libraryPrimer}
          templateSequence={libraryPrimer.templateSequence}
          preferredStrand={libraryPrimer.preferredStrand}
          bindings={libraryPrimer.bindings}
          onClose={() => setLibraryPrimer(null)}
        />
      )}
      {primerOrientationOpen && <PrimerOrientationDialog onCancel={() => setPrimerOrientationOpen(false)} onChoose={openPrimerEditorFromSelection} />}
      {primerColorPickerOpen && selectedPrimer && <PrimerColorPickerDialog currentColor={selectedPrimer.color || '#7c3aed'} onCancel={() => setPrimerColorPickerOpen(false)} onPick={applyPrimerColor} />}
      {hybridizationParamsOpen && <HybridizationParametersDialog initial={hybridization} onCancel={() => setHybridizationParamsOpen(false)} onConfirm={saveHybridizationParameters} />}
      {pickPrimersRange && record.molecule === 'dna' && <LazyPickPrimersDialog recordName={record.name} sequence={record.sequence} topology={record.topology as Topology} selection={pickPrimersRange} onCancel={() => setPickPrimersRange(null)} onAddPrimers={addPickedPrimers} onLoadError={() => {
        // Clear the open state so the lazy boundary unmounts; React.lazy caches
        // the rejection, so a true retry requires reloading the app.
        setPickPrimersRange(null)
        props.setStatus('Could not load the primer picking dialog.')
      }} />}
      {primerImportDialog && <PrimersImportDialog recordName={record.name.endsWith('.dna') ? record.name : `${record.name}.dna`} candidates={primerImportDialog.candidates} skippedCount={primerImportDialog.skipped} onCancel={() => setPrimerImportDialog(null)} onAdd={addImportedPrimers} />}
      {props.primersImportFromFileOpen && <PrimersImportFromFileDialog currentRecord={record} hybridization={hybridization} openTabs={props.otherOpenTabs} onLoadOpenTab={props.onLoadOpenTab} libraryMemberSequences={props.libraryMemberSequences} libraryMemberPrimers={props.libraryMemberPrimers} onCancel={() => props.setPrimersImportFromFileOpen(false)} onAdd={addImportedPrimers} />}
    </>
  )
}

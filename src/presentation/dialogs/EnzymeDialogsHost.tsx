import type { ComponentProps } from 'react'
import type { SequenceRecord } from '../../domain/types'
import type { EnzymePreferences } from '../../domain/enzymePreferences'
import type { SelectionRange } from '../sequence'
import type { EnzymeSetWorkflowController } from '../hooks/useEnzymeSetWorkflowController'
import { EnzymeInfoDialog } from '../../EnzymeInfoDialog'
import { EnzymePrioritiesDialog } from '../../EnzymePrioritiesDialog'
import { ManageEnzymeSetsDialog } from '../../ManageEnzymeSetsDialog'
import { ChooseEnzymesDialog, NoncuttersDialog } from '../dnaViewControls'

export type EnzymeDialogsHostProps = {
  record: SequenceRecord
  selectedRange: SelectionRange | null
  enzymePreferences: EnzymePreferences
  onPreferencesChange: ComponentProps<typeof ChooseEnzymesDialog>['onPreferencesChange']
  enzymeSetWorkflow: EnzymeSetWorkflowController
  enzymeInfoName: string | null
  setEnzymeInfoName: (name: string | null) => void
  enzymePrioritiesOpen: boolean
  setEnzymePrioritiesOpen: (open: boolean) => void
  onSavePriorities: (priorityOrder: string[]) => void
  parentalCounts: Record<string, number>
  noncutters: string[]
  onEnzymeInfo: (name: string) => void
  onDownloadText: ComponentProps<typeof ManageEnzymeSetsDialog>['onDownloadText']
}

/** Hosts enzyme selection, saved-set, priority, and non-cutter dialogs. */
export function EnzymeDialogsHost(props: EnzymeDialogsHostProps) {
  const workflow = props.enzymeSetWorkflow
  const fileEnzymeSets = props.record.fileEnzymeSets ?? []

  return (
    <>
      {props.enzymeInfoName && (
        <EnzymeInfoDialog
          key={props.enzymeInfoName}
          initialEnzymeName={props.enzymeInfoName}
          onClose={() => props.setEnzymeInfoName(null)}
        />
      )}
      {workflow.chooseDraft && (
        <ChooseEnzymesDialog
          recordName={props.record.name}
          draft={workflow.chooseDraft}
          preferences={props.enzymePreferences}
          fileEnzymeSets={fileEnzymeSets}
          sequence={props.record.sequence}
          topology={props.record.topology}
          construct={props.record.construct}
          selectedRange={props.selectedRange}
          onDraftChange={workflow.applyChooseDraftPatch}
          onPreferencesChange={props.onPreferencesChange}
          onFileEnzymeSetsChange={workflow.updateFileEnzymeSets}
          onCancel={() => workflow.setChooseDraft(null)}
          onConfirm={workflow.confirmChoose}
        />
      )}
      {workflow.saveSetOpen && (
        <div className="translation-dialog-backdrop" role="presentation" onPointerDown={() => workflow.setSaveSetOpen(false)}>
          <div className="enzyme-save-set-dialog" role="dialog" aria-modal="true" aria-label="Save Enzyme Set" onPointerDown={(event) => event.stopPropagation()}>
            <h4>Save Enzyme Set</h4>
            <label className="translation-field-row">
              <span>Name:</span>
              <input
                autoFocus
                value={workflow.saveSetName}
                onChange={(event) => workflow.setSaveSetName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault()
                    workflow.confirmSaveSet()
                  }
                }}
              />
            </label>
            <fieldset className="enzyme-save-set-type">
              <legend>Type:</legend>
              <label>
                <input type="radio" name="menu-save-enzyme-set-type" checked={workflow.saveSetScope === 'global'} onChange={() => workflow.setSaveSetScope('global')} />
                <span>Available for all files</span>
              </label>
              <label>
                <input type="radio" name="menu-save-enzyme-set-type" checked={workflow.saveSetScope === 'file'} onChange={() => workflow.setSaveSetScope('file')} />
                <span>Only for {props.record.name}</span>
              </label>
            </fieldset>
            {workflow.saveSetScope === 'file' && <p className="muted">Save the document to write this enzyme set to the file.</p>}
            <div className="translation-actions">
              <button type="button" onClick={() => workflow.setSaveSetOpen(false)}>Cancel</button>
              <button type="button" className="primary" disabled={!workflow.saveSetName.trim() || workflow.activeEnzymeSetExport.enzymeNames.length === 0} onClick={workflow.confirmSaveSet}>Save</button>
            </div>
          </div>
        </div>
      )}
      {workflow.manageSetsOpen && (
        <ManageEnzymeSetsDialog
          recordName={props.record.name}
          preferences={props.enzymePreferences}
          fileEnzymeSets={fileEnzymeSets}
          parentalCounts={props.parentalCounts}
          onCancel={() => workflow.setManageSetsOpen(false)}
          onConfirm={workflow.confirmManageSets}
          onDownloadText={props.onDownloadText}
        />
      )}
      {props.enzymePrioritiesOpen && (
        <EnzymePrioritiesDialog
          preferences={props.enzymePreferences}
          onCancel={() => props.setEnzymePrioritiesOpen(false)}
          onSave={props.onSavePriorities}
        />
      )}
      {workflow.noncuttersOpen && (
        <NoncuttersDialog
          recordName={props.record.name}
          noncutters={props.noncutters}
          onClose={() => workflow.setNoncuttersOpen(false)}
          onEnzymeInfo={props.onEnzymeInfo}
        />
      )}
    </>
  )
}

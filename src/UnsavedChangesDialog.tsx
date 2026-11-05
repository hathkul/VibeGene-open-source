import type { WorkspaceDocumentBinding } from './domain/projectSaveSemantics'

type UnsavedChangesDialogProps = {
  recordName: string
  /** Desktop close uses clearer save-target wording; browser keeps the draft-recovery note. */
  context?: 'document' | 'window-close' | 'app-quit'
  /** SnapGene file extension for this molecule (`.dna` or `.prot`). */
  snapGeneExtension?: 'dna' | 'prot'
  saveBinding?: WorkspaceDocumentBinding
  onCancel: () => void
  onDiscard: () => void
  onSaveFile: () => void
  onSaveAsFile: () => void
  onSaveToDatabase: () => void
}

export function UnsavedChangesDialog({
  recordName,
  context = 'document',
  snapGeneExtension = 'dna',
  saveBinding = 'database',
  onCancel,
  onDiscard,
  onSaveFile,
  onSaveAsFile,
  onSaveToDatabase,
}: UnsavedChangesDialogProps) {
  const closingWindow = context === 'window-close' || context === 'app-quit'
  const snapGeneLabel = `.${snapGeneExtension}`
  const diskBound = saveBinding !== 'database'

  return (
    <div className="translation-dialog-backdrop" role="presentation" onPointerDown={onCancel}>
      <div
        className="translation-dialog unsaved-changes-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="unsaved-changes-title"
        onPointerDown={(event) => event.stopPropagation()}
      >
        <h3 id="unsaved-changes-title">Save sequence?</h3>
        <p className="unsaved-changes-message">
          Your changes to <strong>{recordName}</strong> have not been saved.
          {closingWindow
            ? diskBound
              ? ` Save to the open file, save as a ${snapGeneLabel} file, save to the Vibegene database, or discard your changes before closing.`
              : ` Save to the Vibegene database, save as a ${snapGeneLabel} file, or discard your changes before closing.`
            : diskBound
              ? ` Save to the open file, save as a ${snapGeneLabel} file, save to the Vibegene database, or discard your changes.`
              : ` Save to the Vibegene database, save as a ${snapGeneLabel} file, or discard your changes.`}
        </p>
        {!closingWindow && (
          <p className="unsaved-changes-note">
            Closing a browser tab only shows the browser&apos;s own warning, but Vibegene auto-saves a draft you
            can recover next time you open the app.
          </p>
        )}
        <div className="translation-dialog-footer unsaved-changes-footer">
          <button type="button" onClick={onDiscard}>
            Don&apos;t Save
          </button>
          <div className="translation-actions">
            <button type="button" onClick={onCancel}>
              Cancel
            </button>
            {diskBound ? (
              <>
                <button type="button" onClick={onSaveAsFile}>
                  Save as…
                </button>
                <button type="button" onClick={onSaveToDatabase}>
                  Save to database
                </button>
                <button type="button" className="primary" onClick={onSaveFile}>
                  Save
                </button>
              </>
            ) : (
              <>
                <button type="button" onClick={onSaveAsFile}>
                  Save as {snapGeneLabel}…
                </button>
                <button type="button" className="primary" onClick={onSaveToDatabase}>
                  Save to database
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

import type { NativeOverwriteAvailability } from './domain/projectSaveSemantics'

export function NativeFormatSaveDialog({
  fileName,
  native,
  copyExtension = 'dna',
  busy = false,
  onCancel,
  onSaveCopy,
  onOverwriteNative,
}: {
  fileName: string
  native: NativeOverwriteAvailability
  /** SnapGene copy extension for the current molecule (`.dna` or `.prot`). */
  copyExtension?: 'dna' | 'prot'
  busy?: boolean
  onCancel: () => void
  onSaveCopy: () => void | Promise<void>
  onOverwriteNative: () => void | Promise<void>
}) {
  const copyLabel = `.${copyExtension}`
  return (
    <div
      className="translation-dialog-backdrop"
      role="presentation"
      onPointerDown={() => {
        if (!busy) onCancel()
      }}
    >
      <div
        className="translation-dialog native-format-save-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="native-format-save-title"
        onPointerDown={(event) => event.stopPropagation()}
      >
        <h3 id="native-format-save-title">Save changes</h3>
        <p className="native-format-save-message">
          This database document is stored as <strong>{fileName}</strong>. Saving a {copyLabel}{' '}
          copy keeps the original {native.label} entry and its external file unchanged.
        </p>
        <p className="native-format-save-warning">
          Overwriting the native entry may lose format-specific information. The external
          file is updated only by folder sync, with conflict checks.
        </p>
        {!native.available && (
          <p className="native-format-save-unavailable" role="status">
            {native.reason}
          </p>
        )}
        <div className="translation-dialog-footer">
          <button type="button" disabled={busy} onClick={onCancel}>
            Cancel
          </button>
          <div className="translation-actions">
            <button
              type="button"
              className="danger-text"
              disabled={busy || !native.available}
              title={!native.available ? native.reason : `Overwrite ${native.label}`}
              onClick={() => void Promise.resolve(onOverwriteNative()).catch(() => undefined)}
            >
              Overwrite {native.label}
            </button>
            <button
              type="button"
              className="primary"
              disabled={busy}
              autoFocus
              onClick={() => void Promise.resolve(onSaveCopy()).catch(() => undefined)}
            >
              Save as {copyLabel} copy
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

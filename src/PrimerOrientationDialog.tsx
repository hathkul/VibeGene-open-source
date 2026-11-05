type PrimerOrientationDialogProps = {
  onCancel: () => void
  onChoose: (strand: 'forward' | 'reverse') => void
}

export function PrimerOrientationDialog({ onCancel, onChoose }: PrimerOrientationDialogProps) {
  return (
    <div className="translation-dialog-backdrop" role="presentation" onMouseDown={onCancel}>
      <div
        className="translation-dialog primer-orientation-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="primer-orientation-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <h3 id="primer-orientation-title">Choose primer orientation</h3>
        <p className="muted">
          Create a primer from the selected sequence. Direct uses the top strand; reverse uses the
          reverse complement.
        </p>
        <div className="primer-orientation-actions">
          <button type="button" className="primary" onClick={() => onChoose('forward')}>
            Direct
          </button>
          <button type="button" className="primary" onClick={() => onChoose('reverse')}>
            Reverse
          </button>
          <button type="button" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}

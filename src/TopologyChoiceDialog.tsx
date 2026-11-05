import type { Topology } from './domain/types'

type TopologyChoiceDialogProps = {
  fileName: string
  onCancel: () => void
  onChoose: (topology: Topology) => void
}

export function TopologyChoiceDialog({ fileName, onCancel, onChoose }: TopologyChoiceDialogProps) {
  return (
    <div className="translation-dialog-backdrop" role="presentation" onPointerDown={onCancel}>
      <div
        className="translation-dialog topology-choice-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="topology-choice-title"
        onPointerDown={(event) => event.stopPropagation()}
      >
        <h3 id="topology-choice-title">Open as linear or circular?</h3>
        <p className="topology-choice-message">
          <strong>{fileName}</strong> does not specify whether this DNA is linear or circular.
        </p>
        <div className="translation-dialog-footer topology-choice-footer">
          <button type="button" onClick={onCancel}>
            Cancel
          </button>
          <div className="translation-actions">
            <button type="button" onClick={() => onChoose('linear')}>
              Open as linear
            </button>
            <button type="button" className="primary" onClick={() => onChoose('circular')}>
              Open as circular
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

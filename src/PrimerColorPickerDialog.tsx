import { PRIMER_COLOR_OPTIONS } from './domain/primerColors'

type PrimerColorPickerProps = {
  currentColor: string
  onCancel: () => void
  onPick: (color: string) => void
}

export function PrimerColorPickerDialog({ currentColor, onCancel, onPick }: PrimerColorPickerProps) {
  return (
    <div className="translation-dialog-backdrop" role="presentation" onMouseDown={onCancel}>
      <div
        className="translation-dialog primer-color-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="primer-color-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <h3 id="primer-color-title">Primer Color</h3>
        <div className="primer-color-grid" role="listbox" aria-label="Primer colors">
          {PRIMER_COLOR_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              role="option"
              aria-selected={option.value.toLowerCase() === currentColor.toLowerCase()}
              className={`primer-color-option${option.value.toLowerCase() === currentColor.toLowerCase() ? ' is-selected' : ''}`}
              onClick={() => onPick(option.value)}
            >
              <span className="primer-color-swatch" style={{ background: option.value }} />
              {option.label}
            </button>
          ))}
        </div>
        <div className="translation-dialog-footer">
          <div className="translation-actions">
            <button type="button" onClick={onCancel}>
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

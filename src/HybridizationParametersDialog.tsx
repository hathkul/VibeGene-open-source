import { useState } from 'react'
import { normalizePrimerHybridizationParams, type PrimerHybridizationParams } from './domain/primerHybridization'

type HybridizationParametersDialogProps = {
  initial: PrimerHybridizationParams
  onCancel: () => void
  onConfirm: (next: PrimerHybridizationParams) => void
}

export function HybridizationParametersDialog({
  initial,
  onCancel,
  onConfirm,
}: HybridizationParametersDialogProps) {
  const [draft, setDraft] = useState(() => normalizePrimerHybridizationParams(initial))

  function update(patch: Partial<PrimerHybridizationParams>) {
    setDraft((current) => normalizePrimerHybridizationParams({ ...current, ...patch }))
  }

  return (
    <div className="translation-dialog-backdrop" role="presentation" onMouseDown={onCancel}>
      <div
        className="translation-dialog hybridization-params-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="hybridization-params-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <h3 id="hybridization-params-title">
          Hybridization parameters control how many binding sites are displayed.
        </h3>
        <hr />

        <div className="hybridization-params-row">
          <div className="hybridization-params-icon" aria-hidden>
            <svg viewBox="0 0 64 48" width="64" height="48">
              <path className="hybridization-params-diagram-muted" d="M8 28h48" strokeWidth="2" fill="none" />
              <path d="M18 20h28" stroke="var(--vg-data-mark)" strokeWidth="6" strokeLinecap="round" fill="none" />
              <path className="hybridization-params-diagram-foreground" d="M38 14v18" strokeWidth="1.5" strokeDasharray="2 2" fill="none" />
              <text className="hybridization-params-diagram-foreground" x="44" y="12" fontSize="9">
                3′
              </text>
            </svg>
          </div>
          <div className="hybridization-params-controls">
            <label className="hybridization-params-line">
              <span>Match at least</span>
              <input
                type="number"
                min={1}
                max={60}
                value={draft.minContinuousMatchLen}
                onChange={(event) => update({ minContinuousMatchLen: Number(event.target.value) })}
              />
              <span>bases at the 3′ end of the primer</span>
            </label>
            <label className="checkbox-line">
              <input
                type="checkbox"
                checked={draft.allowMismatch}
                onChange={(event) => update({ allowMismatch: event.target.checked })}
              />
              Allowing a single isolated mismatch (not at the 3′ base)
            </label>
          </div>
        </div>

        <div className="hybridization-params-row">
          <div className="hybridization-params-icon" aria-hidden>
            <svg viewBox="0 0 64 48" width="64" height="48">
              <path className="hybridization-params-diagram-muted" d="M10 30h44" strokeWidth="2" fill="none" />
              <path d="M18 22h28" stroke="var(--vg-data-mark)" strokeWidth="6" strokeLinecap="round" fill="none" />
              <path className="hybridization-params-diagram-foreground" d="M28 12l8 20" strokeWidth="1.5" fill="none" markerEnd="url(#tm-arrow)" />
              <path className="hybridization-params-diagram-foreground" d="M36 12l-8 20" strokeWidth="1.5" fill="none" />
            </svg>
          </div>
          <div className="hybridization-params-controls">
            <label className="hybridization-params-line">
              <span>Require a melting temperature (Tm) of at least</span>
              <input
                type="number"
                min={0}
                max={100}
                value={draft.minMeltingTemperature}
                onChange={(event) => update({ minMeltingTemperature: Number(event.target.value) })}
              />
              <span>°C</span>
            </label>
          </div>
        </div>

        <div className="translation-dialog-footer">
          <div className="translation-actions">
            <button type="button" onClick={onCancel}>
              Cancel
            </button>
            <button type="button" className="primary" onClick={() => onConfirm(draft)}>
              OK
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

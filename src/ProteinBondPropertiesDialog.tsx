import { useState } from 'react'
import {
  DEFAULT_PROTEIN_BOND_STROKE_WIDTH,
  MAX_PROTEIN_BOND_STROKE_WIDTH,
  MIN_PROTEIN_BOND_STROKE_WIDTH,
  defaultProteinBondColor,
  proteinBondStrokeWidth,
  proteinBondTypeLabel,
} from './domain/proteinBonds'
import type { ProteinBond, ProteinBondEndpoint, ProteinBondType } from './domain/types'

const bondTypes: ProteinBondType[] = ['disulfide', 'thioether', 'thiolester', 'cross-link', 'other']

function updateEndpoint(
  bond: ProteinBond,
  endpointIndex: 0 | 1,
  patch: Partial<ProteinBondEndpoint>,
): ProteinBond {
  const endpoints: [ProteinBondEndpoint, ProteinBondEndpoint] = [
    { ...bond.endpoints[0] },
    { ...bond.endpoints[1] },
  ]
  endpoints[endpointIndex] = { ...endpoints[endpointIndex], ...patch }
  if (!endpoints[endpointIndex].chainId?.trim()) delete endpoints[endpointIndex].chainId
  return { ...bond, endpoints }
}

export function ProteinBondPropertiesDialog({
  bond,
  sequenceLength,
  onCancel,
  onSave,
  onDelete,
}: {
  bond: ProteinBond
  sequenceLength: number
  onCancel: () => void
  onSave: (bond: ProteinBond) => void
  onDelete?: () => void
}) {
  const [draft, setDraft] = useState<ProteinBond>(() => ({
    ...bond,
    color: bond.color || defaultProteinBondColor(bond.type),
    strokeWidth: proteinBondStrokeWidth(bond),
    endpoints: [{ ...bond.endpoints[0] }, { ...bond.endpoints[1] }],
  }))
  const maxLocalResidue = Math.max(1, sequenceLength)

  return (
    <div className="translation-dialog-backdrop" role="presentation" onPointerDown={onCancel}>
      <div
        className="translation-dialog protein-bond-properties-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="protein-bond-properties-title"
        onPointerDown={(event) => event.stopPropagation()}
      >
        <h3 id="protein-bond-properties-title">Bond Properties</h3>
        <div className="protein-bond-properties-grid">
          <label>
            <span>Label</span>
            <input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} />
          </label>
          <label>
            <span>Bond type</span>
            <select
              value={draft.type}
              onChange={(event) => {
                const type = event.target.value as ProteinBondType
                setDraft({ ...draft, type, color: defaultProteinBondColor(type) })
              }}
            >
              {bondTypes.map((type) => <option key={type} value={type}>{proteinBondTypeLabel(type)}</option>)}
            </select>
          </label>
          <label>
            <span>Color</span>
            <input type="color" value={draft.color || defaultProteinBondColor(draft.type)} onChange={(event) => setDraft({ ...draft, color: event.target.value })} />
          </label>
          <label>
            <span>Stroke</span>
            <input
              type="number"
              min={MIN_PROTEIN_BOND_STROKE_WIDTH}
              max={MAX_PROTEIN_BOND_STROKE_WIDTH}
              step={0.5}
              aria-label="Stroke weight"
              value={draft.strokeWidth ?? DEFAULT_PROTEIN_BOND_STROKE_WIDTH}
              onChange={(event) => setDraft({ ...draft, strokeWidth: Number(event.target.value) })}
            />
          </label>
        </div>

        <div className="protein-bond-endpoints">
          {draft.endpoints.map((endpoint, endpointIndex) => (
            <div key={endpointIndex}>
              <strong>Endpoint {endpointIndex + 1}</strong>
              <label>
                <span>Chain</span>
                <input
                  value={endpoint.chainId ?? ''}
                  placeholder="This protein"
                  onChange={(event) => setDraft((current) => updateEndpoint(current, endpointIndex as 0 | 1, { chainId: event.target.value }))}
                />
              </label>
              <label>
                <span>Residue</span>
                <input
                  type="number"
                  min={1}
                  max={endpoint.chainId ? undefined : maxLocalResidue}
                  value={endpoint.residue + 1}
                  onChange={(event) => setDraft((current) => updateEndpoint(current, endpointIndex as 0 | 1, { residue: Math.max(0, Number(event.target.value) - 1) }))}
                />
              </label>
            </div>
          ))}
        </div>

        <label className="protein-bond-notes">
          <span>Notes</span>
          <textarea rows={3} value={draft.notes ?? ''} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} />
        </label>

        <div className="protein-bond-display-options">
          <label><input type="checkbox" checked={draft.visible !== false} onChange={(event) => setDraft({ ...draft, visible: event.target.checked ? undefined : false })} /> Show connector in protein views</label>
          <label><input type="checkbox" checked={draft.showLabel !== false} onChange={(event) => setDraft({ ...draft, showLabel: event.target.checked ? undefined : false })} /> Show label in Sequence view</label>
          <label><input type="checkbox" checked={draft.showTypeLabel === true} onChange={(event) => setDraft({ ...draft, showTypeLabel: event.target.checked ? true : undefined })} /> Include bond type in label</label>
        </div>

        <div className="translation-actions protein-bond-dialog-actions">
          {onDelete ? <button type="button" className="danger" onClick={onDelete}>Delete bond</button> : <span />}
          <button type="button" onClick={onCancel}>Cancel</button>
          <button type="button" className="primary" onClick={() => onSave({ ...draft, strokeWidth: proteinBondStrokeWidth(draft) })}>Save</button>
        </div>
      </div>
    </div>
  )
}

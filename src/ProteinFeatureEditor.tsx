import { Plus, Trash2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import {
  PROTEIN_FEATURE_COLORS,
  PROTEIN_FEATURE_FIELDS,
  PROTEIN_FEATURE_TYPES,
  proteinFeatureFieldValues,
  serializeProteinFeatureFields,
  type ProteinFeatureType,
} from './domain/proteinFeatures'
import type { SequenceFeature } from './domain/types'

function ProteinCoordinateInput({ value, min, max, label, onCommit }: {
  value: number
  min: number
  max: number
  label: string
  onCommit: (value: number) => void
}) {
  const [text, setText] = useState(String(value))
  const [invalid, setInvalid] = useState(false)
  const editing = useRef(false)
  useEffect(() => {
    if (!editing.current && !invalid) setText(String(value))
  }, [value, invalid])
  return <input
    type="number"
    min={min}
    max={max}
    data-feature-coordinate
    aria-label={label}
    aria-invalid={invalid || undefined}
    title={invalid ? `Enter a residue position from ${min} to ${max}.` : undefined}
    value={text}
    onFocus={() => { editing.current = true }}
    onChange={(event) => setText(event.target.value)}
    onBlur={(event) => {
      editing.current = false
      const raw = event.currentTarget.value
      const next = Number(raw)
      const valid = raw !== '' && Number.isInteger(next) && next >= min && next <= max
      event.currentTarget.setCustomValidity(valid ? '' : `Enter a residue position from ${min} to ${max}.`)
      setInvalid(!valid)
      if (valid && next !== value) onCommit(next)
    }}
  />
}

export function ProteinFeatureSidebarEditor({
  feature,
  sequenceLength,
  onApply,
}: {
  feature: SequenceFeature
  sequenceLength: number
  onApply: (feature: SequenceFeature) => void
}) {
  const draft = feature
  const fieldValues = proteinFeatureFieldValues(draft.notes)
  const availableFields = [
    ...PROTEIN_FEATURE_FIELDS,
    ...Object.keys(fieldValues).filter((field) => !PROTEIN_FEATURE_FIELDS.includes(field as (typeof PROTEIN_FEATURE_FIELDS)[number])),
  ]
  const [selectedField, setSelectedField] = useState(() =>
    availableFields.find((field) => fieldValues[field]?.trim()) ?? 'note',
  )
  const [fieldInfoOpen, setFieldInfoOpen] = useState(false)
  const filledFields = Object.entries(fieldValues).filter(([, value]) => value.trim())

  function update(next: SequenceFeature) {
    onApply(next)
  }

  function updateType(type: string) {
    const known = PROTEIN_FEATURE_TYPES.includes(type as ProteinFeatureType)
    update({
      ...draft,
      type,
      color: known ? PROTEIN_FEATURE_COLORS[type as ProteinFeatureType] : draft.color,
    })
  }

  function updateLocation(index: number, patch: { start?: number; end?: number }) {
    const locations = draft.locations.map((location, locationIndex) => {
      if (locationIndex !== index) return location
      const start = patch.start == null ? location.start : patch.start - 1
      const end = patch.end == null ? location.end : patch.end
      return { ...location, start, end, strand: 'forward' as const }
    })
    update({ ...draft, locations })
  }

  return (
    <div className="protein-feature-editor">
      <label>
        <span>Name</span>
        <input value={draft.name} onChange={(event) => update({ ...draft, name: event.target.value })} />
      </label>
      <label>
        <span>Type</span>
        <select value={draft.type} onChange={(event) => updateType(event.target.value)}>
          {PROTEIN_FEATURE_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
          {!PROTEIN_FEATURE_TYPES.includes(draft.type as ProteinFeatureType) && (
            <option value={draft.type}>{draft.type}</option>
          )}
        </select>
      </label>
      <label>
        <span>Color</span>
        <input
          type="color"
          value={draft.color === 'nocolor' ? '#64748b' : draft.color}
          onChange={(event) => update({ ...draft, color: event.target.value })}
        />
      </label>
      <div className="protein-feature-segments">
        <div className="protein-feature-segments-heading">
          <strong>Residue ranges</strong>
          <button
            type="button"
            title="Add range"
            onClick={() => {
              const lastEnd = draft.locations.at(-1)?.end ?? 0
              const start = Math.min(Math.max(0, lastEnd), Math.max(0, sequenceLength - 1))
              update({ ...draft, locations: [...draft.locations, { start, end: Math.min(sequenceLength, start + 1), strand: 'forward' }] })
            }}
          >
            <Plus size={14} /> Add
          </button>
        </div>
        {draft.locations.map((location, index) => (
          <div className="protein-feature-segment" key={`${index}-${location.start}-${location.end}`}>
            <ProteinCoordinateInput
              min={1}
              max={location.end}
              label={`Range ${index + 1} start`}
              value={location.start + 1}
              onCommit={(value) => updateLocation(index, { start: value })}
            />
            <span>to</span>
            <ProteinCoordinateInput
              min={location.start + 1}
              max={sequenceLength}
              label={`Range ${index + 1} end`}
              value={location.end}
              onCommit={(value) => updateLocation(index, { end: value })}
            />
            <span>({(location.end - location.start).toLocaleString()} aa)</span>
            <button
              type="button"
              className="danger"
              title="Delete range"
              disabled={draft.locations.length === 1}
              onClick={() => update({ ...draft, locations: draft.locations.filter((_, candidate) => candidate !== index) })}
            >
              <Trash2 size={13} />
            </button>
          </div>
        ))}
      </div>
      <div className="protein-feature-numbering">
        <label className="protein-feature-checkbox">
          <input
            type="checkbox"
            checked={draft.proteinNumberingStart !== undefined}
            onChange={(event) => update({
              ...draft,
              proteinNumberingStart: event.target.checked ? 1 : undefined,
            })}
          />
          <span>Restart residue numbering in this feature</span>
        </label>
        {draft.proteinNumberingStart !== undefined ? (
          <label>
            <span>First residue number</span>
            <input
              type="number"
              value={draft.proteinNumberingStart}
              onChange={(event) => update({ ...draft, proteinNumberingStart: Number(event.target.value) })}
            />
          </label>
        ) : null}
      </div>
      <div className="feature-properties-qualifiers protein-feature-fields">
        <label className="feature-qualifier-key-row">
          <select aria-label="Feature field" value={selectedField} onChange={(event) => setSelectedField(event.target.value)}>
            {availableFields.map((field) => <option key={field} value={field}>/{field}</option>)}
          </select>
          <span>=</span>
        </label>
        <textarea
          aria-label={`Value for ${selectedField}`}
          rows={4}
          value={fieldValues[selectedField] ?? ''}
          onChange={(event) => update({
            ...draft,
            notes: serializeProteinFeatureFields({ ...fieldValues, [selectedField]: event.target.value }),
          })}
        />
      </div>
      {fieldInfoOpen && (
        <div className="feature-properties-field-info" aria-live="polite">
          {filledFields.length ? filledFields.map(([field, value]) => (
            <div className="feature-properties-field-info-line" key={field}>/{field} = {value.trim()}</div>
          )) : (
            <div className="feature-properties-field-info-empty">No filled fields.</div>
          )}
        </div>
      )}
      <button
        type="button"
        className="feature-properties-field-info-toggle protein-feature-field-info-toggle"
        onClick={() => setFieldInfoOpen((open) => !open)}
      >
        {fieldInfoOpen ? 'Hide filled fields' : 'Show all filled fields'}
      </button>
      <label className="protein-feature-checkbox">
        <input type="checkbox" checked={draft.visible !== false} onChange={(event) => update({ ...draft, visible: event.target.checked })} />
        <span>Show in protein sequence</span>
      </label>
    </div>
  )
}

export function ProteinFeaturePropertiesDialog({
  draft,
  sequenceLength,
  onCancel,
  onSave,
}: {
  draft: SequenceFeature
  sequenceLength: number
  onCancel: () => void
  onSave: (feature: SequenceFeature) => void
}) {
  const [localDraft, setLocalDraft] = useState(() => ({
    ...draft,
    locations: draft.locations.map((location) => ({ ...location })),
  }))
  const localDraftRef = useRef(localDraft)
  const dialogRef = useRef<HTMLDivElement>(null)

  return (
    <div className="translation-dialog-backdrop feature-properties-backdrop" role="presentation" onPointerDown={onCancel}>
      <div
        ref={dialogRef}
        className="translation-dialog feature-properties-dialog protein-feature-properties-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="protein-feature-properties-title"
        onPointerDown={(event) => event.stopPropagation()}
      >
        <h3 id="protein-feature-properties-title">Feature Properties</h3>
        <ProteinFeatureSidebarEditor
          feature={localDraft}
          sequenceLength={sequenceLength}
          onApply={(next) => { localDraftRef.current = next; setLocalDraft(next) }}
        />
        <div className="translation-actions">
          <button type="button" onClick={onCancel}>Cancel</button>
          <button type="button" className="primary" onClick={() => {
            const activeElement = document.activeElement
            if (activeElement instanceof HTMLInputElement && activeElement.hasAttribute('data-feature-coordinate')) activeElement.blur()
            const invalid = [...(dialogRef.current?.querySelectorAll<HTMLInputElement>('input[data-feature-coordinate]') ?? [])]
              .find((input) => !input.checkValidity())
            if (invalid) { invalid.reportValidity(); return }
            onSave(localDraftRef.current)
          }}>OK</button>
        </div>
      </div>
    </div>
  )
}

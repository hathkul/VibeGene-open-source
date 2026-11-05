import { useState } from 'react'
import {
  DEFAULT_FEATURE_EXPORT_FIELDS,
  FEATURE_EXPORT_FIELD_OPTIONS,
  type FeatureExportField,
} from './domain/featureExport'

type ExportFeatureDataDialogProps = {
  featureCount: number
  onCancel: () => void
  onConfirm: (fields: FeatureExportField[]) => void
}

export function ExportFeatureDataDialog({ featureCount, onCancel, onConfirm }: ExportFeatureDataDialogProps) {
  const [fields, setFields] = useState<FeatureExportField[]>(() => [...DEFAULT_FEATURE_EXPORT_FIELDS])

  function toggle(field: FeatureExportField) {
    setFields((current) => (current.includes(field) ? current.filter((entry) => entry !== field) : [...current, field]))
  }

  return (
    <div className="translation-dialog-backdrop" role="presentation" onMouseDown={onCancel}>
      <div
        className="translation-dialog export-feature-data-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="export-feature-data-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <h3 id="export-feature-data-title">Export the following feature data:</h3>
        <div className="export-feature-data-options">
          {FEATURE_EXPORT_FIELD_OPTIONS.map((option) => (
            <label key={option.id} className="translation-checkbox-row">
              <input
                type="checkbox"
                checked={fields.includes(option.id)}
                onChange={() => toggle(option.id)}
              />
              {option.label}
            </label>
          ))}
        </div>
        <div className="translation-dialog-footer">
          <div className="translation-actions">
            <button type="button" onClick={onCancel}>
              Cancel
            </button>
            <button
              type="button"
              className="primary"
              disabled={fields.length === 0 || featureCount === 0}
              onClick={() => onConfirm(FEATURE_EXPORT_FIELD_OPTIONS.map((option) => option.id).filter((id) => fields.includes(id)))}
            >
              OK
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

import { useState } from 'react'
import { featureBounds, formatRange } from '../../domain/sequence'
import { type SequenceFeature } from '../../domain/types'
import { featureDisplayName } from '../map/mapPrimitives'
import { type SelectionRange } from '../sequence'
import { DialogActions, DialogBackdrop, DialogSurface } from '../../ui/DialogPrimitives'

export function FeatureSegmentTargetDialog({
  range,
  features,
  mode,
  onCancel,
  onSelect,
}: {
  range: SelectionRange
  features: SequenceFeature[]
  mode: 'split' | 'assign'
  onCancel: () => void
  onSelect: (featureId: string) => void
}) {
  const [selection, setSelection] = useState<{ source: SequenceFeature[]; id: string }>(() => ({
    source: features,
    id: features[0]?.id ?? '',
  }))
  const featureId = selection.source === features ? selection.id : features[0]?.id ?? ''

  return (
    <DialogBackdrop onPointerDown={onCancel}>
      <DialogSurface
        className="enzyme-dialog"
        aria-label="Create Feature Segment"
      >
        <h3>Create Feature Segment</h3>
        <p>
          {mode === 'split'
            ? `Several features span the selection ${formatRange(range.start, range.end)}. Choose which feature to split:`
            : `No feature overlaps the selection ${formatRange(range.start, range.end)}. Choose the feature this segment should belong to:`}
        </p>
        <label className="feature-properties-name-row">
          <span>Feature:</span>
          <select
              value={featureId}
              onChange={(event) => setSelection({ source: features, id: event.target.value })}
              autoFocus
          >
            {features.map((feature) => (
              <option key={feature.id} value={feature.id}>
                {featureDisplayName(feature)} ({formatRange(featureBounds(feature).start, featureBounds(feature).end)})
              </option>
            ))}
          </select>
        </label>
        <DialogActions>
          <button type="button" onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className="primary"
            disabled={!featureId}
            onClick={() => {
              if (featureId) onSelect(featureId)
            }}
          >
            OK
          </button>
        </DialogActions>
      </DialogSurface>
    </DialogBackdrop>
  )
}

export function FeatureMergeTemplateDialog({
  features,
  onCancel,
  onSelect,
}: {
  features: SequenceFeature[]
  onCancel: () => void
  onSelect: (featureId: string) => void
}) {
  const [selection, setSelection] = useState<{ source: SequenceFeature[]; id: string }>(() => ({
    source: features,
    id: features[0]?.id ?? '',
  }))
  const featureId = selection.source === features ? selection.id : features[0]?.id ?? ''

  return (
    <DialogBackdrop onPointerDown={onCancel}>
      <DialogSurface
        className="feature-merge-dialog"
        aria-labelledby="feature-merge-template-title"
      >
        <h3 id="feature-merge-template-title">Merge Features</h3>
        <p className="feature-merge-dialog-description">
          Choose the feature whose name, type, color, and other properties should be used for the merged annotation.
        </p>
        <label className="feature-properties-name-row">
          <span>Template feature:</span>
          <select
              value={featureId}
              onChange={(event) => setSelection({ source: features, id: event.target.value })}
              autoFocus
          >
            {features.map((feature) => (
              <option key={feature.id} value={feature.id}>
                {featureDisplayName(feature)} ({formatRange(featureBounds(feature).start, featureBounds(feature).end)})
              </option>
            ))}
          </select>
        </label>
        <p className="feature-merge-dialog-hint">
          The selected features will become segments of one feature. You can review their coordinates in Feature Properties next.
        </p>
        <DialogActions>
          <button type="button" onClick={onCancel}>Cancel</button>
          <button
            type="button"
            className="primary"
            disabled={!featureId}
            onClick={() => { if (featureId) onSelect(featureId) }}
          >
            Continue…
          </button>
        </DialogActions>
      </DialogSurface>
    </DialogBackdrop>
  )
}

export function CleavageSiteFeatureDialog({
  position,
  mode,
  features,
  onCancel,
  onSelect,
}: {
  position: number
  mode: 'add' | 'remove'
  features: SequenceFeature[]
  onCancel: () => void
  onSelect: (featureId: string) => void
}) {
  const [selection, setSelection] = useState<{ source: SequenceFeature[]; id: string }>(() => ({
    source: features,
    id: features[0]?.id ?? '',
  }))
  const featureId = selection.source === features ? selection.id : features[0]?.id ?? ''

  return (
    <DialogBackdrop onPointerDown={onCancel}>
      <DialogSurface
        className="enzyme-dialog"
        aria-label={mode === 'add' ? 'Add Cleavage Site' : 'Remove Cleavage Site'}
      >
        <h3>{mode === 'add' ? 'Add Cleavage Site' : 'Remove Cleavage Site'}</h3>
        <p>
          {mode === 'add'
            ? `Several features cover position ${position + 1}. Choose which feature receives the cleavage site:`
            : `Several features have a cleavage site at position ${position + 1}. Choose which feature to update:`}
        </p>
        <label className="feature-properties-name-row">
          <span>Feature:</span>
          <select
              value={featureId}
              onChange={(event) => setSelection({ source: features, id: event.target.value })}
              autoFocus
          >
            {features.map((feature) => (
              <option key={feature.id} value={feature.id}>
                {featureDisplayName(feature)} ({formatRange(featureBounds(feature).start, featureBounds(feature).end)})
              </option>
            ))}
          </select>
        </label>
        <DialogActions>
          <button type="button" onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className="primary"
            disabled={!featureId}
            onClick={() => {
              if (featureId) onSelect(featureId)
            }}
          >
            OK
          </button>
        </DialogActions>
      </DialogSurface>
    </DialogBackdrop>
  )
}

export function EditMapLabelDialog({
  fileName,
  currentLabel,
  onCancel,
  onConfirm,
}: {
  fileName: string
  currentLabel: string | null
  onCancel: () => void
  onConfirm: (result: { fileName: string; mapLabel: string | null }) => void
}) {
  const [nameDraft, setNameDraft] = useState(fileName)
  const [useCustom, setUseCustom] = useState(currentLabel !== null)
  const [customLabel, setCustomLabel] = useState(currentLabel ?? '')

  const confirm = () => {
    const nextName = nameDraft.trim().replace(/\.dna$/i, '') || fileName
    if (useCustom) {
      const trimmed = customLabel.trim()
      onConfirm({ fileName: nextName, mapLabel: trimmed ? trimmed : null })
    } else {
      onConfirm({ fileName: nextName, mapLabel: null })
    }
  }

  return (
    <div className="translation-dialog-backdrop" role="presentation" onPointerDown={onCancel}>
      <div
        className="translation-dialog edit-map-label-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Edit map label"
        onPointerDown={(event) => event.stopPropagation()}
      >
        <label className="edit-map-label-file-name">
          <span>File name</span>
          <input
            type="text"
            className="edit-map-label-input"
            value={nameDraft}
            placeholder="Untitled"
            onChange={(event) => setNameDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                confirm()
              }
            }}
          />
        </label>
        <h3>For the sequence label in Map view:</h3>
        <label className="edit-map-label-radio">
          <input
            type="radio"
            name="map-label-mode"
            checked={!useCustom}
            onChange={() => setUseCustom(false)}
          />
          <span>Use the file name</span>
        </label>
        <label className="edit-map-label-radio">
          <input
            type="radio"
            name="map-label-mode"
            checked={useCustom}
            onChange={() => setUseCustom(true)}
          />
          <span>Use the following name:</span>
        </label>
        <input
          type="text"
          className="edit-map-label-input"
          value={useCustom ? customLabel : nameDraft}
          disabled={!useCustom}
          placeholder={nameDraft || fileName}
          onChange={(event) => setCustomLabel(event.target.value)}
          onFocus={() => setUseCustom(true)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              confirm()
            }
          }}
        />
        <div className="translation-actions">
          <button type="button" onClick={onCancel}>Cancel</button>
          <button type="button" className="primary" onClick={confirm}>OK</button>
        </div>
      </div>
    </div>
  )
}

import type { DisplaySettings } from './sequenceShared'
export function SequenceVisualControlsPanel({
  settings,
  onChange,
  onSave,
  onRevert,
}: {
  settings: DisplaySettings['sequenceVisual']
  onChange: (patch: Partial<DisplaySettings['sequenceVisual']>) => void
  onSave?: () => void
  onRevert?: () => void
}) {
  return (
    <div className="elliptic-ring-gap-control sequence-visual-controls" onPointerDown={(event) => event.stopPropagation()}>
      <label>
        <span className="elliptic-ring-gap-label">Sequence size {settings.sequenceFontSizePx}px</span>
        <input
          type="range"
          min={8}
          max={18}
          step={1}
          value={settings.sequenceFontSizePx}
          aria-label="Font size for sequence bases"
          onChange={(event) => onChange({ sequenceFontSizePx: Number(event.target.value) })}
        />
      </label>
      <label>
        <span className="elliptic-ring-gap-label">Sequence weight {settings.sequenceFontWeight}</span>
        <input
          type="range"
          min={400}
          max={800}
          step={100}
          value={settings.sequenceFontWeight}
          aria-label="Font weight for sequence bases"
          onChange={(event) => onChange({ sequenceFontWeight: Number(event.target.value) })}
        />
      </label>
      <label>
        <span className="elliptic-ring-gap-label">Sequence spacing {settings.sequenceBaseSpacingPx ?? 10}px</span>
        <input
          type="range"
          min={6}
          max={16}
          step={1}
          value={settings.sequenceBaseSpacingPx ?? 10}
          aria-label="Horizontal spacing between sequence bases"
          onChange={(event) => onChange({ sequenceBaseSpacingPx: Number(event.target.value) })}
        />
      </label>
      <div className="elliptic-ring-gap-divider" />
      <label>
        <span className="elliptic-ring-gap-label">Enzyme label size {settings.enzymeLabelFontSizePx}px</span>
        <input
          type="range"
          min={8}
          max={16}
          step={1}
          value={settings.enzymeLabelFontSizePx}
          aria-label="Font size for enzyme labels"
          onChange={(event) => onChange({ enzymeLabelFontSizePx: Number(event.target.value) })}
        />
      </label>
      <label>
        <span className="elliptic-ring-gap-label">Enzyme weight {settings.enzymeFontWeight}</span>
        <input
          type="range"
          min={400}
          max={800}
          step={100}
          value={settings.enzymeFontWeight}
          aria-label="Font weight for normal restriction enzyme labels"
          onChange={(event) => onChange({ enzymeFontWeight: Number(event.target.value) })}
        />
      </label>
      <label>
        <span className="elliptic-ring-gap-label">Unique enzyme weight {settings.uniqueEnzymeFontWeight}</span>
        <input
          type="range"
          min={400}
          max={800}
          step={100}
          value={settings.uniqueEnzymeFontWeight}
          aria-label="Font weight for unique restriction enzyme labels"
          onChange={(event) => onChange({ uniqueEnzymeFontWeight: Number(event.target.value) })}
        />
      </label>
      <div className="elliptic-ring-gap-divider" />
      <label>
        <span className="elliptic-ring-gap-label">Primer label size {settings.primerLabelFontSizePx}px</span>
        <input
          type="range"
          min={8}
          max={16}
          step={1}
          value={settings.primerLabelFontSizePx}
          aria-label="Font size for primer labels"
          onChange={(event) => onChange({ primerLabelFontSizePx: Number(event.target.value) })}
        />
      </label>
      <label>
        <span className="elliptic-ring-gap-label">Primer label weight {settings.primerLabelFontWeight}</span>
        <input
          type="range"
          min={400}
          max={800}
          step={100}
          value={settings.primerLabelFontWeight}
          aria-label="Font weight for primer labels"
          onChange={(event) => onChange({ primerLabelFontWeight: Number(event.target.value) })}
        />
      </label>
      <p className="sequence-visual-controls-note">Primer sequence font always matches sequence font.</p>
      <div className="elliptic-ring-gap-divider" />
      <label>
        <span className="elliptic-ring-gap-label">Feature body size {settings.featureBodyFontSizePx}px</span>
        <input
          type="range"
          min={8}
          max={16}
          step={1}
          value={settings.featureBodyFontSizePx}
          aria-label="Font size for feature body labels"
          onChange={(event) => onChange({ featureBodyFontSizePx: Number(event.target.value) })}
        />
      </label>
      <label>
        <span className="elliptic-ring-gap-label">Feature body weight {settings.featureBodyFontWeight}</span>
        <input
          type="range"
          min={400}
          max={800}
          step={100}
          value={settings.featureBodyFontWeight}
          aria-label="Font weight for feature body labels"
          onChange={(event) => onChange({ featureBodyFontWeight: Number(event.target.value) })}
        />
      </label>
      <label className="elliptic-ring-gap-check">
        <input
          type="checkbox"
          checked={settings.featureBodyFrame}
          aria-label="Draw thin black frames around feature bodies"
          onChange={(event) => onChange({ featureBodyFrame: event.target.checked })}
        />
        <span className="elliptic-ring-gap-label">Feature body frame</span>
      </label>
      <div className="elliptic-ring-gap-divider" />
      <label>
        <span className="elliptic-ring-gap-label">Translation size {settings.translationFontSizePx ?? 12}px</span>
        <input
          type="range"
          min={8}
          max={18}
          step={1}
          value={settings.translationFontSizePx ?? 12}
          aria-label="Font size for amino acid translations"
          onChange={(event) => onChange({ translationFontSizePx: Number(event.target.value) })}
        />
      </label>
      <label>
        <span className="elliptic-ring-gap-label">Translation weight {settings.translationFontWeight ?? 700}</span>
        <input
          type="range"
          min={400}
          max={800}
          step={100}
          value={settings.translationFontWeight ?? 700}
          aria-label="Font weight for amino acid translations"
          onChange={(event) => onChange({ translationFontWeight: Number(event.target.value) })}
        />
      </label>
      {onSave || onRevert ? (
        <div className="visual-controls-footer">
          {onRevert ? (
            <button type="button" className="visual-controls-revert" onClick={onRevert}>
              Revert to defaults
            </button>
          ) : null}
          {onSave ? (
            <button type="button" className="visual-controls-save" onClick={onSave}>
              Save
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

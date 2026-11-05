import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { ArrowLeftRight, ArrowRight, Minus } from 'lucide-react'
import {
  CDS_QUALIFIERS,
  COMMON_QUALIFIERS,
  featureQualifierValues,
  qualifiersForFeatureType,
  segmentSizeBp,
  SNAPGENE_FEATURE_TYPES,
  strandFromDirectionality,
  syncTranslationQualifiers,
  totalFeatureBp,
  TRANSLATION_DEPENDENT_QUALIFIERS,
  type FeatureDirectionality,
  type FeatureEditorState,
  type FeatureSegmentDraft,
} from './domain/featureQualifiers'
import { isFeatureNoColor } from './domain/featureAppearance'
import { allowedFeatureDirectionalities, coerceFeatureDirectionality } from './domain/featureDirectionality'
import { readingFramePreservingAminoAcids } from './domain/cdsTranslationFrame'
import { formatRange } from './domain/sequence'
import type { FeatureReadingFrame, Topology } from './domain/types'
import { FeatureTranslationOptionsDialog } from './FeatureTranslationOptionsDialog'
import { RichQualifierEditor } from './presentation/workspaceTabs/RichQualifierEditor'
import { FeatureNoteContent } from './presentation/workspaceTabs/FeatureNoteContent'

function clampLocation(value: number, sequenceLength: number) {
  return Math.max(0, Math.min(sequenceLength, value))
}

function parseLocationInput(raw: string, sequenceLength: number): { start: number; end: number } | null {
  const match = raw.trim().match(/^(\d+)\s*\.\.\s*(\d+)$/)
  if (!match) return null
  const start = clampLocation(Number(match[1]) - 1, sequenceLength)
  const end = clampLocation(Number(match[2]), sequenceLength)
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null
  return { start, end }
}

const LOCATION_ERROR = 'Enter a valid range such as 10..25, with the end at or after the start.'

function SegmentLocationInput({ start, end, sequenceLength, index, onCommit }: {
  start: number
  end: number
  sequenceLength: number
  index: number
  onCommit: (range: { start: number; end: number }) => void
}) {
  const [startText, setStartText] = useState(String(start + 1))
  const [endText, setEndText] = useState(String(end))
  const [invalid, setInvalid] = useState(false)
  const editingRef = useRef(false)
  const endInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!editingRef.current && !invalid) {
      setStartText(String(start + 1))
      setEndText(String(end))
    }
  }, [start, end, invalid])

  function commit() {
    const parsed = parseLocationInput(`${startText}..${endText}`, sequenceLength)
    endInputRef.current?.setCustomValidity(parsed ? '' : LOCATION_ERROR)
    setInvalid(!parsed)
    if (!parsed) return
    setStartText(String(parsed.start + 1))
    setEndText(String(parsed.end))
    if (parsed.start !== start || parsed.end !== end) onCommit(parsed)
  }

  return <span
    className="feature-location-editor"
    onFocus={() => { editingRef.current = true }}
    onBlur={(event) => {
      if (event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget)) return
      editingRef.current = false
      commit()
    }}
    onPaste={(event) => {
      const range = event.clipboardData.getData('text').trim().match(/^(\d+)\s*\.\.\s*(\d+)$/)
      if (!range) return
      event.preventDefault()
      setStartText(range[1]!)
      setEndText(range[2]!)
    }}
  >
    <span className={`feature-location-control${invalid ? ' is-invalid' : ''}`}>
      <input
        className="feature-location-value feature-location-start"
        aria-label={`Segment ${index + 1} start`}
        aria-invalid={invalid || undefined}
        inputMode="numeric"
        value={startText}
        onChange={(event) => setStartText(event.target.value)}
      />
      <span className="feature-location-separator" aria-hidden="true">..</span>
      <input
        ref={endInputRef}
        className="feature-location-value feature-location-end"
        aria-label={`Segment ${index + 1} end`}
        aria-invalid={invalid || undefined}
        inputMode="numeric"
        value={endText}
        onChange={(event) => setEndText(event.target.value)}
      />
      <button
        type="button"
        className="feature-location-set"
        aria-label={`Set segment ${index + 1} location`}
        onMouseDown={(event) => event.preventDefault()}
        onClick={commit}
      >Set</button>
    </span>
    {invalid && <span className="feature-location-error" role="alert">{LOCATION_ERROR}</span>}
  </span>
}

function SegmentPreview({
  segments,
  sequenceLength,
  color,
  directionality,
  cleavageArrows,
  onOpenCleavageSites,
}: {
  segments: FeatureSegmentDraft[]
  sequenceLength: number
  color: string
  directionality: FeatureDirectionality
  cleavageArrows: number[]
  onOpenCleavageSites: () => void
}) {
  const totalBp = totalFeatureBp(segments, sequenceLength)
  const cleavageCount = cleavageArrows.length
  const bounds = segments.reduce(
    (acc, segment) => ({
      min: Math.min(acc.min, segment.start),
      max: Math.max(acc.max, segment.end >= segment.start ? segment.end : sequenceLength),
    }),
    { min: sequenceLength, max: 0 },
  )
  const span = Math.max(1, bounds.max - bounds.min)
  const orderedSegments = [...segments].sort((a, b) => a.start - b.start)

  return (
    <div className="feature-properties-preview">
      <div className="feature-properties-preview-summary">
        <span>
          {totalBp.toLocaleString()} bp / {segments.length} segment{segments.length === 1 ? '' : 's'}
        </span>
        {cleavageCount > 0 ? (
          <>
            <span aria-hidden> / </span>
            <button type="button" className="feature-properties-cleavage-link" onClick={onOpenCleavageSites}>
              {cleavageCount.toLocaleString()} cleavage site{cleavageCount === 1 ? '' : 's'}
            </button>
          </>
        ) : null}
      </div>
      <div className="feature-properties-preview-track">
        {orderedSegments.map((segment, index) => {
          const left = ((segment.start - bounds.min) / span) * 100
          const width = Math.max(2, (segmentSizeBp(segment.start, segment.end, sequenceLength) / span) * 100)
          const hasArrow = directionality === 'forward' || directionality === 'reverse' || directionality === 'both'
          const reverse = directionality === 'reverse' || (directionality === 'both' && segment.strand === 'reverse')
          return (
            <div
              key={`${segment.start}-${segment.end}-${index}`}
              className={`feature-properties-preview-segment${hasArrow ? ' has-arrow' : ''}${directionality === 'both' ? ' both' : reverse ? ' reverse' : ''}`}
              style={{ left: `${left}%`, width: `${width}%`, background: color }}
              title={`${formatRange(segment.start, segment.end)}`}
            />
          )
        })}
        {orderedSegments.map((segment, index) => {
          const next = orderedSegments[index + 1]
          if (!next || next.start <= segment.end) return null
          const gapLeft = ((segment.end - bounds.min) / span) * 100
          const gapWidth = ((next.start - segment.end) / span) * 100
          if (gapWidth <= 0) return null
          return (
            <div
              key={`gap-${segment.end}-${next.start}`}
              className="feature-properties-preview-gap"
              style={{ left: `${gapLeft}%`, width: `${gapWidth}%` }}
            />
          )
        })}
      </div>
      <div className="feature-properties-preview-coords">
        <span>{(bounds.min + 1).toLocaleString()}</span>
        <span>{bounds.max.toLocaleString()}</span>
      </div>
    </div>
  )
}

function CleavageSitesDialog({
  cleavageArrows,
  onCancel,
  onConfirm,
}: {
  cleavageArrows: number[]
  onCancel: () => void
  onConfirm: (kept: number[]) => void
}) {
  const [checked, setChecked] = useState(() => new Set(cleavageArrows))

  function toggle(position: number) {
    setChecked((current) => {
      const next = new Set(current)
      if (next.has(position)) next.delete(position)
      else next.add(position)
      return next
    })
  }

  return (
    <div className="translation-dialog-backdrop" role="presentation" onPointerDown={onCancel}>
      <div
        className="translation-dialog feature-cleavage-sites-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="feature-cleavage-sites-title"
        onPointerDown={(event) => event.stopPropagation()}
      >
        <h3 id="feature-cleavage-sites-title">Uncheck to delete</h3>
        <p className="feature-cleavage-sites-hint">Cleavage sites on this feature:</p>
        <ul className="feature-cleavage-sites-list">
          {cleavageArrows.map((position) => (
            <li key={position}>
              <label>
                <input type="checkbox" checked={checked.has(position)} onChange={() => toggle(position)} />
                <span>Position {(position + 1).toLocaleString()}</span>
              </label>
            </li>
          ))}
        </ul>
        <div className="translation-actions">
          <button type="button" onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className="primary"
            onClick={() =>
              onConfirm(cleavageArrows.filter((position) => checked.has(position)).sort((a, b) => a - b))
            }
          >
            OK
          </button>
        </div>
      </div>
    </div>
  )
}

function DirectionalityButton({
  active,
  disabled,
  title,
  onClick,
  children,
}: {
  active: boolean
  disabled?: boolean
  title: string
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button type="button" className={`feature-direction-btn${active ? ' active' : ''}`} title={title} onClick={onClick} disabled={disabled}>
      {children}
    </button>
  )
}

export type FeaturePropertiesFormProps = {
  draft: FeatureEditorState
  sequenceLength: number
  sequence: string
  topology?: Topology
  onChange: (next: FeatureEditorState) => void
  /** Open the current draft CDS translation as a protein molecule in a new window. */
  onOpenAsProtein?: (draft: FeatureEditorState) => void
  /** Dialog-only: Cancel / OK footer actions. */
  footerActions?: ReactNode
}

export function FeaturePropertiesForm({
  draft,
  sequenceLength,
  sequence,
  topology = 'circular',
  onChange,
  onOpenAsProtein,
  footerActions,
}: FeaturePropertiesFormProps) {
  const [translationOptionsOpen, setTranslationOptionsOpen] = useState(false)
  const [cleavageSitesOpen, setCleavageSitesOpen] = useState(false)
  const [fieldInfoOpen, setFieldInfoOpen] = useState(false)

  const availableQualifiers = useMemo(() => qualifiersForFeatureType(draft.type), [draft.type])
  const selectedQualifier = availableQualifiers.includes(draft.selectedQualifier)
    ? draft.selectedQualifier
    : availableQualifiers[0] ?? 'note'
  const filledFieldInfoLines = useMemo(
    () =>
      Object.entries(draft.qualifiers)
        .flatMap(([key, value]) => featureQualifierValues(value).map((part) => ({ key, value: part }))),
    [draft.qualifiers],
  )

  function withSyncedTranslation(next: FeatureEditorState): FeatureEditorState {
    const strand = strandFromDirectionality(next.directionality)
    const locations = next.segments.map((segment) => ({
      start: segment.start,
      end: segment.end,
      strand: next.directionality === 'both' || next.directionality === 'none' ? segment.strand : strand,
    }))
    const prevStrand = strandFromDirectionality(draft.directionality)
    const prevLocations = draft.segments.map((segment) => ({
      start: segment.start,
      end: segment.end,
      strand: draft.directionality === 'both' || draft.directionality === 'none' ? segment.strand : prevStrand,
    }))
    const locationsChanged =
      prevLocations.length !== locations.length ||
      prevLocations.some(
        (location, index) =>
          location.start !== locations[index]?.start ||
          location.end !== locations[index]?.end ||
          location.strand !== locations[index]?.strand,
      )

    let translation = next.translation
    if (
      locationsChanged &&
      next.translateInSequenceView &&
      next.translation &&
      draft.translation
    ) {
      const readingFrameExplicitlyChanged =
        next.translation.readingFrame !== draft.translation.readingFrame
      translation = {
        ...next.translation,
        readingFrame: readingFrameExplicitlyChanged
          ? next.translation.readingFrame
          : readingFramePreservingAminoAcids(
              { locations: prevLocations, translation: draft.translation },
              locations,
            ),
      }
    }

    return {
      ...next,
      translation,
      qualifiers: syncTranslationQualifiers(
        next.qualifiers,
        {
          locations,
          translateInSequenceView: next.translateInSequenceView,
          translation,
        },
        sequence,
        topology,
      ),
    }
  }

  function update(patch: Partial<FeatureEditorState>) {
    const merged = { ...draft, ...patch }
    if (
      patch.translateInSequenceView !== undefined ||
      patch.translation !== undefined ||
      patch.segments !== undefined ||
      patch.directionality !== undefined
    ) {
      onChange(withSyncedTranslation(merged))
      return
    }
    onChange(merged)
  }

  function updateSegment(index: number, patch: Partial<FeatureSegmentDraft>) {
    onChange(
      withSyncedTranslation({
        ...draft,
        segments: draft.segments.map((segment, segmentIndex) =>
          segmentIndex === index ? { ...segment, ...patch } : segment,
        ),
      }),
    )
  }

  function updateType(type: string) {
    const nextQualifiers = qualifiersForFeatureType(type)
    const nextSelected = nextQualifiers.includes(draft.selectedQualifier)
      ? draft.selectedQualifier
      : nextQualifiers[0] ?? 'note'
    update({
      type,
      selectedQualifier: nextSelected,
      directionality: coerceFeatureDirectionality(type, draft.directionality, draft.segments[0]?.strand ?? 'forward'),
    })
  }

  function updateColor(color: string) {
    onChange({
      ...draft,
      color,
      segments: draft.segments.map((segment) => ({ ...segment, color })),
    })
  }

  function splitSelectedSegment() {
    const index = 0
    const segment = draft.segments[index]
    if (!segment) return
    const midpoint = segment.start + Math.floor(segmentSizeBp(segment.start, segment.end, sequenceLength) / 2)
    if (midpoint <= segment.start || midpoint >= segment.end) return
    const first: FeatureSegmentDraft = { ...segment, end: midpoint }
    const second: FeatureSegmentDraft = { ...segment, start: midpoint, name: `${segment.name} (2)` }
    update({
      segments: [first, second, ...draft.segments.slice(1)],
    })
  }

  function mergeSegments() {
    if (draft.segments.length < 2) return
    const merged = draft.segments.reduce<FeatureSegmentDraft>(
      (acc, segment) => ({
        ...acc,
        start: Math.min(acc.start, segment.start),
        end: Math.max(acc.end, segment.end >= segment.start ? segment.end : sequenceLength),
      }),
      { ...draft.segments[0] },
    )
    update({ segments: [{ ...merged, name: draft.name }] })
  }

  function deleteSegment(index: number) {
    if (draft.segments.length < 2) return
    update({ segments: draft.segments.filter((_, segmentIndex) => segmentIndex !== index) })
  }

  return (
    <div className="feature-properties-form">
      <div className="feature-properties-header">
        <label className="feature-properties-name-row">
          <span>Feature:</span>
          <input
            value={draft.name}
            onChange={(event) => update({ name: event.target.value })}
            autoFocus
            title="In DNA libraries, include <member> to insert each member’s name when this consensus feature is projected."
          />
        </label>
        <div className="feature-properties-type-row">
          <label>
            <span>Type:</span>
            <select value={draft.type} onChange={(event) => updateType(event.target.value)}>
              {SNAPGENE_FEATURE_TYPES.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
              {!SNAPGENE_FEATURE_TYPES.includes(draft.type as (typeof SNAPGENE_FEATURE_TYPES)[number]) && (
                <option value={draft.type}>{draft.type}</option>
              )}
            </select>
          </label>
          <div className="feature-direction-group" role="group" aria-label="Feature directionality">
            <DirectionalityButton
              active={draft.directionality === 'none'}
              disabled={!allowedFeatureDirectionalities(draft.type).includes('none')}
              title="No direction"
              onClick={() => update({ directionality: 'none' })}
            >
              <Minus size={14} />
            </DirectionalityButton>
            <DirectionalityButton
              active={draft.directionality === 'forward'}
              disabled={!allowedFeatureDirectionalities(draft.type).includes('forward')}
              title="Forward strand"
              onClick={() => update({ directionality: 'forward' })}
            >
              <ArrowRight size={14} />
            </DirectionalityButton>
            <DirectionalityButton
              active={draft.directionality === 'reverse'}
              disabled={!allowedFeatureDirectionalities(draft.type).includes('reverse')}
              title="Reverse strand"
              onClick={() => update({ directionality: 'reverse' })}
            >
              <ArrowRight size={14} className="reverse-arrow" />
            </DirectionalityButton>
            <DirectionalityButton
              active={draft.directionality === 'both'}
              disabled={!allowedFeatureDirectionalities(draft.type).includes('both')}
              title="Both strands"
              onClick={() => update({ directionality: 'both' })}
            >
              <ArrowLeftRight size={14} />
            </DirectionalityButton>
          </div>
        </div>
      </div>

      <div className="feature-properties-translation-row">
        <label className="translation-checkbox-row">
          <input
            type="checkbox"
            checked={draft.translateInSequenceView}
            onChange={(event) => {
              const checked = event.target.checked
              if (!checked) {
                update({ translateInSequenceView: false })
                return
              }
              const nextQualifiers = qualifiersForFeatureType('CDS')
              const nextSelected = nextQualifiers.includes(draft.selectedQualifier)
                ? draft.selectedQualifier
                : nextQualifiers[0] ?? 'note'
              update({
                translateInSequenceView: true,
                type: 'CDS',
                directionality: coerceFeatureDirectionality('CDS', draft.directionality, draft.segments[0]?.strand ?? 'forward'),
                selectedQualifier: nextSelected,
                translation: {
                  ...draft.translation,
                  readingFrame: (draft.directionality === 'reverse'
                    ? -Math.abs(draft.translation.readingFrame)
                    : Math.abs(draft.translation.readingFrame)) as FeatureReadingFrame,
                },
              })
            }}
          />
          Translate this feature in Sequence view
        </label>
        <div className="feature-properties-translation-actions">
          <button type="button" disabled={!draft.translateInSequenceView} onClick={() => setTranslationOptionsOpen(true)}>
            Feature Translation Options...
          </button>
          {onOpenAsProtein && (
            <button
              type="button"
              disabled={!draft.translateInSequenceView || !(draft.qualifiers.translation ?? '').trim()}
              onClick={() => onOpenAsProtein(draft)}
            >
              Open as protein
            </button>
          )}
        </div>
      </div>

      <div className="feature-properties-segment-panel">
        <SegmentPreview
          segments={draft.segments}
          sequenceLength={sequenceLength}
          color={draft.color}
          directionality={draft.directionality}
          cleavageArrows={draft.cleavageArrows}
          onOpenCleavageSites={() => setCleavageSitesOpen(true)}
        />
        <div className="feature-properties-segment-actions">
          <button type="button" onClick={splitSelectedSegment}>
            Split Feature...
          </button>
          <button type="button" disabled={draft.segments.length < 2} onClick={mergeSegments}>
            Merge Segments
          </button>
          <button type="button" disabled={draft.segments.length < 2} onClick={() => deleteSegment(0)}>
            Delete Segment
          </button>
        </div>
      </div>

      <table className="feature-properties-segment-table">
        <thead>
          <tr>
            <th>Segment</th>
            <th>Location</th>
            <th>Size (bp)</th>
            <th>Color</th>
          </tr>
        </thead>
        <tbody>
          {draft.segments.map((segment, index) => (
            <tr key={`${segment.start}-${segment.end}-${index}`}>
              <td>
                <span className="feature-segment-index">{index + 1}</span>
                <input
                  className="feature-segment-name"
                  value={segment.name}
                  onChange={(event) => updateSegment(index, { name: event.target.value })}
                />
              </td>
              <td>
                <SegmentLocationInput
                  start={segment.start}
                  end={segment.end}
                  sequenceLength={sequenceLength}
                  index={index}
                  onCommit={(range) => updateSegment(index, range)}
                />
              </td>
              <td>{segmentSizeBp(segment.start, segment.end, sequenceLength)}</td>
              <td>
                <div className="feature-segment-color-cell">
                  <input
                    type="color"
                    value={isFeatureNoColor(segment.color) ? '#cccccc' : segment.color}
                    disabled={isFeatureNoColor(segment.color)}
                    onChange={(event) => {
                      updateColor(event.target.value)
                    }}
                  />
                  <label className="feature-nocolor-option">
                    <input
                      type="checkbox"
                      checked={isFeatureNoColor(segment.color)}
                      onChange={(event) => {
                        if (event.target.checked) {
                          updateColor('nocolor')
                        } else {
                          const fallback = '#69f'
                          updateColor(fallback)
                        }
                      }}
                    />
                    No color
                  </label>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="feature-properties-qualifiers">
        <RichQualifierEditor
          key={selectedQualifier}
          selector={<label className="feature-qualifier-key-row">
          <select value={selectedQualifier} onChange={(event) => update({ selectedQualifier: event.target.value })}>
            {availableQualifiers.map((qualifier) => {
              const disabled = TRANSLATION_DEPENDENT_QUALIFIERS.has(qualifier) && !draft.translateInSequenceView
              return (
                <option key={qualifier} value={qualifier} disabled={disabled}>
                  /{qualifier}
                </option>
              )
            })}
          </select>
          <span>=</span>
        </label>}
          qualifier={selectedQualifier}
          value={draft.qualifiers[selectedQualifier] ?? ''}
          onChange={(value) =>
            update({
              qualifiers: { ...draft.qualifiers, [selectedQualifier]: value },
            })
          }
          disabled={TRANSLATION_DEPENDENT_QUALIFIERS.has(selectedQualifier) && !draft.translateInSequenceView}
        />
        <label className="translation-checkbox-row feature-properties-prioritize-row">
          <input
            type="checkbox"
            checked={draft.prioritizeDisplay}
            onChange={(event) => update({ prioritizeDisplay: event.target.checked })}
          />
          Prioritize display of this feature in maps
        </label>
      </div>

      {fieldInfoOpen && (
        <div className="feature-properties-field-info" aria-live="polite">
          {filledFieldInfoLines.length > 0 ? (
            filledFieldInfoLines.map((line, index) => (
              <div key={`${line.key}-${index}`} className="feature-properties-field-info-line">
                <span>/{line.key} = </span><FeatureNoteContent value={line.value} />
              </div>
            ))
          ) : (
            <div className="feature-properties-field-info-empty">No filled fields.</div>
          )}
        </div>
      )}

      <div className="translation-dialog-footer feature-properties-footer">
        <button
          type="button"
          className="feature-properties-field-info-toggle"
          onClick={() => setFieldInfoOpen((open) => !open)}
        >
          {fieldInfoOpen ? 'Hide Field Info' : 'Show Field Info'}
        </button>
        {footerActions}
      </div>

      {translationOptionsOpen && (
        <FeatureTranslationOptionsDialog
          options={draft.translation}
          segments={draft.segments}
          strand={strandFromDirectionality(draft.directionality)}
          sequence={sequence}
          onCancel={() => setTranslationOptionsOpen(false)}
          onSave={(nextOptions) => {
            update({
              translation: nextOptions,
              directionality: nextOptions.readingFrame < 0 ? 'reverse' : 'forward',
            })
            setTranslationOptionsOpen(false)
          }}
        />
      )}
      {cleavageSitesOpen && (
        <CleavageSitesDialog
          cleavageArrows={draft.cleavageArrows}
          onCancel={() => setCleavageSitesOpen(false)}
          onConfirm={(kept) => {
            update({ cleavageArrows: kept })
            setCleavageSitesOpen(false)
          }}
        />
      )}
    </div>
  )
}

type FeaturePropertiesDialogProps = {
  draft: FeatureEditorState
  sequenceLength: number
  sequence: string
  topology?: Topology
  onCancel: () => void
  onSave: (next: FeatureEditorState) => void
  onOpenAsProtein?: (draft: FeatureEditorState) => void
}

export function FeaturePropertiesDialog({
  draft,
  sequenceLength,
  sequence,
  topology = 'circular',
  onCancel,
  onSave,
  onOpenAsProtein,
}: FeaturePropertiesDialogProps) {
  const [localDraft, setLocalDraft] = useState(draft)
  const localDraftRef = useRef(localDraft)
  const dialogRef = useRef<HTMLDivElement>(null)

  return (
    <div className="translation-dialog-backdrop feature-properties-backdrop" role="presentation" onPointerDown={onCancel}>
      <div
        ref={dialogRef}
        className="translation-dialog feature-properties-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="feature-properties-title"
        onPointerDown={(event) => event.stopPropagation()}
      >
        <h3 id="feature-properties-title">Feature Properties</h3>
        <FeaturePropertiesForm
          draft={localDraft}
          sequenceLength={sequenceLength}
          sequence={sequence}
          topology={topology}
          onChange={(next) => { localDraftRef.current = next; setLocalDraft(next) }}
          onOpenAsProtein={onOpenAsProtein}
          footerActions={
            <div className="translation-actions">
              <button type="button" onClick={onCancel}>
                Cancel
              </button>
              <button
                type="button"
                className="primary"
                onClick={() => {
                  const activeElement = document.activeElement
                  if (activeElement instanceof HTMLElement && activeElement.closest('.feature-location-editor')) activeElement.blur()
                  const invalidInput = [...(dialogRef.current?.querySelectorAll<HTMLElement>('.feature-location-editor') ?? [])]
                    .map((editor) => ({ start: editor.querySelector<HTMLInputElement>('.feature-location-start'), end: editor.querySelector<HTMLInputElement>('.feature-location-end') }))
                    .find(({ start, end }) => start && end && !parseLocationInput(`${start.value}..${end.value}`, sequenceLength))?.end
                  if (invalidInput) {
                    invalidInput.setCustomValidity(LOCATION_ERROR)
                    invalidInput.reportValidity()
                    return
                  }
                  const current = localDraftRef.current
                  const strand = strandFromDirectionality(current.directionality)
                  const locations = current.segments.map((segment) => ({
                    start: segment.start,
                    end: segment.end,
                    strand: current.directionality === 'both' || current.directionality === 'none' ? segment.strand : strand,
                  }))
                  onSave({
                    ...current,
                    qualifiers: syncTranslationQualifiers(
                      current.qualifiers,
                      {
                        locations,
                        translateInSequenceView: current.translateInSequenceView,
                        translation: current.translation,
                      },
                      sequence,
                      topology,
                    ),
                  })
                }}
              >
                OK
              </button>
            </div>
          }
        />
      </div>
    </div>
  )
}

export { CDS_QUALIFIERS, COMMON_QUALIFIERS, SNAPGENE_FEATURE_TYPES }

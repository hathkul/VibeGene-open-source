import { useMemo, useState } from 'react'
import { ArrowLeft, ArrowRight } from 'lucide-react'
import {
  computeFeatureTranslationCells,
  GENETIC_CODE_NAMES,
  type FeatureReadingFrame,
  type FeatureTranslationOptions,
} from './domain/geneticCode'
import type { FeatureSegmentDraft } from './domain/featureQualifiers'
import type { FeatureSegment, Strand } from './domain/types'

type FeatureTranslationOptionsDialogProps = {
  options: FeatureTranslationOptions
  segments: FeatureSegmentDraft[]
  strand: Strand
  sequence: string
  onCancel: () => void
  onSave: (next: FeatureTranslationOptions) => void
}

const POSITIVE_FRAMES: FeatureReadingFrame[] = [1, 2, 3]
const NEGATIVE_FRAMES: FeatureReadingFrame[] = [-3, -2, -1]
const PREVIEW_RESIDUES_PER_ROW = 50
const PREVIEW_GROUP_SIZE = 10

function formatSignedFrame(frame: number) {
  return frame > 0 ? `+${frame}` : `${frame}`
}

export function FeatureTranslationOptionsDialog({
  options,
  segments,
  strand,
  sequence,
  onCancel,
  onSave,
}: FeatureTranslationOptionsDialogProps) {
  const [draft, setDraft] = useState<FeatureTranslationOptions>(options)

  const locations = useMemo<FeatureSegment[]>(
    () => segments.map((segment) => ({ start: segment.start, end: segment.end, strand })),
    [segments, strand],
  )

  const previewCells = useMemo(
    () => computeFeatureTranslationCells({ locations }, sequence, draft),
    [draft, locations, sequence],
  )

  function update(patch: Partial<FeatureTranslationOptions>) {
    setDraft((current) => ({ ...current, ...patch }))
  }

  function updateSegmentNumbering(index: number, patch: Partial<FeatureTranslationOptions['segmentNumbering'][number]>) {
    setDraft((current) => ({
      ...current,
      segmentNumbering: current.segmentNumbering.map((entry, entryIndex) =>
        entryIndex === index ? { ...entry, ...patch } : entry,
      ),
    }))
  }

  const previewRows = useMemo(() => {
    const rows: (typeof previewCells)[] = []
    for (let index = 0; index < previewCells.length; index += PREVIEW_RESIDUES_PER_ROW) {
      rows.push(previewCells.slice(index, index + PREVIEW_RESIDUES_PER_ROW))
    }
    return rows
  }, [previewCells])

  return (
    <div className="translation-dialog-backdrop feature-translation-backdrop" role="presentation" onPointerDown={onCancel}>
      <div
        className="translation-dialog feature-translation-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="feature-translation-title"
        onPointerDown={(event) => event.stopPropagation()}
      >
        <h3 id="feature-translation-title" className="visually-hidden-heading">
          Feature Translation Options
        </h3>

        <label className="feature-translation-code-row">
          <span>Genetic Code:</span>
          <select value={draft.geneticCode} onChange={(event) => update({ geneticCode: event.target.value })}>
            {GENETIC_CODE_NAMES.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </label>

        <label className="translation-checkbox-row feature-translation-met-row">
          <input
            type="checkbox"
            checked={draft.firstCodonAsMet}
            onChange={(event) => update({ firstCodonAsMet: event.target.checked })}
          />
          Translate the first codon as Methionine
        </label>

        <div className="feature-translation-body">
          <div className="feature-translation-frames">
            <span className="feature-translation-frames-title">Reading Frame:</span>
            {POSITIVE_FRAMES.map((frame) => (
              <label key={frame} className="feature-translation-frame-option">
                <input
                  type="radio"
                  name="feature-reading-frame"
                  checked={draft.readingFrame === frame}
                  onChange={() => update({ readingFrame: frame })}
                />
                {formatSignedFrame(frame)}
              </label>
            ))}
            <div className="feature-translation-frame-strands" aria-hidden="true">
              <ArrowRight className="feature-translation-strand-arrow" />
              <ArrowLeft className="feature-translation-strand-arrow" />
            </div>
            {NEGATIVE_FRAMES.map((frame) => (
              <label key={frame} className="feature-translation-frame-option">
                <input
                  type="radio"
                  name="feature-reading-frame"
                  checked={draft.readingFrame === frame}
                  onChange={() => update({ readingFrame: frame })}
                />
                {formatSignedFrame(frame)}
              </label>
            ))}
          </div>

          <div className="feature-translation-preview">
            {previewRows.length === 0 ? (
              <p className="muted">No codons to translate in this reading frame.</p>
            ) : (
              <>
                <div className="feature-translation-preview-header">
                  {Array.from({ length: PREVIEW_RESIDUES_PER_ROW / PREVIEW_GROUP_SIZE }, (_, groupIndex) => (
                    <span className="feature-translation-col" key={groupIndex}>
                      {(groupIndex + 1) * PREVIEW_GROUP_SIZE}
                    </span>
                  ))}
                </div>
                {previewRows.map((row, rowIndex) => (
                  <div className="feature-translation-preview-row" key={rowIndex}>
                    <span className="feature-translation-preview-seq">
                      {Array.from({ length: Math.ceil(row.length / PREVIEW_GROUP_SIZE) }, (_, groupIndex) => (
                        <span className="feature-translation-col" key={groupIndex}>
                          {row
                            .slice(groupIndex * PREVIEW_GROUP_SIZE, groupIndex * PREVIEW_GROUP_SIZE + PREVIEW_GROUP_SIZE)
                            .map((cell) => cell.aa)
                            .join('')}
                        </span>
                      ))}
                    </span>
                    <span className="feature-translation-preview-end">{row[row.length - 1]?.number ?? ''}</span>
                  </div>
                ))}
              </>
            )}
          </div>
        </div>

        <div className="feature-translation-numbers">
          <div className="feature-translation-numbers-header">
            <span>Translation numbers:</span>
            <label className="translation-checkbox-row">
              <input
                type="checkbox"
                checked={draft.consecutiveNumbering}
                onChange={(event) => update({ consecutiveNumbering: event.target.checked })}
              />
              Consecutive for all segments
            </label>
          </div>
          {draft.segmentNumbering.map((entry, index) => (
            <div className="feature-translation-segment-row" key={index}>
              <span className="feature-translation-segment-label">Segment {index + 1}:</span>
              <label className="feature-translation-segment-option">
                <input
                  type="radio"
                  name={`feature-segment-numbering-${index}`}
                  checked={!entry.skip}
                  onChange={() => updateSegmentNumbering(index, { skip: false })}
                />
                Start at
                <input
                  type="number"
                  value={entry.startAt}
                  disabled={entry.skip || (draft.consecutiveNumbering && index > 0)}
                  onChange={(event) => updateSegmentNumbering(index, { startAt: Number(event.target.value) || 1 })}
                />
              </label>
              <label className="feature-translation-segment-option">
                <input
                  type="radio"
                  name={`feature-segment-numbering-${index}`}
                  checked={entry.skip}
                  onChange={() => updateSegmentNumbering(index, { skip: true })}
                />
                Skip this segment
              </label>
            </div>
          ))}
        </div>

        <div className="translation-dialog-footer">
          <div className="translation-actions">
            <button type="button" onClick={onCancel}>
              Cancel
            </button>
            <button type="button" className="primary" onClick={() => onSave(draft)}>
              OK
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { Upload, X } from 'lucide-react'
import {
  buildDnaComparisonLayout,
  dnaComparisonCoveragePercent,
  dnaComparisonIdentityPercent,
} from '../domain/dnaComparisonAlignment'
import { parseDnaComparisonFile, parseDnaComparisonText } from '../domain/dnaComparisonImport'
import type {
  DnaComparisonAlignment,
  DnaComparisonLayoutSlot,
  DnaComparisonSource,
} from '../domain/dnaComparisonTypes'
import type { DnaComparisonAlignmentEntry } from '../presentation/hooks/useDnaComparisonAlignments'
import { SEQUENCE_OPEN_ACCEPT } from '../domain/fileFormats'
import type { SequenceFeature } from '../domain/types'
import { SequenceMinimap } from '../presentation/sequence/SequenceMinimap'
import { featureDisplayName } from '../domain/genbankFeatureName'

type DisplayColumn = {
  sourceIndex?: number
  sourceBase?: string
  kind: 'identity' | 'mismatch' | 'gap'
  title: string
}

function isLockedSource(sourceId: string, lockedSourceIds?: ReadonlySet<string>) {
  return lockedSourceIds?.has(sourceId) === true
}

function featureCoversIndex(feature: SequenceFeature, index: number) {
  return feature.locations.some((location) => location.start <= location.end
    ? index >= location.start && index < location.end
    : index >= location.start || index < location.end)
}

type AnnotationSegment = {
  feature: SequenceFeature
  start: number
  end: number
  lane: number
}

function annotationSegments(slots: DnaComparisonLayoutSlot[], features: SequenceFeature[]): AnnotationSegment[] {
  const spans: Array<Omit<AnnotationSegment, 'lane'>> = []
  for (const feature of features) {
    let start: number | null = null
    for (let index = 0; index <= slots.length; index += 1) {
      const slot = slots[index]
      const covered = slot?.kind === 'reference' && featureCoversIndex(feature, slot.referenceIndex)
      if (covered && start === null) start = index
      if (!covered && start !== null) {
        spans.push({ feature, start, end: index })
        start = null
      }
    }
  }
  spans.sort((left, right) => left.start - right.start || right.end - left.end)
  const laneEnds: number[] = []
  return spans.map((span) => {
    let lane = laneEnds.findIndex((end) => end <= span.start)
    if (lane < 0) {
      lane = laneEnds.length
      laneEnds.push(span.end)
    } else {
      laneEnds[lane] = span.end
    }
    return { ...span, lane }
  })
}

function complement(base: string) {
  return ({ A: 'T', C: 'G', G: 'C', T: 'A', N: 'N' } as Record<string, string>)[base.toUpperCase()] ?? 'N'
}

function displayedSourceBase(source: DnaComparisonSource, sourceIndex: number, alignment: DnaComparisonAlignment) {
  const base = source.sequence[sourceIndex] ?? 'N'
  return alignment.orientation === 'reverse' ? complement(base) : base.toUpperCase()
}

function columnsForLayout(
  slots: DnaComparisonLayoutSlot[],
  source: DnaComparisonSource,
  alignment: DnaComparisonAlignment,
) {
  const references = new Map<number, DisplayColumn>()
  const insertions = new Map<number, DisplayColumn[]>()
  let boundary = Math.max(0, alignment.templateStart)
  for (const column of alignment.columns) {
    if (column.kind === 'traceInsert') {
      const sourceBase = displayedSourceBase(source, column.traceIndex, alignment)
      const values = insertions.get(boundary) ?? []
      values.push({
        sourceIndex: column.traceIndex,
        sourceBase,
        kind: 'gap',
        title: `${source.name} · inserted base ${sourceBase} · source position ${column.traceIndex + 1}`,
      })
      insertions.set(boundary, values)
      continue
    }
    boundary = column.templateIndex + 1
    if (column.kind === 'templateGap') {
      references.set(column.templateIndex, {
        sourceBase: '–',
        kind: 'gap',
        title: `${source.name} · deletion at reference base ${column.templateIndex + 1}`,
      })
      continue
    }
    const sourceBase = displayedSourceBase(source, column.traceIndex, alignment)
    references.set(column.templateIndex, {
      sourceIndex: column.traceIndex,
      sourceBase,
      kind: column.match ? 'identity' : 'mismatch',
      title: `${source.name} · reference base ${column.templateIndex + 1} · source base ${column.traceIndex + 1} · ${column.match ? 'identity' : 'mismatch'}`,
    })
  }
  return slots.map((slot) => slot.kind === 'reference'
    ? references.get(slot.referenceIndex)
    : insertions.get(slot.referenceBoundary)?.[slot.insertionIndex])
}

function DnaComparisonImportControls({
  sources,
  onSourcesChange,
  onStatus,
  onPickFromDatabase,
  compact = false,
}: {
  sources: DnaComparisonSource[]
  onSourcesChange: (sources: DnaComparisonSource[]) => void
  onStatus: (message: string) => void
  onPickFromDatabase?: () => void
  compact?: boolean
}) {
  const [pasteText, setPasteText] = useState('')
  const [busy, setBusy] = useState(false)
  const inputRef = useRef<HTMLInputElement | null>(null)

  const appendSources = useCallback((next: DnaComparisonSource[]) => {
    if (!next.length) return
    onSourcesChange([...sources, ...next])
    onStatus(`Added ${next.length} DNA comparison sequence${next.length === 1 ? '' : 's'}.`)
  }, [onSourcesChange, onStatus, sources])

  async function addFiles(files: FileList | File[]) {
    if (busy) return
    setBusy(true)
    const parsed: DnaComparisonSource[] = []
    const failures: string[] = []
    try {
      for (const file of Array.from(files)) {
        try {
          parsed.push(await parseDnaComparisonFile(file))
        } catch (error) {
          failures.push(`${file.name}: ${error instanceof Error ? error.message : 'could not parse'}`)
        }
      }
      appendSources(parsed)
      if (failures.length) onStatus(failures.join(' · '))
    } finally {
      setBusy(false)
    }
  }

  function addPasted() {
    try {
      const source = parseDnaComparisonText(pasteText)
      if (!source) {
        onStatus('Paste a DNA sequence first.')
        return
      }
      appendSources([source])
      setPasteText('')
    } catch (error) {
      onStatus(error instanceof Error ? error.message : 'Could not parse the pasted DNA sequence.')
    }
  }

  return (
    <div className={`dna-comparison-import${compact ? ' is-compact' : ''}`}>
      <div className="dna-comparison-import-buttons">
        <button type="button" disabled={busy} onClick={() => inputRef.current?.click()}>
          <Upload size={14} /> {busy ? 'Reading…' : 'Browse files'}
        </button>
        <input
          ref={inputRef}
          type="file"
          hidden
          multiple
          accept={SEQUENCE_OPEN_ACCEPT}
          onChange={(event) => {
            if (event.target.files?.length) void addFiles(event.target.files)
            event.target.value = ''
          }}
        />
        {onPickFromDatabase ? (
          <button type="button" disabled={busy} onClick={onPickFromDatabase}>From Database…</button>
        ) : null}
      </div>
      <textarea
        value={pasteText}
        rows={compact ? 3 : 1}
        spellCheck={false}
        placeholder="Paste DNA, FASTA, GenBank, or EMBL"
        onChange={(event) => setPasteText(event.target.value)}
        onKeyDown={(event) => {
          if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
            event.preventDefault()
            addPasted()
          }
        }}
      />
      <button type="button" disabled={!pasteText.trim() || busy} onClick={addPasted}>Add comparison</button>
    </div>
  )
}

export function DnaComparisonSourceList({
  sources,
  onSourcesChange,
  onStatus,
  onPickFromDatabase,
  className,
  lockedSourceIds,
}: {
  sources: DnaComparisonSource[]
  onSourcesChange: (sources: DnaComparisonSource[]) => void
  onStatus: (message: string) => void
  onPickFromDatabase?: () => void
  className?: string
  /** Source ids that cannot be removed (e.g. DNA library members). */
  lockedSourceIds?: ReadonlySet<string>
}) {
  const allEnabled = sources.length > 0 && sources.every((source) => source.enabled)
  return (
    <aside className={className ?? 'alignment-trace-file-list'}>
      <div className="alignment-panel-title-row">
        <div className="alignment-panel-title">Compare sequences:</div>
        {sources.length ? (
          <button
            type="button"
            className="alignment-toggle-all-button"
            onClick={() => onSourcesChange(sources.map((source) => ({ ...source, enabled: !allEnabled })))}
          >
            {allEnabled ? 'Uncheck all' : 'Check all'}
          </button>
        ) : null}
      </div>
      <DnaComparisonImportControls
        compact
        sources={sources}
        onSourcesChange={onSourcesChange}
        onStatus={onStatus}
        onPickFromDatabase={onPickFromDatabase}
      />
      <div className="alignment-file-list">
        {!sources.length ? <div className="alignment-empty-note">No comparison sequences loaded</div> : null}
        {sources.map((source) => {
          const locked = isLockedSource(source.id, lockedSourceIds)
          return (
            <div className="alignment-file-item" key={source.id} title={source.fileName ?? source.name}>
              <input
                type="checkbox"
                checked={source.enabled}
                aria-label={`Show ${source.name}`}
                onChange={() => onSourcesChange(sources.map((candidate) => candidate.id === source.id
                  ? { ...candidate, enabled: !candidate.enabled }
                  : candidate))}
              />
              <span className="alignment-file-name">{source.name}</span>
              {locked ? null : (
                <button
                  type="button"
                  className="alignment-file-remove"
                  aria-label={`Remove ${source.name}`}
                  title="Remove comparison"
                  onClick={() => onSourcesChange(sources.filter((candidate) => candidate.id !== source.id))}
                >
                  <X size={14} />
                </button>
              )}
            </div>
          )
        })}
      </div>
    </aside>
  )
}

export function DnaComparisonPane({
  recordName,
  reference,
  sources,
  entries,
  pending,
  sequenceVisual,
  onSourcesChange,
  onStatus,
  onPickFromDatabase,
  lockedSourceIds,
  annotationFeatures,
  emptyHint,
}: {
  recordName: string
  reference: string
  sources: DnaComparisonSource[]
  entries: DnaComparisonAlignmentEntry[]
  pending: boolean
  sequenceVisual?: {
    sequenceFontSizePx?: number
    sequenceFontWeight?: number
    sequenceBaseSpacingPx?: number
  }
  onSourcesChange: (sources: DnaComparisonSource[]) => void
  onStatus: (message: string) => void
  onPickFromDatabase?: () => void
  /** Source ids that cannot be removed (e.g. DNA library members). */
  lockedSourceIds?: ReadonlySet<string>
  annotationFeatures?: SequenceFeature[]
  emptyHint?: { title: string; body: string }
}) {
  const enabledAlignments = useMemo(
    () => entries.flatMap((entry) => entry.source.enabled && entry.alignment ? [entry.alignment] : []),
    [entries],
  )
  const slots = useMemo(
    () => buildDnaComparisonLayout(reference.length, enabledAlignments),
    [enabledAlignments, reference.length],
  )
  const comparisonScrollRef = useRef<HTMLDivElement | null>(null)
  const [visibleReferenceRange, setVisibleReferenceRange] = useState({ start: 0, end: reference.length })
  const annotationRows = useMemo(
    () => (annotationFeatures ?? []).filter((feature) => feature.visible !== false && feature.locations.length > 0),
    [annotationFeatures],
  )
  const annotationSegmentsForLayout = useMemo(
    () => annotationSegments(slots, annotationRows),
    [annotationRows, slots],
  )
  const annotationLaneCount = annotationSegmentsForLayout.reduce((count, segment) => Math.max(count, segment.lane + 1), 0)
  const allEnabled = sources.length > 0 && sources.every((source) => source.enabled)
  const cellWidthPx = Math.max(6, Math.min(20, sequenceVisual?.sequenceBaseSpacingPx ?? 10))
  const residueFontSizePx = sequenceVisual?.sequenceFontSizePx ?? 14
  const residueFontWeight = sequenceVisual?.sequenceFontWeight ?? 500
  const style = {
    '--protein-comparison-name-width': '280px',
    '--protein-comparison-meta-count': '6',
    '--protein-comparison-meta-width': '92px',
    '--protein-comparison-cell-width': `${cellWidthPx}px`,
    '--protein-comparison-residue-size': `${residueFontSizePx}px`,
    '--protein-comparison-residue-weight': String(residueFontWeight),
  } as CSSProperties
  useEffect(() => {
    const scrollHost = comparisonScrollRef.current
    if (!scrollHost) return
    const updateRange = () => {
      const trackOffset = 280 + 6 * 92
      const cellWidth = cellWidthPx
      const start = Math.max(0, Math.floor((scrollHost.scrollLeft - trackOffset) / cellWidth))
      const end = Math.min(reference.length, Math.ceil((scrollHost.scrollLeft + scrollHost.clientWidth - trackOffset) / cellWidth))
      setVisibleReferenceRange({ start, end: Math.max(start, end) })
    }
    updateRange()
    scrollHost.addEventListener('scroll', updateRange, { passive: true })
    return () => scrollHost.removeEventListener('scroll', updateRange)
  }, [cellWidthPx, reference.length])

  function navigateFromMinimap(position: number) {
    const scrollHost = comparisonScrollRef.current
    if (!scrollHost) return
    const trackOffset = 280 + 6 * 92
    scrollHost.scrollLeft = Math.max(0, trackOffset + position * cellWidthPx - scrollHost.clientWidth / 2)
  }
  const emptyTitle = emptyHint?.title ?? 'Add homologous DNA sequences'
  const emptyBody = emptyHint?.body
    ?? 'Browse sequence files, choose records from Database, or paste a nucleotide sequence above.'

  return (
    <div className="protein-comparison-pane dna-comparison-pane" style={style}>
      <SequenceMinimap
        sequenceLength={reference.length}
        annotationFeatures={annotationFeatures ?? []}
        restrictionSites={[]}
        selectedRange={null}
        cutStrandSelection={null}
        hoveredRestrictionSiteKey={null}
        scrollHostRef={comparisonScrollRef}
        onNavigate={() => undefined}
        visibleRange={visibleReferenceRange}
        onMinimapNavigate={navigateFromMinimap}
        onMinimapViewportNavigate={(start, atEnd) => {
          const host = comparisonScrollRef.current
          if (!host) return
          host.scrollLeft = atEnd ? host.scrollWidth - host.clientWidth : 280 + 6 * 92 + start * cellWidthPx
        }}
      />
      <section className="protein-comparison-workspace">
        <header className="protein-comparison-header">
          <div className="protein-comparison-header-copy">
            <strong>Comparative DNA alignment</strong>
            <span>{recordName} is the fixed DNA reference</span>
            <span className="protein-comparison-header-stats">
              {enabledAlignments.length} aligned · {sources.length} loaded{pending ? ' · aligning…' : ''}
            </span>
            {sources.length ? (
              <button
                type="button"
                className="protein-comparison-toggle-all"
                onClick={() => onSourcesChange(sources.map((source) => ({ ...source, enabled: !allEnabled })))}
              >
                {allEnabled ? 'Uncheck all' : 'Check all'}
              </button>
            ) : null}
          </div>
          <DnaComparisonImportControls
            sources={sources}
            onSourcesChange={onSourcesChange}
            onStatus={onStatus}
            onPickFromDatabase={onPickFromDatabase}
          />
        </header>

        {!sources.length ? (
          <div className="protein-comparison-empty">
            <strong>{emptyTitle}</strong>
            <p>{emptyBody}</p>
          </div>
        ) : (
          <div className="protein-comparison-scroll" ref={comparisonScrollRef}>
            <div className="protein-comparison-grid">
              <div className="protein-comparison-row is-column-header" role="row">
                <div className="protein-comparison-row-label" role="columnheader">Source</div>
                {['Length', 'Orientation', 'Identity', 'Coverage', 'Score', 'Notes'].map((label) => (
                  <div className="protein-comparison-row-meta" role="columnheader" key={label}>{label}</div>
                ))}
                <div className="protein-comparison-column-track" role="columnheader">Reference positions</div>
              </div>

              <div className="protein-comparison-row is-ruler" aria-label="Reference position ruler">
                <div className="protein-comparison-row-label" aria-hidden />
                {Array.from({ length: 6 }, (_, index) => (
                  <div className="protein-comparison-row-meta" key={`ruler-meta-${index}`} aria-hidden />
                ))}
                <div className="protein-comparison-ruler" style={{ ['--protein-comparison-columns' as string]: slots.length }}>
                  {slots.map((slot, index) => (
                    <div className="protein-comparison-ruler-cell" key={`ruler-${index}`}>
                      {slot.kind === 'reference' && (slot.referenceIndex === 0 || (slot.referenceIndex + 1) % 20 === 0)
                        ? <span>{slot.referenceIndex + 1}</span>
                        : null}
                    </div>
                  ))}
                </div>
              </div>

              {annotationRows.length ? (
                <div className="protein-comparison-row dna-comparison-annotation-row" key="annotation-row">
                  <div className="protein-comparison-row-label">
                    <div className="protein-comparison-row-name"><strong>Annotations</strong></div>
                  </div>
                  {Array.from({ length: 6 }, (_, index) => <div className="protein-comparison-row-meta" key={index} />)}
                  <div
                    className="dna-comparison-annotation-track"
                    style={{
                      '--protein-comparison-columns': slots.length,
                      '--dna-comparison-annotation-lanes': annotationLaneCount,
                    } as CSSProperties}
                  >
                    {annotationSegmentsForLayout.map((segment, index) => (
                      <div
                        className={`dna-comparison-annotation-segment${segment.feature.locations[0]?.strand === 'reverse' ? ' is-reverse' : ''}`}
                        key={`${segment.feature.id}-${segment.start}-${index}`}
                        title={`${featureDisplayName(segment.feature)} · ${segment.start + 1}–${segment.end}`}
                        aria-label={`${featureDisplayName(segment.feature)} · reference bases ${segment.start + 1}–${segment.end}`}
                        style={{
                          left: `${segment.start * cellWidthPx}px`,
                          width: `${Math.max(1, segment.end - segment.start) * cellWidthPx}px`,
                          top: `${segment.lane * 22 + 2}px`,
                          background: segment.feature.color,
                        }}
                      >
                        {segment.end - segment.start >= 5 ? featureDisplayName(segment.feature) : null}
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              <div className="protein-comparison-row is-reference">
                <div className="protein-comparison-row-label">
                  <div className="protein-comparison-row-visibility" aria-hidden />
                  <div className="protein-comparison-row-name"><strong>Reference</strong></div>
                </div>
                <div className="protein-comparison-row-meta">{reference.length.toLocaleString()} nt</div>
                <div className="protein-comparison-row-meta">—</div>
                <div className="protein-comparison-row-meta">100.0%</div>
                <div className="protein-comparison-row-meta">100.0%</div>
                <div className="protein-comparison-row-meta">—</div>
                <div className="protein-comparison-row-meta">reference</div>
                <div className="protein-comparison-cells" style={{ ['--protein-comparison-columns' as string]: slots.length }}>
                  {slots.map((slot, index) => slot.kind === 'reference' ? (
                    <div
                      className="protein-comparison-cell is-reference"
                      key={`reference-${slot.referenceIndex}`}
                      title={`Reference base ${slot.referenceIndex + 1}`}
                    >
                      <span className="protein-comparison-residue">{reference[slot.referenceIndex]}</span>
                    </div>
                  ) : (
                    <div className="protein-comparison-cell is-insertion-slot" key={`reference-insertion-${index}`}>
                      <span className="protein-comparison-residue">·</span>
                    </div>
                  ))}
                </div>
              </div>

              {entries.filter((entry) => entry.source.enabled).map((entry) => {
                const locked = isLockedSource(entry.source.id, lockedSourceIds)
                const alignment = entry.alignment
                if (!alignment) return (
                  <div className="protein-comparison-row is-error" key={entry.source.id}>
                    <div className="protein-comparison-row-label">
                      {locked ? (
                        <div className="protein-comparison-row-visibility" aria-hidden />
                      ) : (
                        <button type="button" className="protein-comparison-row-remove" onClick={() => onSourcesChange(sources.filter((source) => source.id !== entry.source.id))}><X size={13} /></button>
                      )}
                      <div className="protein-comparison-row-name"><strong>{entry.source.name}</strong></div>
                    </div>
                    {Array.from({ length: 6 }, (_, index) => <div className="protein-comparison-row-meta" key={index}>—</div>)}
                    <div className="protein-comparison-error">{entry.pending ? 'Aligning in background…' : entry.error ?? 'No useful alignment found.'}</div>
                  </div>
                )
                const columns = columnsForLayout(slots, entry.source, alignment)
                const identity = dnaComparisonIdentityPercent(alignment)
                const coverage = dnaComparisonCoveragePercent(alignment, reference.length)
                return (
                  <div className="protein-comparison-row" key={entry.source.id}>
                    <div className="protein-comparison-row-label">
                      {locked ? null : (
                        <button type="button" className="protein-comparison-row-remove" aria-label={`Remove ${entry.source.name}`} onClick={() => onSourcesChange(sources.filter((source) => source.id !== entry.source.id))}><X size={13} /></button>
                      )}
                      <label className="protein-comparison-row-visibility">
                        <input type="checkbox" checked aria-label={`Show ${entry.source.name}`} onChange={() => onSourcesChange(sources.map((source) => source.id === entry.source.id ? { ...source, enabled: false } : source))} />
                      </label>
                      <div className="protein-comparison-row-name"><strong>{entry.source.name}</strong></div>
                    </div>
                    <div className="protein-comparison-row-meta">{entry.source.sequence.length.toLocaleString()} nt</div>
                    <div className="protein-comparison-row-meta">{alignment.orientation}</div>
                    <div className="protein-comparison-row-meta">{identity.toFixed(1)}%</div>
                    <div className="protein-comparison-row-meta">{coverage.toFixed(1)}%</div>
                    <div className="protein-comparison-row-meta">{alignment.alignmentScore}</div>
                    <div className="protein-comparison-row-meta">{alignment.gapCount ? `${alignment.gapCount} gaps` : 'clean'}</div>
                    <div className="protein-comparison-cells" style={{ ['--protein-comparison-columns' as string]: slots.length }}>
                      {columns.map((column, index) => (
                        <div
                          className={`protein-comparison-cell${column ? ` is-${column.kind}` : ' is-unaligned'}${slots[index]?.kind === 'insertion' ? ' is-insertion-slot' : ''}`}
                          key={`${entry.source.id}-${index}`}
                          title={column?.title ?? `${entry.source.name}: not aligned here`}
                        >
                          <span className="protein-comparison-residue">{column?.sourceBase ?? ''}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
        <footer className="protein-comparison-legend">
          <span><i className="is-identity" /> identity</span>
          <span><i className="is-mismatch" /> mismatch</span>
          <span><i className="is-gap" /> insertion/deletion</span>
        </footer>
      </section>
    </div>
  )
}

import { useTraceAlignment } from '../presentation/hooks/traceAlignmentContext'
import { useCallback, useEffect, useRef, useState, type Dispatch, type DragEvent, type SetStateAction } from 'react'
import { Eye, Upload, X } from 'lucide-react'
import { appendAlignedTraceFiles, appendAlignedTraceFromText } from '../domain/traceFileWorkflow'
import type { TraceFileRecord } from '../domain/traceTypes'
import { bytesToFile, subscribeDesktopFileDrops } from '../desktop/fileIo'
import { isTauriRuntime } from '../desktop/tauriRuntime'
import { SEQUENCE_OPEN_ACCEPT } from '../domain/fileFormats'
import { desktopDropHitsElement } from '../desktop/desktopDropTarget'
import { startLibraryMemberGroupPointerDrag, LIBRARY_MEMBER_DROP_ATTR } from '../domain/libraryMemberGroupDrag'

export const alignmentSidebarWidthPx = 360

const alignmentTraceAccept = `.ab1,${SEQUENCE_OPEN_ACCEPT}`

type AlignmentTraceFileListProps = {
  templateSequence: string
  topology?: 'circular' | 'linear'
  traceFiles: TraceFileRecord[]
  onTraceFilesChange: Dispatch<SetStateAction<TraceFileRecord[]>>
  onTracesAdded?: (result: { scrollTemplateIndex?: number; scrollToTraceId?: string }) => void
  onTraceNavigate?: (traceId: string) => void
  /** Open one alignment in the standalone Trace Viewer, preserving alignment context. */
  onViewTrace?: (traceId: string) => void
  /** Highlight the currently selected alignment / library member in the list. */
  selectedTraceId?: string | null
  onPickFromDatabase?: () => void
  onStatus?: (message: string | null) => void
  traceAlignBusy?: boolean
  className?: string
  /**
   * When false, the parent workspace owns OS / HTML5 file drops (browse input still works).
   * Default true for standalone use of this panel.
   */
  acceptOsFileDrops?: boolean
  mode?: 'trace' | 'comparative'
  isLibrary?: boolean
  onGroupLibraryMembers?: (memberIds: string[], options?: { keepMemberId?: string }) => void
}

export function AlignmentTraceFileList({
  templateSequence,
  topology = 'linear',
  traceFiles,
  onTraceFilesChange,
  onTracesAdded,
  onTraceNavigate,
  onViewTrace,
  selectedTraceId = null,
  onPickFromDatabase,
  onStatus,
  traceAlignBusy = false,
  className,
  acceptOsFileDrops = true,
  mode = 'trace',
  isLibrary = false,
  onGroupLibraryMembers,
}: AlignmentTraceFileListProps) {
  const alignPending = useTraceAlignment()
  const [dragActive, setDragActive] = useState(false)
  const [busy, setBusy] = useState(false)
  const [pasteText, setPasteText] = useState('')
  const [dropTargetMemberId, setDropTargetMemberId] = useState<string | null>(null)
  const suppressNameClickRef = useRef(false)
  const listRef = useRef<HTMLDivElement | null>(null)
  const allEnabled = traceFiles.length > 0 && traceFiles.every((trace) => trace.enabled)
  const dropTargetRef = useRef<HTMLElement | null>(null)

  const applyAddedTraces = useCallback(
    (result: Awaited<ReturnType<typeof appendAlignedTraceFiles>>, emptyMessage: string, successLabel: string) => {
      if (!result.addedCount) {
        onStatus?.(emptyMessage)
        return false
      }
      onTraceFilesChange(result.traces)
      onTracesAdded?.({
        scrollTemplateIndex: result.scrollTemplateIndex,
        scrollToTraceId: result.scrollToTraceId,
      })
      onStatus?.(successLabel)
      return true
    },
    [onStatus, onTraceFilesChange, onTracesAdded],
  )

  const addTraceFiles = useCallback(
    async (files: FileList | File[]) => {
      if (busy) return
      const acceptedFiles = mode === 'comparative'
        ? Array.from(files).filter((file) => !/\.ab1$/i.test(file.name))
        : files
      setBusy(true)
      onStatus?.('Parsing files…')
      try {
        const result = await appendAlignedTraceFiles(acceptedFiles, templateSequence, traceFiles, { topology, alignPending })
        applyAddedTraces(
          result,
          'No supported trace or sequence files found',
          `Added ${result.addedCount} alignment${result.addedCount === 1 ? '' : 's'}`,
        )
      } finally {
        setBusy(false)
      }
    },
    [alignPending, applyAddedTraces, busy, mode, onStatus, templateSequence, topology, traceFiles],
  )

  const addTraceFilesRef = useRef(addTraceFiles)
  useEffect(() => {
    addTraceFilesRef.current = addTraceFiles
  }, [addTraceFiles])

  // Tauri webviews do not deliver Finder/Explorer files to HTML5 onDrop.
  useEffect(() => {
    if (!acceptOsFileDrops || !isTauriRuntime()) return
    let cancelled = false
    let unlisten: (() => void) | undefined
    void subscribeDesktopFileDrops({
      onHoverChange: (active, position) => {
        if (cancelled) return
        if (!active) {
          setDragActive(false)
          return
        }
        setDragActive(desktopDropHitsElement(dropTargetRef.current, position))
      },
      onFiles: async (opened, position) => {
        if (!desktopDropHitsElement(dropTargetRef.current, position)) return
        const files = opened.map((file) => bytesToFile(file.name, file.bytes))
        if (files.length) await addTraceFilesRef.current(files)
      },
    }).then((stop) => {
      if (cancelled) {
        stop()
        return
      }
      unlisten = stop
    })
    return () => {
      cancelled = true
      unlisten?.()
    }
  }, [acceptOsFileDrops])

  useEffect(() => {
    if (!selectedTraceId) return
    const list = listRef.current
    if (!list) return
    const item = list.querySelector<HTMLElement>(`[data-trace-id="${CSS.escape(selectedTraceId)}"]`)
    item?.scrollIntoView({ block: 'nearest' })
  }, [selectedTraceId])

  const addPastedSequence = useCallback(async () => {
    if (busy) return
    const text = pasteText.trim()
    if (!text) {
      onStatus?.('Paste a sequence to align')
      return
    }
    setBusy(true)
    onStatus?.('Aligning pasted sequence…')
    try {
      const result = await appendAlignedTraceFromText(text, 'Pasted sequence', templateSequence, traceFiles, {
        topology,
        alignPending,
      })
      if (applyAddedTraces(result, 'Paste a sequence to align', 'Added pasted sequence')) {
        setPasteText('')
      }
    } finally {
      setBusy(false)
    }
  }, [applyAddedTraces, busy, onStatus, pasteText, templateSequence, topology, traceFiles, alignPending])

  function toggleEnabled(traceId: string) {
    const target = traceFiles.find((trace) => trace.id === traceId)
    const enabling = Boolean(target && !target.enabled)
    onTraceFilesChange((current) =>
      current.map((trace) =>
        trace.id === traceId ? { ...trace, enabled: !trace.enabled } : trace,
      ),
    )
    if (enabling && target?.alignment) {
      onTraceNavigate?.(traceId)
    }
  }

  function toggleAllEnabled() {
    const nextEnabled = !allEnabled
    onTraceFilesChange((current) =>
      current.map((trace) => ({
        ...trace,
        enabled: nextEnabled,
        expanded: nextEnabled ? trace.expanded : false,
      })),
    )
  }

  function removeTrace(traceId: string) {
    onTraceFilesChange((current) => current.filter((trace) => trace.id !== traceId))
  }

  function handleDrop(event: DragEvent) {
    event.preventDefault()
    setDragActive(false)
    if (!acceptOsFileDrops || isTauriRuntime()) return
    if (event.dataTransfer.files?.length) void addTraceFiles(event.dataTransfer.files)
  }

  return (
    <aside
      ref={dropTargetRef}
      className={className ?? 'alignment-trace-file-list'}
    >
      <div className="alignment-panel-title-row">
        <div className="alignment-panel-title">
          {mode === 'comparative' ? 'Compare sequences:' : 'Verify with traces:'}
        </div>
        {traceFiles.length > 0 ? (
          <button type="button" className="alignment-toggle-all-button" onClick={toggleAllEnabled}>
            {allEnabled ? 'Uncheck all' : 'Check all'}
          </button>
        ) : null}
      </div>
      <label
        className={`alignment-dropzone${dragActive ? ' is-drag-active' : ''}`}
        onDragEnter={(event) => {
          if (!acceptOsFileDrops || isTauriRuntime()) return
          event.preventDefault()
          setDragActive(true)
        }}
        onDragOver={(event) => {
          if (!acceptOsFileDrops || isTauriRuntime()) return
          event.preventDefault()
        }}
        onDragLeave={() => {
          if (acceptOsFileDrops && !isTauriRuntime()) setDragActive(false)
        }}
        onDrop={handleDrop}
      >
        <Upload size={14} />
        <span>Drop files or browse</span>
        <input
          type="file"
          accept={mode === 'comparative' ? SEQUENCE_OPEN_ACCEPT : alignmentTraceAccept}
          multiple
          hidden
          onChange={(event) => {
            if (event.target.files?.length) void addTraceFiles(event.target.files)
            event.target.value = ''
          }}
        />
      </label>
      {onPickFromDatabase ? (
        <button
          type="button"
          className="alignment-from-database-button"
          disabled={busy || traceAlignBusy}
          onClick={onPickFromDatabase}
        >
          From Database…
        </button>
      ) : null}
      <div className="alignment-paste-block">
        <label className="alignment-paste-label" htmlFor="alignment-paste-sequence">
          Paste sequence
        </label>
        <textarea
          id="alignment-paste-sequence"
          className="alignment-paste-input"
          rows={3}
          placeholder="ATGC…, FASTA, or GenBank"
          value={pasteText}
          onChange={(event) => setPasteText(event.target.value)}
          onKeyDown={(event) => {
            if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
              event.preventDefault()
              void addPastedSequence()
            }
          }}
        />
        <button type="button" className="alignment-paste-button" disabled={busy || !pasteText.trim()} onClick={() => void addPastedSequence()}>
          Align pasted sequence
        </button>
      </div>
      <div className="alignment-format-note">
        {mode === 'comparative'
          ? '.seq, GenBank, EMBL, FASTA, ApE, SnapGene .dna'
          : '.ab1, .seq, GenBank, EMBL, FASTA, ApE, SnapGene .dna'}
      </div>
      <div className="alignment-file-list" ref={listRef}>
        {traceFiles.length === 0 && (
          <div className="alignment-empty-note">
            {mode === 'comparative' ? 'No comparison sequences loaded' : 'No trace alignments loaded'}
          </div>
        )}
        {traceFiles.map((trace) => {
          const canGroupDrag = Boolean(isLibrary && onGroupLibraryMembers)
          const selected = selectedTraceId === trace.id
          return (
            <div
              key={trace.id}
              data-trace-id={trace.id}
              className={`alignment-file-item${selected ? ' is-selected' : ''}${trace.parseError ? ' has-error' : ''}${dropTargetMemberId === trace.id ? ' is-drop-target' : ''}${canGroupDrag ? ' is-draggable' : ''}`}
              aria-current={selected ? 'true' : undefined}
              title={
                canGroupDrag
                  ? `${trace.parseError ?? trace.fileName} · drag onto another member to group`
                  : (trace.parseError ?? trace.fileName)
              }
              {...{ [LIBRARY_MEMBER_DROP_ATTR]: trace.id }}
            >
              <input
                type="checkbox"
                checked={trace.enabled}
                onChange={() => toggleEnabled(trace.id)}
                aria-label={`Show ${trace.fileName}`}
                onPointerDown={(event) => event.stopPropagation()}
              />
              {canGroupDrag ? (
                <span
                  className="alignment-file-name"
                  role="button"
                  tabIndex={0}
                  title="Drag onto another member to group as one clone · click to select"
                  onPointerDown={(event) => {
                    if (event.button !== 0 || !onGroupLibraryMembers) return
                    event.preventDefault()
                    event.stopPropagation()
                    startLibraryMemberGroupPointerDrag({
                      sourceId: trace.id,
                      clientX: event.clientX,
                      clientY: event.clientY,
                      onDropTargetChange: setDropTargetMemberId,
                      onActivated: () => {
                        suppressNameClickRef.current = true
                      },
                      onGroup: (targetId, sourceId) => {
                        onGroupLibraryMembers([targetId, sourceId], { keepMemberId: targetId })
                      },
                    })
                  }}
                  onClick={() => {
                    if (suppressNameClickRef.current) {
                      suppressNameClickRef.current = false
                      return
                    }
                    onTraceNavigate?.(trace.id)
                  }}
                  onKeyDown={(event) => {
                    if (event.key !== 'Enter' && event.key !== ' ') return
                    event.preventDefault()
                    onTraceNavigate?.(trace.id)
                  }}
                >
                  {trace.fileName}
                  {(trace.reads?.length ?? 0) > 1 ? ` (${trace.reads!.length} reads)` : ''}
                </span>
              ) : (
                <button type="button" className="alignment-file-name" onClick={() => onTraceNavigate?.(trace.id)}>
                  {trace.fileName}
                  {(trace.reads?.length ?? 0) > 1 ? ` (${trace.reads!.length} reads)` : ''}
                </button>
              )}
              <div className="alignment-file-actions">
                {mode === 'trace' ? (
                  <button
                    type="button"
                    className="alignment-file-view"
                    onClick={() => onViewTrace?.(trace.id)}
                    aria-label={`View ${trace.fileName} in trace viewer`}
                    title="View chromatogram in trace viewer"
                    disabled={Boolean(trace.parseError) || trace.sequence.length === 0}
                    onPointerDown={(event) => event.stopPropagation()}
                  >
                    <Eye size={14} />
                  </button>
                ) : null}
                <button
                  type="button"
                  className="alignment-file-remove"
                  onClick={() => removeTrace(trace.id)}
                  aria-label={`Remove ${trace.fileName}`}
                  title="Remove alignment"
                  onPointerDown={(event) => event.stopPropagation()}
                >
                  <X size={14} />
                </button>
              </div>
            </div>
          )
        })}
      </div>
      {busy || traceAlignBusy ? <div className="alignment-empty-note">Working…</div> : null}
    </aside>
  )
}

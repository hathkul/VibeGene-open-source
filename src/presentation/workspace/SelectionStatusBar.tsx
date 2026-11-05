import { useEffect, useState, useSyncExternalStore } from 'react'
import {
  cancelOperationProgress,
  getOperationProgress,
  subscribeOperationProgress,
} from '../../domain/operationProgress'

function OperationProgressIndicator() {
  const operation = useSyncExternalStore(
    subscribeOperationProgress,
    getOperationProgress,
    getOperationProgress,
  )
  const operationId = operation?.id ?? null
  const [visibleId, setVisibleId] = useState<number | null>(null)
  useEffect(() => {
    if (operationId === null) return
    // Short tasks should not flash a progress bar; long tasks remain visible.
    const timer = window.setTimeout(() => setVisibleId(operationId), 1000)
    return () => window.clearTimeout(timer)
  }, [operationId])
  if (!operation || operation.id !== visibleId) return null
  const total = operation.total ?? 0
  const hasTotal = total > 0
  return (
    <div className="selection-bar-progress" role="status" aria-live="polite">
      <span className="selection-bar-progress-label" title={operation.label}>{operation.label}</span>
      <progress
        aria-label={operation.label}
        max={hasTotal ? total : undefined}
        value={hasTotal ? Math.min(operation.completed, total) : undefined}
      />
      {operation.detail && (
        <span className="selection-bar-progress-detail">{operation.detail}</span>
      )}
      {operation.cancellable && (
        <button type="button" onClick={() => cancelOperationProgress(operation.id)}>
          Cancel
        </button>
      )}
    </div>
  )
}

export type SelectionStatusBarProps = {
  isDirty: boolean
  /** Present when the map zoom readout is visible; hides length/GC spans. */
  zoom: { zoomedLengthLabel: string; rangeLabel: string } | null
  summary: string
  sequenceLengthLabel: string
  gcLabel: string | null
  /** Present only for the Sequence workspace on DNA records. */
  counts: { features: number; primerBindings: number; visibleEnzymeSites: number } | null
  statusEcho: string
  attentionKey: number
}

/**
 * Selection/status bar shell. Receives pre-computed labels from App so the
 * component preserves the exact DOM order, class names, and accessibility
 * attributes of the inline version it replaces.
 */
export function SelectionStatusBar({
  isDirty,
  zoom,
  summary,
  sequenceLengthLabel,
  gcLabel,
  counts,
  statusEcho,
  attentionKey,
}: SelectionStatusBarProps) {
  return (
    <section className={`selection-bar${isDirty ? ' selection-bar-unsaved' : ''}`}>
      {zoom ? (
        <>
          <span>
            Zoom: {zoom.zoomedLengthLabel}
          </span>
          <span>{zoom.rangeLabel}</span>
        </>
      ) : null}
      <span>{summary}</span>
      {zoom ? null : (
        <>
          <span>{sequenceLengthLabel}</span>
          {gcLabel !== null ? <span>{gcLabel}</span> : null}
        </>
      )}
      {counts ? (
        <span>
          {counts.features.toLocaleString()} features, {counts.primerBindings.toLocaleString()} primer
          bindings, {counts.visibleEnzymeSites.toLocaleString()} visible enzyme sites
        </span>
      ) : null}
      <OperationProgressIndicator />
      <span
        key={attentionKey}
        className={`selection-bar-status${attentionKey > 0 ? ' is-attention' : ''}`}
      >
        {statusEcho}
      </span>
    </section>
  )
}

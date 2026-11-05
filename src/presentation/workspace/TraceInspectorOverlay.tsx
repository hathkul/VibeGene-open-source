import { useMemo } from 'react'
import { TraceViewer } from '../../TraceViewer'
import { displayedTraceSelectionForTemplateRange } from '../../domain/traceAlignmentSelection'
import type { TraceFileRecord } from '../../domain/traceTypes'

export type TraceInspectorTarget = {
  trace: TraceFileRecord
  /** Template-coordinate span the workspace currently selects, if any. */
  templateRange: { start: number; end: number } | null
}

/**
 * Dedicated Trace Viewer for one alignment. The opening orientation matches the
 * read's aligned strand and the current template selection is mapped into the
 * viewer's own ordinals, so the inspected locus is selected and revealed.
 */
export function TraceInspectorOverlay({ target, onClose }: { target: TraceInspectorTarget; onClose: () => void }) {
  const { trace, templateRange } = target
  const context = useMemo(
    () => (templateRange
      ? displayedTraceSelectionForTemplateRange(
        trace.alignment,
        trace.sequence.length,
        templateRange.start,
        templateRange.end,
      )
      : null),
    [templateRange, trace.alignment, trace.sequence.length],
  )
  return (
    <div className="trace-inspector-backdrop" role="presentation" onPointerDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="trace-inspector-dialog" role="dialog" aria-modal="true" aria-label={`Trace viewer: ${trace.fileName}`}>
        <TraceViewer
          key={trace.id}
          trace={trace}
          onClose={onClose}
          initialDirection={context?.direction}
          initialSelection={context?.selection ?? null}
        />
      </section>
    </div>
  )
}

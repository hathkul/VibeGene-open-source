import { parseAlignmentTraceFiles, parseAlignmentTraceText } from './alignmentTraceImport'
import { alignTraceToTemplate } from './traceAlignment'
import type { TraceFileRecord, TraceTemplateAlignment } from './traceTypes'
import type { Primer, SequenceFeature } from './types'

export type AppendAlignedTraceFilesResult = {
  traces: TraceFileRecord[]
  addedCount: number
  addedTraceIds: string[]
  scrollTemplateIndex?: number
  scrollToTraceId?: string
}

export type AlignedTraceSequenceEntry = {
  name: string
  sequence: string
  features?: SequenceFeature[]
  primers?: Primer[]
}

export function alignmentViewportTemplateIndex(alignment: TraceTemplateAlignment) {
  if (alignment.orientation === 'reverse') {
    return Math.max(alignment.templateStart, alignment.templateEnd - 1)
  }
  return alignment.templateStart
}

export type TemplateCoverageSpan = { start: number; end: number }

/** Merge template spans covered by enabled, aligned trace reads (for minimap coverage strip). */
export function enabledAlignmentCoverageSpans(
  traces: TraceFileRecord[],
  sequenceLength: number,
): TemplateCoverageSpan[] {
  const spans = traces
    .filter((trace) => trace.enabled && !trace.parseError && trace.alignment)
    .map((trace) => ({
      start: Math.max(0, trace.alignment!.templateStart),
      end: Math.min(sequenceLength, trace.alignment!.templateEnd),
    }))
    .filter((span) => span.end > span.start)
    .toSorted((a, b) => a.start - b.start || a.end - b.end)

  const merged: TemplateCoverageSpan[] = []
  for (const span of spans) {
    const last = merged[merged.length - 1]
    if (!last || span.start > last.end) {
      merged.push({ start: span.start, end: span.end })
    } else {
      last.end = Math.max(last.end, span.end)
    }
  }
  return merged
}

export function leftmostAlignedTrace(traces: TraceFileRecord[]): TraceFileRecord | null {
  const aligned = traces.filter((trace) => trace.alignment && !trace.parseError)
  if (!aligned.length) return null
  return aligned.toSorted(
    (a, b) =>
      a.alignment!.templateStart - b.alignment!.templateStart ||
      a.alignment!.templateEnd - b.alignment!.templateEnd ||
      a.fileName.localeCompare(b.fileName),
  )[0]
}

function alignTraceRecord(
  trace: TraceFileRecord,
  templateSequence: string,
  options?: { topology?: 'circular' | 'linear' },
): TraceFileRecord {
  try {
    const alignment = alignTraceToTemplate(trace.sequence, templateSequence, {
      topology: options?.topology,
    })
    if (!alignment) {
      return { ...trace, alignment: null, parseError: 'No alignment to reference found' }
    }
    return { ...trace, alignment, parseError: undefined }
  } catch {
    return { ...trace, alignment: null, parseError: 'Alignment failed (sequence may be too long)' }
  }
}

function abortError() {
  return new DOMException('Aborted', 'AbortError')
}

function yieldForAlignment(signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortError())
      return
    }
    const timer = globalThis.setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      if (signal?.aborted) {
        reject(abortError())
        return
      }
      resolve()
    }, 0)
    const onAbort = () => {
      globalThis.clearTimeout(timer)
      reject(abortError())
    }
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

/** Align on the calling thread when no execution capability was supplied. */
export async function alignPendingTraces(
  traces: TraceFileRecord[],
  templateSequence: string,
  topology?: 'circular' | 'linear',
  signal?: AbortSignal,
  onProgress?: (completed: number, total: number) => void,
): Promise<TraceFileRecord[]> {
  const aligned: TraceFileRecord[] = []
  for (const trace of traces) {
    await yieldForAlignment(signal)
    aligned.push(alignTraceRecord(trace, templateSequence, { topology }))
    onProgress?.(aligned.length, traces.length)
  }
  return aligned
}

export type AlignPendingTraces = typeof alignPendingTraces

export function realignTraceFileRecords(
  traces: TraceFileRecord[],
  templateSequence: string,
  options?: { force?: boolean; topology?: 'circular' | 'linear' },
): TraceFileRecord[] {
  return traces.map((trace) => {
    if (trace.parseError) return trace
    if (!options?.force && trace.alignment) return trace
    return alignTraceRecord(trace, templateSequence, { topology: options?.topology })
  })
}

export async function realignTraceFileRecordsAsync(
  traces: TraceFileRecord[],
  templateSequence: string,
  options?: {
    force?: boolean
    topology?: 'circular' | 'linear'
    signal?: AbortSignal
    onProgress?: (completed: number, total: number) => void
    alignPending?: AlignPendingTraces
  },
): Promise<TraceFileRecord[]> {
  if (options?.signal?.aborted) throw abortError()
  const pending = traces.filter((trace) => !trace.parseError && (options?.force || !trace.alignment))
  if (!pending.length) return traces
  const aligned = await (options?.alignPending ?? alignPendingTraces)(
    pending,
    templateSequence,
    options?.topology,
    options?.signal,
    options?.onProgress,
  )
  let alignedIndex = 0
  return traces.map((trace) =>
    trace.parseError || (!options?.force && trace.alignment)
      ? trace
      : aligned[alignedIndex++]!,
  )
}

async function alignAndAppendTraces(
  parsed: TraceFileRecord[],
  templateSequence: string,
  current: TraceFileRecord[],
  options?: { topology?: 'circular' | 'linear'; alignPending?: AlignPendingTraces },
): Promise<AppendAlignedTraceFilesResult> {
  if (!parsed.length) {
    return { traces: current, addedCount: 0, addedTraceIds: [] }
  }

  const aligned = await realignTraceFileRecordsAsync(parsed, templateSequence, { topology: options?.topology, alignPending: options?.alignPending })

  const allTraces = [...current, ...aligned]
  const leftmost = leftmostAlignedTrace(allTraces)
  return {
    traces: allTraces,
    addedCount: aligned.length,
    addedTraceIds: aligned.map((trace) => trace.id),
    scrollTemplateIndex: leftmost?.alignment ? alignmentViewportTemplateIndex(leftmost.alignment) : undefined,
    scrollToTraceId: leftmost?.id,
  }
}

export async function appendAlignedTraceFiles(
  files: FileList | File[],
  templateSequence: string,
  current: TraceFileRecord[],
  options?: { topology?: 'circular' | 'linear'; alignPending?: AlignPendingTraces },
): Promise<AppendAlignedTraceFilesResult> {
  const parsed = await parseAlignmentTraceFiles(files)
  return alignAndAppendTraces(parsed, templateSequence, current, options)
}

export async function appendAlignedTraceFromText(
  text: string,
  fileName: string,
  templateSequence: string,
  current: TraceFileRecord[],
  options?: { topology?: 'circular' | 'linear'; alignPending?: AlignPendingTraces },
): Promise<AppendAlignedTraceFilesResult> {
  const parsed = parseAlignmentTraceText(text, fileName)
  if (!parsed) {
    return { traces: current, addedCount: 0, addedTraceIds: [] }
  }
  return alignAndAppendTraces([parsed], templateSequence, current, options)
}

/** Align plain nucleotide sequences (e.g. Database constructs) against the template. */
export async function appendAlignedTracesFromSequences(
  entries: readonly AlignedTraceSequenceEntry[],
  templateSequence: string,
  current: TraceFileRecord[],
  options?: { topology?: 'circular' | 'linear'; alignPending?: AlignPendingTraces },
): Promise<AppendAlignedTraceFilesResult> {
  const parsed = entries.flatMap((entry) => {
    const trace = parseAlignmentTraceText(entry.sequence, entry.name)
    if (!trace) return []
    const features = entry.features?.length ? entry.features : undefined
    const primers = entry.primers?.length ? entry.primers : undefined
    return [{
      ...trace,
      features,
      primers,
      showAnnotations: Boolean(features?.length || primers?.length),
    }]
  })
  if (!parsed.length) {
    return { traces: current, addedCount: 0, addedTraceIds: [] }
  }
  return alignAndAppendTraces(parsed, templateSequence, current, options)
}

export function toggleTraceFileEnabled(traces: TraceFileRecord[], traceId: string): TraceFileRecord[] {
  return traces.map((trace) =>
    trace.id === traceId ? { ...trace, enabled: !trace.enabled } : trace,
  )
}

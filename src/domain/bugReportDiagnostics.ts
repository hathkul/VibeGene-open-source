import type { OpenTabSummary } from '../crossTab/types'
import type { SequenceRecord } from './types'

const STATUS_HISTORY_MAX = 40
const SEQUENCE_HEAD = 500
const SEQUENCE_TAIL = 500
const MAX_DIAGNOSTICS_CHARS = 180_000

export type BugReportAppSnapshot = {
  appVersion: string
  platformHint?: string
  current: {
    name: string
    length: number
    topology: string
    molecule: string
    featureCount: number
    primerCount: number
    undoDepth: number
    redoDepth: number
    selection: string | null
    mapLinear: boolean
    mapZoom: boolean
  }
  otherTabs: Array<{ name: string; length: number; stale?: boolean }>
  openDialogs: string[]
}

export function appendStatusHistory(history: string[], message: string, at = Date.now()): string[] {
  const trimmed = message.trim()
  if (!trimmed) return history
  const stamp = new Date(at).toISOString().replace(/\.\d{3}Z$/, 'Z')
  const next = [...history, `${stamp}  ${trimmed}`]
  return next.length > STATUS_HISTORY_MAX ? next.slice(-STATUS_HISTORY_MAX) : next
}

export function truncateSequenceForReport(sequence: string): string {
  const seq = sequence.replace(/\s+/g, '').toUpperCase()
  if (seq.length <= SEQUENCE_HEAD + SEQUENCE_TAIL + 20) return seq
  const omitted = seq.length - SEQUENCE_HEAD - SEQUENCE_TAIL
  return `${seq.slice(0, SEQUENCE_HEAD)}…[${omitted} bp omitted]…${seq.slice(-SEQUENCE_TAIL)}`
}

export function buildBugReportAppSnapshot(input: {
  appVersion: string
  record: SequenceRecord
  otherOpenTabs: OpenTabSummary[]
  selectedRange: { start: number; end: number } | null
  undoDepth: number
  redoDepth: number
  mapLinear: boolean
  mapZoom: boolean
  openDialogs: string[]
}): BugReportAppSnapshot {
  const { record } = input
  const selection =
    input.selectedRange && input.selectedRange.end !== input.selectedRange.start
      ? `${input.selectedRange.start + 1}–${input.selectedRange.end} (${Math.abs(
          input.selectedRange.end - input.selectedRange.start,
        )} bp)`
      : input.selectedRange
        ? `caret ${input.selectedRange.start + 1}`
        : null

  return {
    appVersion: input.appVersion,
    current: {
      name: record.name || '(untitled)',
      length: record.sequence.length,
      topology: record.topology,
      molecule: record.molecule,
      featureCount: record.features?.length ?? 0,
      primerCount: record.primers?.length ?? 0,
      undoDepth: input.undoDepth,
      redoDepth: input.redoDepth,
      selection,
      mapLinear: input.mapLinear,
      mapZoom: input.mapZoom,
    },
    otherTabs: input.otherOpenTabs.map((tab) => ({
      name: tab.name,
      length: tab.sequenceLength,
      stale: tab.stale,
    })),
    openDialogs: input.openDialogs,
  }
}

export function formatBugReportDiagnostics(input: {
  includeDiagnostics: boolean
  includeSequences: boolean
  statusHistory: string[]
  recentStatus?: string
  snapshot?: BugReportAppSnapshot | null
  currentSequence?: string
  otherSequences?: Array<{ name: string; sequence: string }>
}): string {
  if (!input.includeDiagnostics && !input.includeSequences) return ''

  const sections: string[] = []

  if (input.includeDiagnostics) {
    if (input.snapshot) {
      sections.push('## App snapshot')
      sections.push(JSON.stringify(input.snapshot, null, 2))
    }
    const history = input.statusHistory.length
      ? input.statusHistory
      : input.recentStatus?.trim()
        ? [input.recentStatus.trim()]
        : []
    if (history.length) {
      sections.push('## Status history (newest last)')
      sections.push(history.join('\n'))
    }
  }

  if (input.includeSequences) {
    sections.push('## Open sequences (truncated; user opted in)')
    if (input.currentSequence != null) {
      const name = input.snapshot?.current.name || 'current'
      const len = input.currentSequence.replace(/\s+/g, '').length
      sections.push(`### ${name} (${len.toLocaleString()} bp)`)
      sections.push(truncateSequenceForReport(input.currentSequence))
    }
    for (const other of input.otherSequences ?? []) {
      const len = other.sequence.replace(/\s+/g, '').length
      sections.push(`### ${other.name} (${len.toLocaleString()} bp)`)
      sections.push(truncateSequenceForReport(other.sequence))
    }
  }

  const text = sections.join('\n\n').trim()
  if (text.length <= MAX_DIAGNOSTICS_CHARS) return text
  return `${text.slice(0, MAX_DIAGNOSTICS_CHARS)}\n\n…[diagnostics truncated]`
}

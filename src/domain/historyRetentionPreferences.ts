import type {
  AncestorTraceRetention,
  DnaHistoryRetentionMode,
  ProteinSourceDnaRetentionMode,
} from './historyRetention'

const STORAGE_KEY = 'vibegene:history-retention-defaults:v1'

export type HistoryRetentionDefaults = {
  nativeMode: DnaHistoryRetentionMode
  nativeGenerations: number
  sourceMode: ProteinSourceDnaRetentionMode
  sourceGenerations: number
  traceMode: AncestorTraceRetention['mode']
  traceGenerations: number
  clearOperationLog: boolean
  recoveryDays: number
}

export const DEFAULT_HISTORY_RETENTION_DEFAULTS: HistoryRetentionDefaults = {
  nativeMode: 'complete',
  nativeGenerations: 1,
  sourceMode: 'complete',
  sourceGenerations: 1,
  traceMode: 'complete',
  traceGenerations: 1,
  clearOperationLog: false,
  recoveryDays: 7,
}

const nativeModes = new Set<DnaHistoryRetentionMode>([
  'complete', 'generations', 'tree-only', 'current-only',
])
const sourceModes = new Set<ProteinSourceDnaRetentionMode>([
  'complete', 'generations', 'current-dna', 'cds-only', 'reference-only', 'remove',
])
const traceModes = new Set<AncestorTraceRetention['mode']>(['complete', 'generations', 'remove'])

function generations(value: unknown, fallback: number) {
  const number = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(number) ? Math.max(0, Math.min(1000, Math.floor(number))) : fallback
}

function recoveryDays(value: unknown) {
  return Math.min(365, generations(value, DEFAULT_HISTORY_RETENTION_DEFAULTS.recoveryDays))
}

export function normalizeHistoryRetentionDefaults(
  value?: Partial<HistoryRetentionDefaults> | null,
): HistoryRetentionDefaults {
  const defaults = DEFAULT_HISTORY_RETENTION_DEFAULTS
  return {
    nativeMode: nativeModes.has(value?.nativeMode as DnaHistoryRetentionMode)
      ? value!.nativeMode!
      : defaults.nativeMode,
    nativeGenerations: generations(value?.nativeGenerations, defaults.nativeGenerations),
    sourceMode: sourceModes.has(value?.sourceMode as ProteinSourceDnaRetentionMode)
      ? value!.sourceMode!
      : defaults.sourceMode,
    sourceGenerations: generations(value?.sourceGenerations, defaults.sourceGenerations),
    traceMode: traceModes.has(value?.traceMode as AncestorTraceRetention['mode'])
      ? value!.traceMode!
      : defaults.traceMode,
    traceGenerations: generations(value?.traceGenerations, defaults.traceGenerations),
    clearOperationLog: value?.clearOperationLog ?? defaults.clearOperationLog,
    recoveryDays: recoveryDays(value?.recoveryDays),
  }
}

export function readHistoryRetentionDefaults(): HistoryRetentionDefaults {
  if (typeof window === 'undefined') return { ...DEFAULT_HISTORY_RETENTION_DEFAULTS }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    return raw
      ? normalizeHistoryRetentionDefaults(JSON.parse(raw) as Partial<HistoryRetentionDefaults>)
      : { ...DEFAULT_HISTORY_RETENTION_DEFAULTS }
  } catch {
    return { ...DEFAULT_HISTORY_RETENTION_DEFAULTS }
  }
}

export function writeHistoryRetentionDefaults(
  value: HistoryRetentionDefaults,
): HistoryRetentionDefaults {
  const normalized = normalizeHistoryRetentionDefaults(value)
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized))
    } catch {
      // Private browsing and quota failures should not block trimming.
    }
  }
  return normalized
}

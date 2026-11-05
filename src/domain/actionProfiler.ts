export type ActionProfileEntry = {
  id: number
  name: string
  ms: number
  group: string
  detail?: string
  at: number
}

export type ActionProfileAggregate = {
  name: string
  group: string
  count: number
  totalMs: number
  maxMs: number
  avgMs: number
  lastDetail?: string
}

const entries: ActionProfileEntry[] = []
let nextEntryId = 0
let listeners: Array<() => void> = []

type PendingSequenceEdit = {
  expectedSequence: string
  started: number
  detail?: string
}

let pendingSequenceEdit: PendingSequenceEdit | null = null

/** Entries slower than this are highlighted and listed first. */
export const ACTION_PROFILE_SLOW_MS = 16

function notify() {
  listeners.forEach((listener) => listener())
}

function deferNotify(run: () => void) {
  if (typeof queueMicrotask === 'function') {
    queueMicrotask(run)
    return
  }
  setTimeout(run, 0)
}

export function actionProfileEnabled(): boolean {
  if (typeof window === 'undefined') return false
  return new URLSearchParams(window.location.search).get('perf') === '1'
}

export function clearActionProfile() {
  entries.length = 0
  nextEntryId = 0
  pendingSequenceEdit = null
  notify()
}

/** Mark the start of a typed/pasted/deleted sequence edit; completed after paint. */
export function markSequenceEditStart(expectedSequence: string, detail?: string) {
  if (!actionProfileEnabled()) return
  pendingSequenceEdit = {
    expectedSequence,
    started: performance.now(),
    detail,
  }
}

/**
 * Call from a layout effect after `record.sequence` updates.
 * Records time from markSequenceEditStart → React commit, then → browser paint.
 */
export function flushSequenceEditLatency(currentSequence: string) {
  if (!actionProfileEnabled() || !pendingSequenceEdit) return
  if (pendingSequenceEdit.expectedSequence !== currentSequence) return

  const { started, detail } = pendingSequenceEdit
  pendingSequenceEdit = null

  const commitMs = performance.now() - started
  deferNotify(() => {
    recordAction('sequenceEditToCommit', commitMs, 'edit', detail)
  })

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      recordAction('sequenceEditToPaint', performance.now() - started, 'edit', detail)
    })
  })
}

export function recordAction(name: string, ms: number, group: string, detail?: string) {
  if (!actionProfileEnabled()) return
  entries.push({
    id: nextEntryId,
    name,
    ms,
    group,
    detail,
    at: performance.now(),
  })
  nextEntryId += 1
  notify()
}

export function actionProfileSync<T>(name: string, group: string, fn: () => T, detail?: string): T {
  if (!actionProfileEnabled()) return fn()
  const started = performance.now()
  const result = fn()
  const elapsedMs = performance.now() - started
  deferNotify(() => {
    recordAction(name, elapsedMs, group, detail)
  })
  return result
}

export async function actionProfileAsync<T>(name: string, group: string, fn: () => Promise<T>, detail?: string): Promise<T> {
  if (!actionProfileEnabled()) return fn()
  const started = performance.now()
  try {
    const result = await fn()
    const elapsedMs = performance.now() - started
    deferNotify(() => {
      recordAction(name, elapsedMs, group, detail)
    })
    return result
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error
    const elapsedMs = performance.now() - started
    deferNotify(() => {
      recordAction(name, elapsedMs, group, detail)
    })
    throw error
  }
}

export function getActionProfileEntries(): ActionProfileEntry[] {
  return [...entries]
}

export function getActionProfileAggregates(): ActionProfileAggregate[] {
  const byKey = new Map<string, ActionProfileAggregate>()
  for (const entry of entries) {
    const key = `${entry.group}\0${entry.name}`
    const existing = byKey.get(key)
    if (!existing) {
      byKey.set(key, {
        name: entry.name,
        group: entry.group,
        count: 1,
        totalMs: entry.ms,
        maxMs: entry.ms,
        avgMs: entry.ms,
        lastDetail: entry.detail,
      })
      continue
    }
    existing.count += 1
    existing.totalMs += entry.ms
    existing.maxMs = Math.max(existing.maxMs, entry.ms)
    existing.avgMs = existing.totalMs / existing.count
    if (entry.detail) existing.lastDetail = entry.detail
  }
  return [...byKey.values()].toSorted((a, b) => b.maxMs - a.maxMs || b.totalMs - a.totalMs)
}

export function actionProfileReport(title = 'Action profile') {
  if (!actionProfileEnabled() || entries.length === 0) return
  const aggregates = getActionProfileAggregates()
  const totalMs = aggregates.reduce((sum, row) => sum + row.totalMs, 0)
  console.groupCollapsed(`${title} (${aggregates.length} actions, ${totalMs.toFixed(1)} ms tracked)`)
  console.table(
    aggregates.map((row) => ({
      action: row.name,
      group: row.group,
      count: row.count,
      maxMs: Number(row.maxMs.toFixed(2)),
      avgMs: Number(row.avgMs.toFixed(2)),
      totalMs: Number(row.totalMs.toFixed(2)),
      detail: row.lastDetail ?? '',
    })),
  )
  const slow = [...entries].filter((entry) => entry.ms >= ACTION_PROFILE_SLOW_MS).toSorted((a, b) => b.ms - a.ms).slice(0, 30)
  if (slow.length > 0) {
    console.groupCollapsed(`Slow samples (≥ ${ACTION_PROFILE_SLOW_MS} ms)`)
    console.table(
      slow.map((entry) => ({
        action: entry.name,
        group: entry.group,
        ms: Number(entry.ms.toFixed(2)),
        detail: entry.detail ?? '',
      })),
    )
    console.groupEnd()
  }
  console.groupEnd()
}

export function subscribeActionProfile(listener: () => void) {
  listeners.push(listener)
  return () => {
    listeners = listeners.filter((item) => item !== listener)
  }
}

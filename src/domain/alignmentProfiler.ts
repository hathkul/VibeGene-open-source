import { actionProfileEnabled, recordAction } from './actionProfiler'

export type AlignmentProfileEntry = {
  id: number
  name: string
  ms: number
  group: string
  detail?: string
}

const marks = new Map<string, number>()
const entries: AlignmentProfileEntry[] = []
let nextEntryId = 0
let sessionId = 0
let listeners: Array<() => void> = []

function notify() {
  listeners.forEach((listener) => listener())
}

export function alignmentProfileEnabled(): boolean {
  if (typeof window === 'undefined') return false
  return new URLSearchParams(window.location.search).get('alignmentProfile') === '1'
}

export function beginAlignmentProfileSession(label = 'alignment-toggle'): number {
  if (!alignmentProfileEnabled()) return sessionId
  sessionId += 1
  entries.length = 0
  nextEntryId = 0
  marks.clear()
  alignmentProfileMark(`${label}-start`)
  return sessionId
}

export function alignmentProfileMark(name: string) {
  if (!alignmentProfileEnabled()) return
  marks.set(name, performance.now())
  try {
    performance.mark(name)
  } catch {
    // ignore duplicate marks in strict mode
  }
}

export function alignmentProfileMeasure(name: string, startMark: string, group: string, detail?: string) {
  if (!alignmentProfileEnabled()) return
  const started = marks.get(startMark)
  if (started === undefined) return
  recordAlignmentProfile(name, performance.now() - started, group, detail)
}

export function recordAlignmentProfile(name: string, ms: number, group: string, detail?: string) {
  if (!alignmentProfileEnabled()) return
  entries.push({ id: nextEntryId, name, ms, group, detail })
  nextEntryId += 1
  notify()
}

function deferAlignmentProfileNotify(run: () => void) {
  if (typeof queueMicrotask === 'function') {
    queueMicrotask(run)
    return
  }
  setTimeout(run, 0)
}

export function getAlignmentProfileEntries(): AlignmentProfileEntry[] {
  return [...entries]
}

export function alignmentProfileReport(title = 'Alignment profile') {
  if (!alignmentProfileEnabled() || entries.length === 0) return
  const sorted = [...entries].toSorted((a, b) => b.ms - a.ms)
  console.groupCollapsed(`${title} (${sorted.reduce((sum, entry) => sum + entry.ms, 0).toFixed(1)} ms tracked)`)
  console.table(
    sorted.map((entry) => ({
      task: entry.name,
      group: entry.group,
      ms: Number(entry.ms.toFixed(2)),
      detail: entry.detail ?? '',
    })),
  )
  console.groupEnd()
}

export function subscribeAlignmentProfile(listener: () => void) {
  listeners.push(listener)
  return () => {
    listeners = listeners.filter((item) => item !== listener)
  }
}

export function profileSync<T>(name: string, group: string, fn: () => T, detail?: string): T {
  const alignOn = alignmentProfileEnabled()
  const actionOn = actionProfileEnabled()
  if (!alignOn && !actionOn) return fn()
  const started = performance.now()
  const result = fn()
  const elapsedMs = performance.now() - started
  deferAlignmentProfileNotify(() => {
    if (alignOn) recordAlignmentProfile(name, elapsedMs, group, detail)
    if (actionOn) recordAction(name, elapsedMs, group, detail)
  })
  return result
}

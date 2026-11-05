import { parseWorkspaceDocumentOrigin, type WorkspaceDocumentOrigin } from '../domain/workspaceDocumentOrigin'

export const LIBRARY_CHANGED_EVENT = 'vibegene:library-changed'
const LIBRARY_CHANGED_CHANNEL = 'vibegene-library'
const HANDOFF_FOLDER_PREFIX = 'vibegene:history-folder:'
const HANDOFF_DISK_PATH_PREFIX = 'vibegene:history-disk-path:'
const HANDOFF_DOCUMENT_ORIGIN_PREFIX = 'vibegene:history-document-origin:'
/** Coalesce bulk saves (sync/import) into one cross-window refresh. */
const LIBRARY_CHANGED_DEBOUNCE_MS = 250
/** Ignore duplicate Event + BroadcastChannel delivery in the same window. */
const LIBRARY_CHANGED_SUBSCRIBE_MS = 50

const libraryNotifyOrigin =
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `vg-${Math.random().toString(36).slice(2)}`

let libraryChangedTimer = 0
let libraryChangedFlush: (() => void) | null = null
let libraryNotifyPauseDepth = 0
let libraryNotifyPausedDirty = false

function dispatchLibraryChangedNow() {
  const payload = { type: 'changed' as const, at: Date.now(), origin: libraryNotifyOrigin }
  try {
    window.dispatchEvent(new CustomEvent(LIBRARY_CHANGED_EVENT, { detail: payload }))
  } catch {
    // ignore
  }
  try {
    const channel = new BroadcastChannel(LIBRARY_CHANGED_CHANNEL)
    channel.postMessage(payload)
    channel.close()
  } catch {
    // ignore (older browsers / private mode)
  }
}

/**
 * Notify all windows/tabs that IndexedDB library rows changed.
 * Rapid calls (folder sync, bulk import) are debounced so Database only refreshes once.
 * When {@link pauseLibraryChangeNotifications} is active, notifies are deferred until resume.
 */
export function notifyLibraryChanged() {
  if (libraryNotifyPauseDepth > 0) {
    libraryNotifyPausedDirty = true
    return
  }
  if (typeof window === 'undefined') {
    dispatchLibraryChangedNow()
    return
  }
  window.clearTimeout(libraryChangedTimer)
  libraryChangedFlush = () => {
    libraryChangedFlush = null
    libraryChangedTimer = 0
    dispatchLibraryChangedNow()
  }
  libraryChangedTimer = window.setTimeout(libraryChangedFlush, LIBRARY_CHANGED_DEBOUNCE_MS)
}

/** Suppress debounced library refreshes during bulk sync/import (nestable). */
export function pauseLibraryChangeNotifications() {
  libraryNotifyPauseDepth += 1
}

/** Resume notifications; flushes once if anything changed while paused. */
export function resumeLibraryChangeNotifications() {
  libraryNotifyPauseDepth = Math.max(0, libraryNotifyPauseDepth - 1)
  if (libraryNotifyPauseDepth > 0 || !libraryNotifyPausedDirty) return
  libraryNotifyPausedDirty = false
  flushLibraryChanged()
}

/** Flush a pending debounced library notification immediately (e.g. end of sync). */
export function flushLibraryChanged() {
  if (libraryNotifyPauseDepth > 0) {
    libraryNotifyPausedDirty = true
    return
  }
  if (typeof window !== 'undefined') {
    window.clearTimeout(libraryChangedTimer)
    libraryChangedTimer = 0
  }
  libraryNotifyPausedDirty = false
  if (libraryChangedFlush) {
    libraryChangedFlush()
    return
  }
  dispatchLibraryChangedNow()
}

/** Subscribe to cross-window library mutations. Returns an unsubscribe. */
export function subscribeLibraryChanged(onChange: () => void): () => void {
  let timer = 0
  let lastOrigin: string | null = null
  const schedule = (origin: string | null) => {
    // Same-window notify fires both CustomEvent and BroadcastChannel; keep one refresh.
    if (origin && origin === lastOrigin && timer) return
    lastOrigin = origin
    if (typeof window === 'undefined') {
      onChange()
      return
    }
    window.clearTimeout(timer)
    timer = window.setTimeout(() => {
      timer = 0
      lastOrigin = null
      onChange()
    }, LIBRARY_CHANGED_SUBSCRIBE_MS)
  }

  const onEvent = (event: Event) => {
    const detail = (event as CustomEvent<{ origin?: string }>).detail
    schedule(detail?.origin ?? null)
  }
  window.addEventListener(LIBRARY_CHANGED_EVENT, onEvent)

  let channel: BroadcastChannel | null = null
  try {
    channel = new BroadcastChannel(LIBRARY_CHANGED_CHANNEL)
    channel.onmessage = (event) => {
      const origin =
        event.data && typeof event.data === 'object' && 'origin' in event.data
          ? String((event.data as { origin?: string }).origin ?? '')
          : null
      // Local window already handled the CustomEvent for our own posts.
      if (origin === libraryNotifyOrigin) return
      schedule(origin)
    }
  } catch {
    channel = null
  }

  return () => {
    window.removeEventListener(LIBRARY_CHANGED_EVENT, onEvent)
    if (typeof window !== 'undefined') window.clearTimeout(timer)
    try {
      channel?.close()
    } catch {
      // ignore
    }
  }
}

/** Persist folder home for a `?history=` handoff (`''` = Unfiled). */
export function writeHandoffFolderId(key: string, folderId: string | null | undefined) {
  if (folderId === undefined) return
  try {
    window.localStorage.setItem(HANDOFF_FOLDER_PREFIX + key, folderId ?? '')
  } catch {
    // ignore
  }
}

/** Consume one-shot folder handoff. Missing key → unknown. */
export function takeHandoffFolderId(key: string | null): string | null | undefined {
  if (!key) return undefined
  try {
    const raw = window.localStorage.getItem(HANDOFF_FOLDER_PREFIX + key)
    if (raw === null) return undefined
    window.localStorage.removeItem(HANDOFF_FOLDER_PREFIX + key)
    return raw === '' ? null : raw
  } catch {
    return undefined
  }
}

/** Persist absolute disk path for a construct opened from a local file via `?history=`. */
export function writeHandoffDiskPath(key: string, path: string | null | undefined) {
  const trimmed = path?.trim()
  if (!trimmed) return
  try {
    window.localStorage.setItem(HANDOFF_DISK_PATH_PREFIX + key, trimmed)
  } catch {
    // ignore
  }
}

/** Consume one-shot disk-path handoff. */
export function takeHandoffDiskPath(key: string | null): string | null {
  if (!key) return null
  try {
    const raw = window.localStorage.getItem(HANDOFF_DISK_PATH_PREFIX + key)
    window.localStorage.removeItem(HANDOFF_DISK_PATH_PREFIX + key)
    return raw?.trim() || null
  } catch {
    return null
  }
}

/** Persist the typed source binding beside a browser compact handoff. */
export function writeHandoffDocumentOrigin(key: string, origin: WorkspaceDocumentOrigin | undefined) {
  if (!origin) return
  try {
    window.localStorage.setItem(HANDOFF_DOCUMENT_ORIGIN_PREFIX + key, JSON.stringify(origin))
  } catch {
    // Handoff remains recoverable from IndexedDB when localStorage is unavailable.
  }
}

/** Consume one-shot typed source binding. Legacy handoffs return undefined. */
export function takeHandoffDocumentOrigin(key: string | null): WorkspaceDocumentOrigin | undefined {
  if (!key) return undefined
  try {
    const raw = window.localStorage.getItem(HANDOFF_DOCUMENT_ORIGIN_PREFIX + key)
    window.localStorage.removeItem(HANDOFF_DOCUMENT_ORIGIN_PREFIX + key)
    if (!raw) return undefined
    return parseWorkspaceDocumentOrigin(JSON.parse(raw)) ?? undefined
  } catch {
    return undefined
  }
}

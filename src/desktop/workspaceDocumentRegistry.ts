import { isTauriRuntime } from './tauriRuntime'

/** Identity for a construct that should occupy at most one workspace window. */
export type WorkspaceDocumentKey =
  | { kind: 'database'; projectId: string }
  | { kind: 'file'; path: string }

const REGISTRY_KEY = 'vibegene.openWorkspaceDocuments.v1'

type RegistryMap = Record<string, string>

function normalizeFilePath(path: string): string {
  return path.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase()
}

export function workspaceDocumentKeyId(key: WorkspaceDocumentKey): string {
  if (key.kind === 'database') return `db:${key.projectId}`
  return `file:${normalizeFilePath(key.path)}`
}

/** Stable Tauri webview label for a known document (alphanumeric + -_). */
export function workspaceWindowLabelFor(key: WorkspaceDocumentKey): string {
  if (key.kind === 'database') {
    const id = key.projectId.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 140)
    return `workspace-db-${id || 'project'}`
  }
  return `workspace-file-${hashString(normalizeFilePath(key.path))}`
}

function hashString(value: string): string {
  let hash = 2166136261
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

function readRegistry(): RegistryMap {
  try {
    const raw = window.localStorage.getItem(REGISTRY_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object') return {}
    const out: RegistryMap = {}
    for (const [key, label] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof label === 'string' && label) out[key] = label
    }
    return out
  } catch {
    return {}
  }
}

function writeRegistry(map: RegistryMap): void {
  try {
    window.localStorage.setItem(REGISTRY_KEY, JSON.stringify(map))
  } catch {
    // ignore quota / private mode
  }
}

/** Record that this window currently shows the given database project or file. */
export function claimWorkspaceDocument(key: WorkspaceDocumentKey, windowLabel: string): void {
  if (!windowLabel) return
  const id = workspaceDocumentKeyId(key)
  const map = readRegistry()
  // Drop any other keys this window previously claimed.
  for (const [existingId, label] of Object.entries(map)) {
    if (label === windowLabel && existingId !== id) delete map[existingId]
  }
  map[id] = windowLabel
  writeRegistry(map)
}

/** Clear claims for a window (on close) or a specific document. */
export function releaseWorkspaceDocument(
  keyOrLabel: WorkspaceDocumentKey | string,
  windowLabel?: string,
): void {
  const map = readRegistry()
  if (typeof keyOrLabel === 'string') {
    const label = keyOrLabel
    let changed = false
    for (const [id, claimed] of Object.entries(map)) {
      if (claimed === label) {
        delete map[id]
        changed = true
      }
    }
    if (changed) writeRegistry(map)
    return
  }
  const id = workspaceDocumentKeyId(keyOrLabel)
  if (windowLabel && map[id] !== windowLabel) return
  if (map[id]) {
    delete map[id]
    writeRegistry(map)
  }
}

/** Return the window label currently claiming this document, if any. */
export function claimedWorkspaceWindowLabel(key: WorkspaceDocumentKey): string | null {
  return readRegistry()[workspaceDocumentKeyId(key)] ?? null
}

/**
 * True when `windowLabel` is registered for a different document than `key`.
 * Used after in-window file replace: the webview may still have file A's stable
 * label while the registry says it now shows file B.
 */
export function workspaceLabelShowsOtherDocument(
  key: WorkspaceDocumentKey,
  windowLabel: string,
): boolean {
  const id = workspaceDocumentKeyId(key)
  return Object.entries(readRegistry()).some(
    ([otherId, claimed]) => claimed === windowLabel && otherId !== id,
  )
}

/**
 * If a workspace already shows this document, bring it to the front.
 * Clears stale registry entries when the window no longer exists.
 *
 * Only the registry is authoritative. Path-derived stable labels must not be
 * used as a fallback: a window opened for file A keeps `workspace-file-hash(A)`
 * after a drop replaces A with B, and focusing that label would wrongly surface B.
 */
export async function focusExistingWorkspaceDocument(key: WorkspaceDocumentKey): Promise<boolean> {
  if (!isTauriRuntime()) return false
  const id = workspaceDocumentKeyId(key)
  const registeredLabel = readRegistry()[id]
  if (!registeredLabel) return false

  const { WebviewWindow } = await import('@tauri-apps/api/webviewWindow')
  const existing = await WebviewWindow.getByLabel(registeredLabel)
  if (!existing) {
    const map = readRegistry()
    if (map[id] === registeredLabel) {
      delete map[id]
      writeRegistry(map)
    }
    return false
  }
  try {
    await existing.show()
    await existing.setFocus()
    return true
  } catch {
    return false
  }
}

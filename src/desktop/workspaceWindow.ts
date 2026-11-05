import { isTauriRuntime } from './tauriRuntime'
import type { BackgroundThrottlingPolicy } from '@tauri-apps/api/window'
import {
  focusExistingWorkspaceDocument,
  workspaceLabelShowsOtherDocument,
  workspaceWindowLabelFor,
  type WorkspaceDocumentKey,
} from './workspaceDocumentRegistry'

export type OpenWorkspaceWindowOptions = {
  /** Extra query params (e.g. history handoff key). */
  searchParams?: Record<string, string>
  title?: string
  focus?: boolean
  /**
   * When set, reuse an existing workspace that already shows this database
   * project or disk file instead of opening a second window.
   */
  documentKey?: WorkspaceDocumentKey
}

export type OpenWorkspaceResult = 'focused' | 'opened' | false

const WORKSPACE_SIZE_FRACTION = 0.75
const WORKSPACE_MIN_WIDTH = 960
const WORKSPACE_MIN_HEIGHT = 640
const WORKSPACE_FALLBACK_WIDTH = 1440
const WORKSPACE_FALLBACK_HEIGHT = 900

function buildWorkspaceUrl(searchParams?: Record<string, string>): string {
  const params = new URLSearchParams()
  // Skip boot splash — only the first app launch should show it.
  params.set('bootSplash', '0')
  if (searchParams) {
    for (const [key, value] of Object.entries(searchParams)) {
      params.set(key, value)
    }
  }
  // Match Rust WebviewUrl::App("index.html?…") so query params are not dropped
  // when the opener's pathname is "/" (startup / SPA routes).
  return `index.html?${params.toString()}`
}

/** ~75% of the monitor work area, centered — matches the Rust Open With path. */
async function workspaceWindowGeometry(): Promise<{
  width: number
  height: number
  x?: number
  y?: number
  center: boolean
}> {
  try {
    const { currentMonitor, primaryMonitor } = await import('@tauri-apps/api/window')
    const monitor = (await currentMonitor()) ?? (await primaryMonitor())
    if (!monitor) {
      return { width: WORKSPACE_FALLBACK_WIDTH, height: WORKSPACE_FALLBACK_HEIGHT, center: true }
    }
    const scale = monitor.scaleFactor > 0 ? monitor.scaleFactor : 1
    const workW = monitor.workArea.size.width / scale
    const workH = monitor.workArea.size.height / scale
    const workX = monitor.workArea.position.x / scale
    const workY = monitor.workArea.position.y / scale
    const width = Math.min(workW, Math.max(Math.min(WORKSPACE_MIN_WIDTH, workW), workW * WORKSPACE_SIZE_FRACTION))
    const height = Math.min(workH, Math.max(Math.min(WORKSPACE_MIN_HEIGHT, workH), workH * WORKSPACE_SIZE_FRACTION))
    return {
      width,
      height,
      x: workX + (workW - width) / 2,
      y: workY + (workH - height) / 2,
      center: false,
    }
  } catch {
    return { width: WORKSPACE_FALLBACK_WIDTH, height: WORKSPACE_FALLBACK_HEIGHT, center: true }
  }
}

/**
 * Open a full VibeGene workspace as a native Tauri window.
 * Returns false outside Tauri so callers can fall back to `window.open`.
 * With `documentKey`, focuses an existing window for that construct when present.
 */
export async function openWorkspaceWindow(
  options: OpenWorkspaceWindowOptions = {},
): Promise<OpenWorkspaceResult> {
  if (!isTauriRuntime()) return false
  const { invoke } = await import('@tauri-apps/api/core')
  await invoke('begin_user_window_open')
  try {
    return await openWorkspaceWindowUnderGate(options)
  } finally {
    await invoke('end_user_window_open')
  }
}

async function openWorkspaceWindowUnderGate(options: OpenWorkspaceWindowOptions): Promise<OpenWorkspaceResult> {
  if (options.documentKey && (await focusExistingWorkspaceDocument(options.documentKey))) {
    return 'focused'
  }

  const { WebviewWindow } = await import('@tauri-apps/api/webviewWindow')
  let label = options.documentKey
    ? workspaceWindowLabelFor(options.documentKey)
    : `workspace-${Date.now()}-${Math.floor(Math.random() * 1e6)}`

  // Stable path labels outlive the document: a window opened for file A keeps
  // workspace-file-hash(A) after a drop loads B. Never focus that collision —
  // open under a fresh label instead (focusExisting already checked the registry).
  if (options.documentKey) {
    const existing = await WebviewWindow.getByLabel(label)
    if (existing) {
      if (workspaceLabelShowsOtherDocument(options.documentKey, label)) {
        label = `workspace-${Date.now()}-${Math.floor(Math.random() * 1e6)}`
      } else {
        try {
          await existing.show()
          await existing.setFocus()
          return 'focused'
        } catch {
          label = `workspace-${Date.now()}-${Math.floor(Math.random() * 1e6)}`
        }
      }
    }
  }

  const geometry = await workspaceWindowGeometry()
  const webview = new WebviewWindow(label, {
    backgroundThrottling: 'disabled' as BackgroundThrottlingPolicy,
    url: buildWorkspaceUrl(options.searchParams),
    title: options.title ?? 'VibeGene',
    width: geometry.width,
    height: geometry.height,
    ...(geometry.center
      ? { center: true }
      : { x: geometry.x, y: geometry.y }),
    minWidth: WORKSPACE_MIN_WIDTH,
    minHeight: WORKSPACE_MIN_HEIGHT,
    focus: options.focus !== false,
    resizable: true,
    dragDropEnabled: true,
  })

  await new Promise<void>((resolve, reject) => {
    const onCreated = () => resolve()
    const onError = (event: { payload: unknown }) => {
      reject(new Error(typeof event.payload === 'string' ? event.payload : 'Failed to create workspace window'))
    }
    void webview.once('tauri://created', onCreated)
    void webview.once('tauri://error', onError)
  })

  return 'opened'
}

/** Open another blank/demo main workspace window. */
export async function openNewWorkspaceWindow(): Promise<OpenWorkspaceResult> {
  return openWorkspaceWindow()
}

/**
 * Open a workspace window that loads a history/handoff record (`?history=`).
 * Pass `initiallyUnsaved: true` for never-persisted constructs (File → New, cloning
 * products, …) so close prompts until the user saves.
 */
export async function openWorkspaceWindowWithHandoff(
  historyKey: string,
  options?: {
    title?: string
    focus?: boolean
    initiallyUnsaved?: boolean
    projectId?: string
    /** Absolute path when this handoff is a local disk file (not a Database project). */
    diskPath?: string
    openSaveToDatabase?: boolean
  },
): Promise<OpenWorkspaceResult> {
  const documentKey = options?.projectId
    ? ({ kind: 'database', projectId: options.projectId } satisfies WorkspaceDocumentKey)
    : options?.diskPath
      ? ({ kind: 'file', path: options.diskPath } satisfies WorkspaceDocumentKey)
      : undefined
  return openWorkspaceWindow({
    searchParams: {
      history: historyKey,
      ...(options?.initiallyUnsaved ? { unsaved: '1' } : {}),
      ...(options?.projectId ? { projectId: options.projectId } : {}),
      ...(options?.diskPath ? { openPath: options.diskPath } : {}),
      ...(options?.openSaveToDatabase ? { saveToDatabase: '1' } : {}),
    },
    title: options?.title,
    focus: options?.focus,
    documentKey,
  })
}

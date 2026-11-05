import { isTauriRuntime } from './tauriRuntime'

/** Full editor windows (not hybrid dialogs like Database / Preferences). */
export function isWorkspaceWindowLabel(label: string): boolean {
  return label === 'main' || label.startsWith('workspace-')
}

/** Whether closing this window ends the current editor-only session. */
export function isLastWorkspaceSessionWindow(label: string, workspaceCount: number): boolean {
  if (isWorkspaceWindowLabel(label)) return workspaceCount <= 1
  // Database and startup windows can be the only remaining user-facing
  // windows in a session that never opened a construct.
  if (label === 'hybrid-database' || label === 'hybrid-startup') return workspaceCount === 0
  return false
}

/** Current quit flow can confirm one editor's dirty state at a time. */
export function requiresSingleWorkspaceQuitGuard(workspaceCount: number): boolean {
  return workspaceCount > 1
}

export async function countWorkspaceWindows(): Promise<number> {
  if (!isTauriRuntime()) return 1
  const { getAllWindows } = await import('@tauri-apps/api/window')
  const windows = await getAllWindows()
  const workspaces = windows.filter((window) => isWorkspaceWindowLabel(window.label))
  const visible = await Promise.all(workspaces.map(async (window) => {
    try { return await window.isVisible() } catch { return true }
  }))
  return visible.filter(Boolean).length
}

/** True when this window is the only remaining workspace editor. */
export async function isLastWorkspaceWindow(): Promise<boolean> {
  if (!isTauriRuntime()) return true
  const { getCurrentWindow } = await import('@tauri-apps/api/window')
  const current = getCurrentWindow()
  return isLastWorkspaceSessionWindow(current.label, await countWorkspaceWindows())
}

/**
 * Whether closing the current window leaves no visible VibeGene windows.
 * Hidden retained WebViews do not count: macOS keeps those alive solely to
 * avoid destroying WebKit during a normal close.
 */
export async function isLastVisibleAppWindow(): Promise<boolean> {
  if (!isTauriRuntime()) return true
  const { getAllWindows } = await import('@tauri-apps/api/window')
  const windows = await getAllWindows()
  const visibility = await Promise.all(
    windows.map(async (window) => {
      try { return await window.isVisible() } catch { return true }
    }),
  )
  return visibility.filter(Boolean).length <= 1
}

import { createId } from './domain/sequence'
import { isTauriRuntime } from './desktop/tauriRuntime'
import { openWorkspaceWindow } from './desktop/workspaceWindow'

/**
 * Opens a trace (AB1) document in a new workspace window/tab after storing
 * raw bytes in the file-open handoff store.
 */
export async function openTraceDocumentInNewWorkspace(
  file: File,
  bytes: Uint8Array,
  localPath?: string,
): Promise<void> {
  const { putFileOpenHandoff } = await import('./storage/fileOpenHandoff')
  const fileHandoff = createId('fopen')
  await putFileOpenHandoff(fileHandoff, {
    path: localPath ?? '',
    name: file.name,
    bytes,
  })

  if (isTauriRuntime()) {
    const opened = await openWorkspaceWindow({
      searchParams: {
        fileHandoff,
        ...(localPath ? { openPath: localPath } : {}),
      },
      title: `${file.name} — from disk`,
      focus: true,
      documentKey: localPath ? { kind: 'file', path: localPath } : undefined,
    })
    if (!opened) throw new Error(`Could not open ${file.name} in a new workspace.`)
    return
  }

  const params = new URLSearchParams({ fileHandoff, bootSplash: '0' })
  if (localPath) params.set('openPath', localPath)
  const opened = window.open(`${window.location.pathname}?${params.toString()}`, '_blank')
  if (!opened) throw new Error(`Could not open ${file.name} in a new tab. Allow popups and try again.`)
  try {
    opened.opener = null
  } catch {
    // Browser may reject modifying opener for a newly opened tab.
  }
}

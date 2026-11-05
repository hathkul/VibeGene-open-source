import { isTauriRuntime } from './tauriRuntime'
import type { DatabaseExitSyncProgress, DatabaseExitSyncResult } from '../application/ports/lifecycle'
import { hasPendingFolderSyncWork, listFolderSyncMappings } from '../storage/projects'
import { restoreLegacyImportedFolderSyncBaselines } from '../storage/folderScopedSyncRepository'
import { syncDatabaseLibrary, type SyncDatabaseLibraryResult } from './syncDatabaseLibrary'
import { countWorkspaceWindows, isLastWorkspaceWindow, requiresSingleWorkspaceQuitGuard } from './workspaceWindows'

export type { DatabaseExitSyncProgress, DatabaseExitSyncResult } from '../application/ports/lifecycle'

/**
 * A browser confirmation can be suppressed while macOS is delivering a native
 * window-close request. Use Tauri's native dialog there so a failed sync never
 * turns into an invisible "keep open" decision.
 */
export async function confirmCloseAfterDatabaseSyncFailure(
  error: string,
  action: 'close' | 'quit' = 'close',
): Promise<boolean> {
  const verb = action === 'quit' ? 'quit VibeGene' : 'close this window'
  const message = `Could not sync the Database folder: ${error}\n\nChoose Close Anyway to ${verb}, or Keep Open to retry later.`
  if (isTauriRuntime()) {
    try {
      const { confirm } = await import('@tauri-apps/plugin-dialog')
      return await confirm(message, {
        title: 'Database sync could not finish',
        kind: 'warning',
        okLabel: 'Close Anyway',
        cancelLabel: 'Keep Open',
      })
    } catch {
      // Older shells may not expose the dialog plugin; retain the web fallback.
    }
  }
  return window.confirm(message)
}

let syncInFlight: Promise<DatabaseExitSyncResult> | null = null
let backgroundSyncTimer: ReturnType<typeof setTimeout> | undefined
let lastBackgroundSyncAttempt = 0
let fullMirrorRequested = false

function yieldToWindow(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

const BACKGROUND_SYNC_DEBOUNCE_MS = 1_000
const BACKGROUND_SYNC_RETRY_COOLDOWN_MS = 15_000

async function restoreLegacyImportedBaselines(): Promise<number> {
  let restored = 0
  for (const mapping of await listFolderSyncMappings()) {
    restored += await restoreLegacyImportedFolderSyncBaselines(mapping.folderId)
  }
  return restored
}

function scheduleBackgroundSyncAfter(delayMs: number): void {
  if (backgroundSyncTimer) clearTimeout(backgroundSyncTimer)
  backgroundSyncTimer = setTimeout(() => {
    backgroundSyncTimer = undefined
    void runBackgroundSync()
  }, delayMs)
}

async function runBackgroundSync(): Promise<void> {
      try {
        const fullMirror = fullMirrorRequested
        fullMirrorRequested = false
        if (!fullMirror && !await hasPendingFolderSyncWork()) return
        const cooldownRemaining = BACKGROUND_SYNC_RETRY_COOLDOWN_MS - (Date.now() - lastBackgroundSyncAttempt)
        if (!fullMirror && lastBackgroundSyncAttempt > 0 && cooldownRemaining > 0) {
          // Preserve the durable work and arrange one retry at the end of the
          // cooldown, instead of dropping the event that scheduled this pass.
          scheduleBackgroundSyncAfter(cooldownRemaining)
          return
        }
        lastBackgroundSyncAttempt = Date.now()
        const { invoke } = await import('@tauri-apps/api/core')
        if (fullMirror) await invoke('record_folder_sync_diagnostic', { detail: { phase: 'started' } })
        const token = crypto.randomUUID()
        if (!await invoke<boolean>('acquire_exit_sync_lock', { token })) {
          fullMirrorRequested ||= fullMirror
          scheduleBackgroundSyncAfter(1_000)
          return
        }
        const heartbeat = setInterval(() => { void invoke('refresh_exit_sync_lock', { token }) }, 5_000)
        try {
          for (const mapping of await listFolderSyncMappings()) {
            if (fullMirror) {
              const { reconcileMappedFolderDesktop } = await import('./folderScopedSync')
              const result = await reconcileMappedFolderDesktop(mapping.folderId)
              await invoke('record_folder_sync_diagnostic', { detail: { folderId: mapping.folderId, ...result } })
              if (result.failures.length) throw new Error(result.failures[0]!.error)
            } else if (await hasPendingFolderSyncWork(mapping.folderId)) {
              // Startup/save recovery only drains pending writes. Reading every
              // mapped source and exact blob here stalls the Database browser.
              const result = await syncDatabaseLibrary(undefined, { folderId: mapping.folderId, incremental: true })
              if (!result.ok) throw new Error(result.cancelled ? 'Sync cancelled' : result.error)
            }
          }
        } finally {
          clearInterval(heartbeat)
          await invoke('release_exit_sync_lock', { token })
        }
      } catch (error) {
        lastBackgroundSyncAttempt = Date.now()
        console.info('Background database folder sync remains pending', error)
        const { invoke } = await import('@tauri-apps/api/core')
        await invoke('record_folder_sync_diagnostic', { detail: { phase: 'failed', error: String(error) } }).catch(() => {})
      }
}

/** Hold the last editor close while mapped folders are flushed. */
export async function shouldHoldCloseForDatabaseSync(): Promise<boolean> {
  if (!isTauriRuntime()) return false
  if (!(await isLastWorkspaceWindow())) return false
  if (!(await hasPendingFolderSyncWork())) return false
  const restored = await restoreLegacyImportedBaselines()
  return restored > 0 ? hasPendingFolderSyncWork() : true
}

/**
 * Flush mapped folders once per webview runtime. All concurrent close handlers
 * join the same promise, so they cannot race writes to the same mapped folder.
 * This is intentionally a small seam for replacing discovery with an outbox.
 */
export function maybeSyncDatabaseOnExit(
  onProgress?: (progress: DatabaseExitSyncProgress) => void,
): Promise<DatabaseExitSyncResult> {
  if (syncInFlight) return syncInFlight
  syncInFlight = performDatabaseExitSync(onProgress).finally(() => {
    syncInFlight = null
  })
  return syncInFlight
}

/** Debounced, silent write-behind flush after library changes. */
export function scheduleDatabaseBackgroundSync(): void {
  if (!isTauriRuntime()) return
  scheduleBackgroundSyncAfter(BACKGROUND_SYNC_DEBOUNCE_MS)
}

/** Native macOS close retains a hidden webview so it can finish mirror work. */
export async function subscribeLastWindowHiddenForDatabaseSync(): Promise<() => void> {
  if (!isTauriRuntime()) return () => {}
  const { listen } = await import('@tauri-apps/api/event')
  const { getCurrentWindow } = await import('@tauri-apps/api/window')
  const label = getCurrentWindow().label
  return listen('vg-last-window-hidden', () => {
    fullMirrorRequested = true
    // Start directly in the native event callback: a hidden page's timers may
    // be throttled. The native lease serializes overlapping webview requests.
    void runBackgroundSync()
  }, { target: { kind: 'WebviewWindow', label } })
}

async function performDatabaseExitSync(
  onProgress?: (progress: DatabaseExitSyncProgress) => void,
): Promise<DatabaseExitSyncResult> {
  if (!isTauriRuntime()) {
    return { ok: true, conflicts: 0, syncedFolders: 0 }
  }
  let nativeLockHeld = false
  let lockLost = false
  let heartbeat: ReturnType<typeof setInterval> | undefined
  let lockToken = ''
  try {
    if (!(await hasPendingFolderSyncWork())) {
      return { ok: true, conflicts: 0, syncedFolders: 0 }
    }
    const restored = await restoreLegacyImportedBaselines()
    if (restored > 0 && !(await hasPendingFolderSyncWork())) {
      return { ok: true, conflicts: 0, syncedFolders: 0 }
    }
    const { invoke } = await import('@tauri-apps/api/core')
    const startingRevision = await invoke<number>('exit_sync_revision')
    lockToken = globalThis.crypto?.randomUUID?.() ?? `exit-sync-${Date.now()}-${Math.random()}`
    const lockWaitStarted = Date.now()
    while (!nativeLockHeld) {
      nativeLockHeld = await invoke<boolean>('acquire_exit_sync_lock', { token: lockToken })
      if (nativeLockHeld) break
      if (Date.now() - lockWaitStarted > 30_000) {
        return { ok: false, error: 'Another database sync did not release its lock. Keep the app open and retry.' }
      }
      await new Promise((resolve) => setTimeout(resolve, 100))
    }
    heartbeat = setInterval(() => {
      void invoke<boolean>('refresh_exit_sync_lock', { token: lockToken }).then((owned) => {
        if (!owned) lockLost = true
      }).catch(() => { lockLost = true })
    }, 5_000)
    const anotherSyncCompletedWhileWaiting =
      (await invoke<number>('exit_sync_revision')) !== startingRevision
    if (!(await hasPendingFolderSyncWork())) {
      return { ok: true, conflicts: 0, syncedFolders: 0 }
    }
    onProgress?.({
      phase: 'preparing', folderIndex: 0, folderTotal: 0, folderPath: '',
      done: 0,
      total: 0,
      itemName: anotherSyncCompletedWhileWaiting
        ? 'Flushing changes queued during the previous sync'
        : 'Preparing database sync',
    })
    await yieldToWindow()
    let conflicts = 0
    let syncedFolders = 0
    const maxDrainPasses = 3
    for (let pass = 0; pass < maxDrainPasses; pass += 1) {
      const mappings = await listFolderSyncMappings()
      const pendingMappings = []
      for (const mapping of mappings) {
        if (await hasPendingFolderSyncWork(mapping.folderId)) pendingMappings.push(mapping)
      }
      if (pendingMappings.length === 0) {
        if (!(await hasPendingFolderSyncWork())) {
          await invoke('mark_exit_sync_complete')
          return { ok: true, conflicts, syncedFolders }
        }
        return {
          ok: false,
          error: 'Pending Database changes have no active folder mapping. Reconnect the source folder or resolve the queued changes before closing.',
        }
      }
      for (const [index, mapping] of pendingMappings.entries()) {
        if (lockLost) return { ok: false, error: 'The database sync lock expired. Keep the app open and retry.' }
        const result: SyncDatabaseLibraryResult = await syncDatabaseLibrary((done, total, name) => {
          onProgress?.({
            phase: name.toLowerCase().includes('scanning') ? 'scanning' : 'syncing',
            folderIndex: index + 1,
            folderTotal: pendingMappings.length,
            folderPath: mapping.externalPath,
            done,
            total,
            itemName: name,
          })
        }, { folderId: mapping.folderId, incremental: true })
        if (!result.ok) return { ok: false, error: result.cancelled ? 'Sync was cancelled' : result.error }
        if (result.conflicts > 0) {
          return { ok: false, conflicts: result.conflicts, error: `${result.conflicts} sync conflict(s) need review in Database before closing.` }
        }
        conflicts += result.conflicts
        syncedFolders += 1
      }
      if (lockLost) return { ok: false, error: 'The database sync lock expired. Keep the app open and retry.' }
      if (!(await hasPendingFolderSyncWork())) {
        await invoke('mark_exit_sync_complete')
        return { ok: true, conflicts, syncedFolders }
      }
    }
    return { ok: false, error: 'New Database changes remained pending after three sync passes. Keep the app open and retry.' }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  } finally {
    if (heartbeat) clearInterval(heartbeat)
    if (nativeLockHeld) {
      try {
        const { invoke } = await import('@tauri-apps/api/core')
        await invoke('release_exit_sync_lock', { token: lockToken })
      } catch (error) {
        console.error('Could not release database exit sync lock', error)
      }
    }
  }
}

/** Run an explicit native Quit after the same durable shutdown flush used by close. */
export async function quitNativeAppAfterDatabaseSync(): Promise<boolean> {
  if (!await confirmNativeQuitHasSingleWorkspaceGuard()) return false
  const result = await maybeSyncDatabaseOnExit()
  if (!result.ok && !await confirmCloseAfterDatabaseSyncFailure(result.error ?? 'Unknown error', 'quit')) {
    return false
  }
  const { invoke } = await import('@tauri-apps/api/core')
  await invoke('quit_app')
  return true
}

/** Refuse a process quit when other editor windows have not received dirty prompts. */
export async function confirmNativeQuitHasSingleWorkspaceGuard(): Promise<boolean> {
  if (!requiresSingleWorkspaceQuitGuard(await countWorkspaceWindows())) return true
  window.alert('Close the other construct windows first, then choose Quit again. Each window must get a chance to save its changes.')
  return false
}

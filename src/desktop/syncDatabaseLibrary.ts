import { applyFolderScopedSync, preflightFolderScopedSync } from './folderScopedSync'
import { isTauriRuntime } from './tauriRuntime'
import { flushPendingFolderSync } from '../storage/folderScopedSyncRepository'
import { desktopFolderScopedSyncIo } from './folderScopedSyncIo'

export type SyncDatabaseLibraryResult =
  | {
      ok: true
      path: string
      written: number
      skippedUnchanged: number
      modifiedFiles: number
      manifests: number
      projectCount: number
      folderCount: number
      folderScoped: true
      conflicts: number
    }
  | { ok: false; cancelled: true }
  | { ok: false; cancelled?: false; error: string }

/** Outbound-only folder-scoped sync wrapper. */
export async function syncDatabaseLibrary(
  onProgress: ((done: number, total: number, name: string) => void) | undefined,
  options: { folderId: string; incremental?: boolean },
): Promise<SyncDatabaseLibraryResult> {
  try {
    if (!isTauriRuntime()) {
      return { ok: false, error: 'Sync to folder is only available in the desktop app' }
    }
    const folderId = options.folderId
    if (!folderId) throw new Error('Select a mapped top-level database folder before syncing')

    if (options.incremental) {
      onProgress?.(0, 1, 'Saving pending changes')
      const result = await flushPendingFolderSync(folderId, desktopFolderScopedSyncIo, (done, total, name) => {
        onProgress?.(done, Math.max(1, total), name)
      })
      return {
        ok: true,
        path: result.path,
        written: result.written,
        skippedUnchanged: result.skipped,
        modifiedFiles: result.written,
        manifests: 0,
        projectCount: result.written + result.conflicts + result.skipped,
        folderCount: 1,
        folderScoped: true,
        conflicts: result.conflicts,
      }
    }

    onProgress?.(0, 1, 'Scanning mapped folder')
    const preflight = await preflightFolderScopedSync(folderId, { direction: 'to' })
    if (preflight.conflicts.length > 0) {
      // Sync-on-exit is intentionally noninteractive: leave the entire plan
      // untouched so the Database window can resolve it later.
      return {
        ok: true,
        path: preflight.externalPath,
        written: 0,
        skippedUnchanged: preflight.plan.counts.ignore,
        modifiedFiles: 0,
        manifests: 0,
        projectCount: preflight.dbFiles.length,
        folderCount: 1,
        folderScoped: true,
        conflicts: preflight.conflicts.length,
      }
    }
    onProgress?.(0, Math.max(1, preflight.plan.actions.length), 'Applying sync')
    const applied = await applyFolderScopedSync(preflight, { onProgress })
    const totalActions = Math.max(1, preflight.plan.actions.length)
    onProgress?.(
      totalActions,
      totalActions,
      'done',
    )
    if (applied.failures.length > 0) {
      throw new Error(
        `${applied.failures.length} sync operation(s) failed: ${applied.failures[0]!.error}`,
      )
    }
    return {
      ok: true,
      path: preflight.externalPath,
      written: applied.writtenToDisk,
      skippedUnchanged: applied.ignored,
      modifiedFiles: applied.writtenToDisk,
      manifests: 0,
      projectCount: preflight.dbFiles.length,
      folderCount: 1,
      folderScoped: true,
      conflicts: applied.unresolvedConflicts.length,
    }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

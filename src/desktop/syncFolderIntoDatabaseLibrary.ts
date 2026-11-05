import type {
  BytesImportFailure,
  SyncFolderIntoDatabaseResult,
} from '../storage/databaseImport'
import type {
  FolderScopedSyncApplyResult,
  FolderScopedSyncPreflight,
} from '../storage/folderScopedSyncService'
import { applyFolderScopedSync, preflightFolderScopedSync } from './folderScopedSync'
import { isTauriRuntime } from './tauriRuntime'

export type SyncFolderIntoDatabaseLibraryResult =
  | {
      ok: true
      path: string
      result: SyncFolderIntoDatabaseResult
      folderScoped: true
      preflight: FolderScopedSyncPreflight
      apply: FolderScopedSyncApplyResult
    }
  | { ok: false; cancelled: true }
  | { ok: false; cancelled?: false; error: string }

function applyFailures(result: FolderScopedSyncApplyResult): BytesImportFailure[] {
  return [
    ...result.failures.map((failure) => ({
      ok: false as const,
      fileName: failure.relativePath,
      error: failure.error,
    })),
    ...result.unresolvedConflicts.map((conflict) => ({
      ok: false as const,
      fileName: conflict.relativePath,
      error: `Unresolved sync conflict: ${conflict.reason}`,
    })),
  ]
}

/** Inbound-only folder-scoped sync wrapper. */
export async function syncFolderIntoDatabaseLibrary(
  onProgress: ((done: number, total: number, name: string) => void) | undefined,
  options: { cleanup?: boolean; folderId: string },
): Promise<SyncFolderIntoDatabaseLibraryResult> {
  try {
    if (!isTauriRuntime()) {
      return { ok: false, error: 'Sync to database is only available in the desktop app' }
    }
    const folderId = options.folderId
    if (!folderId) throw new Error('Select a mapped top-level database folder before syncing')

    onProgress?.(0, 1, 'plan: scanning mapped folder…')
    const preflight = await preflightFolderScopedSync(folderId, {
      direction: 'from',
      cleanup: options.cleanup,
    })
    if (preflight.conflicts.length > 0) {
      throw new Error(
        `${preflight.conflicts.length} sync conflict(s) require review in the Database window before any changes can be applied`,
      )
    }
    onProgress?.(0, Math.max(1, preflight.plan.actions.length), 'plan: applying sync…')
    const applied = await applyFolderScopedSync(preflight)
    onProgress?.(
      preflight.plan.actions.length,
      preflight.plan.actions.length,
      'done',
    )

    const result: SyncFolderIntoDatabaseResult = {
      rootFolderId: folderId,
      projectsAdded: applied.addedToDb,
      projectsUpdated: applied.updatedInDb,
      projectsSkipped: applied.ignored,
      projectsRemoved: applied.removedFromDb,
      primersSaved: applied.primersSaved,
      primersSkipped: 0,
      primersRemoved: applied.primersRemoved,
      foldersCreated: 0,
      failed: applyFailures(applied),
    }
    return {
      ok: true,
      path: preflight.externalPath,
      result,
      folderScoped: true,
      preflight,
      apply: applied,
    }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

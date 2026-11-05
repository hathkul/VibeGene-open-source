import { createFolderScopedSyncRepositoryDependencies } from '../storage/folderScopedSyncRepository'
import { reconcileMappedFolder } from '../storage/folderScopedSyncRepository'
import {
  createFolderScopedSyncService,
  type FolderScopedSyncApplyOptions,
  type FolderScopedSyncApplyResult,
  type FolderScopedSyncPreflight,
} from '../storage/folderScopedSyncService'
import type { FolderSyncDirection } from '../storage/databaseSync'
import { desktopFolderScopedSyncIo } from './folderScopedSyncIo'
import { isTauriRuntime } from './tauriRuntime'

const service = createFolderScopedSyncService(
  createFolderScopedSyncRepositoryDependencies(desktopFolderScopedSyncIo),
)

export async function preflightFolderScopedSync(
  folderId: string,
  options: { direction: FolderSyncDirection; cleanup?: boolean; externalPath?: string },
): Promise<FolderScopedSyncPreflight> {
  if (!isTauriRuntime()) {
    throw new Error('Folder-scoped sync is only available in the desktop app')
  }
  return service.preflight(folderId, options)
}

export async function applyFolderScopedSync(
  preflight: FolderScopedSyncPreflight,
  options: FolderScopedSyncApplyOptions = {},
): Promise<FolderScopedSyncApplyResult> {
  if (!isTauriRuntime()) {
    throw new Error('Folder-scoped sync is only available in the desktop app')
  }
  return service.apply(preflight, options)
}

/** Reconcile a folder linked by Import folder. This is never the one-off sync flow. */
export async function reconcileMappedFolderDesktop(folderId: string) {
  if (!isTauriRuntime()) throw new Error('Linked-folder reconciliation is only available in the desktop app')
  return reconcileMappedFolder(folderId, desktopFolderScopedSyncIo)
}

/**
 * Install the desktop development diagnostic used to inspect inbound sync plans.
 */
import { isSequenceOpenFileName } from '../domain/fileFormats'
import { DATABASE_EXPORT_MANIFEST_NAME, listDatabaseExportIndex } from '../storage/databaseExport'
import type { VirtualFsEntry } from '../storage/databaseImport'
import { planInboundCleanupRemovals, planInboundConstructSync } from '../storage/databaseSync'
import { readDatabaseSyncTarget } from '../storage/databaseSyncPrefs'
import { hashSyncSourceBytes } from '../storage/syncSourceHash'
import { writeHomeSyncPlanDiagnostic } from './syncPlanDiagnosticWriter'

declare global {
  interface Window {
    __vibegeneDumpInboundPlan?: (entries: VirtualFsEntry[], rootFolderId: string | null) => Promise<unknown>
  }
}

function fileNameOf(relativePath: string) {
  const parts = relativePath.replace(/\\/g, '/').split('/')
  return parts[parts.length - 1] || relativePath
}

export async function dumpInboundSyncPlan(
  entries: VirtualFsEntry[],
  rootFolderId: string | null,
  lastSyncedAt: string | null,
) {
  const sequenceEntries = entries.filter((entry) => {
    const name = fileNameOf(entry.relativePath)
    if (!name || name.startsWith('.')) return false
    if (name.toLowerCase() === DATABASE_EXPORT_MANIFEST_NAME.toLowerCase()) return false
    if (name.toLowerCase().endsWith('.txt') || name.toLowerCase().endsWith('.json')) return false
    return isSequenceOpenFileName(name)
  })
  const primerListEntries = entries.filter((entry) => fileNameOf(entry.relativePath).toLowerCase().endsWith('.txt'))
  const index = await listDatabaseExportIndex({ rootFolderId })
  const diskFiles = await Promise.all(
    sequenceEntries.map(async (entry) => ({
      relativePath: entry.relativePath.replace(/\\/g, '/').replace(/^\/+/, ''),
      mtimeMs: entry.mtimeMs ?? null,
      contentHash: await hashSyncSourceBytes(entry.bytes),
    })),
  )
  const libraryFiles = index.projects.map((project) => ({
    projectId: project.projectId,
    relativePath: project.relativePath,
    syncRelativePath: project.syncRelativePath ?? null,
    updatedAt: project.updatedAt,
    syncSourceHash: project.syncSourceHash ?? null,
  }))
  const plan = planInboundConstructSync(diskFiles, libraryFiles, lastSyncedAt)
  const removalIds = planInboundCleanupRemovals(diskFiles, libraryFiles, plan.matchedProjectIds)
  const adds = plan.actions.filter((action) => action.kind === 'add')
  const updates = plan.actions.filter((action) => action.kind === 'update')
  const summary = {
    at: new Date().toISOString(),
    lastSyncedAt,
    rootFolderId,
    diskSequences: diskFiles.length,
    libraryProjects: libraryFiles.length,
    withHash: libraryFiles.filter((file) => file.syncSourceHash).length,
    withSyncPath: libraryFiles.filter((file) => file.syncRelativePath).length,
    add: adds.length,
    update: updates.length,
    skip: plan.skippedUnchanged,
    dup: plan.skippedDuplicates,
    remove: removalIds.length,
    primersTxt: primerListEntries.length,
    workTotal: adds.length + updates.length + removalIds.length + primerListEntries.length,
    sampleAdds: adds.slice(0, 20).map((action) => action.relativePath),
    sampleUpdates: updates.slice(0, 20).map((action) => action.relativePath),
    sampleLibMissingHash: libraryFiles
      .filter((file) => !file.syncSourceHash)
      .slice(0, 15)
      .map((file) => ({ id: file.projectId, path: file.relativePath, sync: file.syncRelativePath })),
  }

  try {
    await writeHomeSyncPlanDiagnostic('vibegene-last-sync-plan.json', JSON.stringify(summary, null, 2))
  } catch (error) {
    console.warn('Could not write vibegene-last-sync-plan.json', error)
  }
  console.info('[vibegene sync plan]', summary)
  return summary
}

if (typeof window !== 'undefined') {
  window.__vibegeneDumpInboundPlan = async (entries, rootFolderId) => {
    const lastSyncedAt = readDatabaseSyncTarget()?.lastSyncedAt ?? null
    return dumpInboundSyncPlan(entries, rootFolderId, lastSyncedAt)
  }
}

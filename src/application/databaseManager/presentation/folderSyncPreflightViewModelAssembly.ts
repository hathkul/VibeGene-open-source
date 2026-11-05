import {
  folderSyncApplyAllLabel,
  folderSyncConflictReasonLabel,
  type FolderSyncConflictChoice,
  type FolderSyncIntent,
} from '../folderSyncPresentation'

export type DatabaseManagerFolderSyncPreflightConflictInput = {
  id: string
  relativePath: string
  reason: string
  conflictingPaths?: readonly string[]
}

export type DatabaseManagerFolderSyncPreflightAssemblyInput = {
  externalPath: string
  direction: 'from' | 'to'
  primerListCount: number
  counts: {
    addToDb: number
    updateDb: number
    createOnDisk: number
    overwriteDisk: number
    removeFromDb: number
    ignore: number
    conflict: number
  }
  conflicts: readonly DatabaseManagerFolderSyncPreflightConflictInput[]
}

export type DatabaseManagerFolderSyncPreflightAssemblyDeps = {
  allowedChoicesFor: (conflict: DatabaseManagerFolderSyncPreflightConflictInput) => FolderSyncConflictChoice[]
  conflictHasDiskFile: (conflict: DatabaseManagerFolderSyncPreflightConflictInput) => boolean
}

export type DatabaseManagerFolderSyncPreflightViewModel = {
  intent: FolderSyncIntent
  externalPath: string
  direction: 'from' | 'to'
  showPrimerListCount: boolean
  primerListCount: number
  counts: DatabaseManagerFolderSyncPreflightAssemblyInput['counts']
  missingDiskConflicts: boolean
  presentDiskConflicts: boolean
  applyAllDatabaseLabel: string
  applyAllFilesystemLabel: string
  conflicts: Array<{
    id: string
    relativePath: string
    issueLabel: string
    supported: boolean
    allowedChoices: FolderSyncConflictChoice[]
    hasDiskFile: boolean
  }>
  initialChoices: Record<string, FolderSyncConflictChoice>
}

export function assembleFolderSyncPreflightViewModel(
  intent: FolderSyncIntent,
  input: DatabaseManagerFolderSyncPreflightAssemblyInput,
  deps: DatabaseManagerFolderSyncPreflightAssemblyDeps,
): DatabaseManagerFolderSyncPreflightViewModel {
  const conflicts = input.conflicts.map((conflict) => {
    const extraPaths = (conflict.conflictingPaths ?? []).filter(
      (path) => path !== conflict.relativePath,
    )
    const issueLabel = extraPaths.length
      ? `${folderSyncConflictReasonLabel(conflict.reason)} · ${extraPaths.join(', ')}`
      : folderSyncConflictReasonLabel(conflict.reason)
    const allowedChoices = deps.allowedChoicesFor(conflict)
    return {
      id: conflict.id,
      relativePath: conflict.relativePath,
      issueLabel,
      supported: allowedChoices.length > 0,
      allowedChoices,
      hasDiskFile: deps.conflictHasDiskFile(conflict),
    }
  })

  const preferred: FolderSyncConflictChoice =
    input.direction === 'from' ? 'filesystem' : 'database'
  const initialChoices: Record<string, FolderSyncConflictChoice> = {}
  for (const conflict of input.conflicts) {
    const allowed = deps.allowedChoicesFor(conflict)
    if (allowed.includes(preferred)) initialChoices[conflict.id] = preferred
    else if (allowed[0]) initialChoices[conflict.id] = allowed[0]
  }

  const resolvable = conflicts.filter((conflict) => conflict.allowedChoices.length > 0)
  const missingDiskConflicts = resolvable.some((conflict) => !conflict.hasDiskFile)
  const presentDiskConflicts = resolvable.some((conflict) => conflict.hasDiskFile)

  return {
    intent,
    externalPath: input.externalPath,
    direction: input.direction,
    showPrimerListCount: input.direction === 'from',
    primerListCount: input.primerListCount,
    counts: input.counts,
    missingDiskConflicts,
    presentDiskConflicts,
    applyAllDatabaseLabel: folderSyncApplyAllLabel(
      'database',
      missingDiskConflicts,
      presentDiskConflicts,
    ),
    applyAllFilesystemLabel: folderSyncApplyAllLabel(
      'filesystem',
      missingDiskConflicts,
      presentDiskConflicts,
    ),
    conflicts,
    initialChoices,
  }
}

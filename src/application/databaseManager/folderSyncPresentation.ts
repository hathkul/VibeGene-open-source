export type FolderSyncIntent = 'sync-from' | 'sync-cleanup' | 'sync-to'

export type FolderSyncConflictChoice = 'database' | 'filesystem'

export function folderSyncIntentLabel(intent: FolderSyncIntent): string {
  if (intent === 'sync-cleanup') return 'Sync and clean up'
  return intent === 'sync-to' ? 'Sync to source folder' : 'Sync from source folder'
}

export function folderSyncConflictReasonLabel(reason: string): string {
  switch (reason) {
    case 'ambiguous-rename':
      return 'Ambiguous rename'
    case 'both-changed':
      return 'Both sides changed'
    case 'database-changed-disk-missing':
      return 'Changed in database, missing on disk'
    case 'database-path-collision':
      return 'Duplicate path in database'
    case 'disk-path-collision':
      return 'Duplicate path on disk'
    case 'existing-conflict':
      return 'Already marked as a conflict'
    case 'invalid-relative-path':
      return 'Invalid path'
    case 'local-only-path-collision':
      return 'Local database file collides with a disk file'
    case 'missing-baseline':
      return 'Missing sync baseline'
    case 'tombstone-project-collision':
      return 'Path was deleted in the database'
    default:
      return reason.replaceAll('-', ' ')
  }
}

export function folderSyncConflictChoiceLabel(
  choice: FolderSyncConflictChoice,
  hasDiskFile: boolean,
): string {
  if (choice === 'filesystem') return hasDiskFile ? 'Use folder' : 'Remove'
  return hasDiskFile ? 'Keep database' : 'Keep'
}

export function folderSyncApplyAllLabel(
  choice: FolderSyncConflictChoice,
  missingDisk: boolean,
  presentDisk: boolean,
): string {
  if (choice === 'filesystem') {
    if (missingDisk && presentDisk) return 'Use folder / Remove'
    return missingDisk ? 'Remove' : 'Use folder'
  }
  return missingDisk && !presentDisk ? 'Keep' : 'Keep database'
}

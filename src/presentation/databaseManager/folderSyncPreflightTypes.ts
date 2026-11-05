import type { FolderSyncConflictChoice, FolderSyncIntent } from '../../application/databaseManager/folderSyncPresentation'

export type FolderSyncPreflightResolution = {
  conflictId: string
  choice: FolderSyncConflictChoice
}

export type FolderSyncPreflightConflictRow = {
  id: string
  relativePath: string
  issueLabel: string
  supported: boolean
  allowedChoices: FolderSyncConflictChoice[]
  hasDiskFile: boolean
}

export type FolderSyncPreflightViewModel = {
  intent: FolderSyncIntent
  externalPath: string
  direction: 'from' | 'to'
  showPrimerListCount: boolean
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
  missingDiskConflicts: boolean
  presentDiskConflicts: boolean
  applyAllDatabaseLabel: string
  applyAllFilesystemLabel: string
  conflicts: FolderSyncPreflightConflictRow[]
  initialChoices: Record<string, FolderSyncConflictChoice>
}

export type DatabaseManagerFolderSyncTombstoneDto = {
  id: string
  relativePath: string
}

export type DatabaseManagerFolderSyncRegionModelInput = {
  loading: boolean
  mapping: { externalPath: string; lastSyncedAt: number | string | null | undefined } | null
  selectedFolderIsTopLevel: boolean
  topLevelFolderName: string
  tombstones: readonly DatabaseManagerFolderSyncTombstoneDto[]
  busy: boolean
}

export function buildDatabaseManagerFolderSyncRegionModel(
  input: DatabaseManagerFolderSyncRegionModelInput,
) {
  return {
    loading: input.loading,
    mapping: input.mapping,
    selectedFolderIsTopLevel: input.selectedFolderIsTopLevel,
    topLevelFolderName: input.topLevelFolderName,
    tombstones: input.tombstones.map((t) => ({ id: t.id, relativePath: t.relativePath })),
    busy: input.busy,
  }
}

export function databaseManagerFolderSyncRegionVisible(input: {
  fileView: boolean
  browseKind: string
  hasTopLevelFolder: boolean
}): boolean {
  return Boolean(input.fileView && input.browseKind === 'folder' && input.hasTopLevelFolder)
}

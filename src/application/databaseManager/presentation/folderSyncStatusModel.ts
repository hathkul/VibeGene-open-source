export type AppDatabaseManagerFolderSyncLastSyncedAt = number | string | null | undefined

export type AppDatabaseManagerFolderSyncStatusInput = {
  loading: boolean
  hasMapping: boolean
  selectedFolderIsTopLevel: boolean
  topLevelFolderName: string
  externalPath: string | null
  lastSyncedAt: AppDatabaseManagerFolderSyncLastSyncedAt
  tombstoneCount: number
}

export type AppDatabaseManagerFolderSyncSourceRegion =
  | { kind: 'loading'; text: 'Loading source mapping…' }
  | {
      kind: 'mapped'
      sourceHeadingLabel: string
      externalPath: string
      lastSyncedAt: AppDatabaseManagerFolderSyncLastSyncedAt
      lastSyncedEmptyLabel: 'Not synced yet'
      lastSyncedLabelPrefix: 'Last synced '
    }
  | { kind: 'unmapped'; message: string }

export type AppDatabaseManagerFolderSyncIgnoredSection =
  | { kind: 'none'; summary: 'Ignored deleted files: 0' }
  | { kind: 'details'; summary: string; tombstoneCount: number }
  | { kind: 'hidden' }

export type AppDatabaseManagerFolderSyncStatusSlice = {
  /** Maps to `DatabaseFolderSyncStatus` root `is-missing` when false. */
  mappingPresent: boolean
  sourceRegion: AppDatabaseManagerFolderSyncSourceRegion
  ignoredSection: AppDatabaseManagerFolderSyncIgnoredSection
}

export function folderSyncStatusSourceHeadingLabel(
  selectedFolderIsTopLevel: boolean,
  topLevelFolderName: string,
): string {
  return selectedFolderIsTopLevel
    ? 'Source folder'
    : `Inherited source from ${topLevelFolderName}`
}

export function folderSyncStatusMissingMappingMessage(
  selectedFolderIsTopLevel: boolean,
  topLevelFolderName: string,
): string {
  return selectedFolderIsTopLevel
    ? 'No source folder set. Use “Set source folder” before syncing.'
    : `No source is set on top-level folder “${topLevelFolderName}”. Select it to set a source.`
}

export function folderSyncStatusIgnoredDetailsSummary(tombstoneCount: number): string {
  return `Ignored deleted files (${tombstoneCount})`
}

/** Presentation adapter: supply locale `formatDateTime` at the composition boundary. */
export function appDatabaseManagerFolderSyncLastSyncedLine(
  lastSyncedAt: AppDatabaseManagerFolderSyncLastSyncedAt,
  formatDateTime: (value: number | string) => string,
): 'Not synced yet' | `Last synced ${string}` {
  if (!lastSyncedAt) return 'Not synced yet'
  return `Last synced ${formatDateTime(lastSyncedAt)}`
}

export function buildAppDatabaseManagerFolderSyncStatusSlice(
  input: AppDatabaseManagerFolderSyncStatusInput,
): AppDatabaseManagerFolderSyncStatusSlice {
  const mappingPresent = input.hasMapping

  const showIgnoredChrome = input.hasMapping && input.selectedFolderIsTopLevel
  const ignoredSection: AppDatabaseManagerFolderSyncIgnoredSection = !showIgnoredChrome
    ? { kind: 'hidden' }
    : input.tombstoneCount > 0
      ? {
          kind: 'details',
          summary: folderSyncStatusIgnoredDetailsSummary(input.tombstoneCount),
          tombstoneCount: input.tombstoneCount,
        }
      : { kind: 'none', summary: 'Ignored deleted files: 0' }

  if (input.loading) {
    return {
      mappingPresent,
      sourceRegion: { kind: 'loading', text: 'Loading source mapping…' },
      ignoredSection,
    }
  }

  const sourceRegion: AppDatabaseManagerFolderSyncSourceRegion = input.hasMapping
    ? {
        kind: 'mapped',
        sourceHeadingLabel: folderSyncStatusSourceHeadingLabel(
          input.selectedFolderIsTopLevel,
          input.topLevelFolderName,
        ),
        externalPath: input.externalPath ?? '',
        lastSyncedAt: input.lastSyncedAt,
        lastSyncedEmptyLabel: 'Not synced yet',
        lastSyncedLabelPrefix: 'Last synced ',
      }
    : {
        kind: 'unmapped',
        message: folderSyncStatusMissingMappingMessage(
          input.selectedFolderIsTopLevel,
          input.topLevelFolderName,
        ),
      }

  return { mappingPresent, sourceRegion, ignoredSection }
}

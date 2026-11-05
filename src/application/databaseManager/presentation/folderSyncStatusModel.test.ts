import { describe, expect, it } from 'vitest'
import {
  appDatabaseManagerFolderSyncLastSyncedLine,
  buildAppDatabaseManagerFolderSyncStatusSlice,
  folderSyncStatusMissingMappingMessage,
} from './folderSyncStatusModel'

describe('database manager folder sync status labels', () => {
  it('shows loading source region without mapped or missing copy', () => {
    const loading = buildAppDatabaseManagerFolderSyncStatusSlice({
      loading: true,
      hasMapping: true,
      selectedFolderIsTopLevel: true,
      topLevelFolderName: 'Lab',
      externalPath: '/data/lab',
      lastSyncedAt: 1_700_000_000_000,
      tombstoneCount: 2,
    })
    expect(loading.sourceRegion).toEqual({ kind: 'loading', text: 'Loading source mapping…' })
    expect(loading.ignoredSection).toEqual({
      kind: 'details',
      summary: 'Ignored deleted files (2)',
      tombstoneCount: 2,
    })
  })

  it('shows ignored none summary while loading mapped top-level with zero tombstones', () => {
    const loading = buildAppDatabaseManagerFolderSyncStatusSlice({
      loading: true,
      hasMapping: true,
      selectedFolderIsTopLevel: true,
      topLevelFolderName: 'Lab',
      externalPath: '/data/lab',
      lastSyncedAt: null,
      tombstoneCount: 0,
    })
    expect(loading.ignoredSection).toEqual({
      kind: 'none',
      summary: 'Ignored deleted files: 0',
    })
  })

  it('hides ignored section while loading when mapping absent or folder not top-level', () => {
    expect(
      buildAppDatabaseManagerFolderSyncStatusSlice({
        loading: true,
        hasMapping: false,
        selectedFolderIsTopLevel: true,
        topLevelFolderName: 'Lab',
        externalPath: null,
        lastSyncedAt: null,
        tombstoneCount: 3,
      }).ignoredSection,
    ).toEqual({ kind: 'hidden' })
    expect(
      buildAppDatabaseManagerFolderSyncStatusSlice({
        loading: true,
        hasMapping: true,
        selectedFolderIsTopLevel: false,
        topLevelFolderName: 'Lab',
        externalPath: '/data/lab',
        lastSyncedAt: null,
        tombstoneCount: 3,
      }).ignoredSection,
    ).toEqual({ kind: 'hidden' })
  })

  it('carries raw lastSyncedAt for adapter formatting', () => {
    const mapped = buildAppDatabaseManagerFolderSyncStatusSlice({
      loading: false,
      hasMapping: true,
      selectedFolderIsTopLevel: true,
      topLevelFolderName: 'Lab',
      externalPath: '/data/lab',
      lastSyncedAt: 1_700_000_000_000,
      tombstoneCount: 0,
    })
    expect(mapped.sourceRegion.kind).toBe('mapped')
    if (mapped.sourceRegion.kind === 'mapped') {
      expect(mapped.sourceRegion.lastSyncedAt).toBe(1_700_000_000_000)
      expect(mapped.sourceRegion.lastSyncedEmptyLabel).toBe('Not synced yet')
      expect(
        appDatabaseManagerFolderSyncLastSyncedLine(
          mapped.sourceRegion.lastSyncedAt,
          (value) => `FMT:${value}`,
        ),
      ).toBe('Last synced FMT:1700000000000')
      expect(appDatabaseManagerFolderSyncLastSyncedLine(null, () => 'unused')).toBe('Not synced yet')
    }
  })

  it('labels missing mapping when not loading', () => {
    expect(folderSyncStatusMissingMappingMessage(true, 'Lab')).toContain('Set source folder')
    const unmapped = buildAppDatabaseManagerFolderSyncStatusSlice({
      loading: false,
      hasMapping: false,
      selectedFolderIsTopLevel: false,
      topLevelFolderName: 'Lab',
      externalPath: null,
      lastSyncedAt: null,
      tombstoneCount: 0,
    })
    expect(unmapped.sourceRegion.kind).toBe('unmapped')
  })
})

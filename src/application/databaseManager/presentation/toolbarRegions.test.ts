import { describe, expect, it } from 'vitest'
import { buildAppDatabaseManagerSyncToolbarSlice } from './toolbarSyncModel'
import { buildAppDatabaseManagerFolderToolbarSlice } from './toolbarFolderModel'
import { buildAppDatabaseManagerHistoryRecoveryToolbarSlice } from './toolbarHistoryRecoveryModel'
import { buildAppDatabaseManagerFileSelectionToolbarSlice } from './toolbarFileSelectionModel'
import { buildAppDatabaseManagerPrimerSelectionToolbarSlice } from './toolbarPrimerSelectionModel'
import { buildAppDatabaseManagerProteinSelectionToolbarSlice } from './toolbarProteinSelectionModel'

describe('database manager sync toolbar slice', () => {
  it('labels import/export titles by runtime', () => {
    expect(
      buildAppDatabaseManagerSyncToolbarSlice({
        isTauriRuntime: true,
        folderDirectoryImportAvailable: true,
        selectedFolderHasSyncSource: false,
        modes: { import: 'import', inbound: 'sync-to-database', outbound: 'export-database' },
      }).importDatabaseTitle,
    ).toContain('database folder')
    expect(
      buildAppDatabaseManagerSyncToolbarSlice({
        isTauriRuntime: false,
        folderDirectoryImportAvailable: false,
        selectedFolderHasSyncSource: false,
        modes: { import: 'import', inbound: 'sync-to-database', outbound: 'export-database' },
      }).exportDatabaseTitle,
    ).toContain('Download a zip')
  })
})

describe('database manager folder and history toolbar slices', () => {
  it('does not expose a generic source-folder action', () => {
    const mapped = buildAppDatabaseManagerFolderToolbarSlice({
      fileView: true,
      browse: { kind: 'folder', folderId: 'f1' },
      selectedFolderIsTopLevel: true,
      isTauriRuntime: true,
      hasFolderSyncMapping: true,
      busy: false,
    })
    expect(mapped.showSourceFolderButton).toBe(false)
  })

  it('shows history recovery when batch exists', () => {
    expect(
      buildAppDatabaseManagerHistoryRecoveryToolbarSlice({
        fileView: true,
        latestHistoryRecoveryProjectCount: 3,
        busy: false,
      }),
    ).toEqual({ visible: true, projectCount: 3, busy: false })
  })
})

describe('database manager selection toolbar disable rules', () => {
  it('disables rename unless one common primer is selected', () => {
    expect(
      buildAppDatabaseManagerPrimerSelectionToolbarSlice({
        viewMode: 'primers',
        selectedPrimers: [{ isCommon: false }],
        busy: false,
        currentRecordId: 'rec',
      }).renameDisabled,
    ).toBe(true)

    expect(
      buildAppDatabaseManagerPrimerSelectionToolbarSlice({
        viewMode: 'primers',
        selectedPrimers: [{ isCommon: true }],
        busy: false,
        currentRecordId: null,
      }).addToCurrentDisabled,
    ).toBe(true)
  })

  it('labels multi-select file actions', () => {
    const slice = buildAppDatabaseManagerFileSelectionToolbarSlice({
      fileView: true,
      selectedProjectCount: 3,
      alignmentPick: null,
      onAddToAlignmentHandler: false,
      libraryMemberPick: null,
      isTauriRuntime: false,
      busy: true,
    })
    expect(slice.renameDisabled).toBe(true)
    expect(slice.deleteLabel).toBe('Delete (3)')
    expect(slice.busy).toBe(true)
  })

  it('exposes protein selection count and busy', () => {
    expect(
      buildAppDatabaseManagerProteinSelectionToolbarSlice({
        viewMode: 'cdses',
        selectedProteinCount: 4,
        alignmentPick: null,
        onAddToAlignmentHandler: false,
        busy: true,
      }),
    ).toEqual({ visible: true, count: 4, showAlignment: false, busy: true })
  })
})

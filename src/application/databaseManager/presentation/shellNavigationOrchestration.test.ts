import { describe, expect, it } from 'vitest'
import { databaseManagerBrowseNavigationEffect } from './browseNavigationOrchestration'
import {
  databaseManagerDeleteSelectionProjectIds,
  databaseManagerExportSelectionRoute,
  databaseManagerRenameSelectionProjectId,
} from './exportActionOrchestration'
import {
  databaseManagerNewFolderPromptModel,
  databaseManagerNewFolderSuccessStatus,
} from './sidebarNewFolderOrchestration'
import { buildAppDatabaseManagerToolbarPresentationModel } from './toolbarPresentationModel'

describe('database manager browse navigation', () => {
  it('clears selection for every browse target', () => {
    expect(databaseManagerBrowseNavigationEffect({ kind: 'all' })).toEqual({
      browse: { kind: 'all' },
      clearSelection: true,
    })
    expect(databaseManagerBrowseNavigationEffect({ kind: 'folder', folderId: 'f1' }).clearSelection).toBe(true)
    expect(databaseManagerBrowseNavigationEffect({ kind: 'tag', tag: 'pcr' }).clearSelection).toBe(true)
  })
})

describe('database manager new folder orchestration', () => {
  it('labels prompt for move-in selection', () => {
    expect(
      databaseManagerNewFolderPromptModel({ movingCount: 2, singleSelectedName: null }),
    ).toMatchObject({
      label: 'Folder name (2 selected files will be moved in)',
      initial: 'New folder',
    })
    expect(
      databaseManagerNewFolderPromptModel({ movingCount: 1, singleSelectedName: 'pA' }),
    ).toMatchObject({ initial: 'pA' })
  })

  it('formats create status copy', () => {
    expect(databaseManagerNewFolderSuccessStatus({ folderName: 'Lab', movedCount: 0 })).toBe(
      'Created folder “Lab”.',
    )
    expect(databaseManagerNewFolderSuccessStatus({ folderName: 'Lab', movedCount: 2 })).toContain('moved 2 files')
  })
})

describe('database manager export and rename routes', () => {
  it('routes export payloads unchanged', () => {
    expect(databaseManagerExportSelectionRoute(['a', 'b'], 'gb')).toEqual({
      projectIds: ['a', 'b'],
      format: 'gb',
    })
  })

  it('requires a single id to rename', () => {
    expect(databaseManagerRenameSelectionProjectId(['only'])).toBe('only')
    expect(databaseManagerRenameSelectionProjectId(['a', 'b'])).toBeNull()
  })

  it('passes delete ids through', () => {
    expect(databaseManagerDeleteSelectionProjectIds(['x'])).toEqual(['x'])
  })
})

describe('database manager toolbar presentation model', () => {
  const base = {
    libraryMemberPick: null,
    onAddLibraryMembersHandler: false,
    constructPick: null,
    onAddConstructHandlers: false,
    onCancelConstructPickHandler: false,
    selectedConstructs: [{ id: 'p1', name: 'pA', eligible: true }],
    viewMode: 'dna' as const,
    busy: false,
    fileView: true,
    browse: { kind: 'all' as const },
    isTauriRuntime: false,
    folderDirectoryImportAvailable: false,
    selectedFolderHasSyncSource: false,
    toolbarModes: { import: 'import' as const, inbound: 'sync-to-database' as const, outbound: 'export-database' as const },
    selectedFolderIsTopLevel: false,
    hasFolderSyncMapping: false,
    latestHistoryRecoveryProjectCount: 0,
    alignmentPick: null,
    onAddToAlignmentHandler: false,
    selectedPrimers: [],
    currentRecordId: null,
    selectedProteinCount: 0,
  }

  it('disables dna view when construct pick excludes dna', () => {
    const model = buildAppDatabaseManagerToolbarPresentationModel({
      ...base,
      constructPick: { molecules: ['protein'] },
      onAddConstructHandlers: true,
    })
    expect(model.viewMode.dnaDisabled).toBe(true)
    expect(model.viewMode.proteinsDisabled).toBe(false)
  })

  it('shows alignment on file selection when alignment pick is active', () => {
    const model = buildAppDatabaseManagerToolbarPresentationModel({
      ...base,
      alignmentPick: { mode: 'dna', targetRecordId: 'rec-1' },
      onAddToAlignmentHandler: true,
    })
    expect(model.fileSelection.showAlignment).toBe(true)
  })
})

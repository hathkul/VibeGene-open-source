import { themeFixturePalette } from '../../../test-support/themeFixturePalette'
import { describe, expect, it, vi } from 'vitest'
import {
  buildDatabaseManagerToolbarFileSelectionCommands,
  buildDatabaseManagerToolbarFolderCommands,
  buildDatabaseManagerToolbarPickCommands,
  buildDatabaseManagerToolbarPrimerCommands,
  buildDatabaseManagerToolbarProteinCommands,
  buildDatabaseManagerToolbarViewModeCommands,
} from './toolbarCommandBuilders'

describe('toolbar pick commands', () => {
  it('routes library member add through the pick port', () => {
    const addLibraryMembers = vi.fn()
    const commands = buildDatabaseManagerToolbarPickCommands(
      { constructPick: null, selectedProjectIds: ['lib-1', 'lib-2'] },
      {
        addLibraryMembers,
        addSelectedConstructs: vi.fn(),
        addConstructById: vi.fn(),
      },
    )
    commands.onAddLibraryMembers?.()
    expect(addLibraryMembers).toHaveBeenCalledTimes(1)
  })

  it('adds multiple constructs when pick allows it', () => {
    const addSelectedConstructs = vi.fn()
    const commands = buildDatabaseManagerToolbarPickCommands(
      { constructPick: { multiple: true }, selectedProjectIds: ['a', 'b'] },
      {
        addLibraryMembers: vi.fn(),
        addSelectedConstructs,
        addConstructById: vi.fn(),
      },
    )
    commands.onAddConstruct?.()
    expect(addSelectedConstructs).toHaveBeenCalled()
  })
})

describe('toolbar file selection commands', () => {
  it('routes alignment add through the file selection port', () => {
    const addToAlignment = vi.fn()
    const commands = buildDatabaseManagerToolbarFileSelectionCommands(
      { selectedProjectIds: ['p1'], unfiledFolderId: 'unfiled', tagSuggestions: [] },
      {
        file: {
          addToAlignment,
          exportProjects: vi.fn(),
          renameProjectFile: vi.fn(),
          openMoveProjectsPicker: vi.fn(),
          resolveMoveTargetFolder: () => 'unfiled',
          setProjectTags: vi.fn(),
          trimHistory: vi.fn(),
          deleteProjects: vi.fn(),
          normalizeTagsFromRaw: () => [],
          sharedTagsForProjects: () => [],
          fileNameForProject: () => '',
          constructNameForProject: () => '',
        },
        textPrompt: { open: vi.fn(), close: vi.fn() },
        action: { run: vi.fn() },
        status: { report: vi.fn() },
      },
    )
    commands.onAddToAlignment()
    expect(addToAlignment).toHaveBeenCalledTimes(1)
  })

  it('routes export ids and format to the port', async () => {
    const exportProjects = vi.fn(async () => ({ message: 'exported' }))
    const report = vi.fn()
    const commands = buildDatabaseManagerToolbarFileSelectionCommands(
      { selectedProjectIds: ['p1', 'p2'], unfiledFolderId: 'unfiled', tagSuggestions: [] },
      {
        file: {
          addToAlignment: vi.fn(),
          exportProjects,
          renameProjectFile: vi.fn(),
          openMoveProjectsPicker: vi.fn(),
          resolveMoveTargetFolder: () => 'unfiled',
          setProjectTags: vi.fn(),
          trimHistory: vi.fn(),
          deleteProjects: vi.fn(),
          normalizeTagsFromRaw: () => [],
          sharedTagsForProjects: () => [],
          fileNameForProject: () => 'file.dna',
          constructNameForProject: () => 'Construct',
        },
        textPrompt: { open: vi.fn(), close: vi.fn() },
        action: { run: async (_label, fn) => fn() },
        status: { report },
      },
    )
    await commands.onExport('gb')
    expect(exportProjects).toHaveBeenCalledWith(['p1', 'p2'], 'gb')
    expect(report).toHaveBeenCalledWith('exported')
  })

  it('routes rename through action and reports exact success copy', async () => {
    const renameProjectFile = vi.fn(async () => ({ fileName: 'renamed.dna' }))
    const open = vi.fn()
    const close = vi.fn()
    const report = vi.fn()
    const commands = buildDatabaseManagerToolbarFileSelectionCommands(
      { selectedProjectIds: ['p1'], unfiledFolderId: 'unfiled', tagSuggestions: [] },
      {
        file: {
          addToAlignment: vi.fn(),
          exportProjects: vi.fn(),
          renameProjectFile,
          openMoveProjectsPicker: vi.fn(),
          resolveMoveTargetFolder: () => 'unfiled',
          setProjectTags: vi.fn(),
          trimHistory: vi.fn(),
          deleteProjects: vi.fn(),
          normalizeTagsFromRaw: () => [],
          sharedTagsForProjects: () => [],
          fileNameForProject: () => 'old.dna',
          constructNameForProject: () => 'Construct A',
        },
        textPrompt: { open, close },
        action: { run: async (_label, fn) => fn() },
        status: { report },
      },
    )
    commands.onRename()
    const request = open.mock.calls[0]![0]
    await request.onConfirm('renamed.dna')
    expect(renameProjectFile).toHaveBeenCalledWith('p1', 'renamed.dna')
    expect(report).toHaveBeenCalledWith(
      'Renamed file to “renamed.dna”. Construct name remains “Construct A”.',
    )
  })

  it('routes delete ids to the port', () => {
    const deleteProjects = vi.fn()
    const commands = buildDatabaseManagerToolbarFileSelectionCommands(
      { selectedProjectIds: ['a', 'b'], unfiledFolderId: 'unfiled', tagSuggestions: [] },
      {
        file: {
          addToAlignment: vi.fn(),
          exportProjects: vi.fn(),
          renameProjectFile: vi.fn(),
          openMoveProjectsPicker: vi.fn(),
          resolveMoveTargetFolder: () => 'unfiled',
          setProjectTags: vi.fn(),
          trimHistory: vi.fn(),
          deleteProjects,
          normalizeTagsFromRaw: () => [],
          sharedTagsForProjects: () => [],
          fileNameForProject: () => '',
          constructNameForProject: () => '',
        },
        textPrompt: { open: vi.fn(), close: vi.fn() },
        action: { run: vi.fn() },
        status: { report: vi.fn() },
      },
    )
    commands.onDelete()
    expect(deleteProjects).toHaveBeenCalledWith(['a', 'b'])
  })
})

describe('toolbar view mode commands', () => {
  it('routes each mode to setViewMode', () => {
    const setViewMode = vi.fn()
    const commands = buildDatabaseManagerToolbarViewModeCommands({ setViewMode })
    commands.onSelectDna()
    commands.onSelectPrimers()
    commands.onSelectProteins()
    commands.onSelectCdses()
    expect(setViewMode).toHaveBeenNthCalledWith(1, 'dna')
    expect(setViewMode).toHaveBeenNthCalledWith(2, 'primers')
    expect(setViewMode).toHaveBeenNthCalledWith(3, 'proteins')
    expect(setViewMode).toHaveBeenNthCalledWith(4, 'cdses')
  })
})

describe('toolbar folder commands', () => {
  it('opens move picker with folder id and parent', () => {
    const openMoveFolderPicker = vi.fn()
    const commands = buildDatabaseManagerToolbarFolderCommands(
      {
        browse: { kind: 'folder', folderId: 'f1' },
        folderId: 'f1',
        folderName: 'Lab',
        parentId: 'root',
      },
      {
        folder: {
          chooseSourceFolder: vi.fn(),
          renameFolder: vi.fn(),
          deleteFolder: vi.fn(),
          setBrowseAll: vi.fn(),
          openMoveFolderPicker,
          confirmDeleteFolder: () => true,
        },
        textPrompt: { open: vi.fn(), close: vi.fn() },
        action: { run: vi.fn() },
        status: { report: vi.fn() },
      },
    )
    commands.onMoveFolder()
    expect(openMoveFolderPicker).toHaveBeenCalledWith('f1', 'root')
  })
})

describe('toolbar primer common library commands', () => {
  it('adds non-common primers and reports add status', async () => {
    const addCommonPrimers = vi.fn(async () => ({
      added: [{ name: 'fwd' }],
      skipped: 0,
    }))
    const report = vi.fn()
    const commands = buildDatabaseManagerToolbarPrimerCommands(
      { selectedCount: 1, tagSuggestions: [] },
      {
        primer: {
          upsertCommonPrimer: vi.fn(),
          setPrimerKeysTags: vi.fn(),
          refreshPrimerLibrary: vi.fn(),
          refreshPrimerTags: vi.fn(),
          addCommonPrimers,
          deleteCommonPrimers: vi.fn(),
          addPrimersToCurrent: vi.fn(),
          tagsForPrimerKey: () => [],
          primerIdentityKey: () => 'k',
          commonTagsForKeys: () => [],
          confirmRemoveCommon: () => true,
          normalizeTagsFromRaw: () => [],
          isCommonPrimer: () => false,
          primerAt: () => ({
            key: 'k',
            name: 'fwd',
            sequence: 'ATGC',
            color: themeFixturePalette.primerTeal,
          }),
        },
        textPrompt: { open: vi.fn(), close: vi.fn() },
        action: { run: async (_label, fn) => fn() },
        status: { report },
        selection: { setSelectedIds: vi.fn(), setSelectionAnchorId: vi.fn() },
      },
    )
    commands.onAddToCommon()
    await vi.waitFor(() => {
      expect(addCommonPrimers).toHaveBeenCalled()
      expect(report).toHaveBeenCalledWith('Added “fwd” to Common primers.')
    })
  })
})

describe('toolbar protein commands', () => {
  it('opens every selected protein and routes alignment', () => {
    const openProteinAt = vi.fn()
    const addToAlignment = vi.fn()
    const commands = buildDatabaseManagerToolbarProteinCommands(
      { selectedIndices: [0, 1] },
      {
        protein: {
          addToAlignment,
          openProteinAt,
          copySequencesAt: vi.fn(),
          proteinAt: (index) => ({ name: `P${index}`, sequence: 'M' }),
          proteinCount: () => 2,
        },
        status: { report: vi.fn() },
      },
    )
    commands.onOpen()
    expect(openProteinAt).toHaveBeenCalledTimes(2)
    commands.onAddToAlignment()
    expect(addToAlignment).toHaveBeenCalled()
  })
})

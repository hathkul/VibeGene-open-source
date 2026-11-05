// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { labPlasmid } from '../../domain/fixtures'
import {
  useDatabaseHybridWorkflowCallbacks,
  useDatabaseManagerDialogController,
  useSequenceDatabaseImportDialogController,
} from './useDatabaseDialogsWorkflow'

describe('useDatabaseManagerDialogController', () => {
  afterEach(() => {
    document.body.replaceChildren()
  })

  it('focuses an existing database project before opening a new tab', async () => {
    const focusExistingDatabaseProject = vi.fn().mockResolvedValue(true)
    const openDatabaseProjectInNewTab = vi.fn()
    const setStatus = vi.fn()
    let props: ReturnType<typeof useDatabaseManagerDialogController> | undefined
    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)
    function Harness() {
      props = useDatabaseManagerDialogController({
        projects: [],
        currentRecordId: 'rec-1',
        alignmentPick: null,
        libraryMemberPick: null,
        refreshProjects: vi.fn(),
        focusExistingDatabaseProject,
        openDatabaseProjectInNewTab,
        addDatabasePrimers: vi.fn(),
        applyDatabaseConstructsToAlignment: vi.fn(),
        addLibraryMembersFromDatabase: vi.fn(),
        convertOpenConstructToLibraryFromDatabase: vi.fn(),
        deleteProjects: vi.fn(),
        removeRecentDatabaseProject: vi.fn(),
        setStatus,
        setDatabaseOpen: vi.fn(),
        clearDatabasePicks: vi.fn(),
      })
      return null
    }
    await act(async () => root.render(<Harness />))
    await act(async () => {
      props!.databaseManagerProps.onOpenProject({ id: 'p1', name: 'Alpha' } as never)
      await Promise.resolve()
    })
    expect(focusExistingDatabaseProject).toHaveBeenCalledWith('p1')
    expect(openDatabaseProjectInNewTab).not.toHaveBeenCalled()
    expect(setStatus).toHaveBeenCalledWith('Brought “Alpha” to the front.')
    act(() => root.unmount())
  })

  it('routes library member picks to convert vs add handlers', async () => {
    const addLibraryMembersFromDatabase = vi.fn()
    const convertOpenConstructToLibraryFromDatabase = vi.fn()
    let props: ReturnType<typeof useDatabaseManagerDialogController> | undefined
    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)
    function Harness({ purpose }: { purpose?: 'convert' | 'add' }) {
      props = useDatabaseManagerDialogController({
        projects: [],
        currentRecordId: 'rec-1',
        alignmentPick: null,
        libraryMemberPick: { targetRecordId: 'rec-1', purpose },
        refreshProjects: vi.fn(),
        focusExistingDatabaseProject: vi.fn(),
        openDatabaseProjectInNewTab: vi.fn(),
        addDatabasePrimers: vi.fn(),
        applyDatabaseConstructsToAlignment: vi.fn(),
        addLibraryMembersFromDatabase,
        convertOpenConstructToLibraryFromDatabase,
        deleteProjects: vi.fn(),
        removeRecentDatabaseProject: vi.fn(),
        setStatus: vi.fn(),
        setDatabaseOpen: vi.fn(),
        clearDatabasePicks: vi.fn(),
      })
      return null
    }
    await act(async () => root.render(<Harness purpose="convert" />))
    await act(async () => props!.databaseManagerProps.onAddLibraryMembers?.(['p1']))
    expect(convertOpenConstructToLibraryFromDatabase).toHaveBeenCalledWith(['p1'])
    await act(async () => root.render(<Harness purpose="add" />))
    await act(async () => props!.databaseManagerProps.onAddLibraryMembers?.(['p2']))
    expect(addLibraryMembersFromDatabase).toHaveBeenCalledWith(['p2'])
    act(() => root.unmount())
  })

  it('clears database picks when the manager closes', async () => {
    const clearDatabasePicks = vi.fn()
    const setDatabaseOpen = vi.fn()
    let close: (() => void) | undefined
    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)
    function Harness() {
      close = useDatabaseManagerDialogController({
        projects: [],
        currentRecordId: 'rec-1',
        alignmentPick: null,
        libraryMemberPick: null,
        refreshProjects: vi.fn(),
        focusExistingDatabaseProject: vi.fn(),
        openDatabaseProjectInNewTab: vi.fn(),
        addDatabasePrimers: vi.fn(),
        applyDatabaseConstructsToAlignment: vi.fn(),
        addLibraryMembersFromDatabase: vi.fn(),
        convertOpenConstructToLibraryFromDatabase: vi.fn(),
        deleteProjects: vi.fn(),
        removeRecentDatabaseProject: vi.fn(),
        setStatus: vi.fn(),
        setDatabaseOpen,
        clearDatabasePicks,
      }).onDatabaseClose
      return null
    }
    await act(async () => root.render(<Harness />))
    act(() => close?.())
    expect(setDatabaseOpen).toHaveBeenCalledWith(false)
    expect(clearDatabasePicks).toHaveBeenCalledOnce()
    act(() => root.unmount())
  })
})

describe('useSequenceDatabaseImportDialogController', () => {
  afterEach(() => {
    document.body.replaceChildren()
  })

  it('opens an imported sequence in a separate native window and preserves the save intent', async () => {
    let props: ReturnType<typeof useSequenceDatabaseImportDialogController> | undefined
    const openImportedRecordInNewWindow = vi.fn()
    const requestDocumentExit = vi.fn()
    const commitImportedRecord = vi.fn()
    const setSequenceDatabaseImportOpen = vi.fn()
    const setStatus = vi.fn()
    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)
    function Harness() {
      props = useSequenceDatabaseImportDialogController({
        isNativeDesktop: true,
        shouldOpenInNewWindow: () => true,
        openImportedRecordInNewWindow,
        requestDocumentExit,
        setSequenceDatabaseImportOpen,
        commitImportedRecord,
        setSaveToDialogOpen: vi.fn(),
        setStatus,
        openExternalUrl: vi.fn().mockResolvedValue(undefined),
      })
      return null
    }
    await act(async () => root.render(<Harness />))
    await act(async () => {
      props!.sequenceImportProps.onOpen({ ...labPlasmid, name: 'Imported sequence' }, true)
    })
    expect(openImportedRecordInNewWindow).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Imported sequence' }),
      { saveToDatabase: true, label: expect.stringContaining('Imported sequence') },
    )
    expect(requestDocumentExit).not.toHaveBeenCalled()
    expect(commitImportedRecord).not.toHaveBeenCalled()
    expect(setSequenceDatabaseImportOpen).toHaveBeenCalledWith(false)
    act(() => root.unmount())
  })

  it('keeps imported sequence replacement in place for a pristine native workspace', async () => {
    let props: ReturnType<typeof useSequenceDatabaseImportDialogController> | undefined
    const requestDocumentExit = vi.fn((action: () => void) => action())
    const commitImportedRecord = vi.fn()
    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)
    function Harness() {
      props = useSequenceDatabaseImportDialogController({
        isNativeDesktop: true,
        shouldOpenInNewWindow: () => false,
        requestDocumentExit,
        setSequenceDatabaseImportOpen: vi.fn(),
        commitImportedRecord,
        setSaveToDialogOpen: vi.fn(),
        setStatus: vi.fn(),
        openExternalUrl: vi.fn().mockResolvedValue(undefined),
      })
      return null
    }
    await act(async () => root.render(<Harness />))
    await act(async () => {
      props!.sequenceImportProps.onOpen({ ...labPlasmid, name: 'Imported sequence' }, false)
    })
    expect(requestDocumentExit).toHaveBeenCalledTimes(1)
    expect(commitImportedRecord).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Imported sequence' }),
      expect.stringContaining('Imported sequence'),
    )
    act(() => root.unmount())
  })
})

describe('useSequenceDatabaseImportDialogController', () => {
  afterEach(() => {
    document.body.replaceChildren()
  })

  it('runs import through document exit and optional save dialog', async () => {
    const requestDocumentExit = vi.fn((action: () => void) => action())
    const commitImportedRecord = vi.fn()
    const setSaveToDialogOpen = vi.fn()
    let props: ReturnType<typeof useSequenceDatabaseImportDialogController> | undefined
    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)
    function Harness() {
      props = useSequenceDatabaseImportDialogController({
        requestDocumentExit,
        setSequenceDatabaseImportOpen: vi.fn(),
        commitImportedRecord,
        setSaveToDialogOpen,
        setStatus: vi.fn(),
        openExternalUrl: vi.fn(),
      })
      return null
    }
    await act(async () => root.render(<Harness />))
    await act(async () => props!.sequenceImportProps.onOpen({
      id: 'seq-1',
      name: 'Gene',
      molecule: 'dna',
      topology: 'linear',
      sequence: 'ACGT',
      features: [],
      primers: [],
      operations: [],
      createdAt: '',
      updatedAt: '',
      externalSource: { provider: 'ncbi', accession: 'NM_1' },
    } as never, true))
    expect(requestDocumentExit).toHaveBeenCalledOnce()
    expect(commitImportedRecord).toHaveBeenCalledWith(expect.anything(), 'NCBI NM_1')
    expect(setSaveToDialogOpen).toHaveBeenCalledWith(true)
    act(() => root.unmount())
  })
})

describe('useDatabaseHybridWorkflowCallbacks', () => {
  it('forwards latest alignment callback through stable hybrid handlers', async () => {
    const first = vi.fn()
    const second = vi.fn()
    let handlers: ReturnType<typeof useDatabaseHybridWorkflowCallbacks> | undefined
    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)
    function Harness({ apply }: { apply: typeof first }) {
      handlers = useDatabaseHybridWorkflowCallbacks({
        addDatabasePrimers: vi.fn(),
        applyDatabaseConstructsToAlignment: apply,
        addLibraryMembersFromDatabase: vi.fn(),
        convertOpenConstructToLibraryFromDatabase: vi.fn(),
      })
      return null
    }
    await act(async () => root.render(<Harness apply={first} />))
    await act(async () => handlers!.addToAlignment('dna', []))
    expect(first).toHaveBeenCalledOnce()
    await act(async () => root.render(<Harness apply={second} />))
    await act(async () => handlers!.addToAlignment('protein', []))
    expect(second).toHaveBeenCalledOnce()
    act(() => root.unmount())
  })
})

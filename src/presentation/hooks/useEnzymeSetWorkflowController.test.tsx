// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'vitest'
import {
  useEnzymeSetWorkflowController,
  type EnzymeSetWorkflowInput,
  type EnzymeSetWorkflowPorts,
} from './useEnzymeSetWorkflowController'
import {
  defaultEnzymePreferences,
  type EnzymePreferences,
  type SavedEnzymeSet,
} from '../../domain/enzymePreferences'
import type { DisplaySettings } from '../sequence'

type Controller = ReturnType<typeof useEnzymeSetWorkflowController>

type PortCalls = {
  displayPatches: Array<Record<string, unknown>>
  preferences: EnzymePreferences[]
  fileSets: Array<SavedEnzymeSet[] | undefined>
  statuses: string[]
  downloads: Array<{ fileName: string; content: string }>
}

function makePreferences(overrides: Partial<EnzymePreferences> = {}): EnzymePreferences {
  return { ...defaultEnzymePreferences, ...overrides }
}

function setup(inputOverrides: Partial<EnzymeSetWorkflowInput> = {}) {
  const calls: PortCalls = {
    displayPatches: [],
    preferences: [],
    fileSets: [],
    statuses: [],
    downloads: [],
  }
  const input: EnzymeSetWorkflowInput = {
    displaySection: {
      visible: true,
      set: 'custom',
      selectedNames: ['EcoRI'],
      supplierSetId: null,
      showPositions: true,
    } as DisplaySettings['enzymes'],
    preferences: makePreferences(),
    parentalCounts: {},
    fileSets: [],
    ...inputOverrides,
  }
  const ports: EnzymeSetWorkflowPorts = {
    applyDisplayPatch: (patch) => calls.displayPatches.push({ ...patch }),
    applyPreferences: (next) => calls.preferences.push(next),
    commitFileSets: (sets) => calls.fileSets.push(sets),
    status: (message) => calls.statuses.push(message),
    download: (fileName, content) => calls.downloads.push({ fileName, content }),
    createId: () => 'created-id',
  }
  const latest: { controller: Controller | null } = { controller: null }

  function Harness() {
    latest.controller = useEnzymeSetWorkflowController(input, ports)
    return null
  }

  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  act(() => root.render(<Harness />))
  return { calls, latest, host, root }
}

const roots: Root[] = []
const hosts: HTMLElement[] = []

afterEach(() => {
  while (roots.length) act(() => roots.pop()!.unmount())
  while (hosts.length) hosts.pop()!.remove()
})

function mount(inputOverrides?: Partial<EnzymeSetWorkflowInput>) {
  const mounted = setup(inputOverrides)
  roots.push(mounted.root)
  hosts.push(mounted.host)
  return mounted
}

describe('useEnzymeSetWorkflowController', () => {
  it('opens the choose dialog from the current display section and confirms a custom selection', () => {
    const { calls, latest } = mount()
    expect(latest.controller!.chooseDraft).toBeNull()
    act(() => latest.controller!.openChoose())
    expect(latest.controller!.chooseDraft).not.toBeNull()
    expect(latest.controller!.chooseDraft!.selectedNames).toEqual(['EcoRI'])
    act(() => latest.controller!.confirmChoose(['EcoRI', 'BamHI']))
    expect(calls.displayPatches.at(-1)).toEqual({ set: 'custom', selectedNames: ['EcoRI', 'BamHI'], visible: true })
    expect(latest.controller!.chooseDraft).toBeNull()
  })

  it('applies choose-draft patches only while a draft is open', () => {
    const { latest } = mount()
    act(() => latest.controller!.applyChooseDraftPatch({ query: 'eco' }))
    expect(latest.controller!.chooseDraft).toBeNull()
    act(() => latest.controller!.openChoose())
    act(() => latest.controller!.applyChooseDraftPatch({ query: 'eco' }))
    expect(latest.controller!.chooseDraft!.query).toBe('eco')
  })

  it('selects a saved set by id and ignores unknown ids', () => {
    const { calls, latest } = mount({
      preferences: makePreferences({
        savedEnzymeSets: [{ id: 's1', name: 'Saved One', enzymeNames: ['EcoRI', 'HindIII'] }],
      }),
    })
    act(() => latest.controller!.selectSavedSet('missing'))
    expect(calls.displayPatches).toHaveLength(0)
    act(() => latest.controller!.selectSavedSet('s1'))
    expect(calls.displayPatches.at(-1)).toEqual({
      set: 'custom',
      selectedNames: ['EcoRI', 'HindIII'],
      supplierSetId: null,
      visible: true,
    })
  })

  it('selects a file set by id and ignores unknown ids', () => {
    const { calls, latest } = mount({
      fileSets: [{ id: 'f1', name: 'File One', enzymeNames: ['BamHI'] }],
    })
    act(() => latest.controller!.selectFileSet('missing'))
    expect(calls.displayPatches).toHaveLength(0)
    act(() => latest.controller!.selectFileSet('f1'))
    expect(calls.displayPatches.at(-1)).toMatchObject({ set: 'custom', selectedNames: ['BamHI'] })
  })

  it('toggles enzyme visibility through the display port', () => {
    const { calls, latest } = mount()
    act(() => latest.controller!.toggleVisibility())
    expect(calls.displayPatches).toEqual([{ visible: false }])
  })

  it('keeps the save dialog closed when the active export has no enzymes', () => {
    const { latest } = mount({
      displaySection: {
        visible: true,
        set: 'custom',
        selectedNames: [],
        supplierSetId: null,
        showPositions: true,
      } as DisplaySettings['enzymes'],
    })
    act(() => latest.controller!.openSaveSet())
    expect(latest.controller!.saveSetOpen).toBe(false)
  })

  it('opens the save dialog with the export name and global scope', () => {
    const { latest } = mount()
    act(() => latest.controller!.setSaveSetName('leftover'))
    act(() => latest.controller!.setSaveSetScope('file'))
    act(() => latest.controller!.openSaveSet())
    expect(latest.controller!.saveSetOpen).toBe(true)
    expect(latest.controller!.saveSetName).toBe('Custom (1)')
    expect(latest.controller!.saveSetScope).toBe('global')
  })

  it('confirms a global save through the preferences port and resets the dialog', () => {
    const { calls, latest } = mount()
    act(() => latest.controller!.openSaveSet())
    act(() => latest.controller!.setSaveSetName('My Set'))
    act(() => latest.controller!.confirmSaveSet())
    expect(calls.preferences).toHaveLength(1)
    expect(calls.preferences[0]!.savedEnzymeSets).toEqual([
      { id: 'created-id', name: 'My Set', enzymeNames: ['EcoRI'] },
    ])
    expect(calls.displayPatches.at(-1)).toMatchObject({ set: 'custom', selectedNames: ['EcoRI'] })
    expect(calls.statuses).toEqual(['Saved enzyme set “My Set”.'])
    expect(latest.controller!.saveSetOpen).toBe(false)
    expect(latest.controller!.saveSetName).toBe('')
  })

  it('confirms a file save through the file-sets port with the file status', () => {
    const { calls, latest } = mount()
    act(() => latest.controller!.openSaveSet())
    act(() => latest.controller!.setSaveSetName('File Set'))
    act(() => latest.controller!.setSaveSetScope('file'))
    act(() => latest.controller!.confirmSaveSet())
    expect(calls.fileSets).toEqual([[{ id: 'created-id', name: 'File Set', enzymeNames: ['EcoRI'] }]])
    expect(calls.preferences).toHaveLength(0)
    expect(calls.statuses).toEqual(['Saved enzyme set “File Set” to this file.'])
  })

  it('ignores a save confirmation with a blank name', () => {
    const { calls, latest } = mount()
    act(() => latest.controller!.openSaveSet())
    act(() => latest.controller!.setSaveSetName('   '))
    act(() => latest.controller!.confirmSaveSet())
    expect(calls.preferences).toHaveLength(0)
    expect(calls.fileSets).toHaveLength(0)
    expect(calls.statuses).toHaveLength(0)
    expect(latest.controller!.saveSetOpen).toBe(true)
  })

  it('downloads the active set export and reports the status', () => {
    const { calls, latest } = mount()
    act(() => latest.controller!.exportSet())
    expect(calls.downloads).toHaveLength(1)
    expect(calls.downloads[0]!.fileName).toBe('Custom_1.txt')
    expect(calls.statuses).toEqual(['Exported enzyme set “Custom (1)”.'])
  })

  it('reports the empty-set status without downloading', () => {
    const { calls, latest } = mount({
      displaySection: {
        visible: true,
        set: 'custom',
        selectedNames: [],
        supplierSetId: null,
        showPositions: true,
      } as DisplaySettings['enzymes'],
    })
    act(() => latest.controller!.exportSet())
    expect(calls.downloads).toHaveLength(0)
    expect(calls.statuses).toEqual(['No enzymes in the current set to export.'])
  })

  it('applies a manage-sets result to preferences and file sets and closes the dialog', () => {
    const { calls, latest } = mount()
    act(() => latest.controller!.setManageSetsOpen(true))
    act(() =>
      latest.controller!.confirmManageSets({
        savedEnzymeSets: [{ id: 's1', name: 'Saved', enzymeNames: ['EcoRI'] }],
        fileEnzymeSets: [],
      }),
    )
    expect(calls.preferences[0]!.savedEnzymeSets).toHaveLength(1)
    expect(calls.fileSets).toEqual([undefined])
    expect(calls.statuses).toEqual(['Updated enzyme sets.'])
    expect(latest.controller!.manageSetsOpen).toBe(false)
  })

  it('normalizes empty file-set lists when updating file sets', () => {
    const { calls, latest } = mount()
    act(() => latest.controller!.updateFileEnzymeSets([]))
    expect(calls.fileSets).toEqual([undefined])
    act(() => latest.controller!.updateFileEnzymeSets([{ id: 'f1', name: 'F', enzymeNames: ['EcoRI'] }]))
    expect(calls.fileSets[1]).toHaveLength(1)
  })

  it('exposes the noncutters dialog open state', () => {
    const { latest } = mount()
    expect(latest.controller!.noncuttersOpen).toBe(false)
    act(() => latest.controller!.setNoncuttersOpen(true))
    expect(latest.controller!.noncuttersOpen).toBe(true)
  })
})

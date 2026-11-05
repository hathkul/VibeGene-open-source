// @vitest-environment jsdom
import { act, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { defaultDisplaySettings } from '../sequence'
import type { NativeAppMenuAction } from '../../application/ports/nativeMenu'
import { useNativeAppMenuController, type NativeMenuCommands, type NativeMenuLifecycle, type NativeMenuState } from './useNativeAppMenuController'

function menuState(molecule: 'dna' | 'protein'): NativeMenuState {
  return {
    record: { name: molecule === 'protein' ? 'Protein' : 'DNA', molecule, sequence: molecule === 'protein' ? 'M' : 'ACGT', topology: 'circular', protein: undefined },
    documentSaveBinding: 'disk',
    canCreateFromSelection: false,
    canConvertToLibrary: false,
    canUndo: false,
    canRedo: false,
    canCopySelection: false,
    canCopyTranslation: false,
    hasSelection: false,
    canInvertSelection: false,
    canCropLibrary: false,
    canRenameFile: false,
    enzymesVisible: true,
    canSaveEnzymeSet: false,
    hasFeatureSelected: false,
    canMergeFeatures: false,
    canCloneSgRna: false,
    canExportSgRnas: false,
    hasSelectionRange: false,
    hasSelectionPoint: false,
    canRemoveCleavageSite: false,
    canShowSelectedFeatures: false,
    canHideSelectedFeatures: false,
    hasPrimerSelected: false,
    canShowSelectedPrimers: false,
    canHideSelectedPrimers: false,
    activeTab: 'Map',
    displaySettings: defaultDisplaySettings,
    effectiveDescriptionPanelVisible: true,
    traceDocument: false,
    nucleotideStrands: molecule === 'dna',
    selectedRange: null,
    enzymeTabCaretPosition: 0,
  }
}

describe('useNativeAppMenuController', () => {
  let host: HTMLDivElement
  let root: ReturnType<typeof createRoot>

  afterEach(() => {
    act(() => root?.unmount())
    host?.remove()
  })

  it('keeps dispatch current without resubscribing and cleans up on unmount', async () => {
    let dispatchAction: ((action: NativeAppMenuAction) => void) | undefined
    const focusCleanup = vi.fn()
    const subscribeActions = vi.fn(async (dispatch: (action: NativeAppMenuAction) => void) => {
      dispatchAction = dispatch
      return focusCleanup
    })
    const installMenu = vi.fn(async () => undefined)
    const syncEnabled = vi.fn(async () => undefined)
    const lifecycle: NativeMenuLifecycle = {
      isNativeDesktopApp: () => true,
      installMenu,
      subscribeActions,
      syncEnabled,
      rememberFocusedWindow: vi.fn(async () => undefined),
      takePendingMenuAction: vi.fn(async () => null),
      focus: {
        subscribe: vi.fn(async () => vi.fn()),
        isFocused: vi.fn(async () => true),
        isVisible: vi.fn(async () => true),
        showAndFocus: vi.fn(async () => undefined),
      },
    }
    const firstAbout = vi.fn()
    const secondAbout = vi.fn()
    const commands = (setAboutOpen: (open: boolean) => void): NativeMenuCommands => ({ setAboutOpen } as NativeMenuCommands)
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    let setMolecule: (molecule: 'dna' | 'protein') => void = () => undefined
    let setVersion: (version: number) => void = () => undefined
    function Harness() {
      const [molecule, updateMolecule] = useState<'dna' | 'protein'>('dna')
      const [version, updateVersion] = useState(0)
      setMolecule = updateMolecule
      setVersion = updateVersion
      useNativeAppMenuController(menuState(molecule), commands(version === 0 ? firstAbout : secondAbout), lifecycle)
      return null
    }
    await act(async () => root.render(<Harness />))
    expect(subscribeActions).toHaveBeenCalledTimes(1)
    act(() => dispatchAction?.('app.about'))
    expect(firstAbout).toHaveBeenCalledWith(true)
    await act(async () => setVersion(1))
    act(() => dispatchAction?.('app.about'))
    expect(secondAbout).toHaveBeenCalledWith(true)
    expect(subscribeActions).toHaveBeenCalledTimes(1)
    await act(async () => setMolecule('protein'))
    expect(subscribeActions).toHaveBeenCalledTimes(2)
    expect(installMenu).toHaveBeenCalledTimes(2)
    act(() => root.unmount())
    expect(focusCleanup).toHaveBeenCalledTimes(2)
  })

  it('does not reclaim a menu after unmount while focus resolution is pending', async () => {
    let resolveFocused: ((focused: boolean) => void) | undefined
    const installMenu = vi.fn(async () => undefined)
    const rememberFocusedWindow = vi.fn(async () => undefined)
    const lifecycle: NativeMenuLifecycle = {
      isNativeDesktopApp: () => true,
      installMenu,
      subscribeActions: vi.fn(async () => vi.fn()),
      syncEnabled: vi.fn(async () => undefined),
      rememberFocusedWindow,
      takePendingMenuAction: vi.fn(async () => null),
      focus: {
        subscribe: vi.fn(async () => vi.fn()),
        isFocused: vi.fn(() => new Promise<boolean>((resolve) => { resolveFocused = resolve })),
        isVisible: vi.fn(async () => true),
        showAndFocus: vi.fn(async () => undefined),
      },
    }
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    function Harness() {
      useNativeAppMenuController(menuState('dna'), {} as NativeMenuCommands, lifecycle)
      return null
    }

    await act(async () => root.render(<Harness />))
    expect(resolveFocused).toBeDefined()
    act(() => root.unmount())
    await act(async () => {
      resolveFocused!(true)
      await Promise.resolve()
    })
    expect(rememberFocusedWindow).not.toHaveBeenCalled()
    expect(installMenu).not.toHaveBeenCalled()
  })

  it('installs the native menu for an initially hidden window before showing it', async () => {
    const installMenu = vi.fn(async () => undefined)
    const syncEnabled = vi.fn(async () => undefined)
    const lifecycle: NativeMenuLifecycle = {
      isNativeDesktopApp: () => true,
      installMenu,
      subscribeActions: vi.fn(async () => vi.fn()),
      syncEnabled,
      rememberFocusedWindow: vi.fn(async () => undefined),
      takePendingMenuAction: vi.fn(async () => null),
      focus: {
        subscribe: vi.fn(async () => vi.fn()),
        isFocused: vi.fn(async () => false),
        isVisible: vi.fn(async () => false),
        showAndFocus: vi.fn(async () => undefined),
      },
    }
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    function Harness() {
      useNativeAppMenuController(menuState('dna'), {} as NativeMenuCommands, lifecycle)
      return null
    }

    await act(async () => root.render(<Harness />))

    expect(installMenu).toHaveBeenCalledWith(expect.any(Function), {
      reclaim: true,
      isProteinDocument: false,
      initial: true,
    })
    expect(syncEnabled).toHaveBeenCalled()
  })
})

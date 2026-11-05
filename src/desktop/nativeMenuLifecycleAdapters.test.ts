import { describe, expect, it, vi } from 'vitest'
import type { NativeAppMenuAction, NativeAppMenuEnabledState } from '../application/ports/nativeMenu'
import { createNativeMenuLifecycle, type NativeMenuFocusWindow, type NativeMenuLifecycleRuntime } from './nativeMenuLifecycleAdapters'

function runtime(overrides: Partial<NativeMenuLifecycleRuntime>): NativeMenuLifecycleRuntime {
  return {
    loadTakePendingMenuActionFromUrl: vi.fn(async () => ({
      takePendingMenuActionFromUrl: () => null,
    })),
    loadCurrentWindow: vi.fn(async (): Promise<NativeMenuFocusWindow> => ({
      onFocusChanged: vi.fn(async () => vi.fn()),
      isFocused: vi.fn(async () => false),
      isVisible: vi.fn(async () => true),
      show: vi.fn(async () => undefined),
      setFocus: vi.fn(async () => undefined),
    })),
    isNativeDesktopApp: vi.fn(() => true),
    installMenu: vi.fn(async () => undefined),
    subscribeActions: vi.fn(async () => vi.fn()),
    syncEnabled: vi.fn(async () => undefined),
    rememberFocusedWindow: vi.fn(async () => undefined),
    ...overrides,
  }
}

describe('nativeMenuLifecycleAdapters', () => {
  it('delegates pending menu action retrieval', async () => {
    const takePendingMenuActionFromUrl = vi.fn((): NativeAppMenuAction | null => 'help.about')
    const loadTakePendingMenuActionFromUrl = vi.fn(async () => ({ takePendingMenuActionFromUrl }))
    const lifecycle = createNativeMenuLifecycle(runtime({ loadTakePendingMenuActionFromUrl }))

    await expect(lifecycle.takePendingMenuAction()).resolves.toBe('help.about')
    expect(loadTakePendingMenuActionFromUrl).toHaveBeenCalledTimes(1)
    expect(takePendingMenuActionFromUrl).toHaveBeenCalledTimes(1)
  })

  it('forwards focus subscription only when payload is true and returns cleanup', async () => {
    let focusHandler: ((event: { payload: boolean }) => void) | undefined
    const stopListening = vi.fn()
    const onFocusChanged = vi.fn(async (handler: (event: { payload: boolean }) => void) => {
      focusHandler = handler
      return stopListening
    })
    const loadCurrentWindow = vi.fn(async (): Promise<NativeMenuFocusWindow> => ({
      onFocusChanged,
      isFocused: vi.fn(async () => false),
      isVisible: vi.fn(async () => true),
      show: vi.fn(async () => undefined),
      setFocus: vi.fn(async () => undefined),
    }))
    const lifecycle = createNativeMenuLifecycle(runtime({ loadCurrentWindow }))
    const onFocused = vi.fn()
    const cleanup = await lifecycle.focus.subscribe(onFocused)

    expect(onFocusChanged).toHaveBeenCalledTimes(1)
    focusHandler?.({ payload: false })
    focusHandler?.({ payload: true })
    expect(onFocused).toHaveBeenCalledTimes(1)
    cleanup()
    expect(stopListening).toHaveBeenCalledTimes(1)
  })

  it('queries native focus through the current window', async () => {
    const isFocused = vi.fn(async () => true)
    const loadCurrentWindow = vi.fn(async (): Promise<NativeMenuFocusWindow> => ({
      onFocusChanged: vi.fn(async () => vi.fn()),
      isFocused,
      isVisible: vi.fn(async () => true),
      show: vi.fn(async () => undefined),
      setFocus: vi.fn(async () => undefined),
    }))
    const lifecycle = createNativeMenuLifecycle(runtime({ loadCurrentWindow }))

    await expect(lifecycle.focus.isFocused()).resolves.toBe(true)
    expect(loadCurrentWindow).toHaveBeenCalledTimes(1)
    expect(isFocused).toHaveBeenCalledTimes(1)
  })

  it('delegates native window visibility queries', async () => {
    const isVisible = vi.fn(async () => false)
    const loadCurrentWindow = vi.fn(async (): Promise<NativeMenuFocusWindow> => ({
      onFocusChanged: vi.fn(async () => vi.fn()),
      isFocused: vi.fn(async () => false),
      isVisible,
      show: vi.fn(async () => undefined),
      setFocus: vi.fn(async () => undefined),
    }))
    const lifecycle = createNativeMenuLifecycle(runtime({ loadCurrentWindow }))

    await expect(lifecycle.focus.isVisible()).resolves.toBe(false)
    expect(isVisible).toHaveBeenCalledTimes(1)
  })

  it('shows and focuses the current native window', async () => {
    const show = vi.fn(async () => undefined)
    const setFocus = vi.fn(async () => undefined)
    const loadCurrentWindow = vi.fn(async (): Promise<NativeMenuFocusWindow> => ({
      onFocusChanged: vi.fn(async () => vi.fn()),
      isFocused: vi.fn(async () => false),
      isVisible: vi.fn(async () => false),
      show,
      setFocus,
    }))
    const lifecycle = createNativeMenuLifecycle(runtime({ loadCurrentWindow }))

    await lifecycle.focus.showAndFocus()

    expect(show).toHaveBeenCalledTimes(1)
    expect(setFocus).toHaveBeenCalledTimes(1)
  })

  it('delegates menu installation, action subscription, enabled sync, and focused window registration', async () => {
    const dispatch = vi.fn()
    const enabled: NativeAppMenuEnabledState = {
      canCreateFromSelection: false,
      canConvertToLibrary: false,
      canUndo: false,
      canRedo: false,
      canCopySelection: false,
      canCopyTranslation: false,
      hasSequence: true,
      hasSelection: false,
      canInvertSelection: false,
      canCropLibrary: false,
      isCircular: true,
      isLinear: false,
      isProteinDocument: false,
      workspaceDocumentBinding: 'disk',
      canRenameFile: false,
      enzymesVisible: true,
      canSaveEnzymeSet: false,
      hasFeatureSelected: false,
      canMergeFeatures: false,
      hasSelectionRange: false,
      hasSelectionPoint: false,
      canRemoveCleavageSite: false,
      canShowSelectedFeatures: false,
      canHideSelectedFeatures: false,
      hasPrimerSelected: false,
      canShowSelectedPrimers: false,
      canHideSelectedPrimers: false,
      activeTab: 'Map',
      alignmentsVisible: false,
      descriptionPanelVisible: true,
      canToggleDescriptionPanel: true,
      featuresVisible: true,
      featureLabelsVisible: true,
      proteinColorsVisible: false,
      proteinVisualControlsVisible: false,
      hasProteinVariableRegions: false,
    }
    const installMenu = vi.fn(async () => undefined)
    const unsubscribe = vi.fn()
    const subscribeActions = vi.fn(async () => unsubscribe)
    const syncEnabled = vi.fn(async () => undefined)
    const rememberFocusedWindow = vi.fn(async () => undefined)
    const isNativeDesktopApp = vi.fn(() => false)
    const lifecycle = createNativeMenuLifecycle(runtime({
      installMenu,
      subscribeActions,
      syncEnabled,
      rememberFocusedWindow,
      isNativeDesktopApp,
    }))

    await lifecycle.installMenu(dispatch, { reclaim: true, isProteinDocument: true })
    await lifecycle.subscribeActions(dispatch)
    await lifecycle.syncEnabled(enabled)
    await lifecycle.rememberFocusedWindow()

    expect(installMenu).toHaveBeenCalledWith(dispatch, { reclaim: true, isProteinDocument: true })
    expect(subscribeActions).toHaveBeenCalledWith(dispatch)
    expect(syncEnabled).toHaveBeenCalledWith(enabled)
    expect(rememberFocusedWindow).toHaveBeenCalledTimes(1)
    expect(lifecycle.isNativeDesktopApp()).toBe(false)
    expect(isNativeDesktopApp).toHaveBeenCalledTimes(1)
  })

  it('returns subscribeActions cleanup from runtime without wrapping', async () => {
    const dispatch = vi.fn()
    const unsubscribe = vi.fn()
    const subscribeActions = vi.fn(async () => unsubscribe)
    const lifecycle = createNativeMenuLifecycle(runtime({ subscribeActions }))

    const cleanup = await lifecycle.subscribeActions(dispatch)

    expect(subscribeActions).toHaveBeenCalledWith(dispatch)
    expect(cleanup).toBe(unsubscribe)
    cleanup()
    expect(unsubscribe).toHaveBeenCalledTimes(1)
  })
})

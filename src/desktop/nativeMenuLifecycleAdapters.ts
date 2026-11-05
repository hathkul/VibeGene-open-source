import type { NativeAppMenuAction, NativeAppMenuEnabledState } from '../application/ports/nativeMenu'
import {
  installNativeAppMenu,
  isNativeDesktopApp,
  rememberFocusedWorkspaceWindow,
  subscribeNativeAppMenuActions,
  syncNativeAppMenuEnabled,
} from './nativeAppMenu'

/** Tauri window focus surface used by the native menu lifecycle adapter. */
export type NativeMenuFocusWindow = {
  onFocusChanged: (handler: (event: { payload: boolean }) => void) => Promise<() => void>
  isFocused: () => Promise<boolean>
  isVisible: () => Promise<boolean>
  show: () => Promise<void>
  setFocus: () => Promise<void>
}

export type NativeMenuLifecycleAdapters = {
  isNativeDesktopApp: () => boolean
  installMenu: (
    dispatch: (action: NativeAppMenuAction) => void,
    options: { reclaim: boolean; isProteinDocument: boolean; initial?: boolean },
  ) => Promise<void>
  subscribeActions: (dispatch: (action: NativeAppMenuAction) => void) => Promise<() => void>
  syncEnabled: (state: NativeAppMenuEnabledState) => Promise<void>
  rememberFocusedWindow: () => Promise<void>
  takePendingMenuAction: () => Promise<NativeAppMenuAction | null>
  focus: {
    subscribe: (onFocused: () => void) => Promise<() => void>
    isFocused: () => Promise<boolean>
    isVisible: () => Promise<boolean>
    showAndFocus: () => Promise<void>
  }
}

export type NativeMenuLifecycleRuntime = {
  loadTakePendingMenuActionFromUrl: () => Promise<{
    takePendingMenuActionFromUrl: (search?: string) => NativeAppMenuAction | null
  }>
  loadCurrentWindow: () => Promise<NativeMenuFocusWindow>
  isNativeDesktopApp: () => boolean
  installMenu: NativeMenuLifecycleAdapters['installMenu']
  subscribeActions: NativeMenuLifecycleAdapters['subscribeActions']
  syncEnabled: NativeMenuLifecycleAdapters['syncEnabled']
  rememberFocusedWindow: NativeMenuLifecycleAdapters['rememberFocusedWindow']
}

const defaultNativeMenuLifecycleRuntime: NativeMenuLifecycleRuntime = {
  loadTakePendingMenuActionFromUrl: () => import('./globalMenuActions'),
  loadCurrentWindow: async () => {
    const { getCurrentWindow } = await import('@tauri-apps/api/window')
    return getCurrentWindow()
  },
  isNativeDesktopApp,
  installMenu: installNativeAppMenu,
  subscribeActions: subscribeNativeAppMenuActions,
  syncEnabled: syncNativeAppMenuEnabled,
  rememberFocusedWindow: rememberFocusedWorkspaceWindow,
}

export function createNativeMenuLifecycle(
  runtime: NativeMenuLifecycleRuntime = defaultNativeMenuLifecycleRuntime,
): NativeMenuLifecycleAdapters {
  return {
    takePendingMenuAction: async () => {
      const { takePendingMenuActionFromUrl } = await runtime.loadTakePendingMenuActionFromUrl()
      return takePendingMenuActionFromUrl()
    },
    focus: {
      subscribe: async (onFocused) => {
        const window = await runtime.loadCurrentWindow()
        return window.onFocusChanged(({ payload }) => {
          if (payload) onFocused()
        })
      },
      isFocused: async () => {
        const window = await runtime.loadCurrentWindow()
        return window.isFocused()
      },
      isVisible: async () => {
        const window = await runtime.loadCurrentWindow()
        return window.isVisible()
      },
      showAndFocus: async () => {
        const window = await runtime.loadCurrentWindow()
        await window.show()
        await window.setFocus()
      },
    },
    isNativeDesktopApp: runtime.isNativeDesktopApp,
    installMenu: runtime.installMenu,
    subscribeActions: runtime.subscribeActions,
    syncEnabled: runtime.syncEnabled,
    rememberFocusedWindow: runtime.rememberFocusedWindow,
  }
}

export const nativeMenuLifecycleAdapters = createNativeMenuLifecycle()

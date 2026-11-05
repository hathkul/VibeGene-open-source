// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useDesktopWindowLifecycle } from './useDesktopWindowLifecycle'

describe('useDesktopWindowLifecycle', () => {
  let host: HTMLDivElement
  let root: ReturnType<typeof createRoot>

  afterEach(() => {
    act(() => root?.unmount())
    host?.remove()
    vi.clearAllMocks()
  })

  it('routes the native menu quit through the same guarded exit workflow as native quit events', async () => {
    const requestExit = vi.fn()
    const confirmNativeQuitHasSingleWorkspaceGuard = vi.fn().mockResolvedValue(true)
    const quitNativeAppAfterDatabaseSync = vi.fn().mockResolvedValue(true)
    let requestNativeQuit: (() => void) | undefined
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)

    function Harness() {
      const lifecycle = useDesktopWindowLifecycle({
        isNativeDesktop: false,
        removeOpenTab: vi.fn().mockResolvedValue(undefined),
        subscribeDesktopCloseRequested: vi.fn().mockResolvedValue(() => {}),
        subscribeDesktopQuitRequested: vi.fn().mockResolvedValue(() => {}),
        confirmNativeQuitHasSingleWorkspaceGuard,
        shouldHoldCloseForDatabaseSync: vi.fn().mockResolvedValue(false),
        maybeSyncDatabaseOnExit: vi.fn(),
        destroyCurrentDesktopWindow: vi.fn().mockResolvedValue(undefined),
        quitNativeAppAfterDatabaseSync,
        tabId: 'tab-1',
        isDirtyRef: { current: true },
        pendingExitRef: { current: null },
        closeInProgressRef: { current: false },
        setSyncProgress: vi.fn(),
        requestExit,
      })
      requestNativeQuit = lifecycle.requestNativeQuit
      return null
    }

    await act(async () => { root.render(<Harness />) })
    act(() => requestNativeQuit!())
    await act(async () => { await Promise.resolve() })

    expect(requestExit).toHaveBeenCalledTimes(1)
    expect(requestExit.mock.calls[0][1]).toEqual({ context: 'app-quit' })
    await requestExit.mock.calls[0][0]()
    expect(quitNativeAppAfterDatabaseSync).toHaveBeenCalledTimes(1)
  })

  it('closes clean windows without waiting for a failed sync attempt', async () => {
    const requestExit = vi.fn()
    const removeOpenTab = vi.fn().mockResolvedValue(undefined)
    const destroyCurrentDesktopWindow = vi.fn().mockResolvedValue(undefined)
    const shouldHoldCloseForDatabaseSync = vi.fn().mockResolvedValue(true)
    const maybeSyncDatabaseOnExit = vi.fn().mockResolvedValue({ ok: false, error: 'offline' })
    const setSyncProgress = vi.fn()
    let closeHandler: ((preventClose: () => void) => void | Promise<void>) | undefined
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    function Harness() {
      useDesktopWindowLifecycle({
        isNativeDesktop: true,
        removeOpenTab,
        subscribeDesktopCloseRequested: async (handler) => { closeHandler = handler; return () => {} },
        subscribeDesktopQuitRequested: async () => () => {},
        confirmNativeQuitHasSingleWorkspaceGuard: async () => true,
        shouldHoldCloseForDatabaseSync,
        maybeSyncDatabaseOnExit,
        destroyCurrentDesktopWindow,
        quitNativeAppAfterDatabaseSync: async () => true,
        tabId: 'tab-1',
        isDirtyRef: { current: false },
        pendingExitRef: { current: null },
        closeInProgressRef: { current: false },
        setSyncProgress,
        requestExit,
      })
      return null
    }
    await act(async () => { root!.render(<Harness />); await Promise.resolve() })
    const preventClose = vi.fn()
    await closeHandler!(preventClose)
    expect(preventClose).toHaveBeenCalledTimes(1)
    expect(maybeSyncDatabaseOnExit).not.toHaveBeenCalled()
    expect(removeOpenTab).toHaveBeenCalledWith('tab-1')
    expect(destroyCurrentDesktopWindow).toHaveBeenCalledTimes(1)
    expect(setSyncProgress).toHaveBeenLastCalledWith(null)
  })

  it('routes clean closes through explicit destruction instead of Tauri auto-close', async () => {
    const removeOpenTab = vi.fn().mockResolvedValue(undefined)
    const destroyCurrentDesktopWindow = vi.fn().mockResolvedValue(undefined)
    let closeHandler: ((preventClose: () => void) => void | Promise<void>) | undefined
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    function Harness() {
      useDesktopWindowLifecycle({
        isNativeDesktop: true,
        removeOpenTab,
        subscribeDesktopCloseRequested: async (handler) => { closeHandler = handler; return () => {} },
        subscribeDesktopQuitRequested: async () => () => {},
        confirmNativeQuitHasSingleWorkspaceGuard: async () => true,
        shouldHoldCloseForDatabaseSync: async () => false,
        maybeSyncDatabaseOnExit: vi.fn(),
        destroyCurrentDesktopWindow,
        quitNativeAppAfterDatabaseSync: async () => true,
        tabId: 'tab-1',
        isDirtyRef: { current: false },
        pendingExitRef: { current: null },
        closeInProgressRef: { current: false },
        setSyncProgress: vi.fn(),
        requestExit: vi.fn(),
      })
      return null
    }
    await act(async () => { root!.render(<Harness />); await Promise.resolve() })
    const preventClose = vi.fn()
    await closeHandler!(preventClose)
    expect(preventClose).toHaveBeenCalledTimes(1)
    expect(removeOpenTab).toHaveBeenCalledWith('tab-1')
    expect(destroyCurrentDesktopWindow).toHaveBeenCalledTimes(1)
  })

  it('clears sync progress after a successful controlled close', async () => {
    const setSyncProgress = vi.fn()
    const destroyCurrentDesktopWindow = vi.fn().mockResolvedValue(undefined)
    let closeHandler: ((preventClose: () => void) => void | Promise<void>) | undefined
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    function Harness() {
      useDesktopWindowLifecycle({
        isNativeDesktop: true,
        removeOpenTab: vi.fn().mockResolvedValue(undefined),
        subscribeDesktopCloseRequested: async (handler) => { closeHandler = handler; return () => {} },
        subscribeDesktopQuitRequested: async () => () => {},
        confirmNativeQuitHasSingleWorkspaceGuard: async () => true,
        shouldHoldCloseForDatabaseSync: async () => true,
        maybeSyncDatabaseOnExit: async (onProgress) => {
          onProgress?.({ phase: 'syncing', folderIndex: 1, folderTotal: 1, folderPath: '/tmp/db', done: 1, total: 1, itemName: 'done' })
          return { ok: true, conflicts: 0, syncedFolders: 1 }
        },
        destroyCurrentDesktopWindow,
        quitNativeAppAfterDatabaseSync: async () => true,
        tabId: 'tab-1',
        isDirtyRef: { current: false },
        pendingExitRef: { current: null },
        closeInProgressRef: { current: false },
        setSyncProgress,
        requestExit: vi.fn(),
      })
      return null
    }
    await act(async () => { root!.render(<Harness />); await Promise.resolve() })
    await closeHandler!(vi.fn())
    expect(destroyCurrentDesktopWindow).toHaveBeenCalledTimes(1)
    expect(setSyncProgress).toHaveBeenLastCalledWith(null)
  })

  it('still hides after Close Anyway when tab-heartbeat cleanup fails', async () => {
    const destroyCurrentDesktopWindow = vi.fn().mockResolvedValue(undefined)
    let closeHandler: ((preventClose: () => void) => void | Promise<void>) | undefined
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    function Harness() {
      useDesktopWindowLifecycle({
        isNativeDesktop: true,
        removeOpenTab: vi.fn().mockRejectedValue(new Error('IndexedDB unavailable')),
        subscribeDesktopCloseRequested: async (handler) => { closeHandler = handler; return () => {} },
        subscribeDesktopQuitRequested: async () => () => {},
        confirmNativeQuitHasSingleWorkspaceGuard: async () => true,
        shouldHoldCloseForDatabaseSync: async () => true,
        maybeSyncDatabaseOnExit: async () => ({ ok: false, error: '4 sync conflicts need review' }),
        destroyCurrentDesktopWindow,
        quitNativeAppAfterDatabaseSync: async () => true,
        tabId: 'tab-1',
        isDirtyRef: { current: false },
        pendingExitRef: { current: null },
        closeInProgressRef: { current: false },
        setSyncProgress: vi.fn(),
        requestExit: vi.fn(),
      })
      return null
    }
    await act(async () => { root!.render(<Harness />); await Promise.resolve() })
    await closeHandler!(vi.fn())
    expect(destroyCurrentDesktopWindow).toHaveBeenCalledTimes(1)
    confirm.mockRestore()
  })

  it('routes dirty close through requestExit and completes the native destruction path', async () => {
    const requestExit = vi.fn()
    const removeOpenTab = vi.fn().mockResolvedValue(undefined)
    const destroyCurrentDesktopWindow = vi.fn().mockResolvedValue(undefined)
    let closeHandler: ((preventClose: () => void) => void | Promise<void>) | undefined
    const refs = {
      isDirtyRef: { current: true },
      pendingExitRef: { current: null as { context?: string } | null },
      closeInProgressRef: { current: false },
    }
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    function Harness() {
      useDesktopWindowLifecycle({
        isNativeDesktop: true,
        removeOpenTab,
        subscribeDesktopCloseRequested: async (handler) => { closeHandler = handler; return () => {} },
        subscribeDesktopQuitRequested: async () => () => {},
        confirmNativeQuitHasSingleWorkspaceGuard: async () => true,
        shouldHoldCloseForDatabaseSync: async () => false,
        maybeSyncDatabaseOnExit: vi.fn(),
        destroyCurrentDesktopWindow,
        quitNativeAppAfterDatabaseSync: async () => true,
        tabId: 'tab-1',
        ...refs,
        setSyncProgress: vi.fn(),
        requestExit,
      })
      return null
    }
    await act(async () => { root!.render(<Harness />); await Promise.resolve() })
    const preventClose = vi.fn()
    await closeHandler!(preventClose)
    expect(preventClose).toHaveBeenCalledTimes(1)
    expect(requestExit).toHaveBeenCalledWith(expect.any(Function), { context: 'window-close' })
    await requestExit.mock.calls[0][0]()
    expect(removeOpenTab).toHaveBeenCalledWith('tab-1')
    expect(destroyCurrentDesktopWindow).toHaveBeenCalledTimes(1)
  })

  it('stops close and quit listeners when subscriptions resolve after unmount', async () => {
    let resolveClose: ((stop: () => void) => void) | undefined
    let resolveQuit: ((stop: () => void) => void) | undefined
    const stopClose = vi.fn()
    const stopQuit = vi.fn()
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    function Harness() {
      useDesktopWindowLifecycle({
        isNativeDesktop: true,
        removeOpenTab: vi.fn().mockResolvedValue(undefined),
        subscribeDesktopCloseRequested: async () => new Promise((resolve) => { resolveClose = resolve }),
        subscribeDesktopQuitRequested: async () => new Promise((resolve) => { resolveQuit = resolve }),
        confirmNativeQuitHasSingleWorkspaceGuard: async () => true,
        shouldHoldCloseForDatabaseSync: async () => false,
        maybeSyncDatabaseOnExit: vi.fn(),
        destroyCurrentDesktopWindow: vi.fn().mockResolvedValue(undefined),
        quitNativeAppAfterDatabaseSync: async () => true,
        tabId: 'tab-1',
        isDirtyRef: { current: false },
        pendingExitRef: { current: null },
        closeInProgressRef: { current: false },
        setSyncProgress: vi.fn(),
        requestExit: vi.fn(),
      })
      return null
    }
    await act(async () => { root!.render(<Harness />); await Promise.resolve() })
    act(() => root!.unmount())
    resolveClose!(stopClose)
    resolveQuit!(stopQuit)
    await act(async () => { await Promise.resolve() })
    expect(stopClose).toHaveBeenCalledTimes(1)
    expect(stopQuit).toHaveBeenCalledTimes(1)
  })
})

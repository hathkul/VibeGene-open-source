// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { RecentDocumentLifecyclePorts } from './useRecentDocumentLifecycle'
import { useRecentDocumentLifecycle } from './useRecentDocumentLifecycle'

describe('useRecentDocumentLifecycle', () => {
  let host: HTMLDivElement | undefined
  let root: ReturnType<typeof createRoot> | undefined

  afterEach(() => {
    act(() => root?.unmount())
    host?.remove()
  })

  function makePorts(overrides: Partial<RecentDocumentLifecyclePorts> = {}): RecentDocumentLifecyclePorts {
    return {
      listRecentFiles: () => [],
      recentFilesChangedEvent: 'recent-test',
      removeRecentDatabaseProject: vi.fn(),
      removeRecentLocalFile: vi.fn(),
      touchRecentLocalFile: vi.fn(),
      getProject: vi.fn().mockResolvedValue(null),
      isSessionDraftId: () => false,
      isNativeDesktop: false,
      bytesToFile: (name, bytes) => new File([bytes as unknown as ArrayBuffer], name),
      readDroppedDesktopPaths: vi.fn().mockResolvedValue([]),
      openRecentLocalPath: vi.fn().mockResolvedValue(null),
      subscribeDesktopOpenedFiles: vi.fn().mockResolvedValue(() => {}),
      openWorkspaceWindow: vi.fn().mockResolvedValue('opened'),
      putFileOpenHandoff: vi.fn().mockResolvedValue(undefined),
      takeFileOpenHandoff: vi.fn().mockResolvedValue(null),
      claimWorkspaceDocument: vi.fn(),
      claimedWorkspaceWindowLabel: vi.fn().mockReturnValue(null),
      focusExistingWorkspaceDocument: vi.fn().mockResolvedValue(false),
      getCurrentWindowLabel: vi.fn().mockResolvedValue('window-1'),
      handoffRecord: null,
      maxRecentFiles: 5,
      sessionDrafts: [],
      syncNativeDrafts: vi.fn(),
      syncNativeRecent: vi.fn(),
      recentDetail: () => '',
      bootOpenedFromHandoff: false,
      bootOpenedFromDiskFile: false,
      clearBootFileQueryParams: vi.fn(),
      shouldOpenInNewWindow: () => false,
      requestExit: (action) => { void action() },
      handleFile: vi.fn().mockResolvedValue(undefined),
      loadProject: vi.fn().mockResolvedValue(undefined),
      openRecordInNewTab: vi.fn(),
      setStatus: vi.fn(),
      ...overrides,
    }
  }

  it('removes stale database recents and reports web local-file behavior', async () => {
    const stale = { kind: 'database' as const, name: 'Missing', projectId: 'missing', openedAt: 'now' }
    const setStatus = vi.fn()
    const removeRecentDatabaseProject = vi.fn()
    const ports = makePorts({ listRecentFiles: () => [stale], setStatus, removeRecentDatabaseProject })
    let openRecentFile: ((entry: typeof stale) => void) | undefined
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    function Harness() {
      openRecentFile = useRecentDocumentLifecycle(ports).openRecentFile
      return null
    }
    await act(async () => { root!.render(<Harness />); await Promise.resolve() })
    await act(async () => { openRecentFile!(stale); await Promise.resolve() })
    expect(removeRecentDatabaseProject).toHaveBeenCalledWith('missing')
    expect(setStatus).toHaveBeenCalledWith('Could not open “Missing”.')
  })

  it('focuses an existing local document before opening a handoff window', async () => {
    const entry = { kind: 'local' as const, name: 'A.gb', path: '/tmp/A.gb', openedAt: 'now' }
    const focusExistingWorkspaceDocument = vi.fn().mockResolvedValue(false)
    const putFileOpenHandoff = vi.fn().mockResolvedValue(undefined)
    const openWorkspaceWindow = vi.fn().mockResolvedValue('opened' as const)
    const ports = makePorts({
      isNativeDesktop: true,
      shouldOpenInNewWindow: () => true,
      listRecentFiles: () => [entry],
      focusExistingWorkspaceDocument,
      readDroppedDesktopPaths: vi.fn().mockResolvedValue([{ path: entry.path, name: entry.name, bytes: new Uint8Array([1]) }]),
      putFileOpenHandoff,
      openWorkspaceWindow,
    })
    let openRecentFile: ((item: typeof entry) => void) | undefined
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    function Harness() {
      openRecentFile = useRecentDocumentLifecycle(ports).openRecentFile
      return null
    }
    await act(async () => { root!.render(<Harness />); await Promise.resolve() })
    await act(async () => { openRecentFile!(entry); await Promise.resolve() })
    expect(focusExistingWorkspaceDocument).toHaveBeenCalledWith({ kind: 'file', path: entry.path })
    expect(putFileOpenHandoff).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ path: entry.path }))
    expect(openWorkspaceWindow).toHaveBeenCalledWith(expect.objectContaining({ documentKey: { kind: 'file', path: entry.path } }))
  })

  it('removes a missing local recent file after the guarded reopen attempt', async () => {
    const entry = { kind: 'local' as const, name: 'Missing.gb', path: '/tmp/missing.gb', openedAt: 'now' }
    const removeRecentLocalFile = vi.fn()
    const setStatus = vi.fn()
    const ports = makePorts({
      isNativeDesktop: true,
      listRecentFiles: () => [entry],
      openRecentLocalPath: vi.fn().mockResolvedValue(null),
      removeRecentLocalFile,
      setStatus,
    })
    let openRecentFile: ((item: typeof entry) => void) | undefined
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    function Harness() {
      openRecentFile = useRecentDocumentLifecycle(ports).openRecentFile
      return null
    }
    await act(async () => { root!.render(<Harness />); await Promise.resolve() })
    await act(async () => { openRecentFile!(entry); await Promise.resolve() })
    expect(removeRecentLocalFile).toHaveBeenCalledWith(entry.path)
    expect(setStatus).toHaveBeenCalledWith('Could not open “Missing.gb”.')
  })

  it('falls back from a missing handoff to directPath and clears startup query params', async () => {
    const original = window.location.href
    window.history.replaceState({}, '', '/?fileHandoff=missing&openPath=%2Ftmp%2Ffallback.gb')
    const clearBootFileQueryParams = vi.fn()
    const handleFile = vi.fn().mockResolvedValue(undefined)
    const readDroppedDesktopPaths = vi.fn().mockResolvedValue([
      { path: '/tmp/fallback.gb', name: 'fallback.gb', bytes: new Uint8Array([1]) },
    ])
    const ports = makePorts({
      isNativeDesktop: true,
      clearBootFileQueryParams,
      takeFileOpenHandoff: vi.fn().mockResolvedValue(null),
      readDroppedDesktopPaths,
      handleFile,
    })
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    function Harness() { useRecentDocumentLifecycle(ports); return null }
    await act(async () => { root!.render(<Harness />); await Promise.resolve(); await Promise.resolve() })
    expect(readDroppedDesktopPaths).toHaveBeenCalledWith(['/tmp/fallback.gb'])
    expect(clearBootFileQueryParams).toHaveBeenCalled()
    expect(handleFile).toHaveBeenCalledTimes(1)
    window.history.replaceState({}, '', original)
  })

  it('loads the first opened file in place and hands off remaining files in order', async () => {
    let deliver: ((files: { path: string; name: string; bytes: Uint8Array }[]) => void | Promise<void>) | undefined
    const handleFile = vi.fn().mockResolvedValue(undefined)
    const putFileOpenHandoff = vi.fn().mockResolvedValue(undefined)
    const openWorkspaceWindow = vi.fn().mockResolvedValue('opened' as const)
    const ports = makePorts({
      isNativeDesktop: true,
      handleFile,
      putFileOpenHandoff,
      openWorkspaceWindow,
      subscribeDesktopOpenedFiles: async (onFiles) => { deliver = onFiles; return () => {} },
    })
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    function Harness() { useRecentDocumentLifecycle(ports); return null }
    await act(async () => { root!.render(<Harness />); await Promise.resolve(); await Promise.resolve() })
    await act(async () => {
      await deliver!([
        { path: '/tmp/one.gb', name: 'one.gb', bytes: new Uint8Array([1]) },
        { path: '/tmp/two.gb', name: 'two.gb', bytes: new Uint8Array([2]) },
        { path: '/tmp/three.gb', name: 'three.gb', bytes: new Uint8Array([3]) },
      ])
    })
    expect(handleFile).toHaveBeenCalledWith(expect.any(File), '/tmp/one.gb')
    expect(putFileOpenHandoff.mock.calls.map((call) => call[1].path)).toEqual(['/tmp/two.gb', '/tmp/three.gb'])
    expect(openWorkspaceWindow.mock.calls.map((call) => call[0].documentKey.path)).toEqual(['/tmp/two.gb', '/tmp/three.gb'])
  })

  it('routes a warm OS open to a new workspace when the recipient has a construct open', async () => {
    let deliver: ((files: { path: string; name: string; bytes: Uint8Array }[]) => void | Promise<void>) | undefined
    const handleFile = vi.fn().mockResolvedValue(undefined)
    const putFileOpenHandoff = vi.fn().mockResolvedValue(undefined)
    const openWorkspaceWindow = vi.fn().mockResolvedValue('opened' as const)
    const ports = makePorts({
      isNativeDesktop: true,
      shouldOpenInNewWindow: () => true,
      handleFile,
      putFileOpenHandoff,
      openWorkspaceWindow,
      subscribeDesktopOpenedFiles: async (onFiles) => { deliver = onFiles; return () => {} },
    })
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    function Harness() { useRecentDocumentLifecycle(ports); return null }
    await act(async () => { root!.render(<Harness />); await Promise.resolve(); await Promise.resolve() })
    await act(async () => {
      await deliver!([{ path: '/tmp/incoming.gb', name: 'incoming.gb', bytes: new Uint8Array([1]) }])
    })
    expect(handleFile).not.toHaveBeenCalled()
    expect(putFileOpenHandoff).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ path: '/tmp/incoming.gb' }))
    expect(openWorkspaceWindow).toHaveBeenCalledWith(expect.objectContaining({
      searchParams: expect.objectContaining({ fileHandoff: expect.any(String) }),
      documentKey: { kind: 'file', path: '/tmp/incoming.gb' },
    }))
  })

  it('focuses a claimed duplicate and stops a late desktop-open subscription after unmount', async () => {
    let deliver: ((files: { path: string; name: string; bytes: Uint8Array }[]) => void | Promise<void>) | undefined
    let resolveSubscription: ((stop: () => void) => void) | undefined
    const stop = vi.fn()
    const focusExistingWorkspaceDocument = vi.fn().mockResolvedValue(true)
    const handleFile = vi.fn().mockResolvedValue(undefined)
    const ports = makePorts({
      isNativeDesktop: true,
      focusExistingWorkspaceDocument,
      handleFile,
      claimedWorkspaceWindowLabel: vi.fn().mockReturnValue('other-window'),
      subscribeDesktopOpenedFiles: async (onFiles) => {
        deliver = onFiles
        return new Promise((resolve) => { resolveSubscription = resolve })
      },
    })
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    function Harness() { useRecentDocumentLifecycle(ports); return null }
    await act(async () => { root!.render(<Harness />); await Promise.resolve() })
    await act(async () => { await deliver!([{ path: '/tmp/claimed.gb', name: 'claimed.gb', bytes: new Uint8Array([1]) }]) })
    expect(focusExistingWorkspaceDocument).toHaveBeenCalledWith({ kind: 'file', path: '/tmp/claimed.gb' })
    expect(handleFile).not.toHaveBeenCalled()
    act(() => root!.unmount())
    resolveSubscription!(stop)
    await act(async () => { await Promise.resolve() })
    expect(stop).toHaveBeenCalledTimes(1)
  })
})

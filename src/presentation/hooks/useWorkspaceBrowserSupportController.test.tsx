// @vitest-environment jsdom

import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SharedFragment } from '../../crossTab/types'
import {
  KOFI_SUPPORT_BLOCKED_STATUS,
  KOFI_SUPPORT_OPENED_STATUS,
  NEW_VIBEGENE_WINDOW_BLOCKED_STATUS,
  NEW_VIBEGENE_WINDOW_OPENED_STATUS,
} from '../../application/workspaceBrowserSupport/workspaceBrowserSupportPlan'
import {
  SHARED_FRAGMENT_DISMISSED_STATUS,
  SHARED_FRAGMENT_INSERT_MISSING_SELECTION_STATUS,
} from '../../application/workspaceBrowserSupport/sharedFragmentCommandPlan'
import {
  useWorkspaceBrowserSupportController,
  type WorkspaceBrowserSupportPorts,
} from './useWorkspaceBrowserSupportController'

const pendingFragment: SharedFragment = {
  id: 'fragment-1',
  fromTabId: 'tab-a',
  fromRecordId: 'record-a',
  fromRecordName: 'pUC19',
  sequence: 'ACGT',
  rangeStart: 0,
  rangeEnd: 4,
  sharedAt: '2026-01-01T00:00:00.000Z',
}

function browserPorts(overrides: Partial<WorkspaceBrowserSupportPorts> = {}): WorkspaceBrowserSupportPorts {
  return {
    openExternalUrl: vi.fn(async () => true),
    tryOpenNativeNewWindow: vi.fn(async (): Promise<false | 'focused' | 'opened'> => false),
    openBrowserTab: vi.fn(() => true),
    readBrowserLocation: () => ({ origin: 'https://app.test', pathname: '/workspace' }),
    clearSharedFragmentStorage: vi.fn(),
    ...overrides,
  }
}

describe('useWorkspaceBrowserSupportController', () => {
  let host: HTMLDivElement | undefined
  let root: ReturnType<typeof createRoot> | undefined

  afterEach(() => {
    act(() => root?.unmount())
    host?.remove()
  })

  it('reports Ko-fi popup success, block, and failure statuses', async () => {
    const statuses: string[] = []
    let controller: ReturnType<typeof useWorkspaceBrowserSupportController> | undefined
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)

    function Harness({ ports }: { ports: WorkspaceBrowserSupportPorts }) {
      controller = useWorkspaceBrowserSupportController(
        {
          kofiSupportUrl: 'https://ko-fi.com/vibegene',
          pendingSharedFragment: null,
          setPendingSharedFragment: vi.fn(),
          selectedRange: null,
          cutStrandSelection: null,
          insertSequenceBases: () => false,
          setStatus: (status) => statuses.push(status),
        },
        ports,
      )
      return null
    }

    act(() => {
      root!.render(<Harness ports={browserPorts({ openExternalUrl: vi.fn(async () => true) })} />)
    })
    await act(async () => {
      controller!.openKofiSupport()
      await Promise.resolve()
    })
    expect(statuses.at(-1)).toBe(KOFI_SUPPORT_OPENED_STATUS)

    act(() => {
      root!.render(<Harness ports={browserPorts({ openExternalUrl: vi.fn(async () => false) })} />)
    })
    await act(async () => {
      controller!.openKofiSupport()
      await Promise.resolve()
    })
    expect(statuses.at(-1)).toBe(KOFI_SUPPORT_BLOCKED_STATUS)

    act(() => {
      root!.render(
        <Harness ports={browserPorts({ openExternalUrl: vi.fn(async () => { throw new Error('offline') }) })} />,
      )
    })
    await act(async () => {
      controller!.openKofiSupport()
      await Promise.resolve()
    })
    expect(statuses.at(-1)).toBe('Could not open Support page: offline')
  })

  it('uses native new-window success without opening a browser tab', async () => {
    const statuses: string[] = []
    const openBrowserTab = vi.fn(() => true)
    let controller: ReturnType<typeof useWorkspaceBrowserSupportController> | undefined
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)

    function Harness() {
      controller = useWorkspaceBrowserSupportController(
        {
          kofiSupportUrl: 'https://ko-fi.com/vibegene',
          pendingSharedFragment: null,
          setPendingSharedFragment: vi.fn(),
          selectedRange: null,
          cutStrandSelection: null,
          insertSequenceBases: () => false,
          setStatus: (status) => statuses.push(status),
        },
        browserPorts({
          tryOpenNativeNewWindow: vi.fn(async (): Promise<false | 'focused' | 'opened'> => 'opened'),
          openBrowserTab,
        }),
      )
      return null
    }

    act(() => root!.render(<Harness />))
    await act(async () => {
      controller!.openNewVibegeneWindow()
      await Promise.resolve()
    })
    expect(statuses.at(-1)).toBe(NEW_VIBEGENE_WINDOW_OPENED_STATUS)
    expect(openBrowserTab).not.toHaveBeenCalled()
  })

  it('falls back to bootSplash browser tabs when native open is unavailable', async () => {
    const statuses: string[] = []
    const openBrowserTab = vi.fn(() => true)
    let controller: ReturnType<typeof useWorkspaceBrowserSupportController> | undefined
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)

    function Harness() {
      controller = useWorkspaceBrowserSupportController(
        {
          kofiSupportUrl: 'https://ko-fi.com/vibegene',
          pendingSharedFragment: null,
          setPendingSharedFragment: vi.fn(),
          selectedRange: null,
          cutStrandSelection: null,
          insertSequenceBases: () => false,
          setStatus: (status) => statuses.push(status),
        },
        browserPorts({
          tryOpenNativeNewWindow: vi.fn(async (): Promise<false | 'focused' | 'opened'> => false),
          openBrowserTab,
          readBrowserLocation: () => ({ origin: 'https://app.test', pathname: '/workspace' }),
        }),
      )
      return null
    }

    act(() => root!.render(<Harness />))
    await act(async () => {
      controller!.openNewVibegeneWindow()
      await Promise.resolve()
    })
    expect(openBrowserTab).toHaveBeenCalledWith('https://app.test/workspace?bootSplash=0')
    expect(statuses.at(-1)).toBe(NEW_VIBEGENE_WINDOW_OPENED_STATUS)
  })

  it('reports browser popup block for new-window fallback', async () => {
    const statuses: string[] = []
    let controller: ReturnType<typeof useWorkspaceBrowserSupportController> | undefined
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)

    function Harness() {
      controller = useWorkspaceBrowserSupportController(
        {
          kofiSupportUrl: 'https://ko-fi.com/vibegene',
          pendingSharedFragment: null,
          setPendingSharedFragment: vi.fn(),
          selectedRange: null,
          cutStrandSelection: null,
          insertSequenceBases: () => false,
          setStatus: (status) => statuses.push(status),
        },
        browserPorts({
          tryOpenNativeNewWindow: vi.fn(async (): Promise<false | 'focused' | 'opened'> => false),
          openBrowserTab: vi.fn(() => false),
        }),
      )
      return null
    }

    act(() => root!.render(<Harness />))
    await act(async () => {
      controller!.openNewVibegeneWindow()
      await Promise.resolve()
    })
    expect(statuses.at(-1)).toBe(NEW_VIBEGENE_WINDOW_BLOCKED_STATUS)
  })

  it('inserts shared fragments before clearing pending storage and preserves edit side effects', () => {
    const order: string[] = []
    let pending: SharedFragment | null = pendingFragment
    let controller: ReturnType<typeof useWorkspaceBrowserSupportController> | undefined
    const clearSharedFragmentStorage = vi.fn((fragmentId: string) => order.push(`clear:${fragmentId}`))
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)

    function Harness() {
      controller = useWorkspaceBrowserSupportController(
        {
          kofiSupportUrl: 'https://ko-fi.com/vibegene',
          pendingSharedFragment: pending,
          setPendingSharedFragment: (next) => {
            order.push('clearPending')
            pending = next
          },
          selectedRange: { start: 1, end: 1 },
          cutStrandSelection: null,
          insertSequenceBases: (sequence) => {
            order.push(`insert:${sequence}`)
            order.push('history:update')
            order.push('selection:focus')
            return true
          },
          setStatus: (status) => order.push(`status:${status}`),
        },
        browserPorts({ clearSharedFragmentStorage }),
      )
      return null
    }

    act(() => root!.render(<Harness />))
    act(() => controller!.insertPendingSharedFragment())
    expect(order).toEqual([
      'insert:ACGT',
      'history:update',
      'selection:focus',
      'clearPending',
      'clear:fragment-1',
      'status:Inserted 4 bp from pUC19.',
    ])
  })

  it('dismisses shared fragments and reports the exact status message', () => {
    const statuses: string[] = []
    let controller: ReturnType<typeof useWorkspaceBrowserSupportController> | undefined
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)

    function Harness() {
      controller = useWorkspaceBrowserSupportController(
        {
          kofiSupportUrl: 'https://ko-fi.com/vibegene',
          pendingSharedFragment: pendingFragment,
          setPendingSharedFragment: vi.fn(),
          selectedRange: null,
          cutStrandSelection: null,
          insertSequenceBases: () => false,
          setStatus: (status) => statuses.push(status),
        },
        browserPorts(),
      )
      return null
    }

    act(() => root!.render(<Harness />))
    act(() => controller!.dismissPendingSharedFragment())
    expect(statuses).toEqual([SHARED_FRAGMENT_DISMISSED_STATUS])
  })

  it('reports the exact missing-selection status when insert fails', () => {
    const statuses: string[] = []
    let controller: ReturnType<typeof useWorkspaceBrowserSupportController> | undefined
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)

    function Harness() {
      controller = useWorkspaceBrowserSupportController(
        {
          kofiSupportUrl: 'https://ko-fi.com/vibegene',
          pendingSharedFragment: pendingFragment,
          setPendingSharedFragment: vi.fn(),
          selectedRange: null,
          cutStrandSelection: null,
          insertSequenceBases: () => false,
          setStatus: (status) => statuses.push(status),
        },
        browserPorts(),
      )
      return null
    }

    act(() => root!.render(<Harness />))
    act(() => controller!.insertPendingSharedFragment())
    expect(statuses).toEqual([SHARED_FRAGMENT_INSERT_MISSING_SELECTION_STATUS])
  })
})

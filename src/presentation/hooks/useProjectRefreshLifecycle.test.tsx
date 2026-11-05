// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useProjectRefreshLifecycle } from './useProjectRefreshLifecycle'

describe('useProjectRefreshLifecycle', () => {
  let host: HTMLDivElement | undefined
  let root: ReturnType<typeof createRoot> | undefined

  afterEach(() => {
    act(() => root?.unmount())
    host?.remove()
  })

  it('refreshes on mount, reacts to library changes, and unsubscribes on unmount', () => {
    const refreshProjects = vi.fn()
    const scheduleDatabaseBackgroundSync = vi.fn()
    const unsubscribe = vi.fn()
    let listener: (() => void) | undefined
    const subscribeLibraryChanged = vi.fn((next: () => void) => {
      listener = next
      return unsubscribe
    })
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    function Harness() {
      useProjectRefreshLifecycle({
        refreshProjects,
        subscribeLibraryChanged,
        scheduleDatabaseBackgroundSync,
      })
      return null
    }
    act(() => { root!.render(<Harness />) })
    expect(refreshProjects).toHaveBeenCalledTimes(1)
    expect(subscribeLibraryChanged).toHaveBeenCalledTimes(1)

    act(() => { listener!() })
    expect(refreshProjects).toHaveBeenCalledTimes(2)
    expect(scheduleDatabaseBackgroundSync).toHaveBeenCalledTimes(1)

    act(() => { root!.unmount() })
    expect(unsubscribe).toHaveBeenCalledTimes(1)
  })
})

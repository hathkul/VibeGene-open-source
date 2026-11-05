// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useDesktopFileDropLifecycle } from './useDesktopFileDropLifecycle'

describe('useDesktopFileDropLifecycle', () => {
  let host: HTMLDivElement | undefined
  let root: ReturnType<typeof createRoot> | undefined

  afterEach(() => {
    act(() => root?.unmount())
    host?.remove()
  })

  it('routes drops, blocks hover/files, and cleans up a late subscription', async () => {
    let handlers: { onHoverChange?: (active: boolean) => void; onFiles: (files: { path: string; name: string; bytes: Uint8Array }[]) => void | Promise<void> } | undefined
    let resolveSubscription: ((stop: () => void) => void) | undefined
    const stop = vi.fn()
    const blockedRef = { current: false }
    const setDragActive = vi.fn()
    const onFiles = vi.fn().mockResolvedValue(undefined)
    const bytesToFile = vi.fn((name: string) => new File(['bytes'], name))
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    function Harness() {
      useDesktopFileDropLifecycle({
        isNativeDesktop: true,
        bytesToFile,
        subscribeDesktopFileDrops: (next) => {
          handlers = next
          return new Promise((resolve) => { resolveSubscription = resolve })
        },
        blockedRef,
        setDragActive,
        onFiles,
      })
      return null
    }
    await act(async () => { root!.render(<Harness />); await Promise.resolve() })
    handlers!.onHoverChange?.(true)
    expect(setDragActive).toHaveBeenCalledWith(true)
    await handlers!.onFiles([{ path: '/tmp/a.gb', name: 'a.gb', bytes: new Uint8Array([1]) }])
    expect(bytesToFile).toHaveBeenCalledWith('a.gb', expect.any(Uint8Array))
    expect(onFiles).toHaveBeenCalledWith([expect.any(File)], ['/tmp/a.gb'])
    blockedRef.current = true
    handlers!.onHoverChange?.(true)
    await handlers!.onFiles([{ path: '/tmp/b.gb', name: 'b.gb', bytes: new Uint8Array([2]) }])
    expect(setDragActive).toHaveBeenLastCalledWith(false)
    expect(onFiles).toHaveBeenCalledTimes(1)
    act(() => root!.unmount())
    blockedRef.current = false
    handlers!.onHoverChange?.(true)
    await handlers!.onFiles([{ path: '/tmp/c.gb', name: 'c.gb', bytes: new Uint8Array([3]) }])
    expect(setDragActive).toHaveBeenLastCalledWith(false)
    expect(onFiles).toHaveBeenCalledTimes(1)
    resolveSubscription!(stop)
    await act(async () => { await Promise.resolve() })
    expect(stop).toHaveBeenCalledTimes(1)
  })
})

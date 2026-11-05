// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useWorkspaceDocumentTitleLifecycle } from './useWorkspaceDocumentTitleLifecycle'

describe('useWorkspaceDocumentTitleLifecycle', () => {
  let host: HTMLDivElement | undefined
  let root: ReturnType<typeof createRoot> | undefined

  afterEach(() => {
    act(() => root?.unmount())
    host?.remove()
    vi.clearAllMocks()
  })

  it('sets the browser document title before syncing the native window title', async () => {
    const order: string[] = []
    const setDocumentTitle = vi.fn((title: string) => {
      order.push(`browser:${title}`)
    })
    const syncNativeWindowTitle = vi.fn((title: string) => {
      order.push(`native:${title}`)
      return Promise.resolve()
    })
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)

    function Harness() {
      useWorkspaceDocumentTitleLifecycle({
        workspaceTitleName: 'OrderTest',
        isDirty: false,
        documentSaveBinding: 'new',
        showSource: true,
        setDocumentTitle,
        syncNativeWindowTitle,
      })
      return null
    }

    await act(async () => { root!.render(<Harness />); await Promise.resolve() })
    expect(order).toEqual(['browser:OrderTest', 'native:OrderTest'])
  })

  it('derives titles from dirty state and document binding, then syncs native title', async () => {
    const setDocumentTitle = vi.fn()
    const syncNativeWindowTitle = vi.fn().mockResolvedValue(undefined)
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)

    function Harness(props: {
      name: string
      isDirty: boolean
      binding: 'disk' | 'database' | 'new'
      showSource: boolean
    }) {
      useWorkspaceDocumentTitleLifecycle({
        workspaceTitleName: props.name,
        isDirty: props.isDirty,
        documentSaveBinding: props.binding,
        showSource: props.showSource,
        setDocumentTitle,
        syncNativeWindowTitle,
      })
      return null
    }

    await act(async () => {
      root!.render(<Harness name="pDemo" isDirty={false} binding="database" showSource />)
      await Promise.resolve()
    })
    expect(setDocumentTitle).toHaveBeenLastCalledWith('pDemo — from Database')
    expect(syncNativeWindowTitle).toHaveBeenLastCalledWith('pDemo — from Database')

    await act(async () => {
      root!.render(<Harness name="pDemo" isDirty binding="disk" showSource />)
      await Promise.resolve()
    })
    expect(setDocumentTitle).toHaveBeenLastCalledWith('pDemo* — from disk')
    expect(syncNativeWindowTitle).toHaveBeenLastCalledWith('pDemo* — from disk')

    await act(async () => {
      root!.render(<Harness name="WebDoc" isDirty binding="database" showSource={false} />)
      await Promise.resolve()
    })
    expect(setDocumentTitle).toHaveBeenLastCalledWith('WebDoc*')
  })

  it('re-runs when workspaceTitleName changes and stops syncing after unmount', async () => {
    const setDocumentTitle = vi.fn()
    const syncNativeWindowTitle = vi.fn().mockResolvedValue(undefined)
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)

    function Harness({ name }: { name: string }) {
      useWorkspaceDocumentTitleLifecycle({
        workspaceTitleName: name,
        isDirty: false,
        documentSaveBinding: 'new',
        showSource: true,
        setDocumentTitle,
        syncNativeWindowTitle,
      })
      return null
    }

    await act(async () => { root!.render(<Harness name="Alpha" />); await Promise.resolve() })
    await act(async () => { root!.render(<Harness name="Beta" />); await Promise.resolve() })
    expect(setDocumentTitle).toHaveBeenCalledTimes(2)
    expect(syncNativeWindowTitle).toHaveBeenCalledTimes(2)
    act(() => root!.unmount())
    expect(setDocumentTitle).toHaveBeenCalledTimes(2)
  })
})

// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cloneFixture } from '../../domain/fixtures'
import { useDocumentDraftLifecycle } from './useDocumentDraftLifecycle'

describe('useDocumentDraftLifecycle', () => {
  let host: HTMLDivElement | undefined
  let root: ReturnType<typeof createRoot> | undefined

  afterEach(() => {
    vi.useRealTimers()
    act(() => root?.unmount())
    host?.remove()
  })

  it('uses fresh pagehide preferences and routes draft restore/discard through injected storage', async () => {
    const record = cloneFixture()
    const isDirtyRef = { current: true }
    const saveSessionDraft = vi.fn().mockResolvedValue(undefined)
    const getMaxUnsavedDrafts = vi.fn().mockReturnValue(7)
    const getSessionDraft = vi.fn().mockResolvedValue({ ...record, record })
    const deleteSessionDraft = vi.fn().mockResolvedValue(undefined)
    const removeOpenTab = vi.fn().mockResolvedValue(undefined)
    let lifecycle: ReturnType<typeof useDocumentDraftLifecycle> | undefined
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    function Harness() {
      lifecycle = useDocumentDraftLifecycle({
        listSessionDrafts: async () => [],
        clearSessionDraftForRecord: async () => {},
        saveSessionDraft,
        deleteSessionDraft,
        getSessionDraft,
        removeOpenTab,
        getMaxUnsavedDrafts,
        tabId: 'tab-1',
        record,
        traceFiles: [],
        isDirty: true,
        recordRef: { current: record },
        traceFilesRef: { current: [] },
        isDirtyRef,
        maxUnsavedDrafts: 2,
        requestExit: async (action) => { await action() },
        shouldOpenInNewWindow: () => false,
        openRecordInNewTab: () => {},
        restoreInPlace: () => {},
        setStatus: () => {},
      })
      return null
    }
    await act(async () => { root!.render(<Harness />); await Promise.resolve() })
    await act(async () => { window.dispatchEvent(new Event('pagehide')); await Promise.resolve() })
    expect(saveSessionDraft).toHaveBeenCalledWith(expect.objectContaining({ id: record.id }), 7)
    expect(getMaxUnsavedDrafts).toHaveBeenCalled()
    expect(removeOpenTab).toHaveBeenCalledWith('tab-1')
    await act(async () => { lifecycle!.restoreSessionDraft('draft-1'); await Promise.resolve() })
    expect(getSessionDraft).toHaveBeenCalledWith('draft-1')
    await act(async () => { lifecycle!.discardSessionDraft('draft-1'); await Promise.resolve() })
    expect(deleteSessionDraft).toHaveBeenCalledWith('draft-1')
  })

  it('suppresses pagehide draft recreation after a window-close discard', async () => {
    vi.useFakeTimers()
    const record = cloneFixture()
    const saveSessionDraft = vi.fn().mockResolvedValue(undefined)
    const removeOpenTab = vi.fn().mockResolvedValue(undefined)
    let lifecycle: ReturnType<typeof useDocumentDraftLifecycle> | undefined
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    function Harness() {
      lifecycle = useDocumentDraftLifecycle({
        listSessionDrafts: async () => [],
        clearSessionDraftForRecord: async () => {},
        saveSessionDraft,
        deleteSessionDraft: async () => {},
        getSessionDraft: async () => null,
        removeOpenTab,
        getMaxUnsavedDrafts: () => 3,
        tabId: 'tab-close',
        record,
        traceFiles: [],
        isDirty: true,
        recordRef: { current: record },
        traceFilesRef: { current: [] },
        isDirtyRef: { current: true },
        maxUnsavedDrafts: 3,
        requestExit: async (action) => { await action() },
        shouldOpenInNewWindow: () => false,
        openRecordInNewTab: () => {},
        restoreInPlace: () => {},
        setStatus: () => {},
      })
      return null
    }
    await act(async () => { root!.render(<Harness />) })

    act(() => lifecycle!.suppressDraftSaveBeforeClose())
    act(() => { vi.advanceTimersByTime(1500) })
    await act(async () => { window.dispatchEvent(new Event('pagehide')); await Promise.resolve() })

    expect(saveSessionDraft).not.toHaveBeenCalled()
    expect(removeOpenTab).toHaveBeenCalledWith('tab-close')
  })

  it('invalidates a stale save when the document changes and clears only a matching dirty-to-clean record', async () => {
    vi.useFakeTimers()
    const first = cloneFixture()
    const second = { ...cloneFixture(), id: `${cloneFixture().id}-second` }
    const saveSessionDraft = vi.fn()
    let resolveSave: (() => void) | undefined
    saveSessionDraft.mockImplementation(() => new Promise<void>((resolve) => { resolveSave = resolve }))
    const clearSessionDraftForRecord = vi.fn().mockResolvedValue(undefined)
    let current = first
    let dirty = true
    const refs = { record: { current }, isDirty: { current: dirty }, traceFiles: { current: [] as never[] } }
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    function Harness() {
      refs.record.current = current
      refs.isDirty.current = dirty
      useDocumentDraftLifecycle({
        listSessionDrafts: async () => [],
        clearSessionDraftForRecord,
        saveSessionDraft,
        deleteSessionDraft: async () => {},
        getSessionDraft: async () => null,
        removeOpenTab: async () => {},
        getMaxUnsavedDrafts: () => 3,
        tabId: 'tab-1',
        record: current,
        traceFiles: [],
        isDirty: dirty,
        recordRef: refs.record,
        traceFilesRef: refs.traceFiles,
        isDirtyRef: refs.isDirty,
        maxUnsavedDrafts: 3,
        requestExit: async (action) => { await action() },
        shouldOpenInNewWindow: () => false,
        openRecordInNewTab: () => {},
        restoreInPlace: () => {},
        setStatus: () => {},
      })
      return null
    }
    await act(async () => { root!.render(<Harness />) })
    await act(async () => { vi.advanceTimersByTime(1500) })
    expect(saveSessionDraft).toHaveBeenCalledTimes(1)
    current = second
    await act(async () => { root!.render(<Harness />); await Promise.resolve() })
    resolveSave!()
    await act(async () => { await Promise.resolve() })
    expect(clearSessionDraftForRecord).toHaveBeenCalledWith(first.id)

    dirty = false
    current = second
    await act(async () => { root!.render(<Harness />); await Promise.resolve() })
    expect(clearSessionDraftForRecord).toHaveBeenCalledWith(second.id)
    current = first
    dirty = true
    await act(async () => { root!.render(<Harness />); await Promise.resolve() })
    dirty = false
    await act(async () => { root!.render(<Harness />); await Promise.resolve() })
    expect(clearSessionDraftForRecord).toHaveBeenCalledWith(first.id)
  })
})

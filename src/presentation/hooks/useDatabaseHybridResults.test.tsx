// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { HybridWindowResult } from '../../application/ports/hybridWindows'
import { useDatabaseHybridResults } from './useDatabaseHybridResults'

describe('useDatabaseHybridResults', () => {
  let host: HTMLDivElement
  let root: ReturnType<typeof createRoot>

  afterEach(() => {
    act(() => root?.unmount())
    host?.remove()
  })

  it('routes only current-document results and switches convert mode', async () => {
    let handler: ((result: HybridWindowResult) => void | Promise<void>) | undefined
    const addLibraryMembers = vi.fn()
    const convertToLibrary = vi.fn()
    const setStatus = vi.fn()
    const subscribeResults = vi.fn(async (next: typeof handler) => {
      handler = next
      return () => {}
    })
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)

    function Harness() {
      useDatabaseHybridResults({
        enabled: true,
        recordId: 'record-1',
        libraryMemberPick: { targetRecordId: 'record-1', purpose: 'convert' },
        subscribeResults,
        openPrimerProperties: vi.fn().mockResolvedValue(false),
        setStatus,
        addDatabasePrimers: vi.fn(),
        addToAlignment: vi.fn(),
        addLibraryMembers,
        convertToLibrary,
        setLibraryPrimer: vi.fn(),
      })
      return null
    }

    await act(async () => root.render(<Harness />))
    await act(async () => {
      await handler?.({
        kind: 'database',
        type: 'add-library-members',
        targetRecordId: 'other-record',
        projectIds: ['ignored'],
      })
      await handler?.({
        kind: 'database',
        type: 'add-library-members',
        targetRecordId: 'record-1',
        projectIds: ['project-1'],
      })
    })

    expect(addLibraryMembers).not.toHaveBeenCalled()
    expect(convertToLibrary).toHaveBeenCalledWith(['project-1'])
    expect(setStatus).not.toHaveBeenCalled()
  })

  it('keeps new-file status events and tears down its result subscription', async () => {
    let handler: ((result: HybridWindowResult) => void | Promise<void>) | undefined
    const stop = vi.fn()
    const setStatus = vi.fn()
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)

    function Harness() {
      useDatabaseHybridResults({
        enabled: true,
        recordId: 'record-1',
        libraryMemberPick: null,
        subscribeResults: async (next) => {
          handler = next
          return stop
        },
        openPrimerProperties: vi.fn().mockResolvedValue(true),
        setStatus,
        addDatabasePrimers: vi.fn(),
        addToAlignment: vi.fn(),
        addLibraryMembers: vi.fn(),
        convertToLibrary: vi.fn(),
        setLibraryPrimer: vi.fn(),
      })
      return null
    }

    await act(async () => root.render(<Harness />))
    await act(async () => {
      await handler?.({ kind: 'new-dna-file', type: 'status', message: 'Created DNA.' })
      await handler?.({ kind: 'new-protein-file', type: 'status', message: 'Created protein.' })
    })
    expect(setStatus).toHaveBeenNthCalledWith(1, 'Created DNA.')
    expect(setStatus).toHaveBeenNthCalledWith(2, 'Created protein.')

    await act(async () => root.unmount())
    expect(stop).toHaveBeenCalledOnce()
  })
})

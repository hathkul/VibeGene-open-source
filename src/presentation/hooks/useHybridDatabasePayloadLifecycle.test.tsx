// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useHybridDatabasePayloadLifecycle } from './useHybridDatabasePayloadLifecycle'

describe('useHybridDatabasePayloadLifecycle', () => {
  let host: HTMLDivElement | undefined
  let root: ReturnType<typeof createRoot> | undefined

  afterEach(() => {
    act(() => root?.unmount())
    host?.remove()
    vi.clearAllMocks()
  })

  function makePorts(overrides: Partial<Parameters<typeof useHybridDatabasePayloadLifecycle>[0]> = {}) {
    return {
      isNativeDesktop: true,
      currentRecordId: 'rec-1',
      alignmentPick: null,
      libraryMemberPick: null,
      writeHybridDatabasePayload: vi.fn(),
      notifyHybridDatabasePayloadUpdated: vi.fn(),
      readHybridDatabaseConstructPick: vi.fn().mockReturnValue({ requestId: 'pick-1' }),
      ...overrides,
    }
  }

  it('no-ops outside Tauri while still allowing dependency updates without writes', async () => {
    const writeHybridDatabasePayload = vi.fn()
    const notifyHybridDatabasePayloadUpdated = vi.fn()
    const ports = makePorts({
      isNativeDesktop: false,
      writeHybridDatabasePayload,
      notifyHybridDatabasePayloadUpdated,
    })
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)

    function Harness({ recordId }: { recordId: string }) {
      useHybridDatabasePayloadLifecycle({ ...ports, currentRecordId: recordId })
      return null
    }

    await act(async () => { root!.render(<Harness recordId="rec-1" />); await Promise.resolve() })
    await act(async () => { root!.render(<Harness recordId="rec-2" />); await Promise.resolve() })
    expect(writeHybridDatabasePayload).not.toHaveBeenCalled()
    expect(notifyHybridDatabasePayloadUpdated).not.toHaveBeenCalled()
  })

  it('writes the hybrid payload before notifying and preserves constructPick from storage', async () => {
    const order: string[] = []
    const writeHybridDatabasePayload = vi.fn(() => { order.push('write') })
    const notifyHybridDatabasePayloadUpdated = vi.fn(() => { order.push('notify') })
    const readHybridDatabaseConstructPick = vi.fn().mockReturnValue({ requestId: 'keep-me' })
    const alignmentPick = { mode: 'append' as const, requestId: 'align-1' }
    const ports = makePorts({
      writeHybridDatabasePayload,
      notifyHybridDatabasePayloadUpdated,
      readHybridDatabaseConstructPick,
      alignmentPick,
      libraryMemberPick: { purpose: 'add' as const, requestId: 'lib-1' },
    })
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)

    function Harness() {
      useHybridDatabasePayloadLifecycle(ports)
      return null
    }

    await act(async () => { root!.render(<Harness />); await Promise.resolve() })
    expect(readHybridDatabaseConstructPick).toHaveBeenCalledTimes(1)
    expect(writeHybridDatabasePayload).toHaveBeenCalledWith({
      currentRecordId: 'rec-1',
      alignmentPick,
      libraryMemberPick: ports.libraryMemberPick,
      constructPick: { requestId: 'keep-me' },
    })
    expect(notifyHybridDatabasePayloadUpdated).toHaveBeenCalledTimes(1)
    expect(order).toEqual(['write', 'notify'])
  })

  it('does not write or notify again when adapter functions change but legacy data inputs stay the same', async () => {
    const writeHybridDatabasePayload = vi.fn()
    const notifyHybridDatabasePayloadUpdated = vi.fn()
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)

    function Harness(props: {
      adapterGeneration: number
      alignmentPick: { requestId: string } | null
    }) {
      const generation = props.adapterGeneration
      useHybridDatabasePayloadLifecycle({
        isNativeDesktop: true,
        currentRecordId: 'rec-1',
        alignmentPick: props.alignmentPick,
        libraryMemberPick: null,
        writeHybridDatabasePayload: () => {
          writeHybridDatabasePayload(generation)
        },
        notifyHybridDatabasePayloadUpdated: () => {
          notifyHybridDatabasePayloadUpdated(generation)
        },
        readHybridDatabaseConstructPick: () => null,
      })
      return null
    }

    await act(async () => {
      root!.render(<Harness adapterGeneration={0} alignmentPick={null} />)
      await Promise.resolve()
    })
    expect(writeHybridDatabasePayload).toHaveBeenCalledTimes(1)
    expect(writeHybridDatabasePayload).toHaveBeenLastCalledWith(0)
    expect(notifyHybridDatabasePayloadUpdated).toHaveBeenCalledTimes(1)

    await act(async () => {
      root!.render(<Harness adapterGeneration={1} alignmentPick={null} />)
      await Promise.resolve()
    })
    expect(writeHybridDatabasePayload).toHaveBeenCalledTimes(1)
    expect(notifyHybridDatabasePayloadUpdated).toHaveBeenCalledTimes(1)

    await act(async () => {
      root!.render(<Harness adapterGeneration={2} alignmentPick={{ requestId: 'pick-2' }} />)
      await Promise.resolve()
    })
    expect(writeHybridDatabasePayload).toHaveBeenCalledTimes(2)
    expect(writeHybridDatabasePayload).toHaveBeenLastCalledWith(2)
    expect(notifyHybridDatabasePayloadUpdated).toHaveBeenCalledTimes(2)
    expect(notifyHybridDatabasePayloadUpdated).toHaveBeenLastCalledWith(2)
  })

  it('re-runs when record id or database picks change and stops after unmount', async () => {
    const writeHybridDatabasePayload = vi.fn()
    const notifyHybridDatabasePayloadUpdated = vi.fn()
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)

    function Harness(props: {
      recordId: string
      alignmentPick: { requestId: string } | null
    }) {
      useHybridDatabasePayloadLifecycle({
        isNativeDesktop: true,
        currentRecordId: props.recordId,
        alignmentPick: props.alignmentPick,
        libraryMemberPick: null,
        writeHybridDatabasePayload,
        notifyHybridDatabasePayloadUpdated,
        readHybridDatabaseConstructPick: () => null,
      })
      return null
    }

    await act(async () => {
      root!.render(<Harness recordId="rec-1" alignmentPick={null} />)
      await Promise.resolve()
    })
    await act(async () => {
      root!.render(<Harness recordId="rec-2" alignmentPick={{ requestId: 'a1' }} />)
      await Promise.resolve()
    })
    expect(writeHybridDatabasePayload).toHaveBeenCalledTimes(2)
    expect(notifyHybridDatabasePayloadUpdated).toHaveBeenCalledTimes(2)
    act(() => root!.unmount())
    expect(writeHybridDatabasePayload).toHaveBeenCalledTimes(2)
  })
})

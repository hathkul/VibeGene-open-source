// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi, type Mock } from 'vitest'
import type { CrossTabMessage, SharedFragment } from '../../crossTab/types'
import { cloneFixture } from '../../domain/fixtures'
import type { TraceFileRecord } from '../../domain/traceTypes'
import type { OpenTabSessionLifecycleInput, OpenTabSessionLifecyclePorts } from './useOpenTabSessionLifecycle'
import { useOpenTabSessionLifecycle } from './useOpenTabSessionLifecycle'
import * as crossTabChannel from '../../crossTab/channel'

type OpenTabSessionHarnessInput = Omit<
  OpenTabSessionLifecycleInput,
  'refreshOtherOpenTabs' | 'subscribeCrossTabMessages' | 'upsertOpenTab' | 'getSharedFragment' | 'onSharedFragment'
> & {
  refreshOtherOpenTabs: Mock<OpenTabSessionLifecyclePorts['refreshOtherOpenTabs']>
  subscribeCrossTabMessages: Mock<OpenTabSessionLifecyclePorts['subscribeCrossTabMessages']>
  upsertOpenTab: Mock<OpenTabSessionLifecyclePorts['upsertOpenTab']>
  getSharedFragment: Mock<OpenTabSessionLifecyclePorts['getSharedFragment']>
  onSharedFragment: Mock<OpenTabSessionLifecyclePorts['onSharedFragment']>
}

function minimalTraceFile(id: string): TraceFileRecord {
  return {
    id,
    fileName: `${id}.ab1`,
    sequence: 'AT',
    chromatogram: { aTrace: [], tTrace: [], gTrace: [], cTrace: [], basePos: [], baseCalls: [] },
    enabled: true,
    expanded: false,
    showAnnotations: false,
    alignment: null,
  }
}

describe('useOpenTabSessionLifecycle', () => {
  let host: HTMLDivElement | undefined
  let root: ReturnType<typeof createRoot> | undefined

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
    act(() => root?.unmount())
    host?.remove()
  })

  function makeHarnessInput(
    overrides: Partial<OpenTabSessionHarnessInput> = {},
  ): OpenTabSessionHarnessInput {
    const record = cloneFixture()
    const traceFiles: TraceFileRecord[] = []
    const recordRef = { current: record }
    const traceFilesRef = { current: traceFiles }
    const refreshOtherOpenTabs = vi.fn<OpenTabSessionLifecyclePorts['refreshOtherOpenTabs']>()
    const subscribeCrossTabMessages = vi.fn<OpenTabSessionLifecyclePorts['subscribeCrossTabMessages']>(() => vi.fn())
    const upsertOpenTab = vi.fn<OpenTabSessionLifecyclePorts['upsertOpenTab']>()
    const getSharedFragment = vi.fn<OpenTabSessionLifecyclePorts['getSharedFragment']>()
    getSharedFragment.mockResolvedValue(null)
    const onSharedFragment = vi.fn<OpenTabSessionLifecyclePorts['onSharedFragment']>()
    return {
      tabId: 'tab-a',
      record,
      traceFiles,
      recordRef,
      traceFilesRef,
      refreshOtherOpenTabs,
      subscribeCrossTabMessages,
      upsertOpenTab,
      getSharedFragment,
      onSharedFragment,
      ...overrides,
    }
  }

  it('returns the full live chromatogram when another window requests a cloning source', async () => {
    const input = makeHarnessInput()
    const trace = minimalTraceFile('hidden')
    trace.enabled = false
    trace.chromatogram.aTrace = [1, 5, 1]
    input.traceFilesRef.current = [trace]
    let listener: ((message: CrossTabMessage) => void) | undefined
    input.subscribeCrossTabMessages.mockImplementation(next => { listener = next; return vi.fn() })
    const post = vi.spyOn(crossTabChannel, 'postCrossTabMessage').mockImplementation(() => {})
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    function Harness() { useOpenTabSessionLifecycle(input); return null }
    await act(async () => { root!.render(<Harness />) })
    act(() => { listener!({ type: 'cloning-source-request', targetTabId: 'tab-a', requestId: 'request-1' }) })
    expect(post).toHaveBeenCalledWith(expect.objectContaining({
      type: 'cloning-source-response', requestId: 'request-1',
      record: expect.objectContaining({ traceFiles: [expect.objectContaining({ enabled: false, chromatogram: expect.objectContaining({ aTrace: [1, 5, 1] }) })] }),
    }))
    expect(input.upsertOpenTab).not.toHaveBeenCalled()
  })

  it('refreshes on mount, routes messages, ignores handoff, and unsubscribes on unmount', async () => {
    const input = makeHarnessInput()
    const unsubscribe = vi.fn()
    let listener: ((message: CrossTabMessage) => void) | undefined
    input.subscribeCrossTabMessages.mockImplementation((next) => {
      listener = next
      return unsubscribe
    })
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    function Harness() {
      useOpenTabSessionLifecycle(input)
      return null
    }
    await act(async () => { root!.render(<Harness />); await Promise.resolve() })
    expect(input.refreshOtherOpenTabs).toHaveBeenCalledTimes(1)
    expect(input.subscribeCrossTabMessages).toHaveBeenCalledTimes(1)

    act(() => { listener!({ type: 'open-tabs-changed' }) })
    expect(input.refreshOtherOpenTabs).toHaveBeenCalledTimes(2)

    const latestRecord = { ...input.record, name: 'snapshot-name' }
    input.recordRef.current = latestRecord
    act(() => { listener!({ type: 'open-tab-snapshot-request', targetTabId: 'tab-a' }) })
    expect(input.upsertOpenTab).toHaveBeenCalledWith('tab-a', latestRecord, [], undefined)

    act(() => { listener!({ type: 'open-tab-snapshot-request', targetTabId: 'other' }) })
    expect(input.upsertOpenTab).toHaveBeenCalledTimes(1)

    const fragment: SharedFragment = {
      id: 'frag-1', fromTabId: 'tab-b', fromRecordId: 'r1', fromRecordName: 'B', sequence: 'AT', rangeStart: 0, rangeEnd: 1, sharedAt: 'now',
    }
    input.getSharedFragment.mockResolvedValue(fragment)
    await act(async () => {
      listener!({ type: 'fragment-shared', fromTabId: 'tab-b', fromRecordName: 'B', fragmentId: 'frag-1' })
      await Promise.resolve()
    })
    expect(input.onSharedFragment).toHaveBeenCalledWith(fragment)

    act(() => { listener!({ type: 'fragment-shared', fromTabId: 'tab-a', fromRecordName: 'A', fragmentId: 'frag-2' }) })
    expect(input.getSharedFragment).toHaveBeenCalledTimes(1)

    act(() => { listener!({ type: 'window-handoff-ready', key: 'handoff-key' }) })
    act(() => { listener!({ type: 'window-handoff-ack', key: 'handoff-key' }) })
    expect(input.refreshOtherOpenTabs).toHaveBeenCalledTimes(2)
    expect(input.upsertOpenTab).toHaveBeenCalledTimes(1)
    expect(input.getSharedFragment).toHaveBeenCalledTimes(1)

    await act(async () => { root!.unmount(); await Promise.resolve() })
    expect(unsubscribe).toHaveBeenCalledTimes(1)
  })

  it('debounces and interval-writes open tabs and clears timers on dependency change', async () => {
    vi.useFakeTimers()
    const clearIntervalSpy = vi.spyOn(window, 'clearInterval')
    const input = makeHarnessInput()
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    function Harness() {
      useOpenTabSessionLifecycle(input)
      return null
    }
    await act(async () => { root!.render(<Harness />) })
    expect(input.upsertOpenTab).not.toHaveBeenCalled()

    input.recordRef.current = { ...input.record, name: 'debounced' }
    await act(async () => { vi.advanceTimersByTime(999) })
    expect(input.upsertOpenTab).not.toHaveBeenCalled()
    await act(async () => { vi.advanceTimersByTime(1) })
    expect(input.upsertOpenTab).toHaveBeenCalledWith('tab-a', input.recordRef.current, [], undefined)

    await act(async () => { vi.advanceTimersByTime(5000) })
    expect(input.upsertOpenTab).toHaveBeenCalledTimes(2)

    input.traceFiles = [minimalTraceFile('t1')]
    await act(async () => { root!.render(<Harness />) })
    expect(clearIntervalSpy).toHaveBeenCalled()
    await act(async () => { vi.advanceTimersByTime(999) })
    expect(input.upsertOpenTab).toHaveBeenCalledTimes(2)
    await act(async () => { vi.advanceTimersByTime(1) })
    expect(input.upsertOpenTab).toHaveBeenCalledTimes(3)
    await act(async () => { vi.advanceTimersByTime(5000) })
    expect(input.upsertOpenTab).toHaveBeenCalledTimes(4)
  })

  it('stops interval writes after unmount', async () => {
    vi.useFakeTimers()
    const input = makeHarnessInput()
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    function Harness() {
      useOpenTabSessionLifecycle(input)
      return null
    }
    await act(async () => { root!.render(<Harness />) })
    await act(async () => { vi.advanceTimersByTime(1000) })
    expect(input.upsertOpenTab).toHaveBeenCalledTimes(1)
    await act(async () => { root!.unmount() })
    await act(async () => { vi.advanceTimersByTime(10000) })
    expect(input.upsertOpenTab).toHaveBeenCalledTimes(1)
  })

  it('uses updated port implementations without resubscribing when tabId is stable', async () => {
    vi.useFakeTimers()
    const input = makeHarnessInput()
    let listener: ((message: CrossTabMessage) => void) | undefined
    input.subscribeCrossTabMessages.mockImplementation((next) => {
      listener = next
      return vi.fn()
    })
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    function Harness() {
      useOpenTabSessionLifecycle(input)
      return null
    }
    await act(async () => { root!.render(<Harness />); await Promise.resolve() })
    expect(input.subscribeCrossTabMessages).toHaveBeenCalledTimes(1)

    const originalUpsertOpenTab = input.upsertOpenTab
    const upsertOpenTab = vi.fn<OpenTabSessionLifecyclePorts['upsertOpenTab']>()
    input.upsertOpenTab = upsertOpenTab
    input.recordRef.current = { ...input.record, name: 'fresh-port' }
    await act(async () => { root!.render(<Harness />); await Promise.resolve() })
    expect(input.subscribeCrossTabMessages).toHaveBeenCalledTimes(1)

    act(() => { listener!({ type: 'open-tab-snapshot-request', targetTabId: 'tab-a' }) })
    expect(upsertOpenTab).toHaveBeenCalledWith('tab-a', input.recordRef.current, [], undefined)
    expect(originalUpsertOpenTab).not.toHaveBeenCalled()
  })
})

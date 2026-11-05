// @vitest-environment jsdom
import { act, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cloneFixture } from '../../domain/fixtures'
import type { SequenceRecord } from '../../domain/types'
import {
  useBootHandoffMountLifecycle,
  type BootHandoffMountLifecycleBootInput,
  type BootHandoffMountLifecyclePorts,
  type BootHandoffMountLifecycleRefs,
} from './useBootHandoffMountLifecycle'

const bootRecord = (): SequenceRecord => ({
  ...cloneFixture(),
  id: 'boot-record',
  name: 'Boot',
  molecule: 'protein',
  topology: 'linear',
  sequence: 'ACGT',
  features: [],
  primers: [],
})

function stableBootInput(
  recordRef: { current: SequenceRecord },
  overrides: Partial<BootHandoffMountLifecycleBootInput> = {},
): BootHandoffMountLifecycleBootInput {
  return {
    bootOpenedFromHandoff: true,
    bootSourceHydrationPending: true,
    pendingIdbHandoffKey: 'handoff-key',
    bootRecord: recordRef.current,
    bootInitiallyUnsaved: false,
    ...overrides,
  }
}

describe('useBootHandoffMountLifecycle', () => {
  let host: HTMLDivElement | undefined
  let root: ReturnType<typeof createRoot> | undefined
  let rafQueue: FrameRequestCallback[]
  let rafId: number
  let requestAnimationFrameSpy: ReturnType<typeof vi.spyOn>
  let clearTimeoutSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    vi.useFakeTimers()
    rafQueue = []
    rafId = 0
    requestAnimationFrameSpy = vi.fn((callback: FrameRequestCallback) => {
      rafQueue.push(callback)
      rafId += 1
      return rafId
    })
    window.requestAnimationFrame = requestAnimationFrameSpy as typeof window.requestAnimationFrame
    window.cancelAnimationFrame = vi.fn()
    clearTimeoutSpy = vi.spyOn(window, 'clearTimeout')
  })

  afterEach(() => {
    act(() => root?.unmount())
    host?.remove()
    vi.useRealTimers()
    requestAnimationFrameSpy.mockReset()
    clearTimeoutSpy.mockRestore()
  })

  function flushRafOnly() {
    act(() => {
      rafQueue.splice(0).forEach((callback) => callback(0))
    })
  }

  function flushTimersOnly() {
    act(() => {
      vi.runOnlyPendingTimers()
    })
  }

  async function flushRafAndTimers(hydrate: ReturnType<typeof vi.fn>) {
    flushRafOnly()
    flushTimersOnly()
    await act(async () => {
      await Promise.resolve()
      const lastResult = hydrate.mock.results.at(-1)?.value
      if (lastResult) await lastResult
    })
  }

  function renderHarness(
    boot: BootHandoffMountLifecycleBootInput,
    refs: BootHandoffMountLifecycleRefs,
    ports: BootHandoffMountLifecyclePorts,
  ) {
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    function Harness() {
      useBootHandoffMountLifecycle(boot, refs, ports)
      return null
    }
    act(() => {
      root!.render(<Harness />)
    })
  }

  function mountHarness(renderBody: () => void) {
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    let bumpRerender = () => {}
    function Harness() {
      const [, setTick] = useState(0)
      bumpRerender = () => setTick((value) => value + 1)
      renderBody()
      return null
    }
    act(() => {
      root!.render(<Harness />)
    })
    return () => bumpRerender()
  }

  it('does not reschedule hydration after it completes when parent rerenders with fresh ports', async () => {
    const hydrateProteinSources = vi.fn().mockResolvedValue([])
    const applySavedBaseline = vi.fn()
    const setRecord = vi.fn()
    const setStatusDuringBoot = vi.fn()
    const recordRef = { current: bootRecord() }
    const setRecordRef = { current: setRecord }
    const applySavedBaselineRef = { current: applySavedBaseline }
    const boot = stableBootInput(recordRef, { pendingIdbHandoffKey: 'handoff-1' })
    let renderPass = 0

    const bumpRerender = mountHarness(() => {
      renderPass += 1
      useBootHandoffMountLifecycle(
        boot,
        { recordRef, setRecordRef, applySavedBaselineRef },
        {
          hydrateProteinSources,
          clearHistoryBootQueryParams: vi.fn(),
          setStatus: renderPass === 1 ? setStatusDuringBoot : vi.fn(),
        },
      )
    })

    await flushRafAndTimers(hydrateProteinSources)
    expect(requestAnimationFrameSpy).toHaveBeenCalledTimes(1)
    expect(hydrateProteinSources).toHaveBeenCalledTimes(1)
    expect(applySavedBaseline).toHaveBeenCalledTimes(1)
    expect(setRecord).toHaveBeenCalledTimes(1)
    expect(setStatusDuringBoot).toHaveBeenCalledTimes(1)

    recordRef.current = { ...recordRef.current, sequence: 'USER-DIRTY' }
    act(() => {
      bumpRerender()
    })
    expect(renderPass).toBeGreaterThan(1)
    expect(rafQueue).toHaveLength(0)
    expect(requestAnimationFrameSpy).toHaveBeenCalledTimes(1)

    await flushRafAndTimers(hydrateProteinSources)
    expect(hydrateProteinSources).toHaveBeenCalledTimes(1)
    expect(applySavedBaseline).toHaveBeenCalledTimes(1)
    expect(setRecord).toHaveBeenCalledTimes(1)
    expect(recordRef.current.sequence).toBe('USER-DIRTY')
  })

  it('hydrates once when rerender happens before hydration and keeps live record edits', async () => {
    const hydrateProteinSources = vi.fn().mockResolvedValue([])
    const clearHistoryBootQueryParams = vi.fn()
    const setRecord = vi.fn()
    const applySavedBaseline = vi.fn()
    const recordRef = { current: bootRecord() }
    const setRecordRef = { current: setRecord }
    const applySavedBaselineRef = { current: applySavedBaseline }
    const boot = stableBootInput(recordRef, { pendingIdbHandoffKey: 'handoff-1' })

    const bumpRerender = mountHarness(() => {
      useBootHandoffMountLifecycle(
        boot,
        { recordRef, setRecordRef, applySavedBaselineRef },
        {
          hydrateProteinSources,
          clearHistoryBootQueryParams,
          setStatus: vi.fn(),
        },
      )
    })

    act(() => {
      bumpRerender()
    })
    recordRef.current = { ...recordRef.current, sequence: 'GGGG' }
    await flushRafAndTimers(hydrateProteinSources)
    expect(requestAnimationFrameSpy).toHaveBeenCalledTimes(1)
    expect(hydrateProteinSources).toHaveBeenCalledTimes(1)
    expect(applySavedBaseline).toHaveBeenCalledTimes(1)
    expect(setRecord).toHaveBeenCalledTimes(1)
    expect(setRecord.mock.calls[0]![0].sequence).toBe('GGGG')
  })

  it('cancels pending rAF and timeout on unmount before hydration runs', async () => {
    const hydrateProteinSources = vi.fn().mockImplementation(() => new Promise(() => {}))
    const setRecord = vi.fn()
    const recordRef = { current: bootRecord() }
    renderHarness(
      stableBootInput(recordRef, { pendingIdbHandoffKey: 'handoff-2' }),
      { recordRef, setRecordRef: { current: setRecord }, applySavedBaselineRef: { current: vi.fn() } },
      {
        hydrateProteinSources,
        clearHistoryBootQueryParams: vi.fn(),
        setStatus: vi.fn(),
      },
    )
    act(() => root?.unmount())
    flushRafOnly()
    flushTimersOnly()
    expect(hydrateProteinSources).not.toHaveBeenCalled()
    expect(setRecord).not.toHaveBeenCalled()
  })

  it('clears queued timeout after rAF when unmounting before the timer callback runs', async () => {
    const hydrateProteinSources = vi.fn().mockResolvedValue([])
    const setRecord = vi.fn()
    const applySavedBaseline = vi.fn()
    const recordRef = { current: bootRecord() }
    renderHarness(
      stableBootInput(recordRef, { pendingIdbHandoffKey: 'handoff-3' }),
      {
        recordRef,
        setRecordRef: { current: setRecord },
        applySavedBaselineRef: { current: applySavedBaseline },
      },
      {
        hydrateProteinSources,
        clearHistoryBootQueryParams: vi.fn(),
        setStatus: vi.fn(),
      },
    )
    flushRafOnly()
    expect(vi.getTimerCount()).toBe(1)
    act(() => root?.unmount())
    expect(clearTimeoutSpy).toHaveBeenCalled()
    flushTimersOnly()
    expect(hydrateProteinSources).not.toHaveBeenCalled()
    expect(setRecord).not.toHaveBeenCalled()
    expect(applySavedBaseline).not.toHaveBeenCalled()
  })

  it('skips saved baseline when boot opened as unsaved', async () => {
    const hydrateProteinSources = vi.fn().mockResolvedValue([])
    const applySavedBaseline = vi.fn()
    const recordRef = { current: bootRecord() }
    renderHarness(
      stableBootInput(recordRef, { pendingIdbHandoffKey: 'handoff-4', bootInitiallyUnsaved: true }),
      {
        recordRef,
        setRecordRef: { current: vi.fn() },
        applySavedBaselineRef: { current: applySavedBaseline },
      },
      {
        hydrateProteinSources,
        clearHistoryBootQueryParams: vi.fn(),
        setStatus: vi.fn(),
      },
    )
    await flushRafAndTimers(hydrateProteinSources)
    expect(applySavedBaseline).not.toHaveBeenCalled()
  })
})

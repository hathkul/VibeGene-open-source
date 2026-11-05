// @vitest-environment jsdom
import { act, useEffect, useState, type Dispatch, type SetStateAction } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SequenceFeature } from '../../domain/types'
import {
  useSequenceTabMountScrollLifecycleEffects,
  useSequenceTabScrollHost,
  type SequenceTabMountScrollLifecycleInput,
  type SequenceTabMountScrollLifecyclePorts,
  type SequenceTabScrollHost,
} from './useSequenceTabMountScrollLifecycle'

function feature(start: number): SequenceFeature {
  return {
    id: 'f1',
    type: 'CDS',
    locations: [{ start, end: start + 3 }],
  } as SequenceFeature
}

function createCancellationAwareRaf() {
  const entries: { id: number; callback: FrameRequestCallback; cancelled: boolean }[] = []
  let nextId = 0
  return {
    requestAnimationFrame: (callback: FrameRequestCallback) => {
      nextId += 1
      entries.push({ id: nextId, callback, cancelled: false })
      return nextId
    },
    cancelAnimationFrame: (handle: number) => {
      const entry = entries.find((candidate) => candidate.id === handle)
      if (entry) entry.cancelled = true
    },
    flushRaf: () => {
      act(() => {
        const pending = entries.filter((entry) => !entry.cancelled)
        entries.length = 0
        pending.forEach((entry) => entry.callback(0))
      })
    },
  }
}

type HarnessProps = {
  activeTab: string
  bindScrollHost?: boolean
  reveal: Omit<
    SequenceTabMountScrollLifecycleInput,
    'activeTab' | 'sequenceLength' | 'sequenceScrollTarget' | 'setSequenceScrollTarget'
  >
  onSnapshot: (snapshot: { paneMounted: boolean; scrollTarget: number | null; host: SequenceTabScrollHost }) => void
}

describe('useSequenceTabMountScrollLifecycle', () => {
  let container: HTMLDivElement | undefined
  let root: ReturnType<typeof createRoot> | undefined
  let rafQueue: FrameRequestCallback[]
  let rafId: number
  let scrollHost: HTMLDivElement
  let ports: SequenceTabMountScrollLifecyclePorts
  let scheduleScrollMock: SequenceTabMountScrollLifecyclePorts['scheduleScrollToPosition']
  let setHarnessProps: Dispatch<SetStateAction<HarnessProps>> | undefined
  let latestSnapshot: HarnessProps['onSnapshot'] extends (value: infer T) => void ? T : never

  beforeEach(() => {
    rafQueue = []
    rafId = 0
    scrollHost = document.createElement('div')
    document.body.append(scrollHost)

    scheduleScrollMock = vi.fn(() => vi.fn()) as SequenceTabMountScrollLifecyclePorts['scheduleScrollToPosition']

    ports = {
      requestAnimationFrame: (callback) => {
        rafQueue.push(callback)
        rafId += 1
        return rafId
      },
      cancelAnimationFrame: vi.fn(),
      createResizeObserver: () => ({
        observe: vi.fn(),
        disconnect: vi.fn(),
      }),
      computeVisibleRange: () => ({ start: 0, end: 100 }),
      scheduleScrollToPosition: scheduleScrollMock,
    }
  })

  afterEach(() => {
    act(() => root?.unmount())
    container?.remove()
    scrollHost.remove()
  })

  function flushRaf() {
    act(() => {
      rafQueue.splice(0).forEach((callback) => callback(0))
    })
  }

  function mountHarness(initial: HarnessProps) {
    container = document.createElement('div')
    document.body.append(container)
    root = createRoot(container)

    function LifecycleHarness(props: HarnessProps) {
      const tabHost = useSequenceTabScrollHost()
      if (props.bindScrollHost !== false) {
        tabHost.sequenceScrollRef.current = scrollHost
      }

      useSequenceTabMountScrollLifecycleEffects(
        tabHost,
        {
          activeTab: props.activeTab,
          sequenceLength: 1000,
          sequenceScrollTarget: tabHost.sequenceScrollTarget,
          setSequenceScrollTarget: tabHost.setSequenceScrollTarget,
          ...props.reveal,
        },
        ports,
      )

      props.onSnapshot({
        paneMounted: tabHost.sequencePaneMounted,
        scrollTarget: tabHost.sequenceScrollTarget,
        host: tabHost,
      })
      return null
    }

    function Root() {
      const [props, setProps] = useState(initial)
      setHarnessProps = setProps
      return <LifecycleHarness {...props} />
    }

    act(() => {
      root!.render(<Root />)
    })
  }

  function updateHarness(patch: Partial<HarnessProps>) {
    act(() => {
      setHarnessProps?.((current) => ({ ...current, ...patch }))
    })
  }

  const baseReveal = (): HarnessProps['reveal'] => ({
    selectionFocus: 'dna',
    selectedFeature: null,
    selectedPrimerId: null,
    selectedRange: null,
    primerBindings: [],
    cutSelectionEnzymes: null,
    cutSelectionAnchor: null,
    cutStrandSelection: null,
  })

  it('lazy-mounts the sequence pane when the Sequence tab becomes active', () => {
    mountHarness({
      activeTab: 'Map',
      reveal: baseReveal(),
      onSnapshot: (snapshot) => {
        latestSnapshot = snapshot
      },
    })
    expect(latestSnapshot!.paneMounted).toBe(false)
    updateHarness({ activeTab: 'Sequence' })
    expect(latestSnapshot!.paneMounted).toBe(true)
  })

  it('clears scroll target when leaving the Sequence tab', () => {
    mountHarness({
      activeTab: 'Map',
      reveal: { ...baseReveal(), selectionFocus: 'feature', selectedFeature: feature(40) },
      onSnapshot: (snapshot) => {
        latestSnapshot = snapshot
      },
    })
    updateHarness({ activeTab: 'Sequence' })
    expect(latestSnapshot!.scrollTarget).toBe(40)
    updateHarness({ activeTab: 'Map' })
    expect(latestSnapshot!.scrollTarget).toBe(null)
  })

  it('uses selection target when entering the Sequence tab', () => {
    mountHarness({
      activeTab: 'Map',
      reveal: { ...baseReveal(), selectionFocus: 'feature', selectedFeature: feature(55) },
      onSnapshot: (snapshot) => {
        latestSnapshot = snapshot
      },
    })
    vi.mocked(scheduleScrollMock).mockClear()
    updateHarness({ activeTab: 'Sequence' })
    expect(latestSnapshot!.scrollTarget).toBe(55)
    expect(scheduleScrollMock).toHaveBeenCalledWith(scrollHost, 55, expect.any(Function))
  })

  it('uses the alignment navigator for a pending trace reveal target', () => {
    const navigateToTemplate = vi.fn()
    const raf = createCancellationAwareRaf()
    ports.requestAnimationFrame = raf.requestAnimationFrame
    ports.cancelAnimationFrame = raf.cancelAnimationFrame
    mountHarness({
      activeTab: 'Map',
      reveal: baseReveal(),
      onSnapshot: (snapshot) => {
        latestSnapshot = snapshot
      },
    })

    act(() => {
      latestSnapshot!.host.registerTemplateNavigator({ scrollToTemplate: navigateToTemplate })
      latestSnapshot!.host.queueRevealTarget({ kind: 'alignment', templateIndex: 420 })
    })
    updateHarness({ activeTab: 'Sequence' })
    expect(latestSnapshot!.scrollTarget).toBe(null)
    expect(navigateToTemplate).not.toHaveBeenCalled()
    raf.flushRaf()
    raf.flushRaf()
    expect(navigateToTemplate).toHaveBeenCalledWith(420)
    expect(scheduleScrollMock).not.toHaveBeenCalled()
  })

  it('uses the normal sequence scroller for a pending range or feature selection', () => {
    mountHarness({
      activeTab: 'Map',
      reveal: { ...baseReveal(), selectedRange: { start: 72, end: 90 } },
      onSnapshot: (snapshot) => {
        latestSnapshot = snapshot
      },
    })

    act(() => latestSnapshot!.host.queueRevealTarget({ kind: 'selection' }))
    updateHarness({ activeTab: 'Sequence' })
    expect(latestSnapshot!.scrollTarget).toBe(72)
    expect(scheduleScrollMock).toHaveBeenCalledWith(scrollHost, 72, expect.any(Function))
  })

  it('uses the alignment navigator for a pending range or feature selection in alignment mode', () => {
    const navigateToTemplate = vi.fn()
    const raf = createCancellationAwareRaf()
    ports.requestAnimationFrame = raf.requestAnimationFrame
    ports.cancelAnimationFrame = raf.cancelAnimationFrame
    mountHarness({
      activeTab: 'Map',
      reveal: { ...baseReveal(), selectedRange: { start: 72, end: 90 } },
      onSnapshot: (snapshot) => {
        latestSnapshot = snapshot
      },
    })

    act(() => {
      latestSnapshot!.host.registerTemplateNavigator({ scrollToTemplate: navigateToTemplate })
      latestSnapshot!.host.queueRevealTarget({ kind: 'selection', viewport: 'alignment' })
    })
    updateHarness({ activeTab: 'Sequence' })
    raf.flushRaf()
    raf.flushRaf()
    expect(navigateToTemplate).toHaveBeenCalledWith(72)
    expect(scheduleScrollMock).not.toHaveBeenCalled()
  })

  it('routes a template coordinate through the sequence scroller when alignment mode is unavailable', () => {
    mountHarness({
      activeTab: 'Map',
      reveal: baseReveal(),
      onSnapshot: (snapshot) => {
        latestSnapshot = snapshot
      },
    })

    act(() => latestSnapshot!.host.queueRevealTarget({ kind: 'sequence', position: 315 }))
    updateHarness({ activeTab: 'Sequence' })
    expect(latestSnapshot!.scrollTarget).toBe(315)
    expect(scheduleScrollMock).toHaveBeenCalledWith(scrollHost, 315, expect.any(Function))
  })

  it('skips enter restore when an explicit scroll target is already set', () => {
    mountHarness({
      activeTab: 'Map',
      reveal: { ...baseReveal(), selectionFocus: 'feature', selectedFeature: feature(80) },
      onSnapshot: (snapshot) => {
        latestSnapshot = snapshot
      },
    })
    act(() => {
      latestSnapshot!.host.setSequenceScrollTarget(12)
    })
    updateHarness({ activeTab: 'Sequence' })
    flushRaf()
    expect(scheduleScrollMock).toHaveBeenCalledWith(scrollHost, 12, expect.any(Function))
    expect(scheduleScrollMock).not.toHaveBeenCalledWith(scrollHost, 80, expect.any(Function))
  })

  it('tracks the viewport anchor while the Sequence tab is active', () => {
    mountHarness({
      activeTab: 'Sequence',
      reveal: baseReveal(),
      onSnapshot: (snapshot) => {
        latestSnapshot = snapshot
      },
    })
    expect(latestSnapshot!.host.sequenceViewAnchorRef.current).toBe(50)
  })

  it('cancels enter-anchor waiting frame before a late host bind can schedule', () => {
    const raf = createCancellationAwareRaf()
    ports.requestAnimationFrame = raf.requestAnimationFrame
    ports.cancelAnimationFrame = raf.cancelAnimationFrame
    ports.computeVisibleRange = () => ({ start: 0, end: 100 })

    mountHarness({
      activeTab: 'Map',
      bindScrollHost: false,
      reveal: baseReveal(),
      onSnapshot: (snapshot) => {
        latestSnapshot = snapshot
      },
    })
    act(() => {
      latestSnapshot!.host.sequenceViewAnchorRef.current = 500
    })
    vi.mocked(scheduleScrollMock).mockClear()
    updateHarness({ activeTab: 'Sequence', bindScrollHost: false })
    expect(scheduleScrollMock).not.toHaveBeenCalled()
    updateHarness({ activeTab: 'Map', bindScrollHost: false })
    updateHarness({ bindScrollHost: true })
    act(() => {
      latestSnapshot!.host.sequenceScrollRef.current = scrollHost
    })
    raf.flushRaf()
    expect(scheduleScrollMock).not.toHaveBeenCalled()
  })

  it('does not attach scroll after cleanup when a cancelled rAF is flushed', () => {
    const raf = createCancellationAwareRaf()
    ports.requestAnimationFrame = raf.requestAnimationFrame
    ports.cancelAnimationFrame = raf.cancelAnimationFrame

    mountHarness({
      activeTab: 'Map',
      bindScrollHost: false,
      reveal: { ...baseReveal(), selectionFocus: 'feature', selectedFeature: feature(90) },
      onSnapshot: (snapshot) => {
        latestSnapshot = snapshot
      },
    })
    vi.mocked(scheduleScrollMock).mockClear()
    updateHarness({ activeTab: 'Sequence', bindScrollHost: false })
    expect(latestSnapshot!.scrollTarget).toBe(90)
    updateHarness({ activeTab: 'Map', bindScrollHost: false })
    raf.flushRaf()
    expect(scheduleScrollMock).not.toHaveBeenCalled()
  })

  it('schedules stored-anchor restore only when the viewport center is far enough away', () => {
    let visibleRangeCall = 0
    ports.computeVisibleRange = () => {
      visibleRangeCall += 1
      if (visibleRangeCall === 1) return { start: 450, end: 550 }
      return { start: 0, end: 100 }
    }

    mountHarness({
      activeTab: 'Map',
      reveal: baseReveal(),
      onSnapshot: (snapshot) => {
        latestSnapshot = snapshot
      },
    })
    vi.mocked(scheduleScrollMock).mockClear()
    updateHarness({ activeTab: 'Sequence' })
    expect(latestSnapshot!.host.sequenceViewAnchorRef.current).toBe(500)
    expect(scheduleScrollMock).toHaveBeenCalledTimes(1)
    expect(scheduleScrollMock).toHaveBeenCalledWith(scrollHost, 500, expect.any(Function))
    const enterCleanup = vi.mocked(scheduleScrollMock).mock.results[0]?.value as (() => void) | undefined
    expect(typeof enterCleanup).toBe('function')

    vi.mocked(scheduleScrollMock).mockClear()
    ports.computeVisibleRange = () => ({ start: 475, end: 525 })
    updateHarness({ activeTab: 'Map' })
    updateHarness({ activeTab: 'Sequence' })
    expect(latestSnapshot!.host.sequenceViewAnchorRef.current).toBe(500)
    expect(scheduleScrollMock).not.toHaveBeenCalled()
  })

  it('clears an explicit scroll target when scroll scheduling settles', () => {
    let settle: (() => void) | undefined
    scheduleScrollMock = vi.fn((_host, _position, onSettled) => {
      settle = onSettled
      return vi.fn()
    }) as SequenceTabMountScrollLifecyclePorts['scheduleScrollToPosition']
    ports.scheduleScrollToPosition = scheduleScrollMock

    mountHarness({
      activeTab: 'Map',
      reveal: { ...baseReveal(), selectionFocus: 'feature', selectedFeature: feature(33) },
      onSnapshot: (snapshot) => {
        latestSnapshot = snapshot
      },
    })
    updateHarness({ activeTab: 'Sequence' })
    expect(latestSnapshot!.scrollTarget).toBe(33)
    act(() => {
      settle?.()
    })
    expect(latestSnapshot!.scrollTarget).toBe(null)
  })

  it('keeps the sequence pane mounted after leaving the Sequence tab', () => {
    mountHarness({
      activeTab: 'Sequence',
      reveal: baseReveal(),
      onSnapshot: (snapshot) => {
        latestSnapshot = snapshot
      },
    })
    expect(latestSnapshot!.paneMounted).toBe(true)
    updateHarness({ activeTab: 'Map' })
    expect(latestSnapshot!.paneMounted).toBe(true)
  })

  it('wires template navigator registration through the alignment ref', () => {
    container = document.createElement('div')
    document.body.append(container)
    root = createRoot(container)
    const scrollToTemplate = vi.fn()
    let tabHost!: SequenceTabScrollHost

    function TemplateHarness() {
      tabHost = useSequenceTabScrollHost()
      useEffect(() => {
        tabHost.registerTemplateNavigator({ scrollToTemplate })
      }, [])
      return null
    }

    act(() => {
      root!.render(<TemplateHarness />)
    })
    act(() => {
      tabHost.alignmentScrollToTemplateRef.current(3)
    })
    expect(scrollToTemplate).toHaveBeenCalledWith(3)
  })
})

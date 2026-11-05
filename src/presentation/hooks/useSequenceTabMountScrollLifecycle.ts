import { useCallback, useEffect, useLayoutEffect, useRef, useState, type MutableRefObject, type RefObject } from 'react'
import {
  resolveSequenceEnterTabRevealPosition,
  shouldScheduleEnterTabAnchorScroll,
  type SequencePendingRevealTarget,
  type SequenceEnterTabRevealInput,
} from '../../application/sequenceTab/sequenceEnterTabRevealPosition'
import {
  computeSequenceMinimapVisibleRange,
  scheduleSequenceScrollToPosition,
} from '../sequence/sequenceShared'

export type SequenceTabScrollHost = {
  sequenceScrollRef: RefObject<HTMLDivElement | null>
  sequenceViewAnchorRef: MutableRefObject<number | null>
  sequencePaneMounted: boolean
  setSequencePaneMounted: (mounted: boolean) => void
  sequenceScrollTarget: number | null
  setSequenceScrollTarget: (position: number | null) => void
  pendingRevealTarget: SequencePendingRevealTarget | null
  setPendingRevealTarget: (target: SequencePendingRevealTarget | null) => void
  queueRevealTarget: (target: SequencePendingRevealTarget) => void
  alignmentScrollToTemplateRef: MutableRefObject<(templateIndex: number) => void>
  registerTemplateNavigator: (navigator: { scrollToTemplate: (templateIndex: number) => void }) => void
}

export type SequenceTabMountScrollLifecycleInput = SequenceEnterTabRevealInput & {
  activeTab: string
  sequenceLength: number
  sequenceScrollTarget: number | null
  setSequenceScrollTarget: (position: number | null) => void
}

export type SequenceTabMountScrollLifecyclePorts = {
  requestAnimationFrame: (callback: FrameRequestCallback) => number
  cancelAnimationFrame: (handle: number) => void
  createResizeObserver: (callback: () => void) => {
    observe: (target: Element) => void
    disconnect: () => void
  }
  computeVisibleRange: (scrollHost: HTMLElement, sequenceLength: number) => { start: number; end: number }
  scheduleScrollToPosition: (
    scrollHost: HTMLElement,
    position: number,
    onSettled: () => void,
  ) => () => void
}

export const defaultSequenceTabMountScrollLifecyclePorts: SequenceTabMountScrollLifecyclePorts = {
  requestAnimationFrame: (callback) => requestAnimationFrame(callback),
  cancelAnimationFrame: (handle) => cancelAnimationFrame(handle),
  createResizeObserver: (callback) => {
    const observer = new ResizeObserver(() => {
      requestAnimationFrame(callback)
    })
    return {
      observe: (target) => observer.observe(target),
      disconnect: () => observer.disconnect(),
    }
  },
  computeVisibleRange: computeSequenceMinimapVisibleRange,
  scheduleScrollToPosition: scheduleSequenceScrollToPosition,
}

/** Refs and scroll-target state for the Sequence workspace tab. */
export function useSequenceTabScrollHost(): SequenceTabScrollHost {
  const sequenceScrollRef = useRef<HTMLDivElement | null>(null)
  const sequenceViewAnchorRef = useRef<number | null>(null)
  const [sequencePaneMounted, setSequencePaneMounted] = useState(false)
  const [sequenceScrollTarget, setSequenceScrollTarget] = useState<number | null>(null)
  const [pendingRevealTarget, setPendingRevealTarget] = useState<SequencePendingRevealTarget | null>(null)
  const alignmentScrollToTemplateRef = useRef<(templateIndex: number) => void>(() => {})
  const [templateNavigator, setTemplateNavigator] = useState<(templateIndex: number) => void>(() => () => {})

  useLayoutEffect(() => {
    alignmentScrollToTemplateRef.current = templateNavigator
  }, [templateNavigator])

  const registerTemplateNavigator = useCallback(
    ({ scrollToTemplate }: { scrollToTemplate: (templateIndex: number) => void }) => {
      setTemplateNavigator(() => scrollToTemplate)
    },
    [],
  )

  const queueRevealTarget = useCallback((target: SequencePendingRevealTarget) => {
    setPendingRevealTarget(target)
  }, [])

  return {
    sequenceScrollRef,
    sequenceViewAnchorRef,
    sequencePaneMounted,
    setSequencePaneMounted,
    sequenceScrollTarget,
    setSequenceScrollTarget,
    pendingRevealTarget,
    setPendingRevealTarget,
    queueRevealTarget,
    alignmentScrollToTemplateRef,
    registerTemplateNavigator,
  }
}

/** Lazy mount, anchor tracking, enter-tab restore, and explicit scroll targets for the Sequence tab. */
export function useSequenceTabMountScrollLifecycleEffects(
  host: Pick<
    SequenceTabScrollHost,
    | 'sequenceScrollRef'
    | 'sequenceViewAnchorRef'
    | 'setSequencePaneMounted'
    | 'setSequenceScrollTarget'
    | 'alignmentScrollToTemplateRef'
    | 'pendingRevealTarget'
    | 'setPendingRevealTarget'
  >,
  input: SequenceTabMountScrollLifecycleInput,
  ports: SequenceTabMountScrollLifecyclePorts = defaultSequenceTabMountScrollLifecyclePorts,
) {
  const portsRef = useRef(ports)
  useLayoutEffect(() => {
    portsRef.current = ports
  })

  const sequenceTabWasActiveRef = useRef(false)
  const {
    activeTab,
    sequenceLength,
    sequenceScrollTarget,
    setSequenceScrollTarget,
    selectionFocus,
    selectedFeature,
    selectedPrimerId,
    selectedRange,
    primerBindings,
    cutSelectionEnzymes,
    cutSelectionAnchor,
    cutStrandSelection,
  } = input
  const {
    sequenceScrollRef,
    sequenceViewAnchorRef,
    setSequencePaneMounted,
    alignmentScrollToTemplateRef,
    pendingRevealTarget,
    setPendingRevealTarget,
  } = host

  useEffect(() => {
    if (activeTab === 'Sequence') {
      setSequencePaneMounted(true)
    }
  }, [activeTab, setSequencePaneMounted])

  useEffect(() => {
    if (activeTab !== 'Sequence') return
    const scrollHost = sequenceScrollRef.current
    if (!scrollHost) return

    const saveAnchor = () => {
      const range = portsRef.current.computeVisibleRange(scrollHost, sequenceLength)
      sequenceViewAnchorRef.current = Math.round((range.start + range.end) / 2)
    }

    saveAnchor()
    scrollHost.addEventListener('scroll', saveAnchor, { passive: true })
    const resizeObserver = portsRef.current.createResizeObserver(saveAnchor)
    resizeObserver.observe(scrollHost)

    return () => {
      scrollHost.removeEventListener('scroll', saveAnchor)
      resizeObserver.disconnect()
    }
  }, [activeTab, sequenceLength, sequenceScrollRef, sequenceViewAnchorRef])

  useEffect(() => {
    if (activeTab !== 'Sequence') return
    return () => setSequenceScrollTarget(null)
  }, [activeTab, setSequenceScrollTarget])

  useEffect(() => {
    const wasActive = sequenceTabWasActiveRef.current
    sequenceTabWasActiveRef.current = activeTab === 'Sequence'
    if (activeTab !== 'Sequence' || wasActive) return
    if (sequenceScrollTarget !== null) {
      if (pendingRevealTarget) setPendingRevealTarget?.(null)
      return
    }

    if (pendingRevealTarget?.kind === 'alignment') {
      let secondFrame = 0
      const firstFrame = portsRef.current.requestAnimationFrame(() => {
        secondFrame = portsRef.current.requestAnimationFrame(() => {
          alignmentScrollToTemplateRef.current(pendingRevealTarget.templateIndex)
          setPendingRevealTarget?.(null)
        })
      })
      return () => {
        portsRef.current.cancelAnimationFrame(firstFrame)
        if (secondFrame) portsRef.current.cancelAnimationFrame(secondFrame)
      }
    }

    if (pendingRevealTarget?.kind === 'sequence') {
      setPendingRevealTarget?.(null)
      setSequenceScrollTarget(pendingRevealTarget.position)
      return
    }

    const alignmentSelection = pendingRevealTarget?.kind === 'selection' && pendingRevealTarget.viewport === 'alignment'
    if (pendingRevealTarget?.kind === 'selection' && !alignmentSelection) setPendingRevealTarget?.(null)

    const selectionRevealPosition = resolveSequenceEnterTabRevealPosition({
      selectionFocus,
      selectedFeature,
      selectedPrimerId,
      selectedRange,
      primerBindings,
      cutSelectionEnzymes,
      cutSelectionAnchor,
      cutStrandSelection,
    })
    const anchor = selectionRevealPosition ?? sequenceViewAnchorRef.current
    if (anchor === null) return

    if (selectionRevealPosition !== null) {
      if (alignmentSelection) {
        let secondFrame = 0
        const firstFrame = portsRef.current.requestAnimationFrame(() => {
          secondFrame = portsRef.current.requestAnimationFrame(() => {
            alignmentScrollToTemplateRef.current(selectionRevealPosition)
            setPendingRevealTarget?.(null)
          })
        })
        return () => {
          portsRef.current.cancelAnimationFrame(firstFrame)
          if (secondFrame) portsRef.current.cancelAnimationFrame(secondFrame)
        }
      }
      setSequenceScrollTarget(selectionRevealPosition)
      return
    }

    let cleanup: (() => void) | undefined
    let waitFrame = 0
    const { requestAnimationFrame, cancelAnimationFrame, computeVisibleRange, scheduleScrollToPosition } =
      portsRef.current

    const attach = () => {
      const scrollHost = sequenceScrollRef.current
      if (!scrollHost) {
        waitFrame = requestAnimationFrame(attach)
        return
      }

      const range = computeVisibleRange(scrollHost, sequenceLength)
      const center = Math.round((range.start + range.end) / 2)
      if (!shouldScheduleEnterTabAnchorScroll(center, anchor)) return

      cleanup = scheduleScrollToPosition(scrollHost, anchor, () => {})
    }

    attach()

    return () => {
      if (waitFrame) cancelAnimationFrame(waitFrame)
      cleanup?.()
    }
  }, [
    activeTab,
    cutSelectionAnchor,
    cutSelectionEnzymes,
    cutStrandSelection,
    primerBindings,
    sequenceLength,
    sequenceScrollRef,
    sequenceScrollTarget,
    sequenceViewAnchorRef,
    selectedFeature,
    selectedPrimerId,
    selectedRange,
    selectionFocus,
    setSequenceScrollTarget,
    alignmentScrollToTemplateRef,
    pendingRevealTarget,
    setPendingRevealTarget,
  ])

  useEffect(() => {
    if (activeTab !== 'Sequence' || sequenceScrollTarget === null) return

    let disposed = false
    let cleanup: (() => void) | undefined
    let waitFrame = 0
    const position = sequenceScrollTarget
    const { requestAnimationFrame, cancelAnimationFrame, scheduleScrollToPosition } = portsRef.current

    const attach = () => {
      if (disposed) return
      const scrollHost = sequenceScrollRef.current
      if (!scrollHost) {
        waitFrame = requestAnimationFrame(attach)
        return
      }
      cleanup?.()
      cleanup = scheduleScrollToPosition(scrollHost, position, () => {
        if (!disposed) setSequenceScrollTarget(null)
      })
    }

    attach()

    return () => {
      disposed = true
      if (waitFrame) cancelAnimationFrame(waitFrame)
      cleanup?.()
    }
  }, [activeTab, sequenceScrollRef, sequenceScrollTarget, setSequenceScrollTarget])
}

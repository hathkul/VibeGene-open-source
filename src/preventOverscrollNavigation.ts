/** Horizontal wheel delta (tilt wheel or shift+vertical wheel). */
export function horizontalWheelDelta(event: WheelEvent): number {
  if (Math.abs(event.deltaX) > Math.abs(event.deltaY)) return event.deltaX
  if (event.shiftKey && event.deltaY !== 0) return event.deltaY
  return 0
}

function findHorizontalScrollHost(element: Element | null): HTMLElement | null {
  let current: Element | null = element
  while (current && current !== document.documentElement) {
    if (!(current instanceof HTMLElement)) {
      current = current.parentElement
      continue
    }
    const { overflowX } = getComputedStyle(current)
    if (
      (overflowX === 'auto' || overflowX === 'scroll' || overflowX === 'overlay')
      && current.scrollWidth > current.clientWidth
    ) {
      return current
    }
    const wheelRoot = current.getAttribute('data-horizontal-wheel-root')
    if (wheelRoot) {
      const target = current.querySelector<HTMLElement>(wheelRoot)
      if (target) return target
    }
    current = current.parentElement
  }
  return null
}

/** Timestamp of the last horizontal wheel gesture that drove a scroll host. */
export let lastHorizontalWheelAtMs = 0

/** Scroll a host horizontally and stop the event from reaching the browser. */
export function applyHorizontalWheel(event: WheelEvent, scrollHost: HTMLElement): void {
  const delta = horizontalWheelDelta(event)
  if (delta === 0) return
  lastHorizontalWheelAtMs = performance.now()
  event.preventDefault()
  const maxScrollLeft = Math.max(0, scrollHost.scrollWidth - scrollHost.clientWidth)
  scrollHost.scrollLeft = Math.max(0, Math.min(maxScrollLeft, scrollHost.scrollLeft + delta))
}

/**
 * Prevent horizontal wheel / trackpad gestures from triggering browser back/forward
 * navigation when scrolling inside VibeGene panes.
 */
export function installPreventOverscrollNavigation(): () => void {
  const onWheel = (event: WheelEvent) => {
    const delta = horizontalWheelDelta(event)
    if (delta === 0) return
    const scrollHost = findHorizontalScrollHost(event.target as Element)
    if (scrollHost) {
      applyHorizontalWheel(event, scrollHost)
      return
    }
    event.preventDefault()
  }

  document.addEventListener('wheel', onWheel, { passive: false, capture: true })
  return () => document.removeEventListener('wheel', onWheel, { capture: true })
}

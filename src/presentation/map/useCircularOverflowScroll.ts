import { useLayoutEffect, useRef } from 'react'

export interface CircularOverflowScrollOptions {
  /** Whether the circular presentation currently extends beyond its scroll host. */
  enabled: boolean
  /** Change this when the displayed document changes. */
  documentIdentity: unknown
  /** Values that can change rendered geometry; reevaluation preserves the current scroll. */
  geometryDependencies?: readonly unknown[]
}

function initializeScroll(host: HTMLElement, svgWidth: number) {
  host.scrollTop = 0
  host.scrollLeft = svgWidth > host.clientWidth ? (svgWidth - host.clientWidth) / 2 : 0
}

/**
 * Places a newly displayed overflowing circular map at its top edge. Wide maps
 * are centered only when their SVG is wider than the host. Subsequent geometry
 * changes leave the user's scroll position alone; the browser clamps it when
 * the scroll range shrinks.
 */
export function useCircularOverflowScroll(
  svgRef: { current: SVGSVGElement | null },
  { enabled, documentIdentity, geometryDependencies = [] }: CircularOverflowScrollOptions,
): void {
  const previousRef = useRef<{ enabled: boolean; documentIdentity: unknown } | null>(null)

  useLayoutEffect(() => {
    const previous = previousRef.current
    previousRef.current = { enabled, documentIdentity }

    const enteringOverflow = enabled && !previous?.enabled
    const changingDocument = enabled && previous !== null && previous.documentIdentity !== documentIdentity
    const initialOverflow = enabled && previous === null
    if (!enteringOverflow && !changingDocument && !initialOverflow) return

    const host = svgRef.current?.parentElement
    if (!host) return
    const svg = svgRef.current
    const svgWidth = svg?.getBoundingClientRect().width ?? 0

    initializeScroll(host, svgWidth)
  // geometryDependencies intentionally reruns measurement without resetting scroll.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, documentIdentity, svgRef, ...geometryDependencies])
}

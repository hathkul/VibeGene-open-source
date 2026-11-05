import { useLayoutEffect, type RefObject } from 'react'

/** Report the actual compact member row height, including changes after rendering. */
export function useHorizontalRowHeight(
  containerRef: RefObject<HTMLDivElement | null>,
  horizontalMode: boolean,
  compact: boolean,
  layoutActive: boolean | undefined,
  rowEstimatedHeights: number[],
  fallback: number,
  onHeight?: (height: number) => void,
) {
  useLayoutEffect(() => {
    if (!horizontalMode || !onHeight || rowEstimatedHeights.length === 0) return
    if (!compact) { onHeight(rowEstimatedHeights[0] ?? fallback); return }
    const row = containerRef.current?.querySelector<HTMLElement>('.sequence-row:not(.sequence-row-placeholder)')
    if (!row) { onHeight(rowEstimatedHeights[0] ?? fallback); return }
    const report = () => onHeight(Math.ceil(row.getBoundingClientRect().height) || rowEstimatedHeights[0] || fallback)
    report()
    const observer = new ResizeObserver(report)
    observer.observe(row)
    return () => observer.disconnect()
  }, [containerRef, compact, horizontalMode, layoutActive, onHeight, rowEstimatedHeights, fallback])
}

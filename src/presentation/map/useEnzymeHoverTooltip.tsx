import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { RestrictionSite } from '../../domain/types'
import { EnzymeTooltip } from './EnzymeTooltip'
import type { EnzymeTooltipHorizontalSide, SequenceEnzymeTooltipBounds } from './enzymeTooltipLayout'

export type Hover = { site: RestrictionSite; count: number; x: number; y: number; placement: 'pointer' | 'above'; outsideSequence?: boolean; sequenceBounds?: SequenceEnzymeTooltipBounds; horizontalSide?: EnzymeTooltipHorizontalSide }

/** A single delayed tooltip shared by all labels in a map or sequence view. */
export function useEnzymeHoverTooltip() {
  const [visible, setVisible] = useState<Hover | null>(null)
  const [hoveredEnzymeName, setHoveredEnzymeName] = useState<string | null>(null)
  const pending = useRef<Hover | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const dismiss = useCallback(() => {
    if (timer.current !== null) clearTimeout(timer.current)
    timer.current = null
    pending.current = null
    setVisible(null)
    setHoveredEnzymeName(null)
  }, [])

  useEffect(() => {
    window.addEventListener('scroll', dismiss, true)
    window.addEventListener('blur', dismiss)
    return () => {
      window.removeEventListener('scroll', dismiss, true)
      window.removeEventListener('blur', dismiss)
      if (timer.current !== null) clearTimeout(timer.current)
    }
  }, [dismiss])

  const hover = useCallback((site: RestrictionSite, count: number, x: number, y: number, placement: Hover['placement'] = 'pointer', outsideSequence = false, sequenceBounds?: SequenceEnzymeTooltipBounds, horizontalSide?: EnzymeTooltipHorizontalSide) => {
    setHoveredEnzymeName(site.enzyme.name)
    const previous = pending.current
    const next = { site, count, x, y, placement, outsideSequence, sequenceBounds, horizontalSide }
    pending.current = next
    if (previous?.site.enzyme.name === site.enzyme.name && previous.site.start === site.start) return
    if (timer.current !== null) clearTimeout(timer.current)
    setVisible(null)
    timer.current = setTimeout(() => {
      timer.current = null
      setVisible(pending.current)
    }, 1000)
  }, [])

  const portal = visible && typeof document !== 'undefined' ? createPortal(
    <EnzymeTooltip hover={visible} />, document.body,
  ) : null
  return { hover, dismiss, portal, hoveredEnzymeName }
}

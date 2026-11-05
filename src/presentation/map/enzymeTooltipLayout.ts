export type EnzymeTooltipPreferredSide = 'pointer' | 'above'
export type EnzymeTooltipHorizontalSide = 'left' | 'right'
export type SequenceEnzymeTooltipBounds = { labelTop: number; labelBottom: number; rowTop: number; rowBottom: number }

export function resolveEnzymeTooltipLeft(
  x: number,
  tooltipWidth: number,
  viewportWidth: number,
  preferredSide: EnzymeTooltipHorizontalSide = 'right',
) {
  const requestedLeft = preferredSide === 'left' ? x - tooltipWidth - 14 : x + 14
  return Math.max(8, Math.min(requestedLeft, viewportWidth - tooltipWidth - 8))
}

export function resolveEnzymeTooltipVerticalPosition(
  y: number,
  tooltipHeight: number,
  viewportHeight: number,
  preferredSide: EnzymeTooltipPreferredSide,
  sequenceBounds?: SequenceEnzymeTooltipBounds,
) {
  if (preferredSide === 'above' && sequenceBounds) {
    const gapTop = sequenceBounds.labelBottom + 8
    if (gapTop + tooltipHeight <= sequenceBounds.rowTop - 8 && gapTop + tooltipHeight <= viewportHeight - 8) {
      return { side: 'gap', top: gapTop }
    }
    const belowRowTop = sequenceBounds.rowBottom + 12
    if (belowRowTop + tooltipHeight <= viewportHeight - 8) {
      return { side: 'below-row', top: belowRowTop }
    }
    const aboveLabelTop = sequenceBounds.labelTop - tooltipHeight - 12
    if (aboveLabelTop >= 8) {
      return { side: 'above-label', top: aboveLabelTop }
    }
    return { side: 'above-label', top: 8 }
  }

  const aboveTop = y - tooltipHeight - 12
  const fitsAbove = aboveTop >= 8
  const side = preferredSide === 'above' && fitsAbove ? 'above' : 'below'
  const requestedTop = side === 'above' ? aboveTop : y + 14
  const top = Math.max(8, Math.min(requestedTop, viewportHeight - tooltipHeight - 8))
  return { side, top }
}

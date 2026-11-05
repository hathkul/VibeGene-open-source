import { describe, expect, it } from 'vitest'
import { resolveEnzymeTooltipLeft, resolveEnzymeTooltipVerticalPosition } from '../src/presentation/map/enzymeTooltipLayout'

describe('resolveEnzymeTooltipLeft', () => {
  it('places hints to the requested side of the pointer', () => {
    expect(resolveEnzymeTooltipLeft(500, 240, 1200, 'left')).toBe(246)
    expect(resolveEnzymeTooltipLeft(500, 240, 1200, 'right')).toBe(514)
  })

  it('clamps a preferred-side hint to the viewport when necessary', () => {
    expect(resolveEnzymeTooltipLeft(20, 240, 1200, 'left')).toBe(8)
  })
})

describe('resolveEnzymeTooltipVerticalPosition', () => {
  it('keeps sequence hints above the row when the full card fits', () => {
    expect(resolveEnzymeTooltipVerticalPosition(420, 260, 900, 'above')).toEqual({ side: 'above', top: 148 })
  })

  it('uses the gap between the sequence label and DNA row when the full card fits', () => {
    expect(resolveEnzymeTooltipVerticalPosition(120, 100, 900, 'above', {
      labelTop: 110,
      labelBottom: 130,
      rowTop: 260,
      rowBottom: 600,
    })).toEqual({ side: 'gap', top: 138 })
  })

  it('moves a sequence hint below the whole row when the label-to-row gap is too small', () => {
    expect(resolveEnzymeTooltipVerticalPosition(120, 260, 900, 'above', {
      labelTop: 110,
      labelBottom: 130,
      rowTop: 220,
      rowBottom: 600,
    })).toEqual({ side: 'below-row', top: 612 })
  })

  it('falls back above the label when a last row has no room below the row in the viewport', () => {
    expect(resolveEnzymeTooltipVerticalPosition(760, 200, 900, 'above', {
      labelTop: 610,
      labelBottom: 630,
      rowTop: 680,
      rowBottom: 850,
    })).toEqual({ side: 'above-label', top: 398 })
  })

  it('moves a sequence hint below the viewport anchor instead of shrinking it when it cannot fit above', () => {
    expect(resolveEnzymeTooltipVerticalPosition(120, 260, 900, 'above')).toEqual({ side: 'below', top: 134 })
  })

  it('keeps pointer-positioned map hints below the pointer', () => {
    expect(resolveEnzymeTooltipVerticalPosition(300, 200, 900, 'pointer')).toEqual({ side: 'below', top: 314 })
  })
})

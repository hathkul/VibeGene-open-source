// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { RestrictionSite } from '../../domain/types'
import { EnzymeTooltip } from './EnzymeTooltip'
import { useEnzymeHoverTooltip } from './useEnzymeHoverTooltip'

const site: RestrictionSite = {
  enzyme: { name: 'EcoRI', notation: 'G^AATTC', recognition: 'GAATTC', cutTop: 1, cutBottom: 5, type: 'II', overhang: { type: "5'", sequence: 'AATT', length: 4 }, manufacturers: [], notes: [] },
  start: 99, end: 105, cutTop: 100, cutBottom: 104, match: 'GAATTC',
}

function Example() {
  const tooltip = useEnzymeHoverTooltip()
  return <><button onPointerMove={(event) => tooltip.hover(site, 2, event.clientX, event.clientY)} onPointerLeave={tooltip.dismiss}>Enzyme</button>{tooltip.portal}</>
}

describe('enzyme hover tooltip', () => {
  let host: HTMLDivElement
  let root: ReturnType<typeof createRoot>
  afterEach(() => {
    act(() => root?.unmount())
    host?.remove()
    vi.useRealTimers()
  })

  it('waits one second, displays enzyme and cut properties, then dismisses', () => {
    vi.useFakeTimers()
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    act(() => root.render(<Example />))
    const button = host.querySelector('button')!
    act(() => button.dispatchEvent(new MouseEvent('pointermove', { bubbles: true, clientX: 30, clientY: 30 })))
    act(() => vi.advanceTimersByTime(999))
    expect(document.querySelector('[role=tooltip]')).toBeNull()
    act(() => vi.advanceTimersByTime(1))
    const tooltip = document.querySelector('[role=tooltip]')!
    expect(tooltip.textContent).toContain('EcoRI (101)')
    expect(tooltip.textContent).toContain("5' overhang")
    expect(tooltip.textContent).toContain('2 sites')
    expect(tooltip.textContent).toContain('GAATTC')
    expect(tooltip.textContent).toContain('CTTAAG')
    expect(tooltip.querySelectorAll('.enzyme-hover-cut-top')).toHaveLength(1)
    expect(tooltip.querySelectorAll('.enzyme-hover-cut-bottom')).toHaveLength(1)
    act(() => window.dispatchEvent(new Event('scroll')))
    expect(document.querySelector('[role=tooltip]')).toBeNull()
  })

  it('cancels a pending tooltip when the pointer leaves', () => {
    vi.useFakeTimers()
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    act(() => root.render(<Example />))
    const button = host.querySelector('button')!
    act(() => button.dispatchEvent(new MouseEvent('pointermove', { bubbles: true })))
    act(() => button.dispatchEvent(new MouseEvent('pointerout', { bubbles: true, relatedTarget: document.body })))
    act(() => vi.advanceTimersByTime(1000))
    expect(document.querySelector('[role=tooltip]')).toBeNull()
  })

  it('shows short cut offsets as Ns and compresses runs longer than four bases', () => {
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    const enzymeSite = (cutBottom: number): RestrictionSite => ({
      ...site,
      enzyme: {
        ...site.enzyme,
        cutTop: 1,
        cutBottom,
        overhang: { type: "5'", sequence: null, length: cutBottom - 1 },
      },
    })

    act(() => root.render(<EnzymeTooltip hover={{ site: enzymeSite(4), count: 1, x: 20, y: 20, placement: 'pointer' }} />))
    expect(host.querySelector('.enzyme-hover-strand')?.textContent).toBe('GAATTC')

    act(() => root.render(<EnzymeTooltip hover={{ site: enzymeSite(9), count: 1, x: 20, y: 20, placement: 'pointer' }} />))
    expect(host.querySelector('.enzyme-hover-strand')?.textContent).toBe('GAATTCNNNN')

    act(() => root.render(<EnzymeTooltip hover={{ site: enzymeSite(10), count: 1, x: 20, y: 20, placement: 'pointer' }} />))
    expect(host.querySelector('.enzyme-hover-strand')?.textContent).toBe('GAATTCNNNNN')

    act(() => root.render(<EnzymeTooltip hover={{ site: enzymeSite(11), count: 1, x: 20, y: 20, placement: 'pointer' }} />))
    expect(host.querySelector('.enzyme-hover-strand')?.textContent).toBe('GAATTC(N)5N')
    expect(host.querySelector('.enzyme-hover-spacer-group sub')?.textContent).toBe('5')

    const nmeAiiiSite: RestrictionSite = {
      ...site,
      enzyme: {
        ...site.enzyme,
        name: 'NmeAIII',
        notation: 'GCCGAG(21/19)',
        recognition: 'GCCGAG',
        cutTop: 27,
        cutBottom: 25,
        type: 'IIS',
        overhang: { type: "3'", sequence: 'NN', length: 2 },
      },
    }
    act(() => root.render(<EnzymeTooltip hover={{ site: nmeAiiiSite, count: 1, x: 20, y: 20, placement: 'pointer' }} />))
    const strands = host.querySelectorAll('.enzyme-hover-strand')
    expect(strands[0]?.textContent).toBe('GCCGAG(N)19NNN')
    expect(strands[1]?.textContent).toBe('CGGCTC(N)19NNN')
    expect(host.querySelectorAll('.enzyme-hover-cut-top')).toHaveLength(1)
    expect(host.querySelectorAll('.enzyme-hover-cut-bottom')).toHaveLength(1)
    const topSlots = strands[0]?.querySelectorAll('.enzyme-hover-cut-slot')
    const bottomSlots = strands[1]?.querySelectorAll('.enzyme-hover-cut-slot')
    expect(topSlots).toHaveLength(2)
    expect(bottomSlots).toHaveLength(2)
    expect(host.querySelector('.enzyme-hover-cut-top')?.closest('.enzyme-hover-cut-slot')).toBe(topSlots?.[1])
    expect(host.querySelector('.enzyme-hover-cut-bottom')?.closest('.enzyme-hover-cut-slot')).toBe(bottomSlots?.[0])
  })
})

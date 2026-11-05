import { themeFixturePalette } from './test-support/themeFixturePalette'
// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TraceViewer } from './TraceViewer'
import type { TraceFileRecord } from './domain/traceTypes'

const trace: TraceFileRecord = {
  id: 'trace-1',
  fileName: 'read.ab1',
  sequence: 'ATGC',
  chromatogram: {
    aTrace: [0, 5, 0, 0],
    tTrace: [0, 0, 4, 0],
    gTrace: [0, 0, 0, 6],
    cTrace: [0, 0, 0, 0],
    basePos: [0, 1, 2, 3],
    baseCalls: ['A', 'T', 'G', 'C'],
    qualNums: [40, 35, 30, 25],
  },
  enabled: true,
  expanded: true,
  showAnnotations: false,
  alignment: null,
}

const selectionTrace: TraceFileRecord = {
  ...trace,
  chromatogram: {
    aTrace: Array.from({ length: 40 }, (_, index) => index === 2 ? 8 : 0),
    tTrace: Array.from({ length: 40 }, (_, index) => index === 10 ? 8 : 0),
    gTrace: Array.from({ length: 40 }, (_, index) => index === 25 ? 8 : 0),
    cTrace: Array.from({ length: 40 }, (_, index) => index === 37 ? 8 : 0),
    basePos: [2, 10, 25, 37],
    baseCalls: ['A', 'T', 'G', 'C'],
    qualNums: [40, 35, 30, 25],
  },
}

const padRawSamples = (values: number[]) => [...values, ...Array.from({ length: 247 }, () => 0)]
const rawTrace: TraceFileRecord = {
  ...trace,
  chromatogram: {
    ...trace.chromatogram,
    raw: {
      aTrace: padRawSamples([-2, 0, 4, -1]),
      tTrace: padRawSamples([1, 0, -6, 0]),
      gTrace: padRawSamples([0, 3, 0, -2]),
      cTrace: padRawSamples([-1, 2, 1, 0]),
      basePos: [0, 1, 2],
    },
  },
}

let host: HTMLDivElement
let root: Root

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
})

afterEach(async () => {
  await act(async () => root.unmount())
  host.remove()
  vi.unstubAllGlobals()
})

describe('TraceViewer base-call selection', () => {
  it('renders one contiguous selectable HTML sequence in scan order', async () => {
    await act(async () => root.render(createElement(TraceViewer, { trace })))
    const strip = host.querySelector<HTMLElement>('.trace-viewer__base-sequence')!
    const selectableRun = strip.querySelector<HTMLElement>('.trace-viewer__selection-text')!
    expect(selectableRun.childNodes).toHaveLength(1)
    expect(selectableRun.firstChild?.nodeType).toBe(Node.TEXT_NODE)
    expect(selectableRun.textContent).toBe('ATGC')
    expect(selectableRun.dataset.selectionLayer).toBe('native')
    expect(getComputedStyle(selectableRun).width).toBe('1px')
    expect(getComputedStyle(selectableRun).height).toBe('1px')
    expect(getComputedStyle(selectableRun).overflow).toBe('hidden')
    expect(getComputedStyle(selectableRun).clipPath).toBe('inset(50%)')
    expect(getComputedStyle(selectableRun).opacity).toBe('0')
    expect(strip.querySelector('.trace-viewer__glyph-layer')?.getAttribute('aria-hidden')).toBe('true')
    expect(strip.querySelectorAll('.trace-viewer__base-glyph')).toHaveLength(4)
    const orderedBands = [...host.querySelector('.trace-viewer__scroll')!.children].map((element) =>
      element.classList.contains('trace-viewer__chart') ? 'peaks' :
        element.classList.contains('trace-viewer__base-sequence') ? 'sequence' : 'quality-ruler')
    expect(orderedBands).toEqual(['peaks', 'sequence', 'quality-ruler'])
    const selection = window.getSelection()!
    const range = document.createRange()
    range.selectNodeContents(selectableRun)
    selection.removeAllRanges()
    selection.addRange(range)
    expect(selection.toString()).toBe('ATGC')
  })

  it('maps a drag across nonuniform PLOC hit cells to one exact contiguous text range', async () => {
    await act(async () => root.render(createElement(TraceViewer, { trace: selectionTrace })))
    const band = host.querySelector<HTMLElement>('.trace-viewer__base-sequence')!
    band.getBoundingClientRect = () => ({ left: 100, right: 131.2, top: 0, bottom: 30, width: 31.2, height: 30, x: 100, y: 0, toJSON: () => ({}) })
    await act(async () => band.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, clientX: 108 })))
    await act(async () => band.dispatchEvent(new MouseEvent('pointermove', { bubbles: true, clientX: 120 })))
    await act(async () => band.dispatchEvent(new MouseEvent('pointerup', { bubbles: true, clientX: 120 })))
    expect(window.getSelection()?.toString()).toBe('TG')
    const highlights = host.querySelectorAll('.trace-viewer__selection-highlight')
    expect(highlights).toHaveLength(1)
    expect((highlights[0] as HTMLElement).dataset.selectionVisual).toBe('custom')
    expect(Number((highlights[0] as HTMLElement).dataset.selectionStart)).toBe(1)
    expect(Number((highlights[0] as HTMLElement).dataset.selectionEnd)).toBe(2)
    expect(Number.parseFloat((highlights[0] as HTMLElement).style.left)).toBeCloseTo(4.8, 5)
    expect(Number.parseFloat((highlights[0] as HTMLElement).style.width)).toBeCloseTo(20, 5)
  })

  it('leaves a collapsed caret on a single click and supports select-all from the sequence band', async () => {
    await act(async () => root.render(createElement(TraceViewer, { trace: selectionTrace })))
    const band = host.querySelector<HTMLElement>('.trace-viewer__base-sequence')!
    band.getBoundingClientRect = () => ({ left: 100, right: 131.2, top: 0, bottom: 30, width: 31.2, height: 30, x: 100, y: 0, toJSON: () => ({}) })
    await act(async () => band.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, clientX: 120 })))
    await act(async () => band.dispatchEvent(new MouseEvent('pointerup', { bubbles: true, clientX: 120 })))
    expect(window.getSelection()?.isCollapsed).toBe(true)
    expect(host.querySelector('.trace-viewer__selection-highlight')).toBeNull()
    await act(async () => band.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', ctrlKey: true, bubbles: true })))
    expect(window.getSelection()?.toString()).toBe('ATGC')
  })

  it('keeps visual glyph, narrow hover marker, and quality bar centered on the same called-base x', async () => {
    await act(async () => root.render(createElement(TraceViewer, { trace })))
    const band = host.querySelector<HTMLElement>('.trace-viewer__base-sequence')!
    const glyph = host.querySelector<HTMLElement>('.trace-viewer__base-glyph[data-base-index="2"]')!
    const hitRect = host.querySelector<SVGRectElement>('.trace-viewer__hit-segment[data-index="2"]')!
    const qualityBar = host.querySelector<SVGRectElement>('.trace-viewer__quality-bar[data-index="2"]')
    const center = Number.parseFloat(glyph.style.left)
    expect(center).toBe(1.6)
    expect(glyph.getAttribute('data-base-x')).toBe('1.6')
    band.getBoundingClientRect = () => ({ left: 0, right: 2.4, top: 0, bottom: 30, width: 2.4, height: 30, x: 0, y: 0, toJSON: () => ({}) })
    await act(async () => band.dispatchEvent(new MouseEvent('pointermove', { bubbles: true, clientX: center })))
    const highlight = host.querySelector<SVGRectElement>('.trace-viewer__chart .trace-viewer__active-marker')!
    const sequenceMarker = host.querySelector<HTMLElement>('.trace-viewer__sequence-marker')!
    const detailMarker = host.querySelector<SVGRectElement>('.trace-viewer__detail-band .trace-viewer__active-marker')!
    expect(Number(highlight.getAttribute('x')) + Number(highlight.getAttribute('width')) / 2).toBeCloseTo(center, 10)
    expect(Number.parseFloat(sequenceMarker.style.left) + Number.parseFloat(sequenceMarker.style.width) / 2).toBeCloseTo(center, 10)
    expect(Number(detailMarker.getAttribute('x')) + Number(detailMarker.getAttribute('width')) / 2).toBeCloseTo(center, 10)
    expect(Number.parseFloat(sequenceMarker.style.width)).toBeCloseTo(Number(highlight.getAttribute('width')), 10)
    const hitStart = Number(hitRect.getAttribute('x'))
    const hitEnd = hitStart + Number(hitRect.getAttribute('width'))
    expect(Number(highlight.getAttribute('x'))).toBeGreaterThanOrEqual(hitStart)
    expect(Number(highlight.getAttribute('x')) + Number(highlight.getAttribute('width'))).toBeLessThanOrEqual(hitEnd)
    expect(Number(qualityBar?.getAttribute('x')) + Number(qualityBar?.getAttribute('width')) / 2).toBe(center)
  })

  it('opens the current reverse-complement direction as a sequence', async () => {
    const onOpenAsSequence = vi.fn()
    await act(async () => root.render(createElement(TraceViewer, { trace, onOpenAsSequence })))
    const reverse = [...host.querySelectorAll('button')].find((button) => button.title === 'Reverse complement direction')!
    await act(async () => reverse.click())
    const openButton = [...host.querySelectorAll('button')].find((button) => button.textContent === 'Open as sequence')!
    await act(async () => openButton.click())
    expect(onOpenAsSequence).toHaveBeenCalledWith('reverse')
    expect(host.querySelector('.trace-viewer__selection-text')?.textContent).toBe('GCAT')
    const band = host.querySelector<HTMLElement>('.trace-viewer__base-sequence')!
    band.getBoundingClientRect = () => ({ left: 0, right: 2.4, top: 0, bottom: 30, width: 2.4, height: 30, x: 0, y: 0, toJSON: () => ({}) })
    await act(async () => band.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, clientX: 0.8 })))
    await act(async () => band.dispatchEvent(new MouseEvent('pointermove', { bubbles: true, clientX: 1.6 })))
    expect(window.getSelection()?.toString()).toBe('CA')
  })

  it('changes horizontal spacing and preserves the viewport center', async () => {
    await act(async () => root.render(createElement(TraceViewer, { trace })))
    const scroller = host.querySelector<HTMLElement>('.trace-viewer__scroll')!
    const chart = host.querySelector<SVGSVGElement>('.trace-viewer__chart')!
    Object.defineProperties(scroller, {
      clientWidth: { configurable: true, value: 80 },
      scrollLeft: { configurable: true, writable: true, value: 20 },
    })
    const horizontalZoom = host.querySelector<HTMLInputElement>('[aria-label="Horizontal zoom"]')!
    expect(Number(chart.getAttribute('width'))).toBeCloseTo(2.4)
    expect(host.querySelector('.trace-viewer__horizontal-zoom output')?.textContent).toBe('1.0×')

    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(horizontalZoom, '2')
      horizontalZoom.dispatchEvent(new Event('input', { bubbles: true }))
    })
    expect(Number(chart.getAttribute('width'))).toBeCloseTo(4.8)
    expect(host.querySelector('.trace-viewer__horizontal-zoom output')?.textContent).toBe('2.0×')
    expect(scroller.scrollLeft).toBe(80)
  })

  it.each([0.5, 1, 2.5])('mirrors the visible scan region on reverse and restores it at %sx', async (zoom) => {
    const longTrace: TraceFileRecord = {
      ...trace,
      chromatogram: {
        aTrace: Array.from({ length: 500 }, (_, index) => index % 4 === 0 ? 8 : 0),
        tTrace: Array.from({ length: 500 }, (_, index) => index % 4 === 1 ? 7 : 0),
        gTrace: Array.from({ length: 500 }, (_, index) => index % 4 === 2 ? 6 : 0),
        cTrace: Array.from({ length: 500 }, (_, index) => index % 4 === 3 ? 5 : 0),
        basePos: [40, 120, 200, 300, 400],
        baseCalls: ['A', 'T', 'G', 'C', 'A'],
        qualNums: [40, 35, 30, 25, 20],
      },
    }
    await act(async () => root.render(createElement(TraceViewer, { trace: longTrace })))
    const scroller = host.querySelector<HTMLElement>('.trace-viewer__scroll')!
    Object.defineProperties(scroller, {
      clientWidth: { configurable: true, value: 80 },
      scrollLeft: { configurable: true, writable: true, value: 0 },
    })
    const horizontalZoom = host.querySelector<HTMLInputElement>('[aria-label="Horizontal zoom"]')!
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(horizontalZoom, String(zoom))
      horizontalZoom.dispatchEvent(new Event('input', { bubbles: true }))
    })
    const chart = host.querySelector<SVGSVGElement>('.trace-viewer__chart')!
    const oldWidth = Number(chart.getAttribute('width'))
    const initialLeft = oldWidth / 4
    scroller.scrollLeft = initialLeft
    const reverse = [...host.querySelectorAll('button')].find((button) => button.title === 'Reverse complement direction')!
    await act(async () => reverse.click())
    expect(scroller.scrollLeft).toBeCloseTo(oldWidth - initialLeft - 80, 6)

    const forward = [...host.querySelectorAll('button')].find((button) => button.title === 'Show forward direction')!
    await act(async () => forward.click())
    expect(scroller.scrollLeft).toBeCloseTo(initialLeft, 6)
    expect(host.querySelector('.trace-viewer__selection-text')?.textContent).toBe('ATGCA')
  })

  it('renders alignment-compatible, unfilled signal strokes and fills only area paths', async () => {
    await act(async () => root.render(createElement(TraceViewer, { trace })))
    expect(host.querySelector('.trace-viewer__baseline')).toBeNull()
    expect(host.querySelector('.trace-viewer__scroll-track')).toBeNull()
    const strokes = [...host.querySelectorAll<SVGPathElement>('.trace-viewer__signal')]
    expect(strokes).toHaveLength(4)
    for (const stroke of strokes) {
      expect(stroke.getAttribute('fill')).toBe('none')
      expect(stroke.getAttribute('stroke-width')).toBe('1.1')
      expect(stroke.getAttribute('opacity')).toBe('0.95')
    }
    const areas = [...host.querySelectorAll<SVGPathElement>('.trace-viewer__fill')]
    expect(areas).toHaveLength(4)
    expect(areas.every((area) => area.getAttribute('stroke') === 'none')).toBe(true)
    const strokeColors = { A: themeFixturePalette.greenPrimary, T: themeFixturePalette.redPrimary, G: 'var(--vg-trace-g-line)', C: themeFixturePalette.bluePrimary }
    const fillColors = { A: themeFixturePalette.rgbaGreen, T: themeFixturePalette.rgbaRed, G: 'var(--vg-trace-g-fill)', C: themeFixturePalette.rgbaBlue }
    for (const base of ['A', 'T', 'G', 'C'] as const) {
      const channel = host.querySelector(`.trace-viewer__channel--${base}`)!
      expect(channel.querySelector('.trace-viewer__signal')?.getAttribute('stroke')).toBe(strokeColors[base])
      expect(channel.querySelector('.trace-viewer__fill')?.getAttribute('fill')).toBe(fillColors[base])
    }
  })

  it('switches Raw to signed DATA1–4 and hides called bases, fills, and quality controls', async () => {
    await act(async () => root.render(createElement(TraceViewer, { trace: rawTrace })))
    const rawButton = [...host.querySelectorAll<HTMLButtonElement>('.trace-viewer__mode-selector button')].find((button) => button.textContent === 'Raw')!
    expect(rawButton.disabled).toBe(false)
    await act(async () => rawButton.click())
    const chart = host.querySelector<SVGSVGElement>('.trace-viewer__chart')!
    expect(chart.classList.contains('trace-viewer__chart--raw')).toBe(true)
    expect(chart.getAttribute('aria-label')).toContain('signed amplitudes')
    expect(host.querySelector('.trace-viewer__base-sequence')).toBeNull()
    expect(host.querySelector('.trace-viewer__quality-toggle')).toBeNull()
    expect(host.querySelectorAll('.trace-viewer__fill')).toHaveLength(0)
    expect(host.querySelectorAll('.trace-viewer__signal')).toHaveLength(4)
    expect(host.querySelector('.trace-viewer__raw-zero')).not.toBeNull()
    expect(host.querySelector('.trace-viewer__detail-band')?.getAttribute('aria-label')).toBe('Raw scan ruler')
    expect([...host.querySelectorAll('.trace-viewer__ruler-label')].map((tick) => tick.textContent)).toEqual(['100', '200'])
    expect([...host.querySelectorAll<SVGTextElement>('.trace-viewer__ruler-label')].map((tick) => tick.getAttribute('x'))).toEqual(['80', '160'])
  })

  it('explains why Raw is disabled when DATA1–4 are absent', async () => {
    await act(async () => root.render(createElement(TraceViewer, { trace })))
    const rawButton = [...host.querySelectorAll<HTMLButtonElement>('.trace-viewer__mode-selector button')].find((button) => button.textContent === 'Raw')!
    expect(rawButton.disabled).toBe(true)
    expect(rawButton.getAttribute('aria-describedby')).toBe('trace-viewer-raw-unavailable')
    expect(host.querySelector('#trace-viewer-raw-unavailable')?.textContent).toContain('Raw mode is unavailable')
  })

  it('measures available height so plot, 30px sequence, and detail band fill the scroller', async () => {
    let notifyResize: (() => void) | undefined
    class MockResizeObserver {
      private callback: ResizeObserverCallback
      constructor(callback: ResizeObserverCallback) { this.callback = callback }
      observe() { notifyResize = () => this.callback([], this as unknown as ResizeObserver) }
      disconnect() {}
    }
    vi.stubGlobal('ResizeObserver', MockResizeObserver)
    await act(async () => root.render(createElement(TraceViewer, { trace })))
    const scroller = host.querySelector<HTMLElement>('.trace-viewer__scroll')!
    Object.defineProperty(scroller, 'clientHeight', { configurable: true, value: 430 })
    await act(async () => notifyResize?.())
    const chart = host.querySelector<SVGSVGElement>('.trace-viewer__chart')!
    const calls = host.querySelector<HTMLElement>('.trace-viewer__base-sequence')!
    const detail = host.querySelector<SVGSVGElement>('.trace-viewer__detail-band')!
    expect(Number(chart.getAttribute('height'))).toBe(360)
    expect(getComputedStyle(calls).height).toBe('30px')
    expect(Number(detail.getAttribute('height'))).toBe(40)
    expect(Number(chart.getAttribute('height')) + 30 + Number(detail.getAttribute('height'))).toBe(430)
    expect(getComputedStyle(scroller).overflowY).toBe('hidden')
  })
})
describe('TraceViewer oriented search', () => {
  const searchTrace: TraceFileRecord = {
    ...trace,
    sequence: 'ATGCATGC',
    chromatogram: {
      aTrace: Array.from({ length: 80 }, (_, index) => index % 8 === 0 ? 8 : 0),
      tTrace: Array.from({ length: 80 }, (_, index) => index % 8 === 1 ? 8 : 0),
      gTrace: Array.from({ length: 80 }, (_, index) => index % 8 === 2 ? 8 : 0),
      cTrace: Array.from({ length: 80 }, (_, index) => index % 8 === 3 ? 8 : 0),
      basePos: [0, 10, 20, 30, 40, 50, 60, 70],
      baseCalls: ['A', 'T', 'G', 'C', 'A', 'T', 'G', 'C'],
      qualNums: [40, 35, 30, 25, 20, 15, 10, 5],
    },
  }

  async function typeSearch(input: HTMLInputElement, value: string) {
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value)
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
  }

  it('searches the forward-oriented calls and reveals the first hit', async () => {
    await act(async () => root.render(createElement(TraceViewer, { trace: searchTrace })))
    const band = host.querySelector<HTMLElement>('.trace-viewer__base-sequence')!
    band.getBoundingClientRect = () => ({ left: 0, right: 800, top: 0, bottom: 30, width: 800, height: 30, x: 0, y: 0, toJSON: () => ({}) })
    const input = host.querySelector<HTMLInputElement>('[aria-label="Find bases in trace sequence"]')!
    input.focus()
    await typeSearch(input, 'tgc')
    expect(document.activeElement).toBe(input)
    const highlight = host.querySelector<HTMLElement>('.trace-viewer__selection-highlight')!
    expect(Number(highlight.dataset.selectionStart)).toBe(1)
    expect(Number(highlight.dataset.selectionEnd)).toBe(3)
    expect(host.querySelector('.trace-viewer__search-count')?.textContent).toBe('1/2')
  })

  it('searches the reverse-oriented calls after flipping direction', async () => {
    await act(async () => root.render(createElement(TraceViewer, { trace: searchTrace })))
    const band = host.querySelector<HTMLElement>('.trace-viewer__base-sequence')!
    band.getBoundingClientRect = () => ({ left: 0, right: 800, top: 0, bottom: 30, width: 800, height: 30, x: 0, y: 0, toJSON: () => ({}) })
    const reverse = [...host.querySelectorAll('button')].find((button) => button.title === 'Reverse complement direction')!
    await act(async () => reverse.click())
    expect(host.querySelector('.trace-viewer__selection-text')?.textContent).toBe('GCATGCAT')
    const input = host.querySelector<HTMLInputElement>('[aria-label="Find bases in trace sequence"]')!
    await typeSearch(input, 'TGC')
    // 'TGC' occurs once in GCATGCAT, at ordinal 1.
    expect(host.querySelector('.trace-viewer__search-count')?.textContent).toBe('1/1')
    const highlight = host.querySelector<HTMLElement>('.trace-viewer__selection-highlight')!
    expect(Number(highlight.dataset.selectionStart)).toBe(3)
  })

  it('cycles hits with wrap-around and reports no hits', async () => {
    await act(async () => root.render(createElement(TraceViewer, { trace: searchTrace })))
    const band = host.querySelector<HTMLElement>('.trace-viewer__base-sequence')!
    band.getBoundingClientRect = () => ({ left: 0, right: 800, top: 0, bottom: 30, width: 800, height: 30, x: 0, y: 0, toJSON: () => ({}) })
    const scroller = host.querySelector<HTMLElement>('.trace-viewer__scroll')!
    Object.defineProperties(scroller, {
      clientWidth: { configurable: true, value: 2.4 },
      scrollLeft: { configurable: true, writable: true, value: 0 },
    })
    const input = host.querySelector<HTMLInputElement>('[aria-label="Find bases in trace sequence"]')!
    await typeSearch(input, 'ATGC')
    expect(host.querySelector('.trace-viewer__search-count')?.textContent).toBe('1/2')
    expect(host.querySelector<HTMLElement>('.trace-viewer__selection-highlight')?.dataset.selectionStart).toBe('0')
    const next = host.querySelector<HTMLButtonElement>('[aria-label="Next search hit"]')!
    await act(async () => next.click())
    expect(host.querySelector('.trace-viewer__search-count')?.textContent).toBe('2/2')
    expect(host.querySelector<HTMLElement>('.trace-viewer__selection-highlight')?.dataset.selectionStart).toBe('4')
    expect(scroller.scrollLeft).toBeGreaterThan(0)
    await act(async () => next.click())
    expect(host.querySelector('.trace-viewer__search-count')?.textContent).toBe('1/2')
    expect(host.querySelector<HTMLElement>('.trace-viewer__selection-highlight')?.dataset.selectionStart).toBe('0')
    const previous = host.querySelector<HTMLButtonElement>('[aria-label="Previous search hit"]')!
    await act(async () => previous.click())
    expect(host.querySelector('.trace-viewer__search-count')?.textContent).toBe('2/2')
    await typeSearch(input, 'TTTT')
    expect(host.querySelector('.trace-viewer__search-count')?.textContent).toBe('No hits')
    expect(host.querySelector('.trace-viewer__selection-highlight')).toBeNull()
    expect(next.disabled).toBe(true)
  })

  it('reports not-found entries rather than a stale hit count', async () => {
    await act(async () => root.render(createElement(TraceViewer, { trace })))
    const input = host.querySelector<HTMLInputElement>('[aria-label="Find bases in trace sequence"]')!
    await typeSearch(input, 'GG')
    expect(host.querySelector('.trace-viewer__search-count')?.textContent).toBe('No hits')
  })

  it('selects and reveals a one-base match when navigating search hits', async () => {
    await act(async () => root.render(createElement(TraceViewer, { trace: searchTrace })))
    const scroller = host.querySelector<HTMLElement>('.trace-viewer__scroll')!
    Object.defineProperties(scroller, {
      clientWidth: { configurable: true, value: 2.4 },
      scrollLeft: { configurable: true, writable: true, value: 0 },
    })
    const input = host.querySelector<HTMLInputElement>('[aria-label="Find bases in trace sequence"]')!
    await typeSearch(input, 'C')
    const next = host.querySelector<HTMLButtonElement>('[aria-label="Next search hit"]')!
    await act(async () => next.click())
    expect(host.querySelector<HTMLElement>('.trace-viewer__selection-highlight')?.dataset.selectionStart).toBe('7')
    expect(scroller.scrollLeft).toBeGreaterThan(0)
  })

  it('keeps the query and re-selects the hit when the direction is flipped after searching', async () => {
    await act(async () => root.render(createElement(TraceViewer, { trace: searchTrace })))
    const band = host.querySelector<HTMLElement>('.trace-viewer__base-sequence')!
    band.getBoundingClientRect = () => ({ left: 0, right: 800, top: 0, bottom: 30, width: 800, height: 30, x: 0, y: 0, toJSON: () => ({}) })
    const input = host.querySelector<HTMLInputElement>('[aria-label="Find bases in trace sequence"]')!
    await typeSearch(input, 'TGC')
    expect(host.querySelector('.trace-viewer__search-count')?.textContent).toBe('1/2')
    const reverse = [...host.querySelectorAll('button')].find((button) => button.title === 'Reverse complement direction')!
    await act(async () => reverse.click())
    expect(input.value).toBe('TGC')
    expect(host.querySelector('.trace-viewer__selection-text')?.textContent).toBe('GCATGCAT')
    // The reverse complement 'GCATGCAT' contains exactly one 'TGC', at ordinal 3.
    expect(host.querySelector('.trace-viewer__search-count')?.textContent).toBe('1/1')
    const highlight = host.querySelector<HTMLElement>('.trace-viewer__selection-highlight')!
    expect(Number(highlight.dataset.selectionStart)).toBe(3)
  })
})

describe('TraceViewer initial alignment context', () => {
  it('opens in the supplied direction with the supplied selection selected and revealed', async () => {
    await act(async () => root.render(createElement(TraceViewer, { trace: selectionTrace, initialDirection: 'reverse', initialSelection: { start: 0, end: 1 } })))
    expect(host.querySelector('.trace-viewer__selection-text')?.textContent).toBe('GCAT')
    const scroller = host.querySelector<HTMLElement>('.trace-viewer__scroll')!
    Object.defineProperties(scroller, {
      clientWidth: { configurable: true, value: 80 },
      scrollLeft: { configurable: true, writable: true, value: 0 },
    })
    const band = host.querySelector<HTMLElement>('.trace-viewer__base-sequence')!
    band.getBoundingClientRect = () => ({ left: 0, right: 31.2, top: 0, bottom: 30, width: 31.2, height: 30, x: 0, y: 0, toJSON: () => ({}) })
    const highlight = host.querySelector<HTMLElement>('.trace-viewer__selection-highlight')!
    expect(Number(highlight.dataset.selectionStart)).toBe(0)
    expect(Number(highlight.dataset.selectionEnd)).toBe(1)
    expect(window.getSelection()?.toString()).toBe('GC')
    expect(scroller.scrollLeft).toBe(0)
    expect(band).not.toBeNull()
  })

  it('defaults to forward with no selection when no alignment context is supplied', async () => {
    await act(async () => root.render(createElement(TraceViewer, { trace })))
    expect(host.querySelector('.trace-viewer__selection-text')?.textContent).toBe('ATGC')
    expect(host.querySelector('.trace-viewer__selection-highlight')).toBeNull()
  })
})

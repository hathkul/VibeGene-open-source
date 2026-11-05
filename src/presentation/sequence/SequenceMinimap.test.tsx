// @vitest-environment jsdom
import { act, createRef } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, expect, it, vi } from 'vitest'
import { SequenceMinimap } from './SequenceMinimap'
import { scrollSequenceViewToPosition } from './sequenceShared'
import { sequenceMinimapOligoSpans } from './sequenceMinimapOligos'
import { createSgRNAFeatures } from '../../domain/sgrna'
import type { PrimerFrameDisplay } from '../../domain/primerSequenceLayout'
import { themeFixturePalette } from '../../test-support/themeFixturePalette'

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })

it('shows primer and sgRNA spans in strand tracks using their colors', () => {
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(1000)
  const primer: PrimerFrameDisplay = { primerId: 'p', name: 'primer', color: themeFixturePalette.red, strand: 'forward', sequence: 'AAAA', glyphs: [], templateSpanStart: 100, templateSpanEnd: 120, selectRange: { start: 100, end: 120 } }
  const features = createSgRNAFeatures({ strand: 'reverse', guideStart: 300, pamStart: 297, guideSequence: 'A'.repeat(20), pamSequence: 'AGG', guideLocations: [{ start: 300, end: 320, strand: 'reverse' }], pamLocations: [{ start: 297, end: 300, strand: 'reverse' }] }, { id: 'guide', name: 'guide', nuclease: 'SpCas9', pamMotif: 'NGG', pamSide: '3prime', spacer: 'A'.repeat(20) })
  const spans = sequenceMinimapOligoSpans([primer], features, true)
  expect(spans).toHaveLength(3)
  expect(sequenceMinimapOligoSpans([], features, false)).toEqual([])
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  act(() => root.render(<SequenceMinimap sequenceLength={1000} annotationFeatures={features} restrictionSites={[]}
    oligoSpans={spans} selectedRange={null} cutStrandSelection={null} hoveredRestrictionSiteKey={null}
    scrollHostRef={createRef<HTMLDivElement>()} onNavigate={vi.fn()} visibleRange={{ start: 0, end: 200 }} />))
  const forward = host.querySelector<SVGLineElement>('.sequence-minimap-oligo-primer')!
  const reverse = [...host.querySelectorAll<SVGLineElement>('.sequence-minimap-oligo-sgrna')]
  expect(forward.getAttribute('stroke')).toBe(themeFixturePalette.red)
  expect(forward.getAttribute('y1')).toBe('2.5')
  expect(reverse).toHaveLength(2)
  expect(reverse.every((line) => line.getAttribute('y1') === '31.5' && line.getAttribute('stroke') === features[0].color)).toBe(true)
  expect(host.querySelector('.sequence-minimap-feature')).toBeNull()
  expect(host.querySelector('svg')?.getAttribute('height')).toBe('34')
  act(() => root.unmount())
  host.remove()
})

it('drags the viewport by its starting edge and reaches the end without jumping on press', () => {
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(1000)
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  const navigate = vi.fn()
  const view = createRef<HTMLDivElement>()
  act(() => root.render(<SequenceMinimap sequenceLength={1000} annotationFeatures={[]} restrictionSites={[]}
    selectedRange={null} cutStrandSelection={null} hoveredRestrictionSiteKey={null} scrollHostRef={view}
    onNavigate={vi.fn()} visibleRange={{ start: 100, end: 300 }} onMinimapViewportNavigate={navigate} />))
  const svg = host.querySelector('svg')!
  svg.getBoundingClientRect = () => ({ width: 1000 } as DOMRect)
  const frame = host.querySelector<HTMLElement>('.zoom-minimap-frame')!
  frame.setPointerCapture = vi.fn()
  const pointer = (type: string, clientX: number) => {
    const event = new MouseEvent(type, { bubbles: true, clientX })
    Object.defineProperty(event, 'pointerId', { value: 1 })
    act(() => frame.dispatchEvent(event))
  }
  pointer('pointerdown', 300)
  pointer('pointermove', 300)
  expect(navigate).not.toHaveBeenCalled()
  pointer('pointermove', 310)
  expect(navigate.mock.calls[0]![0]).toBeGreaterThan(100)
  expect(navigate.mock.calls[0]![1]).toBe(false)
  pointer('pointermove', 2000)
  expect(navigate).toHaveBeenLastCalledWith(800, true)
  act(() => root.unmount())
  host.remove()
})

it('aligns a viewport start within a row and can scroll to the last row bottom', () => {
  const host = document.createElement('div')
  host.style.overflowY = 'auto'
  Object.defineProperty(host, 'clientHeight', { value: 100 })
  host.getBoundingClientRect = () => ({ top: 0, bottom: 100, height: 100 } as DOMRect)
  const rows = document.createElement('div')
  rows.className = 'sequence-rows'
  const row = document.createElement('div')
  row.className = 'sequence-row'
  row.dataset.rowStart = '0'
  row.dataset.rowEnd = '100'
  row.getBoundingClientRect = () => ({ top: 100 - host.scrollTop, bottom: 300 - host.scrollTop, height: 200 } as DOMRect)
  rows.append(row)
  host.append(rows)
  document.body.append(host)
  scrollSequenceViewToPosition(host, 25, undefined, { viewportAnchorFraction: 0, interpolateWithinRow: true })
  expect(host.scrollTop).toBe(150)
  scrollSequenceViewToPosition(host, 80, undefined, { viewportAnchorFraction: 0, interpolateWithinRow: true, atEnd: true })
  expect(host.scrollTop).toBe(200)
  host.remove()
})

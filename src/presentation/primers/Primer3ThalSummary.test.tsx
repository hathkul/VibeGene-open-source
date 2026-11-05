// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, expect, it, vi } from 'vitest'
import type { PrimerDuplexTmResult } from '../../domain/primerDuplexThermodynamics'
import { Primer3ThalSummary } from './Primer3ThalSummary'

let host: HTMLDivElement
let root: ReturnType<typeof createRoot>
const originalInnerWidth = Object.getOwnPropertyDescriptor(window, 'innerWidth')
const originalInnerHeight = Object.getOwnPropertyDescriptor(window, 'innerHeight')
afterEach(() => {
  act(() => root?.unmount())
  host?.remove()
  if (originalInnerWidth) Object.defineProperty(window, 'innerWidth', originalInnerWidth)
  else Reflect.deleteProperty(window, 'innerWidth')
  if (originalInnerHeight) Object.defineProperty(window, 'innerHeight', originalInnerHeight)
  else Reflect.deleteProperty(window, 'innerHeight')
  vi.restoreAllMocks()
})

const fixedAlignment: PrimerDuplexTmResult = {
  status: 'estimated', tmC: 60.2, mismatchCount: 1, mismatchPositions: [4],
  deltaH: -90, deltaS: -250, method: 'test',
}

function render(
  primer3: Parameters<typeof Primer3ThalSummary>[0]['primer3'],
  fixed = fixedAlignment,
  mapped = false,
  approximation?: Parameters<typeof Primer3ThalSummary>[0]['approximation'],
) {
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  act(() => root.render(<Primer3ThalSummary
    primer3={primer3}
    fixedAlignment={fixed}
    primer3MappedToPreview={mapped}
    approximation={approximation}
  />))
}

it('makes Primer3 the primary estimate and keeps alignment and structure in accessible details', () => {
  render({ status: 'estimated', result: {
    tmC: 64.7, alignEnd1: 20, alignEnd2: 45, structure: '5\' ACGT\n ||||', mode: 'end1',
  } }, fixedAlignment, true)

  expect(host.querySelector('.primer-tm-summary__primary')?.textContent).toContain('Estimated duplex Tm: 64.7 °C (Primer3)')
  const button = host.querySelector<HTMLButtonElement>('button[aria-label="Duplex Tm details"]')!
  const detailsId = button.getAttribute('aria-controls')!
  expect(button.getAttribute('aria-expanded')).toBe('false')
  expect(host.querySelector(`#${detailsId}`)).toBeNull()
  act(() => button.click())
  expect(button.getAttribute('aria-expanded')).toBe('true')
  const details = document.body.querySelector<HTMLElement>(`#${detailsId}`)!
  expect(details.textContent).toContain('Original alignment estimate: 60.2 °C')
  expect(details.textContent).toContain('same reaction conditions but a different calculation method')
  expect(details.textContent).toContain('Neither estimate guarantees PCR extension')
  expect(details.textContent).toContain('Preview shows the Primer3 structure')
  expect(details.textContent).toContain('Sequence highlights and the 3′ exact-match Tm above use the original alignment')
  expect(details.querySelector('pre[aria-label="Primer3 predicted structure drawing"]')?.textContent).toBe('5\' ACGT\n ||||')
  expect(details.querySelector('button')).toBeNull()
})

it('shows the fixed-alignment estimate as a labeled fallback when Primer3 is unavailable', () => {
  render({ status: 'unavailable', reason: 'Primer contains ambiguous bases' })
  expect(host.querySelector('.primer-tm-summary__primary')?.textContent).toContain('Estimated duplex Tm: 60.2 °C (original alignment; Primer3 unavailable)')
  const button = host.querySelector<HTMLButtonElement>('button[aria-label="Duplex Tm details"]')!
  act(() => button.click())
  expect(document.body.querySelector('[role="note"]')?.textContent).toContain('Primer contains ambiguous bases')
})

it('labels trimmed long-primer Tm as approximate and discloses the omitted 5′ tail', () => {
  render({ status: 'estimated', result: {
    tmC: 64.7, alignEnd1: 60, alignEnd2: 70, structure: '5\' ACGT 3\'\\n ||||', mode: 'end1',
  } }, fixedAlignment, true, {
    excludedPrimer5PrimeBases: 'T'.repeat(8),
    excludedPrimer5PrimeBaseCount: 8,
    retainedPrimer5PrimeBaseCount: 2,
    fullPrimerLength: 68,
    modeledPrimerLength: 60,
  })

  expect(host.querySelector('.primer-tm-summary__primary')?.textContent).toContain('64.7 °C (Primer3; approximate)')
  const button = host.querySelector<HTMLButtonElement>('button[aria-label="Duplex Tm details"]')!
  act(() => button.click())
  const details = document.body.querySelector<HTMLElement>('[role="note"]')!
  expect(details.textContent).toContain('it models 60 of 68 primer bases')
  expect(details.textContent).toContain('retaining 2 leading 5′ overhang bases and omitting 8')
  expect(details.textContent).toContain('draws omitted bases as an unmodeled overhang')
  expect(details.textContent).toContain('structure contains only the modeled sequence')
})

it('preserves loading status and uses the original alignment as a labeled interim estimate', () => {
  render({ status: 'loading' })
  expect(host.querySelector('.primer-tm-summary__primary')?.textContent).toContain('60.2 °C (original alignment; Primer3 calculating…)')
})

it('preserves IUPAC range and unsupported coverage in the fallback', () => {
  const range: PrimerDuplexTmResult = {
    status: 'estimated-range', tmCRange: { min: 57, max: 62 },
    deltaHRange: { min: -100, max: -90 }, deltaSRange: { min: -270, max: -240 },
    totalVariantCount: 4, evaluatedVariantCount: 4, estimatedVariantCount: 3,
    unsupportedVariantCount: 1, unexaminedVariantCount: 0,
    approximateTandemMismatchVariantCount: 1, assumedEqualVariantAbundance: true,
    oligoConcPerVariant: 62.5e-9, method: 'test',
  }
  render({ status: 'unavailable', reason: 'Primer3 requires canonical bases' }, range)
  expect(host.querySelector('.primer-tm-summary__primary')?.textContent).toContain('Partial original alignment range 57.0–62.0 °C (3/4 variants estimated; 1 unsupported) (original alignment; Primer3 unavailable)')
  const detailsButton = host.querySelector<HTMLButtonElement>('button[aria-label="Duplex Tm details"]')!
  act(() => detailsButton.click())
  expect(document.body.querySelector('[role="note"]')?.textContent).toContain('1 variants were unsupported and excluded from the range')
  expect(document.body.querySelector('[role="note"]')?.textContent).toContain('Internal-loop model is unvalidated and salt correction approximate for 1 estimated variants')
})

it('explains when Primer3 structure is not used in the preview', () => {
  render({ status: 'estimated', result: {
    tmC: 64.7, alignEnd1: 20, alignEnd2: 45, structure: 'native drawing', mode: 'end1',
  } })
  const button = host.querySelector<HTMLButtonElement>('button[aria-label="Duplex Tm details"]')!
  act(() => button.click())
  const details = document.body.querySelector('[role="note"]')!
  expect(details.textContent).toContain('Preview shows the original alignment; the Primer3 structure is below')
  expect(details.querySelector('pre')?.textContent).toBe('native drawing')
})

it('anchors a scrollable information panel within the viewport and dismisses it accessibly', () => {
  render({ status: 'estimated', result: {
    tmC: 64.7, alignEnd1: 20, alignEnd2: 45, structure: `${'ACGT | | | |\n'.repeat(500)}`, mode: 'end1',
  } })
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: 320 })
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: 240 })
  const button = host.querySelector<HTMLButtonElement>('button[aria-label="Duplex Tm details"]')!
  let anchorRect = {
    x: 296, y: 210, left: 296, top: 210, right: 312, bottom: 226, width: 16, height: 16,
    toJSON: () => ({}),
  } as DOMRect
  vi.spyOn(button, 'getBoundingClientRect').mockImplementation(() => anchorRect)

  act(() => button.click())
  const popup = document.body.querySelector<HTMLElement>('[role="note"]')!
  Object.defineProperty(popup, 'scrollHeight', { configurable: true, value: 600 })
  act(() => window.dispatchEvent(new Event('resize')))
  expect(button.getAttribute('aria-expanded')).toBe('true')
  expect(button.getAttribute('aria-controls')).toBe(popup.id)
  expect(popup.style.left).toBe('12px')
  expect(popup.style.top).toBe('12px')
  expect(popup.style.width).toBe('296px')
  expect(popup.style.maxHeight).toBe('190px')
  const structure = popup.querySelector('pre')!
  expect(getComputedStyle(structure).maxHeight).toBe('220px')
  expect(getComputedStyle(structure).overflow).toBe('auto')
  expect(getComputedStyle(popup).position).toBe('fixed')
  expect(getComputedStyle(popup).overflow).toBe('auto')

  anchorRect = { x: 5, y: 5, left: 5, top: 5, right: 21, bottom: 21, width: 16, height: 16, toJSON: () => ({}) } as DOMRect
  act(() => window.dispatchEvent(new Event('resize')))
  expect(popup.style.left).toBe('12px')
  expect(popup.style.top).toBe('29px')
  expect(popup.style.maxHeight).toBe('199px')

  act(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })))
  expect(document.body.querySelector('[role="note"]')).toBeNull()
  expect(button.getAttribute('aria-expanded')).toBe('false')
  expect(document.activeElement).toBe(button)

  act(() => button.click())
  act(() => host.dispatchEvent(new Event('pointerdown', { bubbles: true })))
  expect(document.body.querySelector('[role="note"]')).toBeNull()
})

it('uses a wider measured panel and places it below when that side has enough room', () => {
  render({ status: 'estimated', result: {
    tmC: 64.7, alignEnd1: 20, alignEnd2: 45, structure: 'structure', mode: 'end1',
  } })
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1000 })
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: 900 })
  const button = host.querySelector<HTMLButtonElement>('button[aria-label="Duplex Tm details"]')!
  vi.spyOn(button, 'getBoundingClientRect').mockReturnValue({
    x: 700, y: 400, left: 700, top: 400, right: 716, bottom: 416, width: 16, height: 16, toJSON: () => ({}),
  } as DOMRect)
  act(() => button.click())
  const popup = document.body.querySelector<HTMLElement>('[role="note"]')!
  Object.defineProperty(popup, 'scrollHeight', { configurable: true, value: 300 })
  act(() => window.dispatchEvent(new Event('resize')))
  expect(popup.style.width).toBe('640px')
  expect(popup.style.left).toBe('348px')
  expect(popup.style.top).toBe('424px')
  expect(popup.style.maxHeight).toBe('300px')
})

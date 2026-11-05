// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, expect, it } from 'vitest'
import { PrimerDuplexTm } from './PrimerDuplexTm'

let host: HTMLDivElement
let root: ReturnType<typeof createRoot>
afterEach(() => { act(() => root?.unmount()); host?.remove() })

it('shows duplex details only on request and closes them on Escape or outside click', () => {
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  act(() => root.render(<PrimerDuplexTm result={{
    status: 'estimated', tmC: 61.6, mismatchCount: 3, mismatchPositions: [15, 16, 17],
    deltaH: -1, deltaS: -1, method: 'test', approximateTandemMismatch: true,
  }} />))
  const button = host.querySelector<HTMLButtonElement>('button[aria-label="Duplex Tm details"]')!
  expect(host.textContent).toContain('61.6 °C')
  expect(host.textContent).not.toContain('3 mismatches')
  expect(button.getAttribute('aria-expanded')).toBe('false')
  act(() => button.click())
  expect(button.getAttribute('aria-expanded')).toBe('true')
  expect(host.querySelector('[role="note"]')?.textContent).toContain('3 mismatches at 5′ positions 15, 16, 17')
  expect(host.querySelector('[role="note"]')?.textContent).toContain('internal-loop model is unvalidated')
  act(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })))
  expect(host.querySelector('[role="note"]')).toBeNull()
  act(() => button.click())
  act(() => document.body.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true })))
  expect(host.querySelector('[role="note"]')).toBeNull()
})

it('keeps the unavailable explanation visible', () => {
  host = document.createElement('div')
  root = createRoot(host)
  act(() => root.render(<PrimerDuplexTm result={{ status: 'unsupported', reason: 'Terminal mismatch' }} />))
  expect(host.textContent).toContain('Duplex Tm unavailable: Terminal mismatch')
  expect(host.querySelector('button')).toBeNull()
})

it('labels an estimated range with its coverage and keeps capped variants unavailable', () => {
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  act(() => root.render(<PrimerDuplexTm result={{
    status: 'estimated-range', tmCRange: { min: 58.2, max: 62.4 },
    deltaHRange: { min: -140, max: -120 }, deltaSRange: { min: -380, max: -340 },
    totalVariantCount: 8, evaluatedVariantCount: 8, estimatedVariantCount: 6,
    unsupportedVariantCount: 2, unexaminedVariantCount: 0,
    approximateTandemMismatchVariantCount: 1, assumedEqualVariantAbundance: true,
    oligoConcPerVariant: 31.25e-9, excludedFivePrimeBases: 3,
    modeledFivePrimeDanglingBases: 1, method: 'test',
  }} />))
  expect(host.textContent).toContain('Partial duplex Tm range 58.2–62.4 °C')
  const button = host.querySelector<HTMLButtonElement>('button[aria-label="Duplex Tm details"]')!
  act(() => button.click())
  expect(host.querySelector('[role="note"]')?.textContent).toContain('Range across 6 estimated primer variants out of 8')
  expect(host.querySelector('[role="note"]')?.textContent).toContain('2 variants were unsupported and excluded from the range')
  expect(host.querySelector('[role="note"]')?.textContent).toContain('Assumes equal abundance across IUPAC variants (31.3 nM per variant); actual mixture proportions may differ')
  expect(host.querySelector('[role="note"]')?.textContent).toContain('5′ tail: 1 adjacent dangling base modeled; 2 remaining tail bases excluded')

  act(() => root.render(<PrimerDuplexTm result={{
    status: 'unsupported', reason: 'Variant count exceeds the exhaustive enumeration limit',
    variantCoverage: { totalVariantCount: 512, evaluatedVariantCount: 0, estimatedVariantCount: 0, unsupportedVariantCount: null, unexaminedVariantCount: 512 },
  }} />))
  expect(host.textContent).toContain('512 unexamined')
  expect(host.textContent).not.toContain('Tm range')
})

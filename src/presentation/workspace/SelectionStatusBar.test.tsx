// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'vitest'
import {
  SelectionStatusBar,
  type SelectionStatusBarProps,
} from './SelectionStatusBar'

function makeProps(overrides: Partial<SelectionStatusBarProps> = {}): SelectionStatusBarProps {
  return {
    isDirty: false,
    zoom: null,
    summary: 'Selected: None',
    sequenceLengthLabel: '4,000 bp',
    gcLabel: '50.0% GC',
    counts: null,
    statusEcho: 'Ready',
    attentionKey: 0,
    ...overrides,
  }
}

describe('SelectionStatusBar', () => {
  let root: Root | null = null
  let host: HTMLElement | null = null

  afterEach(() => {
    act(() => root?.unmount())
    host?.remove()
    root = null
    host = null
  })

  function render(props: SelectionStatusBarProps) {
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    act(() => root!.render(<SelectionStatusBar {...props} />))
    return host
  }

  it('renders the unsaved-changes modifier only when dirty', () => {
    const clean = render(makeProps())
    expect(clean.querySelector('section')!.className).toBe('selection-bar')
    act(() => root!.unmount())
    root = null
    host!.remove()
    const dirty = render(makeProps({ isDirty: true }))
    expect(dirty.querySelector('section')!.className).toBe('selection-bar selection-bar-unsaved')
  })

  it('shows zoom readouts instead of length/GC when zoom is present', () => {
    const dom = render(makeProps({
      zoom: { zoomedLengthLabel: '500 bp', rangeLabel: '1..500' },
    }))
    const spans = Array.from(dom.querySelectorAll('span')).map((span) => span.textContent)
    expect(spans).toContain('Zoom: 500 bp')
    expect(spans).toContain('1..500')
    expect(spans).not.toContain('4,000 bp')
    expect(spans).not.toContain('50.0% GC')
  })

  it('shows length and GC when zoom is absent, and omits GC when the label is null', () => {
    const dom = render(makeProps())
    const spans = Array.from(dom.querySelectorAll('span')).map((span) => span.textContent)
    expect(spans).toContain('4,000 bp')
    expect(spans).toContain('50.0% GC')

    act(() => root!.unmount())
    root = null
    host!.remove()
    const protein = render(makeProps({ gcLabel: null }))
    const proteinSpans = Array.from(protein.querySelectorAll('span')).map((span) => span.textContent)
    expect(proteinSpans).toContain('4,000 bp')
    expect(proteinSpans).not.toContain('50.0% GC')
  })

  it('renders the workspace counts span only when counts are provided', () => {
    const dom = render(makeProps({
      counts: { features: 3, primerBindings: 2, visibleEnzymeSites: 7 },
    }))
    expect(dom.textContent).toContain('3 features, 2 primer bindings, 7 visible enzyme sites')

    act(() => root!.unmount())
    root = null
    host!.remove()
    const withoutCounts = render(makeProps())
    expect(withoutCounts.textContent).not.toContain('visible enzyme sites')
  })

  it('renders the status echo with the attention modifier only after the key changes', () => {
    const dom = render(makeProps({ statusEcho: 'Saved.', attentionKey: 0 }))
    const status = dom.querySelector('.selection-bar-status')!
    expect(status.textContent).toBe('Saved.')
    expect(status.classList.contains('is-attention')).toBe(false)

    act(() => root!.render(<SelectionStatusBar {...makeProps({ statusEcho: 'Saved.', attentionKey: 3 })} />))
    const updated = dom.querySelector('.selection-bar-status')!
    expect(updated.textContent).toBe('Saved.')
    expect(updated.classList.contains('is-attention')).toBe(true)
  })

  it('renders no progress indicator while no operation is running', () => {
    const dom = render(makeProps())
    expect(dom.querySelector('.selection-bar-progress')).toBeNull()
  })
})

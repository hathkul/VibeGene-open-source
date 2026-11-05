// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { defaultFeatureTranslationOptions } from './domain/geneticCode'
import type { FeatureEditorState } from './domain/featureQualifiers'
import { FeaturePropertiesDialog } from './FeaturePropertiesDialog'
import { themeFixturePalette } from './test-support/themeFixturePalette'

const draft: FeatureEditorState = {
  featureId: 'f1',
  name: 'feature',
  type: 'misc_feature',
  color: themeFixturePalette.purpleFixture,
  directionality: 'forward',
  translateInSequenceView: false,
  translation: defaultFeatureTranslationOptions(1),
  prioritizeDisplay: false,
  segments: [{ start: 0, end: 6, strand: 'forward', color: themeFixturePalette.purpleFixture, name: 'feature' }],
  cleavageArrows: [],
  qualifiers: {},
  selectedQualifier: 'note',
}

describe('FeaturePropertiesDialog', () => {
  let host: HTMLDivElement
  let root: ReturnType<typeof createRoot>

  afterEach(() => {
    act(() => root?.unmount())
    host?.remove()
  })

  it('shows formatted qualifier text directly in the editable field', () => {
    const html = '<html><body><b>read </b><a href="https://example.org">more</a></body></html>'
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    act(() => root.render(<FeaturePropertiesDialog draft={{ ...draft, qualifiers: { note: html } }} sequenceLength={12} sequence={'A'.repeat(12)} onCancel={vi.fn()} onSave={vi.fn()} />))
    const field = host.querySelector<HTMLElement>('[role="textbox"][aria-label="note value"]')!
    expect(field.querySelector('b')?.textContent).toBe('read ')
    expect(field.querySelector('a')?.getAttribute('href')).toBe('https://example.org')
    expect(field.textContent).toBe('read more')
    expect(host.querySelector('[aria-label="Bold"]')).toBeNull()
    act(() => field.focus())
    expect(host.querySelector('[aria-label="Bold"]')).not.toBeNull()
  })

  it('shows separate formatted and plain values safely in field info', () => {
    const html = '<html><body><b>first</b> <a href="https://example.org">link</a><script>bad()</script></body></html>'
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    act(() => root.render(<FeaturePropertiesDialog draft={{ ...draft, qualifiers: { note: `${html}\nsecond`, gene: 'example' } }} sequenceLength={12} sequence={'A'.repeat(12)} onCancel={vi.fn()} onSave={vi.fn()} />))
    act(() => { [...host.querySelectorAll('button')].find(button => button.textContent === 'Show Field Info')!.click() })
    const lines = host.querySelectorAll('.feature-properties-field-info-line')
    expect(lines).toHaveLength(3)
    expect(lines[0]!.querySelector('b')?.textContent).toBe('first')
    expect(lines[0]!.querySelector('a')?.getAttribute('href')).toBe('https://example.org')
    expect(lines[0]!.querySelector('script')).toBeNull()
    expect(lines[0]!.textContent).toBe('/note = first link')
    expect(lines[1]!.textContent).toBe('/note = second')
    expect(lines[2]!.textContent).toBe('/gene = example')
  })

  it('saves a changed feature color to both the feature and its segments', () => {
    const onSave = vi.fn()
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    act(() => root.render(
      <FeaturePropertiesDialog
        draft={draft}
        sequenceLength={12}
        sequence={'A'.repeat(12)}
        onCancel={vi.fn()}
        onSave={onSave}
      />,
    ))

    act(() => {
      host.querySelector<HTMLInputElement>('.feature-nocolor-option input[type="checkbox"]')!.click()
    })
    act(() => {
      [...host.querySelectorAll('button')].find((button) => button.textContent === 'OK')!.click()
    })

    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      color: 'nocolor',
      segments: [expect.objectContaining({ color: 'nocolor' })],
    }))
  })

  it('uses a native color input for feature colors', () => {
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    act(() => root.render(
      <FeaturePropertiesDialog
        draft={draft}
        sequenceLength={12}
        sequence={'A'.repeat(12)}
        onCancel={vi.fn()}
        onSave={vi.fn()}
      />,
    ))

    expect(host.querySelector('input[type="color"]')).not.toBeNull()
    expect(host.querySelector('.feature-color-swatch')).toBeNull()
  })

  it('keeps intermediate location text until blur and saves the completed range', () => {
    const onSave = vi.fn()
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    const initial = { ...draft, segments: [{ ...draft.segments[0]!, start: 100, end: 250 }] }
    act(() => root.render(<FeaturePropertiesDialog draft={initial} sequenceLength={1000} sequence={'A'.repeat(1000)} onCancel={vi.fn()} onSave={onSave} />))
    const input = host.querySelector<HTMLInputElement>('[aria-label="Segment 1 end"]')!
    const setValue = (value: string) => act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value)
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    act(() => input.focus())
    expect(host.querySelector('[role="alert"]')).toBeNull()
    setValue('2')
    expect(input.value).toBe('2')
    expect(input.getAttribute('aria-invalid')).toBeNull()
    expect(host.querySelector('.feature-location-separator')?.textContent).toBe('..')
    setValue('200')
    act(() => [...host.querySelectorAll('button')].find((button) => button.textContent === 'OK')!.click())
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ segments: [expect.objectContaining({ start: 100, end: 200 })] }))
  })

  it('shows an invalid range after blur and does not save it', () => {
    const onSave = vi.fn()
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    act(() => root.render(<FeaturePropertiesDialog draft={draft} sequenceLength={12} sequence={'A'.repeat(12)} onCancel={vi.fn()} onSave={onSave} />))
    const start = host.querySelector<HTMLInputElement>('[aria-label="Segment 1 start"]')!
    const input = host.querySelector<HTMLInputElement>('[aria-label="Segment 1 end"]')!
    act(() => start.focus())
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(start, '5')
      start.dispatchEvent(new Event('input', { bubbles: true }))
    })
    act(() => input.focus())
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, '2')
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    expect(host.querySelector('[role="alert"]')).toBeNull()
    act(() => input.blur())
    expect(input.value).toBe('2')
    expect(input.getAttribute('aria-invalid')).toBe('true')
    expect(host.querySelector('[role="alert"]')?.textContent).toContain('valid range')
    act(() => [...host.querySelectorAll('button')].find((button) => button.textContent === 'OK')!.click())
    expect(onSave).not.toHaveBeenCalled()
    act(() => input.focus())
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, '10')
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    act(() => [...host.querySelectorAll('button')].find((button) => button.textContent === 'OK')!.click())
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ segments: [expect.objectContaining({ start: 4, end: 10 })] }))
  })

  it('applies the edited location when Set is clicked', () => {
    const onSave = vi.fn()
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    act(() => root.render(<FeaturePropertiesDialog draft={draft} sequenceLength={12} sequence={'A'.repeat(12)} onCancel={vi.fn()} onSave={onSave} />))
    const input = host.querySelector<HTMLInputElement>('[aria-label="Segment 1 end"]')!
    act(() => input.focus())
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, '10')
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    act(() => host.querySelector<HTMLButtonElement>('[aria-label="Set segment 1 location"]')!.click())
    expect(host.querySelector('[role="alert"]')).toBeNull()
    act(() => [...host.querySelectorAll('button')].find((button) => button.textContent === 'OK')!.click())
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ segments: [expect.objectContaining({ start: 0, end: 10 })] }))
  })
})

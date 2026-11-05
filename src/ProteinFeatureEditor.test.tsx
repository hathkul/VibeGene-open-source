// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SequenceFeature } from './domain/types'
import { ProteinFeaturePropertiesDialog, ProteinFeatureSidebarEditor } from './ProteinFeatureEditor'
import { themeFixturePalette } from './test-support/themeFixturePalette'

const feature: SequenceFeature = {
  id: 'protein-feature',
  name: 'Domain',
  type: 'domain',
  color: themeFixturePalette.purple,
  locations: [{ start: 0, end: 12, strand: 'forward' }],
}

describe('ProteinFeatureSidebarEditor', () => {
  let host: HTMLDivElement
  let root: ReturnType<typeof createRoot>

  afterEach(() => {
    act(() => root?.unmount())
    host?.remove()
  })

  it('uses a native color input and applies its selected color', () => {
    const onApply = vi.fn()
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    act(() => root.render(<ProteinFeatureSidebarEditor feature={feature} sequenceLength={24} onApply={onApply} />))

    const input = host.querySelector<HTMLInputElement>('input[type="color"]')!
    expect(input).not.toBeNull()
    expect(host.querySelector('.feature-color-swatch')).toBeNull()
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, themeFixturePalette.redPrimary)
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    expect(onApply).toHaveBeenCalledWith(expect.objectContaining({ color: themeFixturePalette.redPrimary }))
  })

  it('allows temporarily invalid residue coordinates and commits them on blur', () => {
    const onSave = vi.fn()
    const initial = { ...feature, locations: [{ start: 9, end: 22, strand: 'forward' as const }] }
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    act(() => root.render(<ProteinFeaturePropertiesDialog draft={initial} sequenceLength={100} onCancel={vi.fn()} onSave={onSave} />))
    const input = host.querySelector<HTMLInputElement>('[aria-label="Range 1 end"]')!
    const setValue = (value: string) => act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value)
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    act(() => input.focus())
    setValue('2')
    expect(input.value).toBe('2')
    expect(input.getAttribute('aria-invalid')).toBeNull()
    setValue('20')
    act(() => [...host.querySelectorAll('button')].find((button) => button.textContent === 'OK')!.click())
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ locations: [expect.objectContaining({ start: 9, end: 20 })] }))
  })

  it('does not save an invalid residue coordinate after blur', () => {
    const onSave = vi.fn()
    const initial = { ...feature, locations: [{ start: 9, end: 22, strand: 'forward' as const }] }
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    act(() => root.render(<ProteinFeaturePropertiesDialog draft={initial} sequenceLength={100} onCancel={vi.fn()} onSave={onSave} />))
    const input = host.querySelector<HTMLInputElement>('[aria-label="Range 1 end"]')!
    act(() => input.focus())
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, '2')
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    act(() => input.blur())
    expect(input.value).toBe('2')
    expect(input.getAttribute('aria-invalid')).toBe('true')
    act(() => [...host.querySelectorAll('button')].find((button) => button.textContent === 'OK')!.click())
    expect(onSave).not.toHaveBeenCalled()
    act(() => input.focus())
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, '20')
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    act(() => [...host.querySelectorAll('button')].find((button) => button.textContent === 'OK')!.click())
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ locations: [expect.objectContaining({ start: 9, end: 20 })] }))
  })
})

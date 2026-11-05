// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DNA_LIBRARY_HELP_TITLE, DnaLibraryHelpDialog } from '../src/DnaLibraryHelpDialog'

describe('DnaLibraryHelpDialog', () => {
  let container: HTMLDivElement | null = null

  afterEach(() => {
    if (!container) return
    container.remove()
    container = null
  })

  it('shows the library format article and closes from the footer', () => {
    container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    const onDismiss = vi.fn()

    act(() => {
      root.render(<DnaLibraryHelpDialog onDismiss={onDismiss} />)
    })

    expect(container.querySelector('#dna-library-help-title')?.textContent).toBe(DNA_LIBRARY_HELP_TITLE)
    expect(container.textContent).toContain('with Alignments on')
    expect(container.textContent).toContain('Alignments off')
    expect(container.textContent).toContain('SnapGene')
    expect(container.textContent).toContain('New DNA library')

    act(() => {
      container!.querySelector('button.primary')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(onDismiss).toHaveBeenCalledTimes(1)

    act(() => {
      root.unmount()
    })
  })

  it('closes on Escape', () => {
    container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    const onDismiss = vi.fn()

    act(() => {
      root.render(<DnaLibraryHelpDialog onDismiss={onDismiss} />)
    })
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    })
    expect(onDismiss).toHaveBeenCalledTimes(1)

    act(() => {
      root.unmount()
    })
  })
})

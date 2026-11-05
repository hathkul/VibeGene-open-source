// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ALIGNMENTS_HELP_TITLE, AlignmentsHelpDialog } from '../src/AlignmentsHelpDialog'

describe('AlignmentsHelpDialog', () => {
  let container: HTMLDivElement | null = null

  afterEach(() => {
    if (!container) return
    container.remove()
    container = null
  })

  it('covers trace alignments, comparative MSA, and translated DNA against proteins', () => {
    container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    const onDismiss = vi.fn()

    act(() => {
      root.render(<AlignmentsHelpDialog onDismiss={onDismiss} />)
    })

    expect(container.querySelector('#alignments-help-title')?.textContent).toBe(ALIGNMENTS_HELP_TITLE)
    expect(container.textContent).toContain('Show sequence trace alignments')
    expect(container.textContent).toContain('Show comparative alignments')
    expect(container.textContent).toContain('Replace in original')
    expect(container.textContent).toContain('Comparative DNA alignment')
    expect(container.textContent).toContain('Protein → Comparative Alignment…')
    expect(container.textContent).toContain('Aligning DNA translations to a protein')
    expect(container.textContent).toContain('frameshift')
    expect(container.textContent).toContain('Mark variability')

    act(() => {
      container!.querySelector('button.primary')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(onDismiss).toHaveBeenCalledTimes(1)

    act(() => root.unmount())
  })

  it('closes on Escape', () => {
    container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    const onDismiss = vi.fn()

    act(() => {
      root.render(<AlignmentsHelpDialog onDismiss={onDismiss} />)
    })
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    })
    expect(onDismiss).toHaveBeenCalledTimes(1)

    act(() => root.unmount())
  })
})

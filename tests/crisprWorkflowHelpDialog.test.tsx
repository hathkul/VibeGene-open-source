// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CRISPR_WORKFLOW_HELP_TITLE, CrisprWorkflowHelpDialog } from '../src/CrisprWorkflowHelpDialog'

describe('CrisprWorkflowHelpDialog', () => {
  let container: HTMLDivElement | null = null

  afterEach(() => {
    if (!container) return
    container.remove()
    container = null
  })

  it('covers design, detection, cloning, and oligo ordering', () => {
    container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    const onDismiss = vi.fn()

    act(() => {
      root.render(<CrisprWorkflowHelpDialog onDismiss={onDismiss} />)
    })

    expect(container.querySelector('#crispr-workflow-help-title')?.textContent).toBe(CRISPR_WORKFLOW_HELP_TITLE)
    expect(container.textContent).toContain('Add sgRNA…')
    expect(container.textContent).toContain('Design sgRNA…')
    expect(container.textContent).toContain('Gene / Entrez ID')
    expect(container.textContent).toContain('Selected region')
    expect(container.textContent).toContain('Detect CRISPR…')
    expect(container.textContent).toContain('Select enzyme sites manually…')
    expect(container.textContent).toContain('Copy oligos')
    expect(container.textContent).toContain('Open as sequence')
    expect(container.textContent).toContain('Export sgRNAs…')

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
      root.render(<CrisprWorkflowHelpDialog onDismiss={onDismiss} />)
    })
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    })
    expect(onDismiss).toHaveBeenCalledTimes(1)

    act(() => root.unmount())
  })
})

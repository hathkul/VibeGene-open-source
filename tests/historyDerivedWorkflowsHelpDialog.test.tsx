// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  HISTORY_DERIVED_WORKFLOWS_HELP_TITLE,
  HistoryDerivedWorkflowsHelpDialog,
} from '../src/HistoryDerivedWorkflowsHelpDialog'

describe('HistoryDerivedWorkflowsHelpDialog', () => {
  let container: HTMLDivElement | null = null

  afterEach(() => {
    if (!container) return
    container.remove()
    container = null
  })

  it('unites ligation, PCR, and DNA-gel guidance in one article', () => {
    container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    const onDismiss = vi.fn()

    act(() => {
      root.render(<HistoryDerivedWorkflowsHelpDialog onDismiss={onDismiss} />)
    })

    expect(container.querySelector('#history-derived-workflows-help-title')?.textContent).toBe(
      HISTORY_DERIVED_WORKFLOWS_HELP_TITLE,
    )
    expect(container.textContent).toContain('Restriction-ligation recipes')
    expect(container.textContent).toContain('PCR programs and mixes')
    expect(container.textContent).toContain('Restriction-digest gels from History')
    expect(container.textContent).toContain('20 ng')
    expect(container.textContent).toContain('double-click for agarose gel')

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
      root.render(<HistoryDerivedWorkflowsHelpDialog onDismiss={onDismiss} />)
    })
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    })
    expect(onDismiss).toHaveBeenCalledTimes(1)

    act(() => root.unmount())
  })
})

// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DATABASE_HELP_TITLE, DatabaseHelpDialog } from '../src/DatabaseHelpDialog'

describe('DatabaseHelpDialog', () => {
  let container: HTMLDivElement | null = null

  afterEach(() => {
    if (!container) return
    container.remove()
    container = null
  })

  it('explains the local Database, disk sync, and backups', () => {
    container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    const onDismiss = vi.fn()

    act(() => {
      root.render(<DatabaseHelpDialog onDismiss={onDismiss} />)
    })

    expect(container.querySelector('#database-help-title')?.textContent).toBe(DATABASE_HELP_TITLE)
    expect(container.textContent).toContain('layer above those files')
    expect(container.textContent).toContain('Desktop folder sync')
    expect(container.textContent).toContain('Export database')
    expect(container.textContent).toContain('not a cloud account')

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
      root.render(<DatabaseHelpDialog onDismiss={onDismiss} />)
    })
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    })
    expect(onDismiss).toHaveBeenCalledTimes(1)

    act(() => root.unmount())
  })
})

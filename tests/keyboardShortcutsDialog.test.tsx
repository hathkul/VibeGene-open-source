// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  KEYBOARD_SHORTCUTS_HELP_TITLE,
  KeyboardShortcutsDialog,
} from '../src/KeyboardShortcutsDialog'

describe('KeyboardShortcutsDialog', () => {
  let container: HTMLDivElement | null = null
  let root: ReturnType<typeof createRoot> | null = null

  afterEach(() => {
    if (root) act(() => root?.unmount())
    root = null
    container?.remove()
    container = null
  })

  it('renders registry actions with Windows shortcut labels', () => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    act(() => root!.render(<KeyboardShortcutsDialog onDismiss={() => {}} platform="windows" desktop />))

    expect(container.querySelector('#keyboard-shortcuts-help-title')?.textContent).toBe(KEYBOARD_SHORTCUTS_HELP_TITLE)
    expect(container.textContent).toContain('Open file')
    expect(container.textContent).toContain('Ctrl+O')
    expect(container.textContent).toContain('Duplicate Feature')
    expect(container.textContent).toContain('PCR (desktop app, DNA only)')
    expect(container.textContent).toContain('Ctrl+D')
  })

  it('renders macOS labels and dismisses on Escape', () => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    const onDismiss = vi.fn()
    act(() => root!.render(<KeyboardShortcutsDialog onDismiss={onDismiss} platform="mac" />))

    expect(container.textContent).toContain('⌘O')
    act(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })))
    expect(onDismiss).toHaveBeenCalledTimes(1)
  })

  it('hides DNA-only bindings from protein help', () => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    act(() => root!.render(
      <KeyboardShortcutsDialog onDismiss={() => {}} platform="mac" desktop molecule="protein" />,
    ))

    expect(container.textContent).toContain('Properties view')
    expect(container.textContent).not.toContain('Choose Enzymes')
    expect(container.textContent).not.toContain('Add Primer')
    expect(container.textContent).not.toContain('PCR')
  })
})

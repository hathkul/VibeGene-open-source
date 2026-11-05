// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DialogActions, DialogBackdrop, DialogSurface } from './DialogPrimitives'

describe('DialogPrimitives', () => {
  let host: HTMLDivElement
  let root: ReturnType<typeof createRoot>

  afterEach(() => {
    act(() => root?.unmount())
    host?.remove()
  })

  it('preserves the legacy dialog DOM contract and stops surface pointer events', () => {
    const onBackdropPointerDown = vi.fn()
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)

    act(() => {
      root.render(
        <DialogBackdrop onPointerDown={onBackdropPointerDown}>
          <DialogSurface className="enzyme-dialog" aria-label="Example dialog">
            <DialogActions>Actions</DialogActions>
          </DialogSurface>
        </DialogBackdrop>,
      )
    })

    const backdrop = host.querySelector<HTMLElement>('.translation-dialog-backdrop')!
    const surface = host.querySelector<HTMLElement>('.translation-dialog.enzyme-dialog')!
    const actions = host.querySelector<HTMLElement>('.translation-actions')!
    expect(backdrop.getAttribute('role')).toBe('presentation')
    expect(surface.getAttribute('role')).toBe('dialog')
    expect(surface.getAttribute('aria-modal')).toBe('true')
    expect(surface.getAttribute('aria-label')).toBe('Example dialog')
    expect(actions.textContent).toBe('Actions')

    act(() => surface.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true })))
    expect(onBackdropPointerDown).not.toHaveBeenCalled()
    act(() => backdrop.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true })))
    expect(onBackdropPointerDown).toHaveBeenCalledTimes(1)
  })
})

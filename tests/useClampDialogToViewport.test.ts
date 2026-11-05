// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { clampDialogToViewport, clearDialogViewportClamp } from '../src/ui/useClampDialogToViewport'
import { MOBILE_SHELL_MEDIA } from '../src/ui/mobileShellMedia'

describe('clampDialogToViewport', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('skips inline sizing on touch-phone mobile shell viewports', () => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn((query: string) => ({
        matches: query === MOBILE_SHELL_MEDIA,
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    )

    const dialog = document.createElement('div')
    dialog.style.maxWidth = '400px'
    dialog.style.width = '400px'
    document.body.appendChild(dialog)

    clampDialogToViewport(dialog)

    expect(dialog.style.maxWidth).toBe('')
    expect(dialog.style.width).toBe('')

    document.body.removeChild(dialog)
  })

  it('clears clamp styles explicitly', () => {
    const dialog = document.createElement('div')
    dialog.style.maxWidth = '100px'
    dialog.style.maxHeight = '100px'
    dialog.style.width = '100px'
    dialog.style.height = '100px'

    clearDialogViewportClamp(dialog)

    expect(dialog.style.maxWidth).toBe('')
    expect(dialog.style.maxHeight).toBe('')
    expect(dialog.style.width).toBe('')
    expect(dialog.style.height).toBe('')
  })
})

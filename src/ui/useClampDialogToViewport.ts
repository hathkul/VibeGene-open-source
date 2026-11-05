import { useLayoutEffect, type RefObject } from 'react'
import { matchesMobileShellViewport, MOBILE_SHELL_MEDIA } from './mobileShellMedia'

const DEFAULT_INSET_PX = 24

function viewportSize() {
  const width = window.visualViewport?.width ?? window.innerWidth
  const height = window.visualViewport?.height ?? window.innerHeight
  return { width, height }
}

export function clearDialogViewportClamp(dialog: HTMLElement) {
  dialog.style.removeProperty('max-width')
  dialog.style.removeProperty('max-height')
  dialog.style.removeProperty('width')
  dialog.style.removeProperty('height')
}

/** Keep a resizable dialog inside the visible viewport (handles resize:both overflow). */
export function clampDialogToViewport(dialog: HTMLElement, insetPx = DEFAULT_INSET_PX) {
  if (matchesMobileShellViewport()) {
    clearDialogViewportClamp(dialog)
    return
  }
  const { width: viewW, height: viewH } = viewportSize()
  const maxW = Math.max(280, Math.floor(viewW - insetPx))
  const maxH = Math.max(200, Math.floor(viewH - insetPx))
  const nextMaxW = `${maxW}px`
  const nextMaxH = `${maxH}px`
  if (dialog.style.maxWidth !== nextMaxW) dialog.style.maxWidth = nextMaxW
  if (dialog.style.maxHeight !== nextMaxH) dialog.style.maxHeight = nextMaxH
  if (dialog.offsetWidth > maxW) {
    const nextW = `${maxW}px`
    if (dialog.style.width !== nextW) dialog.style.width = nextW
  }
  if (dialog.offsetHeight > maxH) {
    const nextH = `${maxH}px`
    if (dialog.style.height !== nextH) dialog.style.height = nextH
  }
}

export function useClampDialogToViewport(
  dialogRef: RefObject<HTMLElement | null>,
  insetPx = DEFAULT_INSET_PX,
) {
  useLayoutEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return

    const media = typeof window.matchMedia === 'function' ? window.matchMedia(MOBILE_SHELL_MEDIA) : null

    let frame = 0
    const sync = () => {
      if (frame) return
      frame = requestAnimationFrame(() => {
        frame = 0
        if (media?.matches) {
          clearDialogViewportClamp(dialog)
          return
        }
        clampDialogToViewport(dialog, insetPx)
      })
    }

    sync()

    media?.addEventListener('change', sync)
    window.addEventListener('resize', sync)
    window.visualViewport?.addEventListener('resize', sync)
    window.visualViewport?.addEventListener('scroll', sync)
    // Do not ResizeObserver the dialog itself: writing maxWidth/maxHeight retriggers RO
    // and can freeze the UI in a feedback loop.

    return () => {
      if (frame) cancelAnimationFrame(frame)
      media?.removeEventListener('change', sync)
      window.removeEventListener('resize', sync)
      window.visualViewport?.removeEventListener('resize', sync)
      window.visualViewport?.removeEventListener('scroll', sync)
    }
  }, [dialogRef, insetPx])
}

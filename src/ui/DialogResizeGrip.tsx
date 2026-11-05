import type { PointerEvent as ReactPointerEvent, RefObject } from 'react'
import { dialogDragPosition, setDialogDragPosition } from './dialogDragPosition'

const EDGE_INSET = 8

function pixels(value: string, fallback: number) {
  const parsed = Number.parseFloat(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

/**
 * Bottom-right resize grip for centered dialogs. Native `resize: both` grows a
 * centered dialog on both sides, so the grip drifts away from the pointer; this
 * grip shifts the drag offset to keep the top-left corner fixed instead.
 */
export function DialogResizeGrip({ dialogRef }: { dialogRef: RefObject<HTMLElement | null> }) {
  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    const dialog = dialogRef.current
    if (!dialog || event.button !== 0) return
    event.preventDefault()
    event.stopPropagation()

    const pointerId = event.pointerId
    const rect = dialog.getBoundingClientRect()
    const style = getComputedStyle(dialog)
    const minWidth = pixels(style.minWidth, 320)
    const minHeight = pixels(style.minHeight, 240)
    const viewportWidth = window.visualViewport?.width ?? window.innerWidth
    const viewportHeight = window.visualViewport?.height ?? window.innerHeight
    const maxWidth = Math.max(minWidth, Math.min(pixels(style.maxWidth, Infinity), viewportWidth - EDGE_INSET - rect.left))
    const maxHeight = Math.max(minHeight, Math.min(pixels(style.maxHeight, Infinity), viewportHeight - EDGE_INSET - rect.top))
    const start = dialogDragPosition(dialog)
    const startX = event.clientX
    const startY = event.clientY
    const controller = new AbortController()
    document.documentElement.classList.add('is-resizing-dialog')

    const finish = () => {
      controller.abort()
      document.documentElement.classList.remove('is-resizing-dialog')
    }

    window.addEventListener('pointermove', (move) => {
      if (move.pointerId !== pointerId) return
      const width = Math.round(Math.min(maxWidth, Math.max(minWidth, rect.width + move.clientX - startX)))
      const height = Math.round(Math.min(maxHeight, Math.max(minHeight, rect.height + move.clientY - startY)))
      dialog.style.width = `${width}px`
      dialog.style.height = `${height}px`
      setDialogDragPosition(dialog, start.x + (width - rect.width) / 2, start.y + (height - rect.height) / 2)
      move.preventDefault()
    }, { signal: controller.signal })
    window.addEventListener('pointerup', (up) => {
      if (up.pointerId === pointerId) finish()
    }, { signal: controller.signal })
    window.addEventListener('pointercancel', finish, { signal: controller.signal })
    window.addEventListener('blur', finish, { signal: controller.signal })
  }

  return (
    <div
      className="dialog-resize-grip"
      role="separator"
      aria-label="Resize dialog"
      title="Drag to resize"
      onPointerDown={onPointerDown}
    />
  )
}

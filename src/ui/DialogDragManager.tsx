import { useEffect } from 'react'
import { dialogDragPosition, setDialogDragPosition } from './dialogDragPosition'
import { matchesMobileShellViewport } from './mobileShellMedia'

const DIALOG_SELECTOR = [
  '.translation-dialog[role="dialog"]',
  '.primer-editor-dialog[role="dialog"]',
  '.restriction-cloning-dntp-modal[role="dialog"]',
  '.db-picker-dialog[role="dialog"]',
  '.db-manager-dialog[role="dialog"]',
  '.enzyme-save-set-dialog[role="dialog"]',
].join(', ')

const HEADER_SELECTOR = [
  '[data-dialog-drag-handle]',
  '.restriction-cloning-header',
  '.restriction-cloning-dntp-modal-header',
  '.primer-editor-titlebar',
  '.enzyme-info-header',
  '.db-manager-header',
  '.db-sync-dialog-header',
  '.sequence-database-import-heading',
].join(', ')

const INTERACTIVE_SELECTOR = [
  'button',
  'input',
  'select',
  'textarea',
  'a',
  '[contenteditable="true"]',
  '[role="button"]',
  '[role="menu"]',
  '[role="menuitem"]',
  '[role="tab"]',
].join(', ')

const EDGE_INSET = 8

/** Root shells that fill a hybrid OS window — do not drag these in-webview. */
const HYBRID_ROOT_SHELL_SELECTOR = [
  '.db-manager-dialog',
  '.translation-dialog',
  '.enzyme-info-dialog',
  '.preferences-dialog',
  '.tools-letter-codes-dialog',
  '.tools-genetic-code-dialog',
  '.new-dna-dialog',
].join(', ')

function viewportSize() {
  return {
    width: window.visualViewport?.width ?? window.innerWidth,
    height: window.visualViewport?.height ?? window.innerHeight,
  }
}

function clampBounds(dialog: HTMLElement) {
  const host = dialog.closest(
    '.modal-backdrop, .db-picker-backdrop, .db-sync-dialog-backdrop, .db-manager-backdrop, .translation-dialog-backdrop, .enzyme-info-backdrop',
  )
  if (host instanceof HTMLElement) {
    const rect = host.getBoundingClientRect()
    return {
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height,
    }
  }
  const viewport = viewportSize()
  return { left: 0, top: 0, width: viewport.width, height: viewport.height }
}

function clampDelta(dialog: HTMLElement, startRect: DOMRect, pointerDeltaX: number, pointerDeltaY: number) {
  const bounds = clampBounds(dialog)
  const minLeft = Math.min(bounds.left + EDGE_INSET, bounds.left + bounds.width - EDGE_INSET - startRect.width)
  const maxLeft = Math.max(bounds.left + EDGE_INSET, bounds.left + bounds.width - EDGE_INSET - startRect.width)
  const minTop = Math.min(bounds.top + EDGE_INSET, bounds.top + bounds.height - EDGE_INSET - startRect.height)
  const maxTop = Math.max(bounds.top + EDGE_INSET, bounds.top + bounds.height - EDGE_INSET - startRect.height)

  return {
    x: Math.min(maxLeft - startRect.left, Math.max(minLeft - startRect.left, pointerDeltaX)),
    y: Math.min(maxTop - startRect.top, Math.max(minTop - startRect.top, pointerDeltaY)),
  }
}

function isDragHandle(target: Element, dialog: HTMLElement) {
  const header = target.closest(HEADER_SELECTOR)
  if (header && dialog.contains(header)) return true

  const heading = target.closest('h2, h3, h4')
  return Boolean(heading && heading.parentElement === dialog)
}

/** Innermost dialog under the event target (nested popups beat their host shell). */
function findDialog(target: Element): HTMLElement | null {
  let node: Element | null = target
  while (node) {
    if (node instanceof HTMLElement && node.matches(DIALOG_SELECTOR)) {
      return node
    }
    node = node.parentElement
  }
  return null
}

function isHybridRootShell(dialog: HTMLElement) {
  if (!document.documentElement.classList.contains('vg-hybrid-window')) return false
  // Nested popup inside Database / another host dialog → allow in-webview drag.
  const hostDialog = dialog.closest('.db-manager-dialog, .translation-dialog, .enzyme-info-dialog')
  if (hostDialog && hostDialog !== dialog) return false
  return dialog.matches(HYBRID_ROOT_SHELL_SELECTOR)
}

/** Adds desktop-style title-bar dragging to the shared in-app dialog shells. */
export function DialogDragManager() {
  useEffect(() => {
    let stopActiveDrag: (() => void) | null = null

    const onPointerDown = (event: PointerEvent) => {
      if (matchesMobileShellViewport()) return
      if (event.button !== 0 || event.pointerType === 'touch') return

      const target = event.target instanceof Element ? event.target : null
      if (!target || target.closest(INTERACTIVE_SELECTOR)) return
      if (target.closest('[data-local-dialog-drag]')) return

      const dialog = findDialog(target)
      if (!dialog || !isDragHandle(target, dialog)) return
      if (isHybridRootShell(dialog)) return

      stopActiveDrag?.()
      const startRect = dialog.getBoundingClientRect()
      const startPointerX = event.clientX
      const startPointerY = event.clientY
      const { x: startX, y: startY } = dialogDragPosition(dialog)
      const pointerId = event.pointerId
      const controller = new AbortController()

      dialog.classList.add('is-dialog-dragging')
      document.documentElement.classList.add('is-dragging-dialog')
      event.preventDefault()

      const finish = () => {
        controller.abort()
        dialog.classList.remove('is-dialog-dragging')
        document.documentElement.classList.remove('is-dragging-dialog')
        if (stopActiveDrag === finish) stopActiveDrag = null
      }
      stopActiveDrag = finish

      window.addEventListener('pointermove', (moveEvent) => {
        if (moveEvent.pointerId !== pointerId) return
        const delta = clampDelta(
          dialog,
          startRect,
          moveEvent.clientX - startPointerX,
          moveEvent.clientY - startPointerY,
        )
        setDialogDragPosition(dialog, startX + delta.x, startY + delta.y)
        moveEvent.preventDefault()
      }, { signal: controller.signal })

      window.addEventListener('pointerup', (upEvent) => {
        if (upEvent.pointerId === pointerId) finish()
      }, { signal: controller.signal })
      window.addEventListener('pointercancel', finish, { signal: controller.signal })
      window.addEventListener('blur', finish, { signal: controller.signal })
    }

    document.addEventListener('pointerdown', onPointerDown, true)
    return () => {
      stopActiveDrag?.()
      document.removeEventListener('pointerdown', onPointerDown, true)
    }
  }, [])

  return null
}

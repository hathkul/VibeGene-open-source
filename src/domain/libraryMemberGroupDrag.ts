/** Shared pointer-drag grouping for library members (works in Tauri WKWebView). */

export const LIBRARY_MEMBER_DROP_ATTR = 'data-library-member-id'

const DRAG_THRESHOLD_PX = 6

export function startLibraryMemberGroupPointerDrag(options: {
  sourceId: string
  clientX: number
  clientY: number
  onDropTargetChange: (targetId: string | null) => void
  onGroup: (targetId: string, sourceId: string) => void
  /** Called when the gesture moved enough to count as a drag (suppress following click). */
  onActivated?: () => void
}) {
  let activated = false

  const resolveTarget = (x: number, y: number) => {
    const el = document.elementFromPoint(x, y)
    const host = el?.closest(`[${LIBRARY_MEMBER_DROP_ATTR}]`) as HTMLElement | null
    const id = host?.getAttribute(LIBRARY_MEMBER_DROP_ATTR)
    return id && id !== options.sourceId ? id : null
  }

  const onMove = (event: PointerEvent) => {
    const dx = event.clientX - options.clientX
    const dy = event.clientY - options.clientY
    if (!activated) {
      if (dx * dx + dy * dy < DRAG_THRESHOLD_PX * DRAG_THRESHOLD_PX) return
      activated = true
      document.body.classList.add('is-library-member-grouping')
      options.onActivated?.()
    }
    event.preventDefault()
    options.onDropTargetChange(resolveTarget(event.clientX, event.clientY))
  }

  const finish = (event: PointerEvent) => {
    window.removeEventListener('pointermove', onMove)
    window.removeEventListener('pointerup', finish)
    window.removeEventListener('pointercancel', finish)
    document.body.classList.remove('is-library-member-grouping')
    const targetId = activated ? resolveTarget(event.clientX, event.clientY) : null
    options.onDropTargetChange(null)
    if (targetId) options.onGroup(targetId, options.sourceId)
  }

  window.addEventListener('pointermove', onMove)
  window.addEventListener('pointerup', finish)
  window.addEventListener('pointercancel', finish)
}

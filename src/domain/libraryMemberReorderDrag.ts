/** Pointer-drag reorder for Members table rows (works in Tauri WKWebView). */

export const LIBRARY_MEMBER_ROW_ATTR = 'data-library-member-row-id'

const DRAG_THRESHOLD_PX = 6

function syncGhostColumnWidths(sourceRow: HTMLTableRowElement, ghostRow: HTMLTableRowElement) {
  const sourceCells = sourceRow.cells
  const ghostCells = ghostRow.cells
  for (let index = 0; index < sourceCells.length && index < ghostCells.length; index += 1) {
    const width = sourceCells[index]!.getBoundingClientRect().width
    ghostCells[index]!.style.width = `${width}px`
    ghostCells[index]!.style.minWidth = `${width}px`
    ghostCells[index]!.style.maxWidth = `${width}px`
  }
}

function createMemberReorderGhost(
  sourceRow: HTMLTableRowElement,
  clientX: number,
  clientY: number,
): { ghost: HTMLElement; offsetX: number; offsetY: number } {
  const rect = sourceRow.getBoundingClientRect()
  const table = sourceRow.closest('table')
  const ghostTable = document.createElement('table')
  ghostTable.className = `members-table-reorder-ghost${table ? ` ${table.className}` : ''}`
  ghostTable.setAttribute('aria-hidden', 'true')
  const body = document.createElement('tbody')
  const ghostRow = sourceRow.cloneNode(true) as HTMLTableRowElement
  ghostRow.removeAttribute(LIBRARY_MEMBER_ROW_ATTR)
  ghostRow.classList.remove('is-selected', 'is-drop-before', 'is-drop-after', 'is-reorder-source')
  body.appendChild(ghostRow)
  ghostTable.appendChild(body)
  ghostTable.style.width = `${rect.width}px`
  document.body.appendChild(ghostTable)
  syncGhostColumnWidths(sourceRow, ghostRow)

  const offsetX = clientX - rect.left
  const offsetY = clientY - rect.top
  ghostTable.style.transform = `translate(${rect.left}px, ${rect.top}px)`
  return { ghost: ghostTable, offsetX, offsetY }
}

function placeGhost(ghost: HTMLElement, clientX: number, clientY: number, offsetX: number, offsetY: number) {
  ghost.style.transform = `translate(${clientX - offsetX}px, ${clientY - offsetY}px)`
}

export function startLibraryMemberReorderPointerDrag(options: {
  sourceId: string
  sourceRow: HTMLTableRowElement
  clientX: number
  clientY: number
  onDropBeforeChange: (beforeId: string | null | undefined) => void
  onReorder: (movedId: string, beforeId: string | null) => void
  onActivated?: () => void
  onFinished?: () => void
}) {
  let activated = false
  let ghost: HTMLElement | null = null
  let offsetX = 0
  let offsetY = 0
  const sourceRow = options.sourceRow

  const resolveBeforeId = (x: number, y: number): string | null | undefined => {
    // Ghost has pointer-events: none; still ensure hits go to the real table.
    const el = document.elementFromPoint(x, y)
    const host = el?.closest(`[${LIBRARY_MEMBER_ROW_ATTR}]`) as HTMLElement | null
    const id = host?.getAttribute(LIBRARY_MEMBER_ROW_ATTR)
    if (!host || !id || id === options.sourceId) return undefined
    const rect = host.getBoundingClientRect()
    // Drop in the lower half → insert after this row (before the next sibling).
    if (y > rect.top + rect.height / 2) {
      const next = host.nextElementSibling as HTMLElement | null
      const nextId = next?.getAttribute(LIBRARY_MEMBER_ROW_ATTR)
      return nextId && nextId !== options.sourceId ? nextId : null
    }
    return id
  }

  const cleanupGhost = () => {
    ghost?.remove()
    ghost = null
  }

  const onMove = (event: PointerEvent) => {
    const dx = event.clientX - options.clientX
    const dy = event.clientY - options.clientY
    if (!activated) {
      if (dx * dx + dy * dy < DRAG_THRESHOLD_PX * DRAG_THRESHOLD_PX) return
      activated = true
      document.body.classList.add('is-library-member-reordering')
      const created = createMemberReorderGhost(sourceRow, options.clientX, options.clientY)
      ghost = created.ghost
      offsetX = created.offsetX
      offsetY = created.offsetY
      options.onActivated?.()
    }
    event.preventDefault()
    if (ghost) placeGhost(ghost, event.clientX, event.clientY, offsetX, offsetY)
    options.onDropBeforeChange(resolveBeforeId(event.clientX, event.clientY))
  }

  const finish = (event: PointerEvent) => {
    window.removeEventListener('pointermove', onMove)
    window.removeEventListener('pointerup', finish)
    window.removeEventListener('pointercancel', finish)
    const beforeId = activated ? resolveBeforeId(event.clientX, event.clientY) : undefined
    cleanupGhost()
    document.body.classList.remove('is-library-member-reordering')
    options.onDropBeforeChange(undefined)
    options.onFinished?.()
    if (beforeId !== undefined) options.onReorder(options.sourceId, beforeId)
  }

  window.addEventListener('pointermove', onMove)
  window.addEventListener('pointerup', finish)
  window.addEventListener('pointercancel', finish)
}

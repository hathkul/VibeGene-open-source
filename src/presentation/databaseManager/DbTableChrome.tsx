import type { ReactNode } from 'react'
import { DATABASE_COLUMN_DRAG_MIME, type DbSortDirection } from './types'

export { DATABASE_COLUMN_DRAG_MIME }

export function DbSortHeader<T extends string>({
  label,
  column,
  activeColumn,
  direction,
  onSort,
}: {
  label: string
  column: T
  activeColumn: T
  direction: DbSortDirection
  onSort: (column: T) => void
}) {
  const isActive = activeColumn === column
  return (
    <button
      type="button"
      className={`db-table-sort-header${isActive ? ' is-active' : ''}`}
      onClick={() => onSort(column)}
      aria-sort={isActive ? (direction === 'asc' ? 'ascending' : 'descending') : 'none'}
    >
      <span>{label}</span>
      <span className="db-table-sort-arrow" aria-hidden>
        {isActive ? (direction === 'asc' ? '▲' : '▼') : '▾'}
      </span>
    </button>
  )
}

export function DbColumnResizeHandle<T extends string>({
  columnId,
  width,
  onResize,
}: {
  columnId: T
  width: number
  onResize: (columnId: T, nextWidth: number) => void
}) {
  return (
    <span
      className="db-col-resize-handle"
      role="separator"
      aria-orientation="vertical"
      aria-label={`Resize ${columnId} column`}
      draggable={false}
      onClick={(event) => event.stopPropagation()}
      onPointerDown={(event) => {
        event.preventDefault()
        event.stopPropagation()
        const handle = event.currentTarget
        const startX = event.clientX
        const startWidth = width
        handle.classList.add('is-dragging')
        handle.setPointerCapture(event.pointerId)

        const onMove = (moveEvent: PointerEvent) => {
          onResize(columnId, Math.round(startWidth + (moveEvent.clientX - startX)))
        }
        const onUp = (upEvent: PointerEvent) => {
          handle.classList.remove('is-dragging')
          if (handle.hasPointerCapture(upEvent.pointerId)) {
            handle.releasePointerCapture(upEvent.pointerId)
          }
          handle.removeEventListener('pointermove', onMove)
          handle.removeEventListener('pointerup', onUp)
          handle.removeEventListener('pointercancel', onUp)
        }
        handle.addEventListener('pointermove', onMove)
        handle.addEventListener('pointerup', onUp)
        handle.addEventListener('pointercancel', onUp)
      }}
    />
  )
}

export function DbDraggableTh({
  columnId,
  className,
  dragColumnId,
  dropTargetId,
  onReorderDragStart,
  onReorderDragOver,
  onReorderDrop,
  onReorderDragEnd,
  children,
}: {
  columnId: string
  className?: string
  dragColumnId: string | null
  dropTargetId: string | null
  onReorderDragStart: (columnId: string) => void
  onReorderDragOver: (columnId: string) => void
  onReorderDrop: (columnId: string) => void
  onReorderDragEnd: () => void
  children: ReactNode
}) {
  return (
    <th
      className={[
        'db-sortable-header',
        'db-col-draggable',
        className,
        dragColumnId === columnId ? 'is-col-dragging' : '',
        dropTargetId === columnId && dragColumnId !== columnId ? 'is-col-drop-target' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      draggable
      onDragStart={(event) => {
        if ((event.target as HTMLElement).closest('.db-col-resize-handle')) {
          event.preventDefault()
          return
        }
        event.dataTransfer.setData(DATABASE_COLUMN_DRAG_MIME, columnId)
        event.dataTransfer.setData('text/plain', columnId)
        event.dataTransfer.effectAllowed = 'move'
        onReorderDragStart(columnId)
      }}
      onDragOver={(event) => {
        event.preventDefault()
        event.dataTransfer.dropEffect = 'move'
        onReorderDragOver(columnId)
      }}
      onDrop={(event) => {
        event.preventDefault()
        onReorderDrop(columnId)
      }}
      onDragEnd={onReorderDragEnd}
    >
      {children}
    </th>
  )
}

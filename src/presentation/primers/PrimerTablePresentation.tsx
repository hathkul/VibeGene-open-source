/* eslint-disable react-refresh/only-export-components */
import type { ReactNode } from 'react'
import { GUIDESCAN_METRIC_HELP } from '../../domain/guidescan/mapping'
import type { PrimerColumnId, PrimerTabSortDirection } from '../sequence'
import type { PrimerTabSortMode } from '../../domain/primerExport'
import type { SgRnaPaneSortMode } from '../../domain/primerPaneEntries'
export const PRIMER_COLUMN_ORDER: PrimerColumnId[] = [
  'vis',
  'name',
  'length',
  'binding',
  'orientation',
  'tm',
  'gc',
  'mass',
  'sequence',
  'description',
  'warnings',
]

export const DEFAULT_PRIMER_COLUMN_WIDTHS: Record<PrimerColumnId, number> = {
  vis: 30,
  name: 180,
  description: 180,
  length: 72,
  binding: 130,
  orientation: 90,
  tm: 120,
  gc: 56,
  mass: 72,
  sequence: 220,
  warnings: 110,
}

const PRIMER_COLUMN_MIN_WIDTH: Record<PrimerColumnId, number> = {
  vis: 30,
  name: 80,
  description: 80,
  length: 48,
  binding: 72,
  orientation: 64,
  tm: 84,
  gc: 40,
  mass: 48,
  sequence: 80,
  warnings: 72,
}

export function PrimerTableSortHeader<M extends string>({
  label,
  mode,
  activeMode,
  direction,
  onSort,
  title,
}: {
  label: string
  mode: M
  activeMode: M
  direction: PrimerTabSortDirection
  onSort: (mode: M) => void
  title?: string
}) {
  const isActive = activeMode === mode
  return (
    <button
      type="button"
      className={`enzyme-table-sort-header${isActive ? ' is-active' : ''}`}
      onClick={() => onSort(mode)}
      title={title}
      aria-sort={isActive ? (direction === 'asc' ? 'ascending' : 'descending') : 'none'}
    >
      <span>{label}</span>
      <span className="enzyme-table-sort-arrow" aria-hidden>
        {isActive ? (direction === 'asc' ? '▲' : '▼') : '▾'}
      </span>
    </button>
  )
}

export function PrimerPaneOligoGroupHeaderRow({
  oligoTabSortMode,
  oligoTabSortDirection,
  toggleOligoTabSort,
  primerColumnWidths,
  resizePrimerColumn,
  visibilityMenu,
}: {
  oligoTabSortMode: PrimerTabSortMode
  oligoTabSortDirection: PrimerTabSortDirection
  toggleOligoTabSort: (mode: PrimerTabSortMode) => void
  primerColumnWidths: Record<PrimerColumnId, number>
  resizePrimerColumn: (columnId: PrimerColumnId, nextWidth: number) => void
  visibilityMenu: ReactNode
}) {
  return (
    <tr className="primer-group-header-row">
      <th className="feature-visibility-col">
        {visibilityMenu}
        <PrimerColumnResizeHandle columnId="vis" width={primerColumnWidths.vis} onResize={resizePrimerColumn} />
      </th>
      <th className="enzyme-sortable-header">
        <PrimerTableSortHeader label="Oligo" mode="name" activeMode={oligoTabSortMode} direction={oligoTabSortDirection} onSort={toggleOligoTabSort} />
        <PrimerColumnResizeHandle columnId="name" width={primerColumnWidths.name} onResize={resizePrimerColumn} />
      </th>
      <th className="enzyme-sortable-header">
        <PrimerTableSortHeader label="Length" mode="length" activeMode={oligoTabSortMode} direction={oligoTabSortDirection} onSort={toggleOligoTabSort} />
        <PrimerColumnResizeHandle columnId="length" width={primerColumnWidths.length} onResize={resizePrimerColumn} />
      </th>
      <th className="enzyme-sortable-header">
        <PrimerTableSortHeader label="Binding site" mode="binding" activeMode={oligoTabSortMode} direction={oligoTabSortDirection} onSort={toggleOligoTabSort} />
        <PrimerColumnResizeHandle columnId="binding" width={primerColumnWidths.binding} onResize={resizePrimerColumn} />
      </th>
      <th className="enzyme-sortable-header">
        <PrimerTableSortHeader label="Orientation" mode="orientation" activeMode={oligoTabSortMode} direction={oligoTabSortDirection} onSort={toggleOligoTabSort} />
        <PrimerColumnResizeHandle columnId="orientation" width={primerColumnWidths.orientation} onResize={resizePrimerColumn} />
      </th>
      <th className="enzyme-sortable-header">
        <PrimerTableSortHeader label="3′ Tm" mode="tm" activeMode={oligoTabSortMode} direction={oligoTabSortDirection} onSort={toggleOligoTabSort} />
        <PrimerColumnResizeHandle columnId="tm" width={primerColumnWidths.tm} onResize={resizePrimerColumn} />
      </th>
      <th className="enzyme-sortable-header">
        <PrimerTableSortHeader label="GC" mode="gc" activeMode={oligoTabSortMode} direction={oligoTabSortDirection} onSort={toggleOligoTabSort} />
        <PrimerColumnResizeHandle columnId="gc" width={primerColumnWidths.gc} onResize={resizePrimerColumn} />
      </th>
      <th className="enzyme-sortable-header">
        <PrimerTableSortHeader label="Da" mode="mass" activeMode={oligoTabSortMode} direction={oligoTabSortDirection} onSort={toggleOligoTabSort} />
        <PrimerColumnResizeHandle columnId="mass" width={primerColumnWidths.mass} onResize={resizePrimerColumn} />
      </th>
      <th className="enzyme-sortable-header">
        <PrimerTableSortHeader label="Sequence" mode="sequence" activeMode={oligoTabSortMode} direction={oligoTabSortDirection} onSort={toggleOligoTabSort} />
        <PrimerColumnResizeHandle columnId="sequence" width={primerColumnWidths.sequence} onResize={resizePrimerColumn} />
      </th>
      <th className="enzyme-sortable-header">
        <PrimerTableSortHeader label="Description" mode="description" activeMode={oligoTabSortMode} direction={oligoTabSortDirection} onSort={toggleOligoTabSort} />
        <PrimerColumnResizeHandle columnId="description" width={primerColumnWidths.description} onResize={resizePrimerColumn} />
      </th>
      <th className="enzyme-sortable-header">
        <PrimerTableSortHeader label="Warnings" mode="warnings" activeMode={oligoTabSortMode} direction={oligoTabSortDirection} onSort={toggleOligoTabSort} />
        <PrimerColumnResizeHandle columnId="warnings" width={primerColumnWidths.warnings} onResize={resizePrimerColumn} />
      </th>
    </tr>
  )
}

export function PrimerPaneSgRnaGroupHeaderRow({
  sgRnaTabSortMode,
  sgRnaTabSortDirection,
  toggleSgRnaTabSort,
  primerColumnWidths,
  resizePrimerColumn,
  visibilityMenu,
}: {
  sgRnaTabSortMode: SgRnaPaneSortMode
  sgRnaTabSortDirection: PrimerTabSortDirection
  toggleSgRnaTabSort: (mode: SgRnaPaneSortMode) => void
  primerColumnWidths: Record<PrimerColumnId, number>
  resizePrimerColumn: (columnId: PrimerColumnId, nextWidth: number) => void
  visibilityMenu: ReactNode
}) {
  return (
    <tr className="primer-group-header-row">
      <th className="feature-visibility-col">
        {visibilityMenu}
        <PrimerColumnResizeHandle columnId="vis" width={primerColumnWidths.vis} onResize={resizePrimerColumn} />
      </th>
      <th className="enzyme-sortable-header">
        <PrimerTableSortHeader label="sgRNA" mode="name" activeMode={sgRnaTabSortMode} direction={sgRnaTabSortDirection} onSort={toggleSgRnaTabSort} />
        <PrimerColumnResizeHandle columnId="name" width={primerColumnWidths.name} onResize={resizePrimerColumn} />
      </th>
      <th className="enzyme-sortable-header">
        <PrimerTableSortHeader label="Length" mode="length" activeMode={sgRnaTabSortMode} direction={sgRnaTabSortDirection} onSort={toggleSgRnaTabSort} />
        <PrimerColumnResizeHandle columnId="length" width={primerColumnWidths.length} onResize={resizePrimerColumn} />
      </th>
      <th className="enzyme-sortable-header">
        <PrimerTableSortHeader label="Binding site" mode="binding" activeMode={sgRnaTabSortMode} direction={sgRnaTabSortDirection} onSort={toggleSgRnaTabSort} />
        <PrimerColumnResizeHandle columnId="binding" width={primerColumnWidths.binding} onResize={resizePrimerColumn} />
      </th>
      <th className="enzyme-sortable-header">
        <PrimerTableSortHeader label="Orientation" mode="orientation" activeMode={sgRnaTabSortMode} direction={sgRnaTabSortDirection} onSort={toggleSgRnaTabSort} />
        <PrimerColumnResizeHandle columnId="orientation" width={primerColumnWidths.orientation} onResize={resizePrimerColumn} />
      </th>
      <th className="enzyme-sortable-header">
        <PrimerTableSortHeader
          label="Spec."
          mode="specificity"
          activeMode={sgRnaTabSortMode}
          direction={sgRnaTabSortDirection}
          onSort={toggleSgRnaTabSort}
          title={GUIDESCAN_METRIC_HELP.specificity}
        />
        <PrimerColumnResizeHandle columnId="tm" width={primerColumnWidths.tm} onResize={resizePrimerColumn} />
      </th>
      <th className="enzyme-sortable-header">
        <PrimerTableSortHeader
          label="Cut"
          mode="cutting"
          activeMode={sgRnaTabSortMode}
          direction={sgRnaTabSortDirection}
          onSort={toggleSgRnaTabSort}
          title={GUIDESCAN_METRIC_HELP.cuttingEfficiency}
        />
        <PrimerColumnResizeHandle columnId="gc" width={primerColumnWidths.gc} onResize={resizePrimerColumn} />
      </th>
      <th className="enzyme-sortable-header">
        <PrimerTableSortHeader
          label="Off-targets"
          mode="offtargets"
          activeMode={sgRnaTabSortMode}
          direction={sgRnaTabSortDirection}
          onSort={toggleSgRnaTabSort}
          title={GUIDESCAN_METRIC_HELP.offTargets}
        />
        <PrimerColumnResizeHandle columnId="mass" width={primerColumnWidths.mass} onResize={resizePrimerColumn} />
      </th>
      <th className="enzyme-sortable-header">
        <PrimerTableSortHeader label="Spacer" mode="spacer" activeMode={sgRnaTabSortMode} direction={sgRnaTabSortDirection} onSort={toggleSgRnaTabSort} />
        <PrimerColumnResizeHandle columnId="sequence" width={primerColumnWidths.sequence} onResize={resizePrimerColumn} />
      </th>
      <th aria-label="No primer description for sgRNA" />
      <th className="enzyme-sortable-header">
        <PrimerTableSortHeader label="Nuclease · PAM" mode="nuclease" activeMode={sgRnaTabSortMode} direction={sgRnaTabSortDirection} onSort={toggleSgRnaTabSort} />
        <PrimerColumnResizeHandle columnId="warnings" width={primerColumnWidths.warnings} onResize={resizePrimerColumn} />
      </th>
    </tr>
  )
}

function ColumnResizeHandle<T extends string>({
  columnId,
  width,
  minWidth,
  onResize,
}: {
  columnId: T
  width: number
  minWidth: number
  onResize: (columnId: T, nextWidth: number) => void
}) {
  return (
    <span
      className="table-col-resize-handle"
      role="separator"
      aria-orientation="vertical"
      aria-label={`Resize ${columnId} column`}
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
          const next = Math.max(minWidth, Math.round(startWidth + (moveEvent.clientX - startX)))
          onResize(columnId, next)
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
export function PrimerColumnResizeHandle({
  columnId,
  width,
  onResize,
}: {
  columnId: PrimerColumnId
  width: number
  onResize: (columnId: PrimerColumnId, nextWidth: number) => void
}) {
  return (
    <ColumnResizeHandle
      columnId={columnId}
      width={width}
      minWidth={PRIMER_COLUMN_MIN_WIDTH[columnId]}
      onResize={onResize}
    />
  )
}

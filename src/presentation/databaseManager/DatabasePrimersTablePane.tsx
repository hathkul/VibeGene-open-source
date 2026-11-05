import type { MouseEvent } from 'react'
import { dbFileColumnClassName } from '../../ui/mobileDenseTables'
import {
  DbColumnResizeHandle,
  DbDraggableTh,
  DbSortHeader,
} from './DbTableChrome'
import type { DatabaseManagerPrimersPaneModel, DatabaseManagerPrimerSortColumn } from './databaseManagerTableTypes'
import type { DatabaseManagerPrimerColumnId } from './types'
import { formatPrimerGcPercent, formatPrimerOligoTm } from './databaseManagerFormatters'
import { DATABASE_PRIMERS_DRAG_MIME, encodeDatabasePrimersDragPayload } from '../../domain/databasePrimerDrag'
import type { LibraryPrimer } from '../../domain/libraryPrimer'

export type DatabasePrimersTableCommands = {
  onDragPrimersToWorkspace?: (primers: LibraryPrimer[]) => void
  onToggleSelectAll: () => void
  onToggleRowSelected: (key: string, selected: boolean) => void
  onSelectRow: (key: string, event: MouseEvent) => void
  onOpenRow: (key: string) => void
  onBrowseTag: (tag: string) => void
  onSort: (column: DatabaseManagerPrimerSortColumn) => void
  onResizeColumn: (columnId: DatabaseManagerPrimerColumnId, width: number) => void
  onReorderColumn: (toId: DatabaseManagerPrimerColumnId) => void
  onReorderDragStart: (columnId: string | null) => void
  onReorderDragOver: (columnId: string | null) => void
  onReorderDragEnd: () => void
}

export type DatabasePrimersTablePaneProps = {
  model: DatabaseManagerPrimersPaneModel
  commands: DatabasePrimersTableCommands
}

export function DatabasePrimersTablePane({ model, commands }: DatabasePrimersTablePaneProps) {
  const {
    empty,
    rows,
    tableWidth,
    viewportWidth,
    checkColWidth,
    columnOrder,
    columnWidths,
    sortColumn,
    sortDirection,
    selection,
    selectedKeys,
    columnReorder,
  } = model

  if (empty) {
    return (
      <div className="db-file-empty-wrap">
        <p className="muted db-file-empty">{empty.message}</p>
      </div>
    )
  }

  const sortLabels: Partial<Record<DatabaseManagerPrimerSortColumn, string>> = {
    name: 'Name',
    sequence: 'Sequence',
    length: 'Length',
    tm: 'Tm',
    gc: 'GC',
    tags: 'Tags',
    files: 'Files',
  }

  return (
    <table
      className="db-file-table db-primer-table"
      style={{ width: Math.max(tableWidth, viewportWidth) }}
    >
      <colgroup>
        <col style={{ width: checkColWidth }} />
        {columnOrder.map((columnId) => (
          <col key={columnId} style={{ width: columnWidths[columnId] }} />
        ))}
      </colgroup>
      <thead>
        <tr>
          <th className="db-file-check-col">
            <input
              type="checkbox"
              checked={selection.allVisibleSelected}
              ref={(el) => {
                if (el) el.indeterminate = selection.someVisibleSelected && !selection.allVisibleSelected
              }}
              onChange={commands.onToggleSelectAll}
              aria-label="Select all primers in this view"
            />
          </th>
          {columnOrder.map((columnId, index) => {
            const isLast = index === columnOrder.length - 1
            const numClass =
              columnId === 'length' || columnId === 'tm' || columnId === 'gc' ? 'db-primer-num' : undefined
            return (
              <DbDraggableTh
                key={columnId}
                columnId={columnId}
                className={[numClass, dbFileColumnClassName(columnId)].filter(Boolean).join(' ')}
                dragColumnId={columnReorder.dragColumnId}
                dropTargetId={columnReorder.dropTargetId}
                onReorderDragStart={commands.onReorderDragStart}
                onReorderDragOver={commands.onReorderDragOver}
                onReorderDrop={(toId) => commands.onReorderColumn(toId as DatabaseManagerPrimerColumnId)}
                onReorderDragEnd={commands.onReorderDragEnd}
              >
                {columnId === 'actions' ? (
                  <span className="db-col-header-label">Actions</span>
                ) : (
                  <DbSortHeader
                    label={sortLabels[columnId as DatabaseManagerPrimerSortColumn] ?? columnId}
                    column={columnId}
                    activeColumn={sortColumn}
                    direction={sortDirection}
                    onSort={(col) => commands.onSort(col as DatabaseManagerPrimerSortColumn)}
                  />
                )}
                {!isLast ? (
                  <DbColumnResizeHandle
                    columnId={columnId}
                    width={columnWidths[columnId]}
                    onResize={commands.onResizeColumn}
                  />
                ) : null}
              </DbDraggableTh>
            )
          })}
        </tr>
      </thead>
      <tbody>
        {rows.map((primer) => {
          const selected = selectedKeys.includes(primer.key)
          const dragPrimers = selected
            ? rows.filter((candidate) => selectedKeys.includes(candidate.key))
            : [primer]
          return (
            <tr
              key={primer.key}
              className={selected ? 'is-selected' : ''}
              draggable
              onDragStart={(event) => {
                const primers = dragPrimers.map((candidate) => ({
                  name: candidate.name,
                  sequence: candidate.sequence,
                  color: candidate.color,
                }))
                event.dataTransfer.setData(DATABASE_PRIMERS_DRAG_MIME, encodeDatabasePrimersDragPayload(primers))
                event.dataTransfer.effectAllowed = 'copy'
                commands.onDragPrimersToWorkspace?.(primers)
              }}
              onClick={(event) => commands.onSelectRow(primer.key, event)}
              onDoubleClick={() => commands.onOpenRow(primer.key)}
            >
              <td className="db-file-check-col" onClick={(event) => event.stopPropagation()}>
                <input
                  type="checkbox"
                  checked={selected}
                  onChange={(event) => commands.onToggleRowSelected(primer.key, event.target.checked)}
                  aria-label={`Select ${primer.name}`}
                />
              </td>
              {columnOrder.map((columnId) => {
                if (columnId === 'name') {
                  return (
                    <td key={columnId} className={dbFileColumnClassName(columnId)}>
                      <div className="db-file-name-cell">
                        <span className="db-primer-color" style={{ background: primer.color }} aria-hidden />
                        <strong className="db-file-name">{primer.name}</strong>
                      </div>
                    </td>
                  )
                }
                if (columnId === 'sequence') {
                  return (
                    <td
                      key={columnId}
                      className={`${dbFileColumnClassName(columnId)} db-file-ellipsis db-primer-sequence`}
                      title={primer.sequence}
                    >
                      {primer.sequence}
                    </td>
                  )
                }
                if (columnId === 'length') {
                  return (
                    <td key={columnId} className={`${dbFileColumnClassName(columnId)} db-primer-num`}>
                      {primer.sequence.length}
                    </td>
                  )
                }
                if (columnId === 'tm') {
                  return (
                    <td key={columnId} className={`${dbFileColumnClassName(columnId)} db-primer-num`}>
                      {formatPrimerOligoTm(primer.sequence)}
                    </td>
                  )
                }
                if (columnId === 'gc') {
                  return (
                    <td key={columnId} className={`${dbFileColumnClassName(columnId)} db-primer-num`}>
                      {formatPrimerGcPercent(primer.sequence)}
                    </td>
                  )
                }
                if (columnId === 'tags') {
                  return (
                    <td key={columnId} className={dbFileColumnClassName(columnId)}>
                      <div className="db-tag-chips">
                        {primer.tags.map((tag) => (
                          <button
                            key={tag}
                            type="button"
                            className="db-tag-chip"
                            onClick={(event) => {
                              event.stopPropagation()
                              commands.onBrowseTag(tag)
                            }}
                          >
                            {tag}
                          </button>
                        ))}
                      </div>
                    </td>
                  )
                }
                if (columnId === 'files') {
                  return (
                    <td
                      key={columnId}
                      className={`${dbFileColumnClassName(columnId)} db-file-ellipsis`}
                      title={primer.fileTitle}
                    >
                      {primer.fileLabel}
                    </td>
                  )
                }
                return (
                  <td
                    key={columnId}
                    className={`${dbFileColumnClassName(columnId)} db-file-row-actions`}
                    onClick={(event) => event.stopPropagation()}
                  >
                    <button type="button" onClick={() => commands.onOpenRow(primer.key)}>
                      Open
                    </button>
                  </td>
                )
              })}
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

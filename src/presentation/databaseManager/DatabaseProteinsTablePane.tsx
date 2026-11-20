import type { MouseEvent } from 'react'
import { dbFileColumnClassName } from '../../ui/mobileDenseTables'
import {
  DbColumnResizeHandle,
  DbDraggableTh,
  DbSortHeader,
} from './DbTableChrome'
import type { DatabaseManagerProteinsPaneModel, DatabaseManagerProteinSortColumn } from './databaseManagerTableTypes'
import type { DatabaseManagerProteinColumnId } from './types'

export type DatabaseProteinsTableCommands = {
  onToggleSelectAll: () => void
  onToggleRowSelected: (key: string, selected: boolean) => void
  onSelectRow: (key: string, event: MouseEvent) => void
  onOpenRow: (key: string) => void
  onCopyRowSequence: (key: string) => void
  onSort: (column: DatabaseManagerProteinSortColumn) => void
  onResizeColumn: (columnId: DatabaseManagerProteinColumnId, width: number) => void
  onReorderColumn: (toId: DatabaseManagerProteinColumnId) => void
  onReorderDragStart: (columnId: string | null) => void
  onReorderDragOver: (columnId: string | null) => void
  onReorderDragEnd: () => void
}

export type DatabaseProteinsTablePaneProps = {
  model: DatabaseManagerProteinsPaneModel
  commands: DatabaseProteinsTableCommands
}

export function DatabaseProteinsTablePane({ model, commands }: DatabaseProteinsTablePaneProps) {
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

  const sortLabels: Partial<Record<DatabaseManagerProteinSortColumn, string>> = {
    name: 'Name',
    sequence: 'Sequence',
    length: 'Length',
    mass: 'Mass',
    product: 'Product',
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
              aria-label="Select all proteins in this view"
            />
          </th>
          {columnOrder.map((columnId) => {
            const numClass = columnId === 'length' || columnId === 'mass' ? 'db-primer-num' : undefined
            return (
              <DbDraggableTh
                key={columnId}
                columnId={columnId}
                className={[numClass, dbFileColumnClassName(columnId)].filter(Boolean).join(' ')}
                dragColumnId={columnReorder.dragColumnId}
                dropTargetId={columnReorder.dropTargetId}
                onReorderDragStart={commands.onReorderDragStart}
                onReorderDragOver={commands.onReorderDragOver}
                onReorderDrop={(toId) => commands.onReorderColumn(toId as DatabaseManagerProteinColumnId)}
                onReorderDragEnd={commands.onReorderDragEnd}
              >
                {columnId === 'actions' ? (
                  <span className="db-col-header-label">Actions</span>
                ) : (
                  <DbSortHeader
                    label={sortLabels[columnId as DatabaseManagerProteinSortColumn] ?? columnId}
                    column={columnId}
                    activeColumn={sortColumn}
                    direction={sortDirection}
                    onSort={(col) => commands.onSort(col as DatabaseManagerProteinSortColumn)}
                  />
                )}
                <DbColumnResizeHandle
                  columnId={columnId}
                  width={columnWidths[columnId]}
                  onResize={commands.onResizeColumn}
                />
              </DbDraggableTh>
            )
          })}
        </tr>
      </thead>
      <tbody>
        {rows.map((protein) => {
          const selected = selectedKeys.includes(protein.key)
          return (
            <tr
              key={protein.key}
              className={selected ? 'is-selected' : ''}
              onClick={(event) => commands.onSelectRow(protein.key, event)}
              onDoubleClick={() => commands.onOpenRow(protein.key)}
            >
              <td className="db-file-check-col" onClick={(event) => event.stopPropagation()}>
                <input
                  type="checkbox"
                  checked={selected}
                  onChange={(event) => commands.onToggleRowSelected(protein.key, event.target.checked)}
                  aria-label={`Select ${protein.name}`}
                />
              </td>
              {columnOrder.map((columnId) => {
                if (columnId === 'name') {
                  return (
                    <td key={columnId} className={dbFileColumnClassName(columnId)}>
                      <div className="db-file-name-cell">
                        <span className="db-primer-color" style={{ background: protein.color }} aria-hidden />
                        <strong className="db-file-name">{protein.name}</strong>
                      </div>
                    </td>
                  )
                }
                if (columnId === 'sequence') {
                  return (
                    <td
                      key={columnId}
                      className={`${dbFileColumnClassName(columnId)} db-file-ellipsis db-primer-sequence`}
                      title={protein.sequence}
                    >
                      {protein.sequence}
                    </td>
                  )
                }
                if (columnId === 'length') {
                  return (
                    <td key={columnId} className={`${dbFileColumnClassName(columnId)} db-primer-num`}>
                      {protein.sequence.length}
                    </td>
                  )
                }
                if (columnId === 'mass') {
                  return (
                    <td key={columnId} className={`${dbFileColumnClassName(columnId)} db-primer-num`}>
                      {protein.massLabel}
                    </td>
                  )
                }
                if (columnId === 'product') {
                  return (
                    <td
                      key={columnId}
                      className={`${dbFileColumnClassName(columnId)} db-file-ellipsis`}
                      title={protein.product || undefined}
                    >
                      {protein.product || '—'}
                    </td>
                  )
                }
                if (columnId === 'files') {
                  return (
                    <td
                      key={columnId}
                      className={`${dbFileColumnClassName(columnId)} db-file-ellipsis`}
                      title={protein.fileTitle}
                    >
                      {protein.fileLabel}
                    </td>
                  )
                }
                return (
                  <td
                    key={columnId}
                    className={`${dbFileColumnClassName(columnId)} db-file-row-actions`}
                    onClick={(event) => event.stopPropagation()}
                  >
                    <button type="button" onClick={() => commands.onOpenRow(protein.key)}>
                      Open
                    </button>
                    <button type="button" onClick={() => commands.onCopyRowSequence(protein.key)}>
                      Copy
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

import { Fragment, type MouseEvent } from 'react'
import { ChevronDown, ChevronRight, Trash2 } from 'lucide-react'
import { dbFileColumnClassName } from '../../ui/mobileDenseTables'
import { DbRowExportMenu } from './DbExportMenus'
import {
  DbColumnResizeHandle,
  DbDraggableTh,
  DbSortHeader,
} from './DbTableChrome'
import type { DatabaseManagerFilesPaneModel, DatabaseManagerFileSortColumn } from './databaseManagerTableTypes'
import type { DatabaseManagerFileColumnId } from './types'
import type { DatabaseProjectExportFormat } from './types'
import { DATABASE_PROJECTS_DRAG_MIME, encodeDatabaseProjectsDragPayload } from '../../domain/databaseProjectDrag'

export type DatabaseFilesTableCommands = {
  onDragProjectsToWorkspace?: (projectIds: string[]) => void
  onToggleSelectAll: () => void
  onToggleRowSelected: (projectId: string, selected: boolean, replaceSelection?: boolean) => void
  onSelectProject: (projectId: string, event: MouseEvent) => void
  onProjectDoubleClick: (projectId: string) => void
  onToggleLibraryExpanded: (projectId: string) => void
  onBrowseTag: (tag: string) => void
  onRowPrimaryAction: (projectId: string) => void
  onTogglePickSelection: (projectId: string) => void
  onExportProject: (projectId: string, format: DatabaseProjectExportFormat) => void
  onDeleteProject: (projectId: string) => void
  onOpenLibraryMember: (projectId: string, memberId: string) => void
  onLibraryMemberDoubleClick: (projectId: string, memberId: string) => void
  onSort: (column: DatabaseManagerFileSortColumn) => void
  onResizeColumn: (columnId: DatabaseManagerFileColumnId, width: number) => void
  onReorderColumn: (toId: DatabaseManagerFileColumnId) => void
  onReorderDragStart: (columnId: string | null) => void
  onReorderDragOver: (columnId: string | null) => void
  onReorderDragEnd: () => void
  onStatus: (message: string) => void
}

export type DatabaseFilesTablePaneProps = {
  model: DatabaseManagerFilesPaneModel
  commands: DatabaseFilesTableCommands
}

export function DatabaseFilesTablePane({ model, commands }: DatabaseFilesTablePaneProps) {
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
    columnReorder,
    pickRowToggleMode,
    fileCheckboxReplaceSelection,
    showHeaderSelectAll,
  } = model

  if (empty) {
    return (
      <div className="db-file-empty-wrap">
        <p className="muted db-file-empty">{empty.message}</p>
        {empty.kind === 'empty' && empty.hint ? (
          <p className="muted db-file-drop-hint">{empty.hint}</p>
        ) : null}
      </div>
    )
  }

  const sortLabels: Partial<Record<DatabaseManagerFileSortColumn, string>> = {
    name: 'Name',
    format: 'Format',
    folder: 'Folder',
    tags: 'Tags',
    updated: 'Updated',
    size: 'Size',
    fileSize: 'File size',
  }

  return (
    <table className="db-file-table" style={{ width: Math.max(tableWidth, viewportWidth) }}>
      <colgroup>
        <col style={{ width: checkColWidth }} />
        {columnOrder.map((columnId) => (
          <col key={columnId} style={{ width: columnWidths[columnId] }} />
        ))}
      </colgroup>
      <thead>
        <tr>
          <th className="db-file-check-col">
            {showHeaderSelectAll ? (
              <input
                type="checkbox"
                checked={selection.allVisibleSelected}
                ref={(el) => {
                  if (el) el.indeterminate = selection.someVisibleSelected && !selection.allVisibleSelected
                }}
                onChange={commands.onToggleSelectAll}
                aria-label="Select all files in this view"
              />
            ) : null}
          </th>
          {columnOrder.map((columnId) => {
            return (
              <DbDraggableTh
                key={columnId}
                columnId={columnId}
                className={dbFileColumnClassName(columnId)}
                dragColumnId={columnReorder.dragColumnId}
                dropTargetId={columnReorder.dropTargetId}
                onReorderDragStart={commands.onReorderDragStart}
                onReorderDragOver={commands.onReorderDragOver}
                onReorderDrop={(toId) => commands.onReorderColumn(toId as DatabaseManagerFileColumnId)}
                onReorderDragEnd={commands.onReorderDragEnd}
              >
                {columnId === 'actions' ? (
                  <span className="db-col-header-label">Actions</span>
                ) : columnId === 'fileSize' ? (
                  <DbSortHeader
                    label="File size"
                    column={columnId}
                    activeColumn={sortColumn}
                    direction={sortDirection}
                    onSort={(col) => commands.onSort(col as DatabaseManagerFileSortColumn)}
                  />
                ) : (
                  <DbSortHeader
                    label={sortLabels[columnId as DatabaseManagerFileSortColumn] ?? columnId}
                    column={columnId}
                    activeColumn={sortColumn}
                    direction={sortDirection}
                    onSort={(col) => commands.onSort(col as DatabaseManagerFileSortColumn)}
                  />
                )}
                {columnId !== 'actions' ? (
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
        {rows.map((project) => (
          <Fragment key={project.id}>
            <tr
              data-db-project-id={project.id}
              draggable
              className={`${project.selected ? 'is-selected' : ''}${project.isCurrent ? ' is-current' : ''}${project.isLibrary ? ' is-library' : ''}`}
              onDragStart={(event) => {
                const projectIds = project.selected ? model.selectedIds : [project.id]
                event.dataTransfer.setData(DATABASE_PROJECTS_DRAG_MIME, encodeDatabaseProjectsDragPayload(projectIds))
                event.dataTransfer.effectAllowed = 'copy'
                commands.onDragProjectsToWorkspace?.(projectIds)
              }}
              onClick={(event) => commands.onSelectProject(project.id, event)}
              onDoubleClick={() => {
                window.getSelection()?.removeAllRanges()
                commands.onProjectDoubleClick(project.id)
              }}
            >
              <td className="db-file-check-col" onClick={(event) => event.stopPropagation()}>
                <input
                  type="checkbox"
                  checked={project.selected}
                  onChange={(event) =>
                    commands.onToggleRowSelected(
                      project.id,
                      event.target.checked,
                      fileCheckboxReplaceSelection,
                    )
                  }
                  aria-label={`Select ${project.constructName}`}
                />
              </td>
              {columnOrder.map((columnId) => {
                if (columnId === 'name') {
                  return (
                    <td key={columnId} className={dbFileColumnClassName(columnId)}>
                      <div className="db-file-name-cell">
                        {project.isLibrary ? (
                          <button
                            type="button"
                            className="db-tree-twistie db-library-expand"
                            aria-label={
                              project.libraryExpanded
                                ? `Collapse members of ${project.fileName}`
                                : `Expand members of ${project.fileName}`
                            }
                            aria-expanded={project.libraryExpanded}
                            onClick={(event) => {
                              event.stopPropagation()
                              commands.onToggleLibraryExpanded(project.id)
                            }}
                          >
                            {project.libraryExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                          </button>
                        ) : (
                          <span className="db-tree-twistie-spacer" aria-hidden />
                        )}
                        <div className="db-file-name-stack" title={project.fileName}>
                          <strong className="db-file-name">{project.fileName}</strong>
                          {project.showConstructName ? (
                            <span className="db-file-construct-name">Construct: {project.constructName}</span>
                          ) : null}
                        </div>
                        {project.isLibrary ? (
                          <span className="db-library-badge" title="DNA library">
                            library
                          </span>
                        ) : null}
                        {project.isCurrent ? <span className="db-current-badge">open</span> : null}
                      </div>
                    </td>
                  )
                }
                if (columnId === 'format') {
                  return (
                    <td key={columnId} className={`${dbFileColumnClassName(columnId)} db-file-ellipsis`}>
                      {project.formatLabel}
                    </td>
                  )
                }
                if (columnId === 'folder') {
                  return (
                    <td key={columnId} className={`${dbFileColumnClassName(columnId)} db-file-ellipsis`}>
                      {project.folderLabel}
                    </td>
                  )
                }
                if (columnId === 'tags') {
                  return (
                    <td key={columnId} className={dbFileColumnClassName(columnId)}>
                      <div className="db-tag-chips">
                        {project.tags.map((tag) => (
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
                if (columnId === 'updated') {
                  return (
                    <td key={columnId} className={`${dbFileColumnClassName(columnId)} db-file-ellipsis`}>
                      {project.updatedLabel}
                    </td>
                  )
                }
                if (columnId === 'size') {
                  return (
                    <td key={columnId} className={`${dbFileColumnClassName(columnId)} db-file-ellipsis`}>
                      {project.sequenceLengthLabel}
                    </td>
                  )
                }
                if (columnId === 'fileSize') {
                  return (
                    <td key={columnId} className={`${dbFileColumnClassName(columnId)} db-file-ellipsis`}>
                      {project.fileSizeLabel}
                    </td>
                  )
                }
                return (
                  <td
                    key={columnId}
                    className={`${dbFileColumnClassName(columnId)} db-file-row-actions`}
                    onClick={(event) => event.stopPropagation()}
                  >
                    <button
                      type="button"
                      disabled={project.rowActionDisabled}
                      onClick={() => {
                        if (pickRowToggleMode) {
                          commands.onTogglePickSelection(project.id)
                          return
                        }
                        commands.onRowPrimaryAction(project.id)
                      }}
                    >
                      {project.rowActionLabel}
                    </button>
                    <DbRowExportMenu
                      projectName={project.constructName}
                      onStatus={commands.onStatus}
                      onExport={async (format) => commands.onExportProject(project.id, format)}
                    />
                    <button
                      type="button"
                      className="danger-text"
                      aria-label={`Delete ${project.constructName}`}
                      onClick={() => commands.onDeleteProject(project.id)}
                    >
                      <Trash2 size={14} />
                    </button>
                  </td>
                )
              })}
            </tr>
            {project.libraryExpanded && project.libraryMembersLoading && !project.libraryMembers ? (
              <tr className="is-library-member is-library-member-status">
                <td />
                <td colSpan={Math.max(1, columnOrder.length)}>
                  <span className="muted db-library-member-status">Loading members…</span>
                </td>
              </tr>
            ) : null}
            {project.libraryExpanded && project.libraryMembers && project.libraryMembers.length === 0 ? (
              <tr className="is-library-member is-library-member-status">
                <td />
                <td colSpan={Math.max(1, columnOrder.length)}>
                  <span className="muted db-library-member-status">No members in this library.</span>
                </td>
              </tr>
            ) : null}
            {project.libraryExpanded &&
              project.libraryMembers?.map((member) => (
                <tr
                  key={`${project.id}:${member.id}`}
                  className={`is-library-member${member.parseError ? ' has-error' : ''}${member.enabled ? '' : ' is-disabled'}`}
                  onDoubleClick={() => {
                    window.getSelection()?.removeAllRanges()
                    commands.onLibraryMemberDoubleClick(project.id, member.id)
                  }}
                >
                  <td className="db-file-check-col" />
                  {columnOrder.map((columnId) => {
                    if (columnId === 'name') {
                      return (
                        <td key={columnId} className={dbFileColumnClassName(columnId)}>
                          <div className="db-file-name-cell db-library-member-name-cell">
                            <span className="db-tree-twistie-spacer" aria-hidden />
                            <strong className="db-file-name" title={member.fileName}>
                              {member.fileName}
                            </strong>
                            <span className="db-library-member-badge" title="Library member">
                              member
                            </span>
                            {member.parseError ? (
                              <span className="db-library-member-error" title={member.parseError}>
                                error
                              </span>
                            ) : null}
                          </div>
                        </td>
                      )
                    }
                    if (columnId === 'format') {
                      return (
                        <td key={columnId} className={`${dbFileColumnClassName(columnId)} db-file-ellipsis`}>
                          Member
                        </td>
                      )
                    }
                    if (columnId === 'folder') {
                      return (
                        <td
                          key={columnId}
                          className={`${dbFileColumnClassName(columnId)} db-file-ellipsis muted`}
                          title={member.parentFileName}
                        >
                          {member.parentFileName}
                        </td>
                      )
                    }
                    if (columnId === 'tags') {
                      return <td key={columnId} className={dbFileColumnClassName(columnId)} />
                    }
                    if (columnId === 'updated') {
                      return <td key={columnId} className={dbFileColumnClassName(columnId)} />
                    }
                    if (columnId === 'size') {
                      return (
                        <td key={columnId} className={`${dbFileColumnClassName(columnId)} db-file-ellipsis`}>
                          {member.sequenceLengthLabel}
                        </td>
                      )
                    }
                    if (columnId === 'fileSize') {
                      return <td key={columnId} className={dbFileColumnClassName(columnId)} />
                    }
                    return (
                      <td
                        key={columnId}
                        className={`${dbFileColumnClassName(columnId)} db-file-row-actions`}
                        onClick={(event) => event.stopPropagation()}
                      >
                        <button
                          type="button"
                          disabled={member.openDisabled}
                          title={member.openTitle}
                          onClick={() => commands.onOpenLibraryMember(project.id, member.id)}
                        >
                          Open
                        </button>
                      </td>
                    )
                  })}
                </tr>
              ))}
          </Fragment>
        ))}
      </tbody>
    </table>
  )
}

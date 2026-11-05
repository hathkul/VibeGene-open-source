import { useRef, type PointerEvent as ReactPointerEvent, type RefObject } from 'react'
import { AppWindow, ChevronDown, FlipHorizontal2, Plus, Trash2 } from 'lucide-react'
import { SEQUENCE_OPEN_ACCEPT } from '../../domain/fileFormats'
import { getLibraryReferenceMemberId, isLibraryConsensusEnabled } from '../../domain/libraryMemberFeatures'
import { LIBRARY_MEMBER_ROW_ATTR } from '../../domain/libraryMemberReorderDrag'
import type {
  LibraryMemberTabRow,
  LibraryMemberTabSortDirection,
  LibraryMemberTabSortMode,
} from '../../domain/libraryMemberTab'
import type { TraceFileRecord } from '../../domain/traceTypes'
import type { SequenceRecord } from '../../domain/types'
import type { MemberColumnId } from '../sequence'
import { MEMBER_COLUMN_ORDER } from './memberColumnModel'
import { WorkspaceFileInput } from '../workspace/WorkspaceFileInput'

const MEMBER_COLUMN_MIN_WIDTH: Record<MemberColumnId, number> = {
  ref: 36,
  on: 36,
  name: 72,
  length: 52,
  reads: 44,
  strand: 48,
  aligned: 56,
  mismatches: 64,
  features: 52,
  primers: 52,
  status: 72,
  actions: 96,
}

const MEMBER_COLUMN_HEADER: Record<
  MemberColumnId,
  { label: string; sort?: LibraryMemberTabSortMode; className?: string; title?: string }
> = {
  ref: { label: 'Ref', className: 'members-ref-col', title: 'Annotation reference (features/primers spread from here)' },
  on: { label: 'On', className: 'feature-visibility-col', title: 'Include in consensus / alignment' },
  name: { label: 'Member', className: 'enzyme-sortable-header feature-name-col', sort: 'name' },
  length: { label: 'Length', className: 'enzyme-sortable-header', sort: 'length' },
  reads: { label: 'Reads', className: 'enzyme-sortable-header', sort: 'reads' },
  strand: { label: 'Strand', className: 'enzyme-sortable-header', sort: 'orientation' },
  aligned: { label: 'Aligned' },
  mismatches: { label: 'Mismatches', className: 'enzyme-sortable-header', sort: 'mismatches' },
  features: { label: 'Features' },
  primers: { label: 'Primers' },
  status: { label: 'Status', className: 'enzyme-sortable-header feature-notes-col', sort: 'status' },
  actions: { label: 'Actions', className: 'members-actions-col' },
}

export function MemberTableSortHeader({
  label,
  mode,
  activeMode,
  direction,
  onSort,
}: {
  label: string
  mode: LibraryMemberTabSortMode
  activeMode: LibraryMemberTabSortMode
  direction: LibraryMemberTabSortDirection
  onSort: (mode: LibraryMemberTabSortMode) => void
}) {
  const isActive = activeMode === mode
  return (
    <button
      type="button"
      className={`enzyme-table-sort-header${isActive ? ' is-active' : ''}`}
      onClick={() => onSort(mode)}
      aria-sort={isActive ? (direction === 'asc' ? 'ascending' : 'descending') : 'none'}
    >
      <span>{label}</span>
      <span className="enzyme-table-sort-arrow" aria-hidden>
        {isActive ? (direction === 'asc' ? '▲' : '▼') : '▾'}
      </span>
    </button>
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

export function MemberColumnResizeHandle({
  columnId,
  width,
  onResize,
}: {
  columnId: MemberColumnId
  width: number
  onResize: (columnId: MemberColumnId, nextWidth: number) => void
}) {
  return (
    <ColumnResizeHandle
      columnId={columnId}
      width={width}
      minWidth={MEMBER_COLUMN_MIN_WIDTH[columnId]}
      onResize={onResize}
    />
  )
}

export type MembersTabPaneProps = {
  record: SequenceRecord
  traceFiles: readonly TraceFileRecord[]
  rows: LibraryMemberTabRow[]
  selection: {
    selectedMemberIds: readonly string[]
    selectedAlignmentTraceId: string | null
  }
  addMenu: {
    open: boolean
    busy: boolean
  }
  addMenuRef: RefObject<HTMLDivElement | null>
  reorder: {
    dropBeforeId: string | null | undefined
    sourceId: string | null
    dragActiveRef: RefObject<boolean>
  }
  nameEdit: {
    editingMemberId: string | null
    draft: string
  }
  columns: {
    widths: Record<MemberColumnId, number>
    minWidthPx: number
    sortMode: LibraryMemberTabSortMode
    sortDirection: LibraryMemberTabSortDirection
  }
  actions: {
    onToggleAddMenu: () => void
    onCloseAddMenu: () => void
    onAddMembersFromFiles: (files: FileList | File[]) => void
    onAddMembersFromDatabase: () => void
    onDeleteSelected: () => void
    onDeduplicate: () => void
    onSetAllEnabled: (enabled: boolean) => void
    onSelectAnnotationReference: (memberId: string | null) => void
    onSetConsensusEnabled: (enabled: boolean) => void
    onSetMemberEnabled: (memberId: string, enabled: boolean) => void
    onBeginReorderDrag: (memberId: string, event: ReactPointerEvent<HTMLTableRowElement>) => void
    onSelectRow: (
      memberId: string,
      event: { shiftKey: boolean; metaKey: boolean; ctrlKey: boolean },
      orderedMemberIds: readonly string[],
    ) => void
    onOpenMemberSequence: (memberId: string) => void
    onBeginNameEdit: (memberId: string, currentName: string) => void
    onCommitNameEdit: () => void
    onCancelNameEdit: () => void
    onNameDraftChange: (draft: string) => void
    onOpenMemberAsConstruct: (memberId: string) => void
    onFlipMember: (memberId: string) => void
    onRemoveMembers: (memberIds: string[]) => void
    onResizeColumn: (columnId: MemberColumnId, nextWidth: number) => void
    onSort: (mode: LibraryMemberTabSortMode) => void
  }
}

export function MembersTabPane({
  record,
  traceFiles,
  rows,
  selection,
  addMenu,
  addMenuRef,
  reorder,
  nameEdit,
  columns,
  actions,
}: MembersTabPaneProps) {
  const membersFileInputRef = useRef<HTMLInputElement | null>(null)
  return (
    <div className="tab-table-layout features-tab members-tab">
      <div className="features-tab-table-wrap">
        <div className="features-toolbar">
          <div
            ref={addMenuRef}
            className={`members-add-menu${addMenu.open ? ' is-open' : ''}`}
          >
            <button
              type="button"
              disabled={addMenu.busy}
              aria-haspopup="menu"
              aria-expanded={addMenu.open}
              onClick={actions.onToggleAddMenu}
            >
              <Plus size={16} /> {addMenu.busy ? 'Adding…' : 'Add members'}
              <ChevronDown size={14} aria-hidden="true" />
            </button>
            {addMenu.open ? (
              <div className="members-add-dropdown" role="menu">
                <button
                  type="button"
                  role="menuitem"
                  disabled={addMenu.busy}
                  onClick={() => {
                    actions.onCloseAddMenu()
                    membersFileInputRef.current?.click()
                  }}
                >
                  From files…
                </button>
                <button
                  type="button"
                  role="menuitem"
                  disabled={addMenu.busy}
                  onClick={() => {
                    actions.onCloseAddMenu()
                    actions.onAddMembersFromDatabase()
                  }}
                >
                  From Database…
                </button>
              </div>
            ) : null}
          </div>
          <WorkspaceFileInput
            inputRef={membersFileInputRef}
            accept={`.ab1,${SEQUENCE_OPEN_ACCEPT}`}
            multiple
            onFiles={actions.onAddMembersFromFiles}
          />
          <button
            type="button"
            className="danger"
            disabled={selection.selectedMemberIds.length === 0 && !selection.selectedAlignmentTraceId}
            onClick={actions.onDeleteSelected}
          >
            <Trash2 size={16} /> Delete
          </button>
          <button
            type="button"
            disabled={rows.length < 2}
            title="Find members with identical sequences and merge each group into one"
            onClick={actions.onDeduplicate}
          >
            Deduplicate
          </button>
          <button
            type="button"
            disabled={rows.length === 0}
            onClick={() => actions.onSetAllEnabled(true)}
          >
            Check all
          </button>
          <button
            type="button"
            disabled={rows.length === 0}
            onClick={() => actions.onSetAllEnabled(false)}
          >
            Uncheck all
          </button>
          <span className="members-toolbar-summary" title="Library member count">
            {rows.length.toLocaleString()} member{rows.length === 1 ? '' : 's'}
            {' · '}
            {rows.filter((row) => row.member.enabled).length.toLocaleString()} enabled
            {' · '}
            ref:{' '}
            {(() => {
              const refId = getLibraryReferenceMemberId(record)
              if (!refId) return 'consensus'
              return traceFiles.find((trace) => trace.id === refId)?.fileName ?? 'consensus'
            })()}
          </span>
        </div>
        <table
          className="data-table features-table members-table"
          style={{ minWidth: columns.minWidthPx }}
        >
          <colgroup>
            {MEMBER_COLUMN_ORDER.map((columnId) => (
              <col key={columnId} style={{ width: columns.widths[columnId] }} />
            ))}
          </colgroup>
          <thead>
            <tr>
              {MEMBER_COLUMN_ORDER.map((columnId) => {
                const header = MEMBER_COLUMN_HEADER[columnId]
                return (
                  <th
                    key={columnId}
                    className={header.className}
                    title={header.title}
                  >
                    {header.sort ? (
                      <MemberTableSortHeader
                        label={header.label}
                        mode={header.sort}
                        activeMode={columns.sortMode}
                        direction={columns.sortDirection}
                        onSort={actions.onSort}
                      />
                    ) : (
                      header.label
                    )}
                    <MemberColumnResizeHandle
                      columnId={columnId}
                      width={columns.widths[columnId]}
                      onResize={actions.onResizeColumn}
                    />
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {(() => {
              const libraryReferenceId = getLibraryReferenceMemberId(record)
              const consensusEnabled = isLibraryConsensusEnabled(record)
              return (
                <>
                  <tr className="members-consensus-row">
                    <td className="members-ref-col" onClick={(event) => event.stopPropagation()}>
                      <input
                        type="radio"
                        name="library-annotation-reference"
                        checked={!libraryReferenceId}
                        onChange={() => actions.onSelectAnnotationReference(null)}
                        aria-label="Use consensus as annotation reference"
                        title="Spread new features and primers from consensus"
                      />
                    </td>
                    <td className="feature-visibility-col" onClick={(event) => event.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={consensusEnabled}
                        onChange={(event) => actions.onSetConsensusEnabled(event.target.checked)}
                        aria-label="Show consensus in Sequence and Map browse"
                        title="Show consensus in Sequence and Map browse"
                      />
                    </td>
                    <td className="feature-name-col" title={record.name}>
                      <span className="members-consensus-label">Consensus</span>
                    </td>
                    <td>{record.sequence.length.toLocaleString()} bp</td>
                    <td>—</td>
                    <td>—</td>
                    <td>—</td>
                    <td>—</td>
                    <td>{record.features.length || '—'}</td>
                    <td>{record.primers.length || '—'}</td>
                    <td className="feature-notes-col">Annotation reference template</td>
                    <td className="members-actions-col" />
                  </tr>
                  {rows.length === 0 ? (
                    <tr>
                      <td colSpan={12} className="muted">
                        No library members yet. Add AB1, FASTA, GenBank, or .seq files.
                      </td>
                    </tr>
                  ) : (
                    rows.map((row) => {
                      const { member } = row
                      const isRowSelected =
                        selection.selectedMemberIds.includes(member.id)
                        || (selection.selectedMemberIds.length === 0 && selection.selectedAlignmentTraceId === member.id)
                      const dropBefore = reorder.dropBeforeId === member.id
                      return (
                        <tr
                          key={member.id}
                          {...{ [LIBRARY_MEMBER_ROW_ATTR]: member.id }}
                          className={[
                            isRowSelected ? 'selected-row' : '',
                            reorder.sourceId === member.id ? 'is-reorder-source' : '',
                            dropBefore ? 'is-drop-before' : '',
                            reorder.dropBeforeId === null
                              && rows[rows.length - 1]?.member.id === member.id
                              ? 'is-drop-after'
                              : '',
                          ].filter(Boolean).join(' ') || undefined}
                          onMouseDown={(event) => {
                            if (event.shiftKey || event.metaKey || event.ctrlKey) event.preventDefault()
                          }}
                          onPointerDown={(event) => actions.onBeginReorderDrag(member.id, event)}
                          onClick={(event) => {
                            if (reorder.dragActiveRef.current) {
                              reorder.dragActiveRef.current = false
                              event.preventDefault()
                              event.stopPropagation()
                              return
                            }
                            actions.onSelectRow(member.id, event, rows.map((row) => row.member.id))
                          }}
                          onDoubleClick={() => actions.onOpenMemberSequence(member.id)}
                        >
                          <td className="members-ref-col" onClick={(event) => event.stopPropagation()}>
                            <input
                              type="radio"
                              name="library-annotation-reference"
                              checked={libraryReferenceId === member.id}
                              onChange={() => actions.onSelectAnnotationReference(member.id)}
                              aria-label={`Use ${member.fileName} as annotation reference`}
                              title="Spread features and primers from this member"
                            />
                          </td>
                          <td className="feature-visibility-col" onClick={(event) => event.stopPropagation()}>
                            <input
                              type="checkbox"
                              checked={member.enabled}
                              onChange={(event) => actions.onSetMemberEnabled(member.id, event.target.checked)}
                              aria-label={`Include ${member.fileName} in consensus`}
                            />
                          </td>
                          <td className="feature-name-col" title={member.fileName}>
                            {nameEdit.editingMemberId === member.id ? (
                              <div className="members-name-edit">
                                <input
                                  className="members-name-input"
                                  size={1}
                                  value={nameEdit.draft}
                                  autoFocus
                                  aria-label={`Rename ${member.fileName}`}
                                  onClick={(event) => event.stopPropagation()}
                                  onDoubleClick={(event) => event.stopPropagation()}
                                  onChange={(event) => actions.onNameDraftChange(event.target.value)}
                                  onFocus={(event) => event.currentTarget.select()}
                                  onBlur={actions.onCommitNameEdit}
                                  onKeyDown={(event) => {
                                    if (event.key === 'Enter') {
                                      event.preventDefault()
                                      event.currentTarget.blur()
                                    } else if (event.key === 'Escape') {
                                      event.preventDefault()
                                      actions.onCancelNameEdit()
                                    }
                                  }}
                                />
                              </div>
                            ) : (
                              <button
                                type="button"
                                className="link-button feature-name-button"
                                title={`${member.fileName} — click to select, click again to rename`}
                                onClick={(event) => {
                                  event.stopPropagation()
                                  if (event.shiftKey || event.metaKey || event.ctrlKey) {
                                    actions.onSelectRow(member.id, event, rows.map((row) => row.member.id))
                                    return
                                  }
                                  const alreadyOnlySelected =
                                    selection.selectedMemberIds.length === 1
                                    && selection.selectedMemberIds[0] === member.id
                                  if (alreadyOnlySelected) {
                                    actions.onBeginNameEdit(member.id, member.fileName)
                                    return
                                  }
                                  actions.onSelectRow(member.id, event, rows.map((row) => row.member.id))
                                }}
                                onDoubleClick={(event) => event.stopPropagation()}
                              >
                                {member.fileName}
                              </button>
                            )}
                          </td>
                          <td>{row.lengthBp.toLocaleString()} bp</td>
                          <td>{row.readCount || '—'}</td>
                          <td>
                            {row.orientation ? (
                              <span className="common-feature-direction" aria-label={row.orientation}>
                                {row.orientation === 'reverse' ? '←' : '→'}
                              </span>
                            ) : (
                              '—'
                            )}
                          </td>
                          <td>{row.alignedSpan}</td>
                          <td>{row.mismatchCount ?? '—'}</td>
                          <td>{row.featureCount || '—'}</td>
                          <td>{row.primerCount || '—'}</td>
                          <td className="feature-notes-col" title={row.status}>{row.status}</td>
                          <td className="members-actions-col" onClick={(event) => event.stopPropagation()}>
                            <button
                              type="button"
                              className="link-button"
                              aria-label={`Open ${member.fileName} as a construct`}
                              title="Open as a single construct"
                              disabled={Boolean(member.parseError) || member.sequence.length === 0}
                              onClick={() => actions.onOpenMemberAsConstruct(member.id)}
                            >
                              <AppWindow size={14} />
                            </button>
                            <button
                              type="button"
                              className="link-button"
                              aria-label={`Flip ${member.fileName}`}
                              title="Reverse-complement this member and realign to consensus"
                              disabled={Boolean(member.parseError) || member.sequence.length === 0}
                              onClick={() => actions.onFlipMember(member.id)}
                            >
                              <FlipHorizontal2 size={14} />
                            </button>
                            <button
                              type="button"
                              className="link-button"
                              aria-label={`Delete ${member.fileName}`}
                              title="Delete member"
                              onClick={() => actions.onRemoveMembers([member.id])}
                            >
                              <Trash2 size={14} />
                            </button>
                          </td>
                        </tr>
                      )
                    })
                  )}
                </>
              )
            })()}
          </tbody>
        </table>
      </div>
    </div>
  )
}

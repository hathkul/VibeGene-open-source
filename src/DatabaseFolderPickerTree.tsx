import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, ChevronRight, Folder } from 'lucide-react'
import {
  buildFolderTree,
  folderPathLabel,
  type FolderTreeNode,
  type StoredFolder,
} from './storage/projectLibrary'
import {
  readDatabaseExpandedFolderIds,
  writeDatabaseExpandedFolderIds,
} from './storage/databaseUiPrefs'
import { revealedFolderIds } from './application/databaseManager/folderReveal'

function filterTreeExcluding(
  nodes: FolderTreeNode[],
  excludeIds: ReadonlySet<string>,
): FolderTreeNode[] {
  return nodes
    .filter((node) => !excludeIds.has(node.id))
    .map((node) => ({
      ...node,
      children: filterTreeExcluding(node.children, excludeIds),
    }))
}

function FolderPickRows({
  nodes,
  depth,
  selectedId,
  expandedIds,
  onSelect,
  onToggle,
}: {
  nodes: FolderTreeNode[]
  depth: number
  selectedId: string
  expandedIds: ReadonlySet<string>
  onSelect: (folderId: string) => void
  onToggle: (folderId: string) => void
}) {
  return (
    <>
      {nodes.map((node) => {
        const hasChildren = node.children.length > 0
        const expanded = expandedIds.has(node.id)
        return (
          <div key={node.id} className="db-tree-node">
            <div
              className={`db-tree-item${selectedId === node.id ? ' is-selected' : ''}`}
              data-folder-id={node.id}
              style={{ paddingLeft: 2 + depth * 12 }}
            >
              {hasChildren ? (
                <button
                  type="button"
                  className="db-tree-twistie"
                  aria-label={expanded ? `Collapse ${node.name}` : `Expand ${node.name}`}
                  aria-expanded={expanded}
                  onClick={(event) => {
                    event.stopPropagation()
                    onToggle(node.id)
                  }}
                >
                  {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                </button>
              ) : (
                <span className="db-tree-twistie-spacer" aria-hidden />
              )}
              <button type="button" className="db-tree-label" onClick={() => onSelect(node.id)}>
                <Folder size={14} />
                <span>{node.name}</span>
              </button>
            </div>
            {hasChildren && expanded ? (
              <FolderPickRows
                nodes={node.children}
                depth={depth + 1}
                selectedId={selectedId}
                expandedIds={expandedIds}
                onSelect={onSelect}
                onToggle={onToggle}
              />
            ) : null}
          </div>
        )
      })}
    </>
  )
}

export type DatabaseFolderPickerRootOption = {
  /** Synthetic id for the non-folder root choice (e.g. Unfiled or Root). */
  id: string
  label: string
}

/**
 * Collapsible folder tree matching Database sidebar expand/collapse prefs.
 * `selectedId` is either `rootOption.id` or a real folder id.
 */
type DatabaseFolderPickerTreeProps = {
  folders: readonly StoredFolder[]
  selectedId: string
  onSelect: (id: string) => void
  rootOption: DatabaseFolderPickerRootOption
  /** Extra synthetic roots under the primary root (e.g. Unfiled). */
  secondaryRoots?: readonly DatabaseFolderPickerRootOption[]
  /** Hide these folders (and do not show them as destinations). */
  excludeFolderIds?: ReadonlySet<string>
  /** Expand ancestors so this folder (if present) is visible. */
  revealFolderId?: string | null
  /** When false, omit the path summary under the tree. */
  showSelectionLabel?: boolean
  selectionLabelPrefix?: string
  className?: string
}

export function DatabaseFolderPickerTree(props: DatabaseFolderPickerTreeProps) {
  const expansionKey = [
    props.revealFolderId ?? 'database-folder-picker-no-reveal',
    props.folders.map((folder) => `${folder.id}:${folder.parentId ?? ''}`).join(','),
    [...(props.excludeFolderIds ?? [])].sort().join(','),
  ].join('|')
  return <DatabaseFolderPickerTreeContent key={expansionKey} {...props} />
}

function DatabaseFolderPickerTreeContent({
  folders,
  selectedId,
  onSelect,
  rootOption,
  secondaryRoots,
  excludeFolderIds,
  revealFolderId,
  showSelectionLabel = true,
  selectionLabelPrefix = 'Destination',
  className,
}: DatabaseFolderPickerTreeProps) {
  const [expandedFolderIds, setExpandedFolderIds] = useState<Set<string>>(
    () => revealedFolderIds(folders, readDatabaseExpandedFolderIds(), revealFolderId, excludeFolderIds),
  )
  useEffect(() => {
    writeDatabaseExpandedFolderIds(expandedFolderIds)
  }, [expandedFolderIds])

  const tree = useMemo(() => {
    const full = buildFolderTree([...folders])
    return excludeFolderIds?.size ? filterTreeExcluding(full, excludeFolderIds) : full
  }, [folders, excludeFolderIds])

  const treeRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    if (!revealFolderId) return
    const frame = window.requestAnimationFrame(() => {
      const row = [...(treeRef.current?.querySelectorAll<HTMLElement>('[data-folder-id]') ?? [])]
        .find((candidate) => candidate.dataset.folderId === revealFolderId)
      row?.scrollIntoView({ block: 'nearest' })
    })
    return () => window.cancelAnimationFrame(frame)
  }, [revealFolderId, tree])

  const destinationLabel = (() => {
    if (selectedId === rootOption.id) return rootOption.label
    const secondary = secondaryRoots?.find((root) => root.id === selectedId)
    if (secondary) return secondary.label
    return folderPathLabel([...folders], selectedId)
  })()

  function toggleFolderExpanded(folderId: string) {
    setExpandedFolderIds((current) => {
      const next = new Set(current)
      if (next.has(folderId)) next.delete(folderId)
      else next.add(folderId)
      return next
    })
  }

  return (
    <>
      <div
        ref={treeRef}
        className={className ?? 'save-to-database-tree'}
        role="listbox"
        aria-label="Database folders"
      >
        <button
          type="button"
          className={`db-tree-item${selectedId === rootOption.id ? ' is-selected' : ''}`}
          onClick={() => onSelect(rootOption.id)}
        >
          <span className="db-tree-twistie-spacer" aria-hidden />
          <Folder size={14} />
          <span>{rootOption.label}</span>
        </button>
        {secondaryRoots?.map((root) => (
          <button
            key={root.id}
            type="button"
            className={`db-tree-item${selectedId === root.id ? ' is-selected' : ''}`}
            onClick={() => onSelect(root.id)}
          >
            <span className="db-tree-twistie-spacer" aria-hidden />
            <Folder size={14} />
            <span>{root.label}</span>
          </button>
        ))}
        <FolderPickRows
          nodes={tree}
          depth={0}
          selectedId={selectedId}
          expandedIds={expandedFolderIds}
          onSelect={onSelect}
          onToggle={toggleFolderExpanded}
        />
      </div>
      {showSelectionLabel ? (
        <p className="muted save-to-database-destination">
          {selectionLabelPrefix}: {destinationLabel}
        </p>
      ) : null}
    </>
  )
}

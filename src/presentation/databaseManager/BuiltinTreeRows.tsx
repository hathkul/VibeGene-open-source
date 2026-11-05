import { ChevronDown, ChevronRight, Folder } from 'lucide-react'
import type { DatabaseManagerBuiltinTreeNode } from './types'

export function BuiltinTreeRows({
  nodes,
  depth,
  selectedGroupId,
  expandedIds,
  onSelect,
  onToggle,
}: {
  nodes: DatabaseManagerBuiltinTreeNode[]
  depth: number
  selectedGroupId: string | null
  expandedIds: ReadonlySet<string>
  onSelect: (groupId: string) => void
  onToggle: (groupId: string) => void
}) {
  return (
    <>
      {nodes.map((node) => {
        const hasChildren = node.children.length > 0
        const expanded = expandedIds.has(node.id)
        return (
          <div key={node.id} className="db-tree-node">
            <div
              className={`db-tree-item${selectedGroupId === node.id ? ' is-selected' : ''}`}
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
            {hasChildren && expanded && (
              <BuiltinTreeRows
                nodes={node.children}
                depth={depth + 1}
                selectedGroupId={selectedGroupId}
                expandedIds={expandedIds}
                onSelect={onSelect}
                onToggle={onToggle}
              />
            )}
          </div>
        )
      })}
    </>
  )
}

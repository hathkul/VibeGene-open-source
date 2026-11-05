import { Database, Tag } from 'lucide-react'
import { allBrowseLabel } from '../../application/databaseManager/browsePresentation'
import { builtInGroupTitle } from '../../domain/builtInPlasmids'
import type { DatabaseManagerBrowseState } from './databaseManagerTableTypes'
import type { DatabaseManagerViewMode } from './types'

export type DatabaseManagerHeaderModel = {
  title: string
  browse: DatabaseManagerBrowseState
  browsePathLabel: string
  viewMode: DatabaseManagerViewMode
  itemCount: number
  selectedCount: number
  busy: boolean
  headerStatus: string | null
}

export type DatabaseManagerHeaderCommands = {
  onClose: () => void
  onClearIdleHeaderStatus: () => void
}

export type DatabaseManagerHeaderProps = {
  model: DatabaseManagerHeaderModel
  commands: DatabaseManagerHeaderCommands
}

export function DatabaseManagerHeader({ model, commands }: DatabaseManagerHeaderProps) {
  const { title, browse, browsePathLabel, viewMode, itemCount, selectedCount, busy, headerStatus } = model
  return (
    <header className="db-manager-header">
      <div className="db-manager-header-main">
        <h3>
          <Database size={16} /> {title}
        </h3>
        <div className="db-manager-context" title={browsePathLabel}>
          <span className="db-manager-path">
            {browse.kind === 'all' && allBrowseLabel(viewMode)}
            {browse.kind === 'unfiled' && 'Unfiled'}
            {browse.kind === 'common' && 'Common primers'}
            {browse.kind === 'builtin' && builtInGroupTitle(browse.group)}
            {browse.kind === 'folder' && browsePathLabel}
            {browse.kind === 'tag' && (
              <>
                <Tag size={14} /> {browse.tag}
              </>
            )}
          </span>
          <span className="muted">({itemCount})</span>
          {selectedCount > 0 && (
            <span className="muted db-selection-count">{selectedCount} selected</span>
          )}
        </div>
        {(busy || headerStatus) && (
          <span
            className={`db-manager-activity-status${busy ? ' is-busy' : ''}`}
            title={headerStatus ?? 'Working...'}
          >
            {headerStatus ?? 'Working...'}
          </span>
        )}
      </div>
      <button type="button" className="db-manager-close" onClick={commands.onClose} aria-label="Close">
        ×
      </button>
    </header>
  )
}

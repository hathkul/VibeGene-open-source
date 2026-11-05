import { BookOpen, Clipboard, Dna, FolderOpen, Scissors, Search, Users } from 'lucide-react'
import type { MoleculeWorkspaceTab } from '../../domain/moleculeCapabilities'
import type { WorkspaceTabBarModel } from './workspaceTabBarViewModel'

export type WorkspaceTabBarCommands = {
  onSelectTab: (tab: MoleculeWorkspaceTab) => void
  onToggleMobileSearch: () => void
  onSearchQueryChange: (query: string) => void
  onPreviousSearchHit: () => void
  onNextSearchHit: () => void
  onDescriptionPanelVisibleChange: (visible: boolean) => void
}

export type WorkspaceTabBarProps = {
  model: WorkspaceTabBarModel
  commands: WorkspaceTabBarCommands
}

function tabIcon(tab: MoleculeWorkspaceTab) {
  if (tab === 'Map') return <Dna size={15} />
  if (tab === 'Sequence') return <BookOpen size={15} />
  if (tab === 'Members') return <Users size={15} />
  if (tab === 'Properties') return <Clipboard size={15} />
  if (tab === 'Enzymes') return <Scissors size={15} />
  if (tab === 'Features') return <Clipboard size={15} />
  if (tab === 'Primers') return <Dna size={15} />
  if (tab === 'History') return <FolderOpen size={15} />
  return null
}

export function WorkspaceTabBar({ model, commands }: WorkspaceTabBarProps) {
  return (
    <div className="tab-bar">
      <div className="tab-bar-tabs">
        {model.tabs.map((tab) => (
          <button
            type="button"
            key={tab}
            className={model.activeTab === tab ? 'active' : ''}
            onClick={() => commands.onSelectTab(tab)}
          >
            {tabIcon(tab)}
            {tab}
          </button>
        ))}
      </div>
      {model.showSearch ? (
        <>
          <button
            type="button"
            className={`mobile-search-toggle${model.mobileSearchOpen ? ' is-active' : ''}`}
            aria-label={`${model.mobileSearchOpen ? 'Close' : 'Open'} sequence search`}
            aria-controls="tab-bar-search-panel"
            aria-expanded={model.mobileSearchOpen}
            onClick={commands.onToggleMobileSearch}
          >
            <Search aria-hidden="true" />
          </button>
          <div
            id="tab-bar-search-panel"
            className={`inline-search tab-bar-search${model.mobileSearchOpen ? ' is-open' : ''}`}
          >
            <Search size={15} />
            <input
              value={model.searchQuery}
              onChange={(event) => commands.onSearchQueryChange(event.target.value)}
              placeholder={model.searchPlaceholder}
            />
            <span>
              {model.searchHitCountLabel}
              {model.searchHitPositionLabel}
            </span>
            {model.showSearchNavigation ? (
              <>
                <button
                  type="button"
                  className="document-header-search-nav"
                  disabled={model.searchNavDisabled}
                  onClick={commands.onPreviousSearchHit}
                  aria-label="Previous search hit"
                >
                  Previous
                </button>
                <button
                  type="button"
                  className="document-header-search-nav"
                  disabled={model.searchNavDisabled}
                  onClick={commands.onNextSearchHit}
                  aria-label="Next search hit"
                >
                  Next
                </button>
              </>
            ) : null}
          </div>
        </>
      ) : null}
      {model.showDescriptionPanelToggle && (
        <label className="description-panel-toggle">
          <input
            type="checkbox"
            checked={model.descriptionPanelVisible}
            onChange={(event) => commands.onDescriptionPanelVisibleChange(event.target.checked)}
          />
          Description Panel
        </label>
      )}
    </div>
  )
}

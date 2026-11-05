import type { OpenTabSummary, SharedFragment } from '../crossTab/types'
import { formatSequenceLength } from '../domain/moleculeCapabilities'

type OtherOpenTabsPanelProps = {
  otherTabs: OpenTabSummary[]
  pendingFragment: SharedFragment | null
  canInsertFragment: boolean
  canShareSelection: boolean
  onShareSelection: () => void
  onLoadOpenTab: (tabId: string) => void
  onUnloadOpenTab: (tabId: string) => void
  onUnloadOrphanedTabs: () => void
  onInsertFragment: () => void
  onDismissFragment: () => void
}

export function OtherOpenTabsPanel({
  otherTabs,
  pendingFragment,
  canInsertFragment,
  canShareSelection,
  onShareSelection,
  onLoadOpenTab,
  onUnloadOpenTab,
  onUnloadOrphanedTabs,
  onInsertFragment,
  onDismissFragment,
}: OtherOpenTabsPanelProps) {
  const orphanCount = otherTabs.filter((tab) => tab.stale).length

  return (
    <div className="panel-section other-open-tabs-panel">
      <h3>Other Open Tabs</h3>
      <p className="muted other-open-tabs-note">
        Vibegene tabs on this site share a local cache. Share a selection from this tab, or load a construct that is
        open elsewhere. Entries marked orphaned are leftovers from tabs that closed without cleanup.
      </p>
      <div className="other-open-tabs-actions">
        {canShareSelection && (
          <button type="button" onClick={onShareSelection}>
            Share selection to other tabs
          </button>
        )}
        {orphanCount > 0 && (
          <button type="button" className="danger-text" onClick={onUnloadOrphanedTabs}>
            Unload orphaned ({orphanCount})
          </button>
        )}
        {otherTabs.length > 0 && orphanCount === 0 && (
          <button type="button" className="danger-text" onClick={onUnloadOrphanedTabs}>
            Unload all listed
          </button>
        )}
      </div>
      {pendingFragment && (
        <div className="shared-fragment-banner">
          <strong>
            Fragment from {pendingFragment.fromRecordName} ({pendingFragment.sequence.length.toLocaleString()} bp)
          </strong>
          <div className="shared-fragment-actions">
            <button type="button" className="primary" disabled={!canInsertFragment} onClick={onInsertFragment}>
              Insert at selection
            </button>
            <button type="button" onClick={onDismissFragment}>
              Dismiss
            </button>
          </div>
          {!canInsertFragment && (
            <small>Select a range in the Sequence tab to choose where the fragment should be inserted.</small>
          )}
        </div>
      )}
      {otherTabs.length === 0 ? (
        <p className="muted">No other Vibegene tabs are open right now.</p>
      ) : (
        <div className="other-open-tabs-list">
          {otherTabs.map((tab) => (
            <div className={`other-open-tab-row${tab.stale ? ' is-orphaned' : ''}`} key={tab.tabId}>
              <button type="button" onClick={() => onLoadOpenTab(tab.tabId)}>
                {tab.name}
                {tab.stale ? ' (orphaned)' : ''}
                <span>
                  {formatSequenceLength(tab.sequenceLength, tab.molecule)} — {new Date(tab.updatedAt).toLocaleString()}
                </span>
              </button>
              <button
                type="button"
                className="icon-button danger"
                aria-label={`Unload ${tab.name}`}
                title="Unload from shared cache"
                onClick={() => onUnloadOpenTab(tab.tabId)}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

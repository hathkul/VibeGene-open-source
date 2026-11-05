import { Database } from 'lucide-react'
import type { DatabaseExitSyncProgress } from '../../application/ports/lifecycle'

export function DatabaseExitSyncOverlay({ progress }: { progress: DatabaseExitSyncProgress }) {
  const hasItemProgress = progress.phase === 'syncing' && progress.total > 0
  const folderName = progress.folderPath.split(/[\\/]/).filter(Boolean).at(-1)
  const status =
    progress.phase === 'preparing'
      ? 'Preparing database sync…'
      : progress.phase === 'scanning'
        ? 'Scanning mapped folder…'
        : progress.itemName === 'done'
          ? 'Finishing folder…'
          : `Processing ${Math.min(progress.done, progress.total)} of ${progress.total}`

  return (
    <div className="database-exit-sync-backdrop">
      <section
        className="database-exit-sync-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="database-exit-sync-title"
        aria-describedby="database-exit-sync-description"
      >
        <div className="database-exit-sync-heading">
          <Database aria-hidden="true" size={24} />
          <div>
            <h2 id="database-exit-sync-title">Finishing database sync</h2>
            <p id="database-exit-sync-description">
              VibeGene is saving mapped database folders before closing.
            </p>
          </div>
        </div>
        {progress.folderTotal > 0 && (
          <div className="database-exit-sync-folder">
            <span>Folder {progress.folderIndex} of {progress.folderTotal}</span>
            {folderName && <strong title={progress.folderPath}>{folderName}</strong>}
          </div>
        )}
        <progress
          className="database-exit-sync-progress"
          max={hasItemProgress ? progress.total : undefined}
          value={hasItemProgress ? Math.min(progress.done, progress.total) : undefined}
          aria-label={status}
        />
        <div className="database-exit-sync-status" role="status" aria-live="polite">
          <span>{status}</span>
          {hasItemProgress && progress.itemName !== 'done' && (
            <small title={progress.itemName}>{progress.itemName}</small>
          )}
        </div>
        <p className="database-exit-sync-note">Please keep the app open. It will close automatically.</p>
      </section>
    </div>
  )
}

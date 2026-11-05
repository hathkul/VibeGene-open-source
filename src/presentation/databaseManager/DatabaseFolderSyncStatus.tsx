import { FolderSync } from 'lucide-react'

export type DatabaseFolderSyncTombstoneRow = {
  id: string
  relativePath: string
}

export type DatabaseFolderSyncStatusModel = {
  loading: boolean
  mapping: {
    externalPath: string
    lastSyncedAt: number | string | null | undefined
  } | null
  selectedFolderIsTopLevel: boolean
  topLevelFolderName: string
  tombstones: DatabaseFolderSyncTombstoneRow[]
  busy: boolean
}

export type DatabaseFolderSyncStatusCommands = {
  onRestoreTombstone: (tombstoneId: string) => void
}

export type DatabaseFolderSyncStatusProps = {
  model: DatabaseFolderSyncStatusModel
  commands: DatabaseFolderSyncStatusCommands
}

export function DatabaseFolderSyncStatus({ model, commands }: DatabaseFolderSyncStatusProps) {
  const {
    loading,
    mapping,
    selectedFolderIsTopLevel,
    topLevelFolderName,
    tombstones,
    busy,
  } = model
  return (
    <div className={`db-folder-sync-status${mapping ? '' : ' is-missing'}`}>
      <div className="db-folder-sync-source">
        <FolderSync size={14} aria-hidden />
        {loading ? (
          <span>Loading source mapping…</span>
        ) : mapping ? (
          <>
            <span className="db-folder-sync-label">
              {selectedFolderIsTopLevel
                ? 'Source folder'
                : `Inherited source from ${topLevelFolderName}`}
            </span>
            <span className="db-folder-sync-path" title={mapping.externalPath}>
              {mapping.externalPath}
            </span>
            <span className="db-folder-sync-last">
              {mapping.lastSyncedAt
                ? `Last synced ${new Date(mapping.lastSyncedAt).toLocaleString()}`
                : 'Not synced yet'}
            </span>
          </>
        ) : (
          <span>
            {selectedFolderIsTopLevel
              ? 'No source folder set. Use “Set source folder” before syncing.'
              : `No source is set on top-level folder “${topLevelFolderName}”. Select it to set a source.`}
          </span>
        )}
      </div>
      {mapping && selectedFolderIsTopLevel && tombstones.length > 0 ? (
        <details className="db-folder-sync-ignored">
          <summary>Ignored deleted files ({tombstones.length})</summary>
          <p>
            These source files are tombstoned after database deletion. Restore only makes a file eligible for the next inbound sync; it does not import it now.
          </p>
          <ul>
            {tombstones.map((tombstone) => (
              <li key={tombstone.id}>
                <span title={tombstone.relativePath}>{tombstone.relativePath}</span>
                <button
                  type="button"
                  disabled={busy}
                  aria-label={`Restore ${tombstone.relativePath} for the next inbound sync`}
                  onClick={() => commands.onRestoreTombstone(tombstone.id)}
                >
                  Restore
                </button>
              </li>
            ))}
          </ul>
        </details>
      ) : mapping && selectedFolderIsTopLevel ? (
        <span className="db-folder-sync-none">Ignored deleted files: 0</span>
      ) : null}
    </div>
  )
}

import { useEffect, useRef, useState } from 'react'
import { FolderPlus } from 'lucide-react'
import {
  UNFILED_FOLDER_ID,
  createFolder,
  listFolders,
  type StoredFolder,
} from './storage/projectLibrary'
import { DatabaseFolderPickerTree } from './DatabaseFolderPickerTree'

export function SaveToDatabaseDialog({
  recordName,
  initialFileName,
  title = 'Save to database',
  confirmLabel = 'Save',
  status = '',
  initialFolderId = null,
  allowCreateFolder = false,
  busy = false,
  onCancel,
  onConfirm,
}: {
  recordName: string
  /** Suggested Database file basename (with extension). */
  initialFileName: string
  title?: string
  confirmLabel?: string
  status?: string
  /** Current / suggested folder (`null` = Unfiled). */
  initialFolderId?: string | null
  allowCreateFolder?: boolean
  busy?: boolean
  onCancel: () => void
  onConfirm: (folderId: string | null, fileName: string) => void | Promise<void>
}) {
  const [folders, setFolders] = useState<StoredFolder[]>([])
  const [selectedId, setSelectedId] = useState<string>(
    () => initialFolderId ?? UNFILED_FOLDER_ID,
  )
  const [fileNameDraft, setFileNameDraft] = useState(() => ({ source: initialFileName, value: initialFileName }))
  const fileName = fileNameDraft.source === initialFileName ? fileNameDraft.value : initialFileName
  const [loading, setLoading] = useState(true)
  const [creatingFolder, setCreatingFolder] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')
  const [folderError, setFolderError] = useState('')
  const fileNameRef = useRef<HTMLInputElement | null>(null)

  async function handleCreateFolder() {
    const name = newFolderName.trim()
    if (!name) {
      setFolderError('Enter a folder name.')
      return
    }
    setCreatingFolder(true)
    setFolderError('')
    try {
      const parentId = selectedId === UNFILED_FOLDER_ID ? null : selectedId
      const folder = await createFolder(name, parentId)
      setFolders(await listFolders())
      setSelectedId(folder.id)
      setNewFolderName('')
    } catch (error) {
      setFolderError(error instanceof Error ? error.message : String(error))
    } finally {
      setCreatingFolder(false)
    }
  }

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const next = await listFolders()
      if (cancelled) return
      setFolders(next)
      setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    const input = fileNameRef.current
    if (!input) return
    input.focus()
    const dot = input.value.lastIndexOf('.')
    if (dot > 0) input.setSelectionRange(0, dot)
    else input.select()
  }, [])

  const canSave = Boolean(fileName.trim()) && !busy && !loading

  return (
    <div className="translation-dialog-backdrop" role="presentation" onPointerDown={onCancel}>
      <div
        className="translation-dialog save-to-database-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="save-to-database-title"
        onPointerDown={(event) => event.stopPropagation()}
      >
        <h3 id="save-to-database-title">{title}</h3>
        <p className="muted save-to-database-message">
          Choose a file name and folder for <strong>{recordName}</strong>.
        </p>
        <label className="save-to-database-filename">
          <span>File name</span>
          <input
            ref={fileNameRef}
            value={fileName}
            disabled={busy || loading}
            onChange={(event) => setFileNameDraft({ source: initialFileName, value: event.target.value })}
            onKeyDown={(event) => {
              if (event.key !== 'Enter' || !canSave) return
              event.preventDefault()
              const folderId = selectedId === UNFILED_FOLDER_ID ? null : selectedId
              void Promise.resolve(onConfirm(folderId, fileName.trim())).catch(() => undefined)
            }}
          />
        </label>
        {allowCreateFolder && (
          <div className="save-to-database-folder-tools">
            <label>
              <span>New folder</span>
              <input
                value={newFolderName}
                disabled={busy || loading || creatingFolder}
                placeholder="Folder name"
                onChange={(event) => {
                  setNewFolderName(event.target.value)
                  setFolderError('')
                }}
                onKeyDown={(event) => {
                  if (event.key !== 'Enter') return
                  event.preventDefault()
                  void handleCreateFolder()
                }}
              />
            </label>
            <button
              type="button"
              disabled={busy || loading || creatingFolder || !newFolderName.trim()}
              onClick={() => void handleCreateFolder()}
            >
              <FolderPlus size={14} aria-hidden="true" /> Create
            </button>
          </div>
        )}
        {folderError && <p className="mass-insert-dialog-status is-error" role="alert">{folderError}</p>}
        {loading ? (
          <p className="muted">Loading folders…</p>
        ) : (
          <DatabaseFolderPickerTree
            folders={folders}
            selectedId={selectedId}
            onSelect={setSelectedId}
            rootOption={{ id: UNFILED_FOLDER_ID, label: 'Unfiled' }}
            revealFolderId={selectedId === UNFILED_FOLDER_ID ? null : selectedId}
          />
        )}
        {status && <p className="mass-insert-dialog-status" role="status">{status}</p>}
        <div className="translation-dialog-footer">
          <div className="translation-actions">
            <button type="button" disabled={busy} onClick={onCancel}>
              Cancel
            </button>
            <button
              type="button"
              className="primary"
              disabled={!canSave}
              onClick={() => {
                const folderId = selectedId === UNFILED_FOLDER_ID ? null : selectedId
                void Promise.resolve(onConfirm(folderId, fileName.trim())).catch(() => undefined)
              }}
            >
              {confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

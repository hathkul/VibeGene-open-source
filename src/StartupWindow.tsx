import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import {
  ChevronRight,
  Clock3,
  Database,
  Dna,
  FileText,
  FlaskConical,
  FolderOpen,
  Plus,
  Scissors,
  Sparkles,
  X,
} from 'lucide-react'
import { NewDnaFileDialog } from './NewDnaFileDialog'
import { createSequenceRecordFromNewDnaFile, type NewDnaFileResult } from './domain/newDnaFile'
import { NewProteinFileDialog } from './NewProteinFileDialog'
import { createSequenceRecordFromNewProteinFile, type NewProteinFileResult } from './domain/newProteinFile'
import { SEQUENCE_OPEN_EXTENSIONS, isSequenceOpenFileName } from './domain/fileFormats'
import { createId } from './domain/sequence'
import type { SequenceRecord } from './domain/types'
import { databaseWorkspaceDocumentOrigin } from './domain/workspaceDocumentOrigin'
import { readAppPreferences } from './domain/appPreferences'
import { getProject, putHandoffRecord, type StoredProjectSummary } from './storage/projects'
import { deleteSessionDraft, getSessionDraft, listSessionDrafts } from './storage/sessionDraft'
import {
  listRecentFiles,
  removeRecentDatabaseProject,
  removeRecentLocalFile,
  touchRecentDatabaseProject,
  type RecentFileEntry,
} from './storage/recentFiles'
import { writeHandoffDocumentOrigin, writeHandoffFolderId } from './storage/libraryEvents'
import { openRecentLocalPath, readDroppedDesktopPaths, subscribeDesktopFileDrops, type OpenedDesktopFile } from './desktop/fileIo'
import { closeCurrentHybridWindow, createStandaloneAgaroseGelPayload, openOrFocusHybridWindow } from './desktop/hybridWindows'
import { isTauriRuntime } from './desktop/tauriRuntime'
import {
  scheduleDatabaseBackgroundSync,
} from './desktop/syncOnExit'
import { openWorkspaceWindow, openWorkspaceWindowWithHandoff } from './desktop/workspaceWindow'
import { putFileOpenHandoff } from './storage/fileOpenHandoff'
import { getColorScheme, subscribeColorScheme } from './domain/colorScheme'
import './StartupWindow.css'

type NewFileKind = 'dna' | 'protein' | null

function dateLabel(value: string): string {
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return ''
  const now = new Date()
  const sameDay = date.toDateString() === now.toDateString()
  return sameDay
    ? `Today, ${date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`
    : date.toLocaleDateString([], { month: 'short', day: 'numeric', year: date.getFullYear() === now.getFullYear() ? undefined : 'numeric' })
}

function pathDetail(path: string): string {
  const normalized = path.replace(/\\/g, '/')
  const parts = normalized.split('/')
  parts.pop()
  return parts.slice(-2).join('/') || 'Local file'
}

function moleculeDetail(project: StoredProjectSummary): string {
  const unit = project.molecule === 'protein' ? 'aa' : 'bp'
  const molecule = project.molecule === 'protein' ? 'Protein' : project.topology === 'circular' ? 'Circular DNA' : 'Linear DNA'
  return `${molecule} · ${project.sequenceLength.toLocaleString()} ${unit}`
}

async function openRecord(record: SequenceRecord, options?: {
  folderId?: string | null
  title?: string
  initiallyUnsaved?: boolean
  projectId?: string
}) {
  if (options?.projectId) {
    const { focusExistingWorkspaceDocument } = await import('./desktop/workspaceDocumentRegistry')
    if (await focusExistingWorkspaceDocument({ kind: 'database', projectId: options.projectId })) {
      return 'focused' as const
    }
  }
  const key = createId('hist')
  const documentOrigin = options?.projectId
    ? databaseWorkspaceDocumentOrigin(options.projectId, options.folderId)
    : undefined
  await putHandoffRecord(key, record, documentOrigin)
  if (options && 'folderId' in options) writeHandoffFolderId(key, options.folderId)
  if (documentOrigin) writeHandoffDocumentOrigin(key, documentOrigin)
  return openWorkspaceWindowWithHandoff(key, {
    title: options?.title ?? record.name,
    focus: true,
    initiallyUnsaved: options?.initiallyUnsaved,
    projectId: options?.projectId,
  })
}

export function StartupWindow() {
  const colorScheme = useSyncExternalStore(subscribeColorScheme, getColorScheme, () => 'beige')
  const [drafts, setDrafts] = useState<StoredProjectSummary[]>([])
  const [recents, setRecents] = useState<RecentFileEntry[]>(() =>
    listRecentFiles(readAppPreferences().maxRecentFiles),
  )
  const [loadingDrafts, setLoadingDrafts] = useState(true)
  const [busy, setBusy] = useState(false)
  const [dragActive, setDragActive] = useState(false)
  const [status, setStatus] = useState('')
  const [newFileKind, setNewFileKind] = useState<NewFileKind>(null)

  const recentRows = useMemo(() => recents.slice(0, 8), [recents])
  const draftRows = useMemo(() => drafts.slice(0, 8), [drafts])

  const refreshDrafts = useCallback(async () => {
    try {
      setDrafts(await listSessionDrafts())
    } finally {
      setLoadingDrafts(false)
    }
  }, [])

  useEffect(() => {
    void refreshDrafts()
  }, [refreshDrafts])

  // Recover durable outbox work left by a previous webview/process lifetime,
  // even when no editor change event occurs in this session.
  useEffect(() => {
    scheduleDatabaseBackgroundSync()
  }, [])

  const finish = useCallback(async () => {
    await closeCurrentHybridWindow('startup')
    // macOS retains this component while hidden and reuses it on Dock reopen.
    setBusy(false)
    setStatus('')
  }, [])

  // Open With / double-click launch: never keep the chooser beside the editor.
  useEffect(() => {
    let cancelled = false
    let unlisten: (() => void) | undefined
    void (async () => {
      if (!isTauriRuntime()) return
      try {
        const { invoke } = await import('@tauri-apps/api/core')
        const { listen } = await import('@tauri-apps/api/event')
        const active = await invoke<boolean>('document_open_launch_active')
        if (!cancelled && active) {
          await finish()
          return
        }
        const stop = await listen('vg-dismiss-startup', () => {
          if (!cancelled) void finish()
        })
        if (cancelled) stop()
        else unlisten = stop
      } catch {
        // Non-desktop or older shell — leave the chooser open.
      }
    })()
    return () => {
      cancelled = true
      unlisten?.()
    }
  }, [finish])

  const openDesktopFiles = useCallback(async (files: OpenedDesktopFile[]) => {
    const supported = files.filter((file) => isSequenceOpenFileName(file.name) || isSequenceOpenFileName(file.path))
    if (!supported.length) {
      setStatus('Drop or choose a supported DNA, protein, GenBank, FASTA, or VibeGene file.')
      setBusy(false)
      return
    }
    setBusy(true)
    setStatus(`Opening ${supported.length === 1 ? supported[0]!.name : `${supported.length} files`}…`)
    try {
      const { focusExistingWorkspaceDocument } = await import('./desktop/workspaceDocumentRegistry')
      let openedCount = 0
      let focusedCount = 0
      for (const [index, file] of supported.entries()) {
        if (file.path && (await focusExistingWorkspaceDocument({ kind: 'file', path: file.path }))) {
          focusedCount += 1
          continue
        }
        // Hand off already-read bytes (+ openPath fallback). Do not put large constructs
        // into the Database history table — that can stall IndexedDB and freeze boot.
        setStatus(`Opening ${file.name}…`)
        const key = createId('fopen')
        await putFileOpenHandoff(key, {
          path: file.path,
          name: file.name,
          bytes: file.bytes,
        })
        const opened = await openWorkspaceWindow({
          searchParams: {
            fileHandoff: key,
            ...(file.path ? { openPath: file.path } : {}),
          },
          title: `${file.name} — from disk`,
          focus: index === 0 && focusedCount === 0,
          documentKey: file.path ? { kind: 'file', path: file.path } : undefined,
        })
        if (!opened) throw new Error(`Could not open ${file.name}.`)
        if (opened === 'focused') focusedCount += 1
        else openedCount += 1
      }
      if (openedCount === 0 && focusedCount > 0) {
        setStatus(
          focusedCount === 1
            ? 'Brought the open file to the front.'
            : `Brought ${focusedCount} open files to the front.`,
        )
        setBusy(false)
        return
      }
      await finish()
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Could not open the selected file.')
      setBusy(false)
    }
  }, [finish])

  const openPaths = useCallback(async (paths: string[]) => {
    const supported = paths.filter(isSequenceOpenFileName)
    if (!supported.length) {
      setStatus('Drop or choose a supported DNA, protein, GenBank, FASTA, or VibeGene file.')
      setBusy(false)
      return
    }
    const files = await readDroppedDesktopPaths(supported)
    if (!files.length) {
      setStatus('Could not read the selected file.')
      setBusy(false)
      return
    }
    await openDesktopFiles(files)
  }, [openDesktopFiles])

  useEffect(() => {
    let cancelled = false
    let unlisten: (() => void) | undefined
    void subscribeDesktopFileDrops({
      onHoverChange: (active) => {
        if (!cancelled) setDragActive(active)
      },
      onFiles: (files) => {
        if (!cancelled) void openDesktopFiles(files)
      },
    }).then((stop) => {
      if (cancelled) stop()
      else unlisten = stop
    })
    return () => {
      cancelled = true
      unlisten?.()
    }
  }, [openDesktopFiles])

  const chooseFiles = useCallback(async () => {
    setStatus('')
    try {
      const { open } = await import('@tauri-apps/plugin-dialog')
      const selected = await open({
        title: 'Open sequence file',
        multiple: true,
        directory: false,
        filters: [
          {
            name: 'Sequence files',
            extensions: SEQUENCE_OPEN_EXTENSIONS.map((extension) => extension.slice(1)),
          },
          { name: 'All files', extensions: ['*'] },
        ],
      })
      if (!selected) return
      await openPaths(Array.isArray(selected) ? selected : [selected])
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Could not show the file picker.')
    }
  }, [openPaths])

  const openDraft = useCallback(async (summary: StoredProjectSummary) => {
    if (busy) return
    setBusy(true)
    setStatus(`Opening draft ${summary.name}…`)
    try {
      const draft = await getSessionDraft(summary.id)
      if (!draft) {
        await refreshDrafts()
        throw new Error('That draft is no longer available.')
      }
      if (!(await openRecord(draft.record, { title: summary.name, initiallyUnsaved: true }))) {
        throw new Error('Could not create a workspace window.')
      }
      await finish()
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Could not open the draft.')
      setBusy(false)
    }
  }, [busy, finish, refreshDrafts])

  const deleteDraft = useCallback(async (summary: StoredProjectSummary) => {
    if (busy) return
    try {
      await deleteSessionDraft(summary.id)
      setStatus(`Deleted draft ${summary.name}.`)
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Could not delete the draft.')
    }
    await refreshDrafts()
  }, [busy, refreshDrafts])

  const openRecent = useCallback(async (entry: RecentFileEntry) => {
    if (busy) return
    setBusy(true)
    setStatus(`Opening ${entry.name}…`)
    try {
      if (entry.kind === 'local') {
        const file = await openRecentLocalPath(entry.path)
        if (!file) {
          removeRecentLocalFile(entry.path)
          setRecents(listRecentFiles(readAppPreferences().maxRecentFiles))
          throw new Error(`Could not find “${entry.name}” at its previous location.`)
        }
        await openPaths([entry.path])
        return
      }
      const project = await getProject(entry.projectId)
      if (!project) {
        removeRecentDatabaseProject(entry.projectId)
        setRecents(listRecentFiles(readAppPreferences().maxRecentFiles))
        throw new Error(`“${entry.name}” is no longer in the Database.`)
      }
      touchRecentDatabaseProject(project.id, project.name)
      const opened = await openRecord(project.record, {
        folderId: project.folderId ?? null,
        title: project.name,
        projectId: project.id,
      })
      if (!opened) {
        throw new Error('Could not create a workspace window.')
      }
      if (opened === 'focused') {
        setStatus(`Brought “${project.name}” to the front.`)
        setBusy(false)
        return
      }
      await finish()
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Could not open the recent file.')
      setBusy(false)
    }
  }, [busy, finish, openPaths])

  const createNewRecord = useCallback(async (record: SequenceRecord) => {
    setBusy(true)
    setStatus(`Creating ${record.name}…`)
    try {
      if (!(await openRecord(record, { title: record.name, initiallyUnsaved: true }))) {
        throw new Error('Could not create a workspace window.')
      }
      await finish()
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Could not create the file.')
      setBusy(false)
    }
  }, [finish])

  const openDatabase = useCallback(async () => {
    if (busy) return
    setBusy(true)
    setStatus('Opening Database…')
    try {
      const opened = await openOrFocusHybridWindow('database', {
        currentRecordId: null,
        alignmentPick: null,
        constructPick: null,
        libraryMemberPick: null,
      })
      if (!opened) throw new Error('Could not open Database.')
      await finish()
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Could not open Database.')
      setBusy(false)
    }
  }, [busy, finish])

  const openEnzymeDatabase = useCallback(async () => {
    if (busy) return
    setStatus('Opening Enzyme Database…')
    try {
      const opened = await openOrFocusHybridWindow('enzyme-database', {
        initialEnzymeName: null,
      })
      if (!opened) throw new Error('Could not open Enzyme Database.')
      setStatus('')
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Could not open Enzyme Database.')
    }
  }, [busy])

  const openAgaroseGel = useCallback(async () => {
    if (busy) return
    setStatus('Opening gel simulator…')
    try {
      const opened = await openOrFocusHybridWindow(
        'agarose-gel',
        createStandaloneAgaroseGelPayload({ currentTabId: 'startup', currentSourceLabel: 'Startup' }),
      )
      if (!opened) throw new Error('Could not open the gel simulator.')
      setStatus('')
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Could not open the gel simulator.')
    }
  }, [busy])

  return (
    <main className={`startup-window${dragActive ? ' is-dragging' : ''}`}>
      <div className="startup-ambient startup-ambient-one" />
      <div className="startup-ambient startup-ambient-two" />

      <header className="startup-header">
        <img
          src={colorScheme === 'dark' ? '/vibegene-logo-splash-dark.png' : '/vibegene-logo-splash-bright.png'}
          alt="VibeGene"
          className="startup-logo"
          width="1692"
          height="352"
        />
        <p>What would you like to work on?</p>
      </header>

      <section className="startup-content">
        <div className="startup-actions" aria-label="Create or open">
          <article className="startup-action-card startup-new-card">
            <div className="startup-card-heading">
              <span className="startup-icon startup-icon-purple"><Plus aria-hidden="true" /></span>
              <div>
                <h2>New file</h2>
                <p>Start with a sequence</p>
              </div>
            </div>
            <div className="startup-new-options">
              <button type="button" disabled={busy} onClick={() => setNewFileKind('dna')}>
                <Dna aria-hidden="true" />
                <span><strong>DNA</strong><small>Linear or circular</small></span>
                <ChevronRight aria-hidden="true" />
              </button>
              <button type="button" disabled={busy} onClick={() => setNewFileKind('protein')}>
                <Sparkles aria-hidden="true" />
                <span><strong>Protein</strong><small>Amino-acid sequence</small></span>
                <ChevronRight aria-hidden="true" />
              </button>
            </div>
          </article>

          <button type="button" className="startup-action-card startup-open-card" disabled={busy} onClick={() => void chooseFiles()}>
            <span className="startup-icon startup-icon-blue"><FolderOpen aria-hidden="true" /></span>
            <span><strong>Open file</strong><small>From your computer</small></span>
            <ChevronRight aria-hidden="true" />
          </button>

          <button type="button" className="startup-action-card startup-database-card" disabled={busy} onClick={() => void openDatabase()}>
            <span className="startup-icon startup-icon-teal"><Database aria-hidden="true" /></span>
            <span><strong>Database</strong><small>Browse saved constructs</small></span>
            <ChevronRight aria-hidden="true" />
          </button>

          <article className="startup-action-card startup-tools-card">
            <div className="startup-card-heading">
              <span className="startup-icon startup-icon-rose"><FlaskConical aria-hidden="true" /></span>
              <div>
                <h2>Tools</h2>
                <p>No construct required</p>
              </div>
            </div>
            <div className="startup-new-options">
              <button type="button" disabled={busy} onClick={() => void openEnzymeDatabase()}>
                <Scissors aria-hidden="true" />
                <span><strong>Enzyme Database</strong><small>Browse cutters</small></span>
                <ChevronRight aria-hidden="true" />
              </button>
              <button type="button" disabled={busy} onClick={() => void openAgaroseGel()}>
                <FlaskConical aria-hidden="true" />
                <span><strong>Simulate gel</strong><small>DNA fragments</small></span>
                <ChevronRight aria-hidden="true" />
              </button>
            </div>
          </article>
        </div>

        <div className="startup-lists">
          <section className="startup-list-card" aria-labelledby="startup-drafts-title">
            <div className="startup-list-heading">
              <span className="startup-icon startup-icon-amber"><FileText aria-hidden="true" /></span>
              <div><h2 id="startup-drafts-title">Saved drafts</h2><p>Recover unsaved work</p></div>
            </div>
            <div className="startup-list-scroll">
              {loadingDrafts ? (
                <p className="startup-empty">Loading drafts…</p>
              ) : draftRows.length ? draftRows.map((draft) => (
                <div key={draft.id} className="startup-draft-row">
                  <button type="button" className="startup-file-row" disabled={busy} onClick={() => void openDraft(draft)} title={draft.name}>
                    <span className={`startup-molecule-dot ${draft.molecule}`} />
                    <span className="startup-file-copy"><strong>{draft.name}</strong><small>{moleculeDetail(draft)}</small></span>
                    <time>{dateLabel(draft.updatedAt)}</time>
                  </button>
                  <button
                    type="button"
                    className="startup-draft-delete"
                    disabled={busy}
                    onClick={() => void deleteDraft(draft)}
                    aria-label={`Delete draft ${draft.name}`}
                    title="Delete draft permanently"
                  >
                    <X aria-hidden="true" />
                  </button>
                </div>
              )) : (
                <p className="startup-empty">No saved drafts yet.</p>
              )}
            </div>
          </section>

          <section className="startup-list-card" aria-labelledby="startup-recents-title">
            <div className="startup-list-heading">
              <span className="startup-icon startup-icon-slate"><Clock3 aria-hidden="true" /></span>
              <div><h2 id="startup-recents-title">Recent files</h2><p>Continue where you left off</p></div>
            </div>
            <div className="startup-list-scroll">
              {recentRows.length ? recentRows.map((entry) => (
                <button key={entry.kind === 'local' ? `local:${entry.path}` : `database:${entry.projectId}`} type="button" className="startup-file-row" disabled={busy} onClick={() => void openRecent(entry)}>
                  <span className={`startup-source-badge ${entry.kind}`}><span>{entry.kind === 'local' ? 'FILE' : 'DB'}</span></span>
                  <span className="startup-file-copy"><strong>{entry.name}</strong><small>{entry.kind === 'local' ? pathDetail(entry.path) : 'VibeGene Database'}</small></span>
                  <time>{dateLabel(entry.openedAt)}</time>
                </button>
              )) : (
                <p className="startup-empty">Files you open will appear here.</p>
              )}
            </div>
          </section>
        </div>
      </section>

      <footer className="startup-footer">
        <span className="startup-drop-hint"><FolderOpen aria-hidden="true" /> You can also drop sequence files anywhere in this window</span>
        <span className="startup-status" role="status" aria-live="polite">{status}</span>
      </footer>

      {dragActive && (
        <div className="startup-drop-overlay" aria-hidden="true">
          <span><FolderOpen /><strong>Drop files to open</strong><small>DNA, protein, GenBank, FASTA, and VibeGene files</small></span>
        </div>
      )}

      {newFileKind === 'dna' && (
        <NewDnaFileDialog
          onCancel={() => setNewFileKind(null)}
          onCreate={(result: NewDnaFileResult) => {
            setNewFileKind(null)
            void createNewRecord(createSequenceRecordFromNewDnaFile(result))
          }}
        />
      )}
      {newFileKind === 'protein' && (
        <NewProteinFileDialog
          onCancel={() => setNewFileKind(null)}
          onCreate={(result: NewProteinFileResult) => {
            setNewFileKind(null)
            void createNewRecord(createSequenceRecordFromNewProteinFile(result))
          }}
        />
      )}
    </main>
  )
}

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { normalizeSequenceRecord } from '../../domain/constructProperties'
import { createId } from '../../domain/sequence'
import type { RecentDocumentLifecycleAdapters, OpenedDesktopFile, NativeAppMenuRecentSummary } from '../../application/ports/lifecycle'
import type { RecentFileEntry } from '../../application/ports/recentFiles'
import type { StoredProject } from '../../application/ports/projectPersistence'
import { databaseWorkspaceDocumentOrigin, type WorkspaceDocumentOrigin } from '../../domain/workspaceDocumentOrigin'

export type RecentDocumentLifecyclePorts = RecentDocumentLifecycleAdapters & {
  handoffRecord: unknown
  maxRecentFiles: number
  isNativeDesktop: boolean
  sessionDrafts: Array<{ name: string; updatedAt: string }>
  syncNativeDrafts: (drafts: Array<{ name: string; updatedAt: string }>) => void
  syncNativeRecent: (entries: NativeAppMenuRecentSummary[]) => void
  recentDetail: (entry: RecentFileEntry) => string
  bootOpenedFromHandoff: boolean
  bootOpenedFromDiskFile: boolean
  clearBootFileQueryParams: () => void
  shouldOpenInNewWindow: () => boolean
  requestExit: (action: () => void | Promise<void>) => void
  handleFile: (file: File, localPath?: string) => Promise<void>
  loadProject: (project: StoredProject) => Promise<void>
  openRecordInNewTab: (record: StoredProject['record'], options: {
    folderId?: string | null
    projectId?: string
    documentOrigin?: WorkspaceDocumentOrigin
  }) => void
  setStatus: (status: string) => void
  refreshDrafts?: () => Promise<void>
}

/** Recent-file menu state, native-menu summaries, and desktop Open With startup. */
export function useRecentDocumentLifecycle(ports: RecentDocumentLifecyclePorts) {
  const portsRef = useRef(ports)
  const [recentFiles, setRecentFiles] = useState<RecentFileEntry[]>(() =>
    ports.listRecentFiles(ports.maxRecentFiles),
  )
  const recentFilesRef = useRef(recentFiles)
  const refreshRecentFiles = useCallback(() => {
    setRecentFiles(portsRef.current.listRecentFiles(portsRef.current.maxRecentFiles))
  }, [])
  const refreshRecentFilesRef = useRef(refreshRecentFiles)
  useLayoutEffect(() => {
    portsRef.current = ports
    recentFilesRef.current = recentFiles
    refreshRecentFilesRef.current = refreshRecentFiles
  }, [ports, recentFiles, refreshRecentFiles])

  useEffect(() => {
    const refresh = () => refreshRecentFilesRef.current()
    window.addEventListener(ports.recentFilesChangedEvent, refresh)
    return () => window.removeEventListener(ports.recentFilesChangedEvent, refresh)
  }, [ports.recentFilesChangedEvent])

  const openRecentFile = useCallback((entry: RecentFileEntry) => {
    const currentPorts = portsRef.current
    const openInNewWindow = currentPorts.shouldOpenInNewWindow()
    if (entry.kind === 'database') {
      const open = async () => {
        if (openInNewWindow) {
          const project = await currentPorts.getProject(entry.projectId)
          if (!project || currentPorts.isSessionDraftId(entry.projectId)) {
            currentPorts.removeRecentDatabaseProject(entry.projectId)
            refreshRecentFilesRef.current()
            currentPorts.setStatus(`Could not open “${entry.name}”.`)
            return
          }
          if (await currentPorts.focusExistingWorkspaceDocument({ kind: 'database', projectId: project.id })) {
            currentPorts.setStatus(`Brought “${project.name}” to the front.`)
            return
          }
          currentPorts.openRecordInNewTab(normalizeSequenceRecord(project.record), {
            folderId: project.folderId ?? null,
            projectId: project.id,
            documentOrigin: databaseWorkspaceDocumentOrigin(project.id, project.folderId),
          })
          currentPorts.setStatus(`Opened ${project.name} in a new window.`)
          return
        }
        currentPorts.requestExit(async () => {
          const project = await currentPorts.getProject(entry.projectId)
          if (!project || currentPorts.isSessionDraftId(entry.projectId)) {
            currentPorts.removeRecentDatabaseProject(entry.projectId)
            refreshRecentFilesRef.current()
            currentPorts.setStatus(`Could not open “${entry.name}”.`)
            return
          }
          await currentPorts.loadProject(project)
        })
      }
      void open()
      return
    }
    if (!currentPorts.isNativeDesktop) {
      currentPorts.setStatus('Re-open local files from disk on the desktop app.')
      return
    }
    const open = async () => {
      if (openInNewWindow) {
        if (await currentPorts.focusExistingWorkspaceDocument({ kind: 'file', path: entry.path })) {
          currentPorts.setStatus(`Brought “${entry.name}” to the front.`)
          return
        }
        const file = (await currentPorts.readDroppedDesktopPaths([entry.path]))[0]
        if (!file) {
          currentPorts.removeRecentLocalFile(entry.path)
          refreshRecentFilesRef.current()
          currentPorts.setStatus(`Could not open “${entry.name}”.`)
          return
        }
        const key = createId('fopen')
        await currentPorts.putFileOpenHandoff(key, { path: file.path, name: file.name, bytes: file.bytes })
        const opened = await currentPorts.openWorkspaceWindow({
          searchParams: { fileHandoff: key, openPath: file.path },
          title: `${file.name} — from disk`,
          focus: true,
          documentKey: { kind: 'file', path: file.path },
        })
        if (!opened) {
          currentPorts.setStatus(`Could not open “${entry.name}”.`)
          return
        }
        currentPorts.touchRecentLocalFile(entry.path, entry.name)
        currentPorts.setStatus(opened === 'focused' ? `Brought “${entry.name}” to the front.` : `Opened ${entry.name} in a new window.`)
        return
      }
      currentPorts.requestExit(async () => {
        const file = await currentPorts.openRecentLocalPath(entry.path)
        if (!file) {
          currentPorts.removeRecentLocalFile(entry.path)
          refreshRecentFilesRef.current()
          currentPorts.setStatus(`Could not open “${entry.name}”.`)
          return
        }
        await currentPorts.handleFile(file, entry.path)
      })
    }
    void open()
  }, [])

  useEffect(() => {
    if (!portsRef.current.isNativeDesktop) return
    portsRef.current.syncNativeDrafts(portsRef.current.sessionDrafts)
  }, [ports.isNativeDesktop, ports.sessionDrafts])

  useEffect(() => {
    if (!portsRef.current.isNativeDesktop) return
    portsRef.current.syncNativeRecent(recentFiles.map((entry) => ({
      kind: entry.kind,
      name: entry.name,
      detail: portsRef.current.recentDetail(entry),
    })))
  }, [ports.isNativeDesktop, recentFiles])

  useEffect(() => {
    if (portsRef.current.handoffRecord) return
    let cancelled = false
    let unlisten: (() => void) | undefined
    const openIncomingFiles = async (files: OpenedDesktopFile[], allowLoadInCurrentWindow = false) => {
      if (cancelled || !files[0]) return
      const myLabel = await portsRef.current.getCurrentWindowLabel()
      const loadIntoCurrentWindow = allowLoadInCurrentWindow || !portsRef.current.shouldOpenInNewWindow()
      const pending: OpenedDesktopFile[] = []
      for (const file of files) {
        if (file.path) {
          const claimedBy = portsRef.current.claimedWorkspaceWindowLabel({ kind: 'file', path: file.path })
          if (loadIntoCurrentWindow && (!claimedBy || (myLabel && claimedBy === myLabel))) {
            pending.push(file)
            continue
          }
          if (await portsRef.current.focusExistingWorkspaceDocument({ kind: 'file', path: file.path })) continue
        }
        pending.push(file)
      }
      if (!pending.length) return
      const [first, ...rest] = pending
      if (!loadIntoCurrentWindow) {
        const key = createId('fopen')
        await portsRef.current.putFileOpenHandoff(key, { path: first.path, name: first.name, bytes: first.bytes })
        const opened = await portsRef.current.openWorkspaceWindow({
          searchParams: { fileHandoff: key, ...(first.path ? { openPath: first.path } : {}) },
          title: `${first.name} — from disk`,
          focus: true,
          documentKey: first.path ? { kind: 'file', path: first.path } : undefined,
        })
        if (opened) {
          portsRef.current.touchRecentLocalFile(first.path, first.name)
          portsRef.current.setStatus(`Opened ${first.name} in a new window.`)
        } else {
          portsRef.current.setStatus(`Could not open “${first.name}”.`)
        }
        for (const openedFile of rest) {
          const restKey = createId('fopen')
          await portsRef.current.putFileOpenHandoff(restKey, {
            path: openedFile.path,
            name: openedFile.name,
            bytes: openedFile.bytes,
          })
          await portsRef.current.openWorkspaceWindow({
            searchParams: { fileHandoff: restKey, ...(openedFile.path ? { openPath: openedFile.path } : {}) },
            title: `${openedFile.name} — from disk`,
            focus: true,
            documentKey: openedFile.path ? { kind: 'file', path: openedFile.path } : undefined,
          })
        }
        return
      }
      if (first.path) {
        try { portsRef.current.claimWorkspaceDocument({ kind: 'file', path: first.path }, myLabel) } catch { /* ignore */ }
      }
      portsRef.current.requestExit(async () => {
        await portsRef.current.handleFile(portsRef.current.bytesToFile(first.name, first.bytes), first.path)
        for (const opened of rest) {
          const key = createId('fopen')
          await portsRef.current.putFileOpenHandoff(key, { path: opened.path, name: opened.name, bytes: opened.bytes })
          await portsRef.current.openWorkspaceWindow({
            searchParams: { fileHandoff: key, ...(opened.path ? { openPath: opened.path } : {}) },
            title: `${opened.name} — from disk`, focus: true,
            documentKey: opened.path ? { kind: 'file', path: opened.path } : undefined,
          })
        }
      })
    }
    void (async () => {
      const params = new URLSearchParams(window.location.search)
      const fileHandoffKey = params.get('fileHandoff')
      const directPath = params.get('openPath')
      if (portsRef.current.isNativeDesktop) {
        if (portsRef.current.bootOpenedFromHandoff || portsRef.current.bootOpenedFromDiskFile) {
          portsRef.current.clearBootFileQueryParams()
        } else if (fileHandoffKey || directPath) {
          if (fileHandoffKey) {
            const handoff = await portsRef.current.takeFileOpenHandoff(fileHandoffKey)
            if (handoff && !cancelled) await openIncomingFiles([{ path: handoff.path, name: handoff.name, bytes: handoff.bytes }], true)
            else if (directPath && !cancelled) await openIncomingFiles(await portsRef.current.readDroppedDesktopPaths([directPath]), true)
          } else if (directPath) await openIncomingFiles(await portsRef.current.readDroppedDesktopPaths([directPath]), true)
          portsRef.current.clearBootFileQueryParams()
        }
      }
      if (cancelled) return
      if (portsRef.current.isNativeDesktop) unlisten = await portsRef.current.subscribeDesktopOpenedFiles(openIncomingFiles)
      if (cancelled) {
        unlisten?.()
        return
      }
      await portsRef.current.refreshDrafts?.()
      refreshRecentFilesRef.current()
    })()
    return () => { cancelled = true; unlisten?.() }
  }, [])

  useEffect(() => {
    refreshRecentFilesRef.current()
  }, [ports.maxRecentFiles])

  return { recentFiles, recentFilesRef, refreshRecentFiles, refreshRecentFilesRef, openRecentFile }
}

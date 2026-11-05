import { useCallback } from 'react'
import { hydrateLibraryTracesFromDocument } from '../../domain/libraryMemberFeatures'
import { isDnaLibraryRecord } from '../../domain/dnaLibrary'
import { normalizeSequenceRecord } from '../../domain/constructProperties'
import type { SequenceRecord } from '../../domain/types'
import type { TraceFileRecord } from '../../domain/traceTypes'
import type { StoredProject } from '../../application/ports/projectPersistence'
import type { WorkspaceDocumentOrigin } from '../../domain/workspaceDocumentOrigin'

type ProjectPersistenceOptions = {
  setTraceDocument: (value: null) => void
  mergeCustomMwLadders: (ladders: NonNullable<StoredProject['customMwLadders']>) => void
  actionProfileSync: <T>(name: string, category: string, run: () => T, detail: string) => T
  setRecord: (record: SequenceRecord) => void
  setLibraryFolderId: (folderId: string | null) => void
  setWorkspaceDiskPath: (path: string | null) => void
  setDocumentOrigin: (origin: WorkspaceDocumentOrigin) => void
  applyDefaultMapViewForTopology: (topology: SequenceRecord['topology'], length: number) => void
  setTraceFiles: (recordId: string, traces: TraceFileRecord[]) => void
  clearDocumentSelection: () => void
  setActiveTabForRecord: (record: SequenceRecord) => void
  setAlignmentsVisible: () => void
  setLastAlignedSequence: (sequence: string) => void
  setTracesNeedRealign: (value: boolean) => void
  markClean: (record: SequenceRecord, traces: TraceFileRecord[]) => void
  touchRecentDatabaseProject: (id: string, name: string) => void
  setStatus: (status: string) => void
  getProject: (id: string) => Promise<StoredProject | null>
  deleteProject: (id: string) => Promise<void>
  removeRecentDatabaseProject: (id: string) => void
  refreshProjects: () => Promise<void>
}

/** Owns database project load/delete state transitions; repository and history ports stay in App. */
export function useProjectPersistenceController(options: ProjectPersistenceOptions) {
  const loadProject = useCallback(async (project: StoredProject) => {
    options.setTraceDocument(null)
    if (project.customMwLadders?.length) options.mergeCustomMwLadders(project.customMwLadders)
    const normalized = options.actionProfileSync('loadProject', 'persistence', () => normalizeSequenceRecord(project.record), project.name)
    options.setLastAlignedSequence(normalized.sequence)
    options.setTracesNeedRealign(false)
    options.setRecord(normalized)
    options.setLibraryFolderId(project.folderId ?? null)
    options.setWorkspaceDiskPath(null)
    options.setDocumentOrigin({ kind: 'database', projectId: project.id, folderId: project.folderId ?? null })
    options.applyDefaultMapViewForTopology(normalized.topology, normalized.sequence.length)
    const loadedTraces = hydrateLibraryTracesFromDocument(normalized, normalized.traceFiles ?? [])
    options.setTraceFiles(normalized.id, loadedTraces)
    options.clearDocumentSelection()
    options.setActiveTabForRecord(normalized)
    if (isDnaLibraryRecord(normalized)) options.setAlignmentsVisible()
    options.setStatus(project.customMwLadders?.length
      ? `Loaded local project ${project.name} (${project.customMwLadders.length} custom MW markers).`
      : `Loaded local project ${project.name}.`)
    options.markClean(normalized, loadedTraces)
    options.touchRecentDatabaseProject(normalized.id, normalized.name)
  }, [options])

  const loadProjectSummary = useCallback(async (summary: { id: string; name: string }) => {
    const project = await options.getProject(summary.id)
    if (!project) {
      options.setStatus(`Could not load project “${summary.name}”.`)
      return
    }
    await loadProject(project)
  }, [options, loadProject])

  const deleteProject = useCallback(async (project: { id: string; name: string }) => {
    await options.deleteProject(project.id)
    options.removeRecentDatabaseProject(project.id)
    await options.refreshProjects()
    options.setStatus(`Deleted local project ${project.name}.`)
  }, [options])

  return { loadProject, loadProjectSummary, deleteProject }
}

import { useCallback, useRef } from 'react'
import { DATABASE_PROJECTS_DRAG_MIME, decodeDatabaseProjectsDragPayload } from '../../domain/databaseProjectDrag'
import { DATABASE_PRIMERS_DRAG_MIME, decodeDatabasePrimersDragPayload } from '../../domain/databasePrimerDrag'

export type WorkspaceFileDragEvent = {
  preventDefault: () => void
  dataTransfer: {
    types: readonly string[]
    dropEffect: string
    files: FileList
    getData?: (type: string) => string
  }
}

type WorkspaceFileDragControllerOptions = {
  isNativeDesktop: boolean
  blocked: boolean
  hasFiles: (types: readonly string[]) => boolean
  onDatabaseProjects?: (projectIds: string[]) => void
  onDatabasePrimers?: (primers: import('../../domain/libraryPrimer').LibraryPrimer[]) => void
  setDragActive: (active: boolean) => void
  onFiles: (files: File[]) => void
}

/** Owns browser drag-depth bookkeeping; file parsing remains an injected workflow port. */
export function useWorkspaceFileDragController(options: WorkspaceFileDragControllerOptions) {
  const depthRef = useRef(0)

  const onDragEnter = useCallback((event: WorkspaceFileDragEvent) => {
    const hasProjects = event.dataTransfer.types.includes(DATABASE_PROJECTS_DRAG_MIME)
    const hasPrimers = event.dataTransfer.types.includes(DATABASE_PRIMERS_DRAG_MIME)
    if ((options.blocked && !hasProjects && !hasPrimers) || (!hasProjects && !hasPrimers && (options.isNativeDesktop || !options.hasFiles(event.dataTransfer.types)))) return
    event.preventDefault()
    depthRef.current += 1
    options.setDragActive(true)
  }, [options])

  const onDragOver = useCallback((event: WorkspaceFileDragEvent) => {
    const hasProjects = event.dataTransfer.types.includes(DATABASE_PROJECTS_DRAG_MIME)
    const hasPrimers = event.dataTransfer.types.includes(DATABASE_PRIMERS_DRAG_MIME)
    if ((options.blocked && !hasProjects && !hasPrimers) || (!hasProjects && !hasPrimers && (options.isNativeDesktop || !options.hasFiles(event.dataTransfer.types)))) return
    event.preventDefault()
    event.dataTransfer.dropEffect = 'copy'
  }, [options])

  const onDragLeave = useCallback((event: WorkspaceFileDragEvent) => {
    const hasProjects = event.dataTransfer.types.includes(DATABASE_PROJECTS_DRAG_MIME)
    const hasPrimers = event.dataTransfer.types.includes(DATABASE_PRIMERS_DRAG_MIME)
    if ((options.blocked && !hasProjects && !hasPrimers) || (!hasProjects && !hasPrimers && (options.isNativeDesktop || !options.hasFiles(event.dataTransfer.types)))) return
    depthRef.current = Math.max(0, depthRef.current - 1)
    if (depthRef.current === 0) options.setDragActive(false)
  }, [options])

  const onDrop = useCallback((event: WorkspaceFileDragEvent) => {
    const projectIds = decodeDatabaseProjectsDragPayload(event.dataTransfer.getData?.(DATABASE_PROJECTS_DRAG_MIME))
    const primers = decodeDatabasePrimersDragPayload(event.dataTransfer.getData?.(DATABASE_PRIMERS_DRAG_MIME))
    if (options.blocked && !projectIds.length && !primers.length) return
    event.preventDefault()
    depthRef.current = 0
    options.setDragActive(false)
    if (projectIds.length) {
      options.onDatabaseProjects?.(projectIds)
      return
    }
    if (primers.length) {
      options.onDatabasePrimers?.(primers)
      return
    }
    if (event.dataTransfer.files?.length) options.onFiles(Array.from(event.dataTransfer.files))
  }, [options])

  return { onDragEnter, onDragOver, onDragLeave, onDrop }
}

import { useCallback, useState } from 'react'
import {
  diskWorkspaceDocumentOrigin,
  type WorkspaceDocumentOrigin,
} from '../../domain/workspaceDocumentOrigin'

/** Keeps the legacy disk-path adapter and the authoritative document origin in sync. */
export function useWorkspaceDocumentOriginState(
  initialPath: string | null,
  initialOrigin: WorkspaceDocumentOrigin,
) {
  const [workspaceDiskPath, setWorkspaceDiskPath] = useState<string | null>(initialPath)
  const [documentOrigin, setDocumentOrigin] = useState(initialOrigin)
  const setWorkspaceDiskPathWithOrigin = useCallback((path: string | null) => {
    setWorkspaceDiskPath(path)
    setDocumentOrigin(diskWorkspaceDocumentOrigin(path))
  }, [])
  return { workspaceDiskPath, documentOrigin, setDocumentOrigin, setWorkspaceDiskPathWithOrigin }
}

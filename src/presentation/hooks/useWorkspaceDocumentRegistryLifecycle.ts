import { useEffect, useLayoutEffect, useRef } from 'react'
import type { WorkspaceDocumentBinding } from '../../domain/projectSaveSemantics'
import type { WorkspaceDocumentOrigin } from '../../domain/workspaceDocumentOrigin'

export type WorkspaceDocumentRegistryKey =
  | { kind: 'database'; projectId: string }
  | { kind: 'file'; path: string }

export type WorkspaceDocumentRegistryLifecyclePorts = {
  isNativeDesktop: boolean
  resolveCurrentWindowLabel: () => Promise<string>
  claimWorkspaceDocument: (key: WorkspaceDocumentRegistryKey, windowLabel: string) => void
  releaseWorkspaceDocument: (windowLabel: string) => void
}

export type WorkspaceDocumentRegistryLifecycleInput = WorkspaceDocumentRegistryLifecyclePorts & {
  documentSaveBinding: WorkspaceDocumentBinding
  workspaceDiskPath: string | null
  recordId: string
  documentOrigin?: WorkspaceDocumentOrigin
}

/** Tauri workspace-document registry claim on binding changes and release on unmount. */
export function useWorkspaceDocumentRegistryLifecycle(input: WorkspaceDocumentRegistryLifecycleInput) {
  const {
    documentSaveBinding,
    workspaceDiskPath,
    recordId,
    documentOrigin,
    isNativeDesktop,
    ...restPorts
  } = input
  const portsRef = useRef(restPorts)
  useLayoutEffect(() => {
    portsRef.current = {
      resolveCurrentWindowLabel: input.resolveCurrentWindowLabel,
      claimWorkspaceDocument: input.claimWorkspaceDocument,
      releaseWorkspaceDocument: input.releaseWorkspaceDocument,
    }
  })

  useEffect(() => {
    if (!isNativeDesktop) return
    let cancelled = false
    void (async () => {
      try {
        const label = await portsRef.current.resolveCurrentWindowLabel()
        if (cancelled) return
        if (documentOrigin?.kind === 'disk') {
          portsRef.current.claimWorkspaceDocument({ kind: 'file', path: documentOrigin.path }, label)
        } else if (documentOrigin?.kind === 'database') {
          portsRef.current.claimWorkspaceDocument({ kind: 'database', projectId: documentOrigin.projectId }, label)
        } else if (documentSaveBinding === 'disk' && workspaceDiskPath) {
          portsRef.current.claimWorkspaceDocument({ kind: 'file', path: workspaceDiskPath }, label)
        } else if (documentSaveBinding === 'database' && recordId) {
          portsRef.current.claimWorkspaceDocument({ kind: 'database', projectId: recordId }, label)
        } else {
          portsRef.current.releaseWorkspaceDocument(label)
        }
      } catch {
        // ignore
      }
    })()
    return () => {
      cancelled = true
    }
  }, [documentSaveBinding, workspaceDiskPath, recordId, documentOrigin, isNativeDesktop])

  useEffect(() => {
    if (!isNativeDesktop) return
    return () => {
      void (async () => {
        try {
          const label = await portsRef.current.resolveCurrentWindowLabel()
          portsRef.current.releaseWorkspaceDocument(label)
        } catch {
          // ignore
        }
      })()
    }
  }, [isNativeDesktop])
}

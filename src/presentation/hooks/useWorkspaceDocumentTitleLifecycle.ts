import { useEffect, useLayoutEffect, useRef } from 'react'
import { workspaceWindowTitle, type WorkspaceDocumentBinding } from '../../domain/projectSaveSemantics'
import type { WorkspaceDocumentTitleLifecycleAdapters } from '../../application/ports/lifecycle'

export type WorkspaceDocumentTitleLifecyclePorts = WorkspaceDocumentTitleLifecycleAdapters & {
  workspaceTitleName: string
  isDirty: boolean
  documentSaveBinding: WorkspaceDocumentBinding
  showSource: boolean
}

/** Keeps browser and native window titles aligned with workspace save state. */
export function useWorkspaceDocumentTitleLifecycle(ports: WorkspaceDocumentTitleLifecyclePorts) {
  const portsRef = useRef(ports)
  useLayoutEffect(() => {
    portsRef.current = ports
  }, [ports])

  const { workspaceTitleName, isDirty, documentSaveBinding } = ports

  useEffect(() => {
    const currentPorts = portsRef.current
    const title = workspaceWindowTitle(workspaceTitleName, {
      isDirty,
      binding: documentSaveBinding,
      showSource: currentPorts.showSource,
    })
    currentPorts.setDocumentTitle(title)
    void currentPorts.syncNativeWindowTitle(title)
  }, [isDirty, workspaceTitleName, documentSaveBinding])
}

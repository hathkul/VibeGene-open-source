import { useEffect, useLayoutEffect, useRef } from 'react'
import type { DesktopFileDropAdapters, OpenedDesktopFile } from '../../application/ports/lifecycle'

export type DesktopFileDropLifecyclePorts = DesktopFileDropAdapters & {
  blockedRef: { readonly current: boolean }
  setDragActive: (active: boolean) => void
  onFiles: (files: File[], paths: string[]) => Promise<void>
}

/** Desktop drag/drop subscription adapter; routing remains in the workspace controller. */
export function useDesktopFileDropLifecycle(ports: DesktopFileDropLifecyclePorts) {
  const portsRef = useRef(ports)
  useLayoutEffect(() => {
    portsRef.current = ports
  }, [ports])
  useEffect(() => {
    if (!portsRef.current.isNativeDesktop) return
    let cancelled = false
    let unlisten: (() => void) | undefined
    void portsRef.current.subscribeDesktopFileDrops({
      onHoverChange: (active) => {
        if (cancelled) return
        if (portsRef.current.blockedRef.current) {
          portsRef.current.setDragActive(false)
          return
        }
        portsRef.current.setDragActive(active)
      },
      onFiles: async (opened: OpenedDesktopFile[]) => {
        if (cancelled || portsRef.current.blockedRef.current) return
        const files = opened.map((file) => portsRef.current.bytesToFile(file.name, file.bytes))
        const paths = opened.map((file) => file.path)
        if (files.length) await portsRef.current.onFiles(files, paths)
      },
    }).then((stop) => {
      if (cancelled) stop()
      else unlisten = stop
    })
    return () => { cancelled = true; unlisten?.() }
  }, [])
}

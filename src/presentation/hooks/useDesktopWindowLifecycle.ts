import { useCallback, useEffect, useLayoutEffect, useRef } from 'react'
import type { DatabaseExitSyncProgress, DesktopWindowLifecycleAdapters } from '../../application/ports/lifecycle'

export type DesktopWindowLifecyclePorts = DesktopWindowLifecycleAdapters & {
  tabId: string
  isDirtyRef: { current: boolean }
  pendingExitRef: { current: { context?: string } | null }
  closeInProgressRef: { current: boolean }
  setSyncProgress: (progress: DatabaseExitSyncProgress | null) => void
  requestExit: (action: () => void | Promise<void>, options?: { context?: 'window-close' | 'app-quit' }) => void
}

/** Native close/quit and browser unload coordination. */
export function useDesktopWindowLifecycle(ports: DesktopWindowLifecyclePorts) {
  const portsRef = useRef(ports)
  useLayoutEffect(() => {
    portsRef.current = ports
  }, [ports])
  const requestNativeQuit = useCallback(() => {
    void (async () => {
      if (!(await portsRef.current.confirmNativeQuitHasSingleWorkspaceGuard())) return
      portsRef.current.requestExit(async () => {
        await portsRef.current.quitNativeAppAfterDatabaseSync()
      }, { context: 'app-quit' })
    })()
  }, [])
  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!portsRef.current.isDirtyRef.current) return
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [])

  useEffect(() => {
    if (!portsRef.current.isNativeDesktop) return
    let cancelled = false
    let unlisten: (() => void) | undefined
    void portsRef.current.subscribeDesktopCloseRequested(async (preventClose) => {
      if (cancelled) return
      if (portsRef.current.closeInProgressRef.current) { preventClose(); return }
      const finishClose = async () => {
        portsRef.current.closeInProgressRef.current = true
        try {
          // Only the last visible window starts a close-time sync. It remains
          // background work, so no conflict can stall this window close.
          portsRef.current.scheduleDatabaseAfterWindowClose?.()
          portsRef.current.setSyncProgress(null)
          await portsRef.current.destroyCurrentDesktopWindow()
          void portsRef.current.removeOpenTab(portsRef.current.tabId).catch((error: unknown) => {
            console.warn('Could not remove the closed workspace tab heartbeat', error)
          })
        } finally {
          portsRef.current.closeInProgressRef.current = false
          portsRef.current.setSyncProgress(null)
        }
      }
      if (!portsRef.current.isDirtyRef.current) {
        // Do not let Tauri auto-destroy the WebKit view synchronously. The
        // controlled path below gives macOS a pair of animation frames to
        // dispatch pending content-inset work before destruction.
        preventClose()
        await new Promise<void>((resolve) => setTimeout(resolve, 0))
        await finishClose()
        return
      }
      preventClose()
      if (portsRef.current.pendingExitRef.current?.context === 'window-close') return
      portsRef.current.requestExit(() => finishClose(), { context: 'window-close' })
    }).then((stop) => { if (cancelled) stop(); else unlisten = stop })
    return () => { cancelled = true; unlisten?.() }
  }, [])

  useEffect(() => {
    let cancelled = false
    let unlisten: (() => void) | undefined
    void portsRef.current.subscribeDesktopQuitRequested(() => {
      if (cancelled) return
      requestNativeQuit()
    }).then((stop) => { if (cancelled) stop(); else unlisten = stop })
    return () => { cancelled = true; unlisten?.() }
  }, [requestNativeQuit])

  return { requestNativeQuit }
}

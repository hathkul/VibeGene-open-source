import { isTauriRuntime } from './tauriRuntime'

function isMacOsDesktop(): boolean {
  return isTauriRuntime() && /Mac/i.test(navigator.platform || navigator.userAgent || '')
}

type ClosableDesktopWindow = { label: string; destroy: () => Promise<void> }

/** Close the requested window. Process lifetime is handled separately by Rust. */
export async function destroyDesktopWindowSafely(window: ClosableDesktopWindow): Promise<void> {
  if (isMacOsDesktop()) {
    const { invoke } = await import('@tauri-apps/api/core')
    await invoke('hide_desktop_window', { label: window.label })
    return
  }
  await window.destroy()
}

let nativeCloseHandler: ((preventClose: () => void) => void | Promise<void>) | undefined

/** Installed once before React mounts, including in Startup and utility windows. */
export async function installNativeCloseCoordinator(): Promise<() => void> {
  if (!isMacOsDesktop()) return () => {}
  const { listen } = await import('@tauri-apps/api/event')
  const { getCurrentWindow } = await import('@tauri-apps/api/window')
  const label = getCurrentWindow().label
  return listen('vg-native-window-close-requested', () => {
    void (async () => {
      let prevented = false
      await nativeCloseHandler?.(() => { prevented = true })
      if (!prevented) {
        const { getCurrentWindow } = await import('@tauri-apps/api/window')
        await destroyDesktopWindowSafely(getCurrentWindow())
      }
    })().catch((error) => console.error('Native close failed', error))
  }, { target: { kind: 'WebviewWindow', label } })
}

/**
 * Intercept the OS close button / Cmd+W for the current Tauri window.
 * Call `preventClose()` to keep the window open (e.g. dirty document → save dialog).
 * When clean (or after the user confirms), omit preventClose so Tauri destroys the window.
 */
export async function subscribeDesktopCloseRequested(
  handler: (preventClose: () => void) => void | Promise<void>,
): Promise<() => void> {
  if (!isTauriRuntime()) return () => {}
  if (isMacOsDesktop()) {
    nativeCloseHandler = handler
    return () => { if (nativeCloseHandler === handler) nativeCloseHandler = undefined }
  }

  const { getCurrentWindow } = await import('@tauri-apps/api/window')
  const win = getCurrentWindow()
  return win.onCloseRequested((event) => {
    // The native close event must be released immediately. Awaiting the
    // database-sync/hide path here leaves AppKit waiting on the WebView close
    // callback, which can prevent the window from ever disappearing.
    void Promise.resolve(
      handler(() => {
        event.preventDefault()
      }),
    ).catch((error: unknown) => {
      console.error('Unable to finish the desktop window close request', error)
    })
  })
}

/** Listen for a native Quit request routed to this designated webview. */
export async function subscribeDesktopQuitRequested(handler: () => void | Promise<void>): Promise<() => void> {
  if (!isTauriRuntime()) return () => {}
  const { listen } = await import('@tauri-apps/api/event')
  return listen('vg-native-exit-requested', () => {
    void handler()
  })
}

/** Close the current Tauri window after the user confirmed leaving a dirty document. */
export async function destroyCurrentDesktopWindow(): Promise<void> {
  if (!isTauriRuntime()) {
    window.close()
    return
  }
  const { getCurrentWindow } = await import('@tauri-apps/api/window')
  const current = getCurrentWindow()
  const { releaseWorkspaceDocument } = await import('./workspaceDocumentRegistry')
  releaseWorkspaceDocument(current.label)
  await destroyDesktopWindowSafely(current)
}

import { isTauriRuntime } from './tauriRuntime'

/** Keep the native window title in sync with the open construct (Tauri ignores document.title). */
export async function syncNativeWindowTitle(title: string): Promise<void> {
  if (!isTauriRuntime()) return
  try {
    const { getCurrentWindow } = await import('@tauri-apps/api/window')
    await getCurrentWindow().setTitle(title)
  } catch {
    // Dev without a window API, or capability not granted yet.
  }
}

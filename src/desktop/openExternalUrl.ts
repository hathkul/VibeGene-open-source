import { isTauriRuntime } from './tauriRuntime'

/** Open a URL in the system browser (desktop) or a new tab (web). */
export async function openExternalUrl(url: string): Promise<boolean> {
  if (isTauriRuntime()) {
    const { openUrl } = await import('@tauri-apps/plugin-opener')
    await openUrl(url)
    return true
  }
  const opened = window.open(url, '_blank', 'noopener,noreferrer')
  return Boolean(opened)
}

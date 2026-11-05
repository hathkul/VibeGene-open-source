import { openOrFocusHybridWindow } from './hybridWindows'

export const UPDATE_CHECK_REQUEST = 'vg-desktop-update-check'
export const UPDATE_CHECK_PENDING_KEY = 'vg-desktop-update-check-pending'
const LAST_CHECK_KEY = 'vg-desktop-update-last-check'
const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000

/** Keep the coordinator alive while editor windows are closed for an update. */
export async function requestDesktopUpdateCheck(): Promise<void> {
  localStorage.setItem(UPDATE_CHECK_PENDING_KEY, '1')
  const opened = await openOrFocusHybridWindow('startup')
  if (!opened) throw new Error('Could not open the update window')
  const { emitTo } = await import('@tauri-apps/api/event')
  await emitTo('hybrid-startup', UPDATE_CHECK_REQUEST, {})
}

/** Silent periodic check; no installation identifiers or construct data. */
export async function checkForDesktopUpdateInBackground(): Promise<void> {
  const now = Date.now()
  const last = Number(localStorage.getItem(LAST_CHECK_KEY) || 0)
  if (last && now - last < CHECK_INTERVAL_MS) return
  try {
    const { invoke } = await import('@tauri-apps/api/core')
    const info = await invoke<{ configured: boolean }>('desktop_update_info')
    if (!info.configured) return
    // Set before network access so offline sessions and multiple windows don't
    // repeatedly contact the service. Manual checks are never throttled.
    localStorage.setItem(LAST_CHECK_KEY, String(now))
    const { check } = await import('@tauri-apps/plugin-updater')
    const update = await check({ timeout: 20_000 })
    if (update) {
      await update.close()
      await requestDesktopUpdateCheck()
    }
  } catch (error) {
    console.info('Background update check unavailable', error)
  }
}

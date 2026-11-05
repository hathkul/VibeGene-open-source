import { useCallback, useEffect, useRef, useState } from 'react'
import type { Update } from '@tauri-apps/plugin-updater'
import { UPDATE_CHECK_PENDING_KEY, UPDATE_CHECK_REQUEST } from './desktopUpdater'
import { requestUpdateWorkspaceClose } from './updateCloseProtocol'
import { prepareShutdownForUpdate } from './updateShutdown'
import { countWorkspaceWindows, isWorkspaceWindowLabel } from './workspaceWindows'
import { maybeSyncDatabaseOnExit } from './syncOnExit'
import './DesktopUpdaterHost.css'

type UpdateInfo = { configured: boolean; selfUpdate: boolean }
type DialogState = { message: string; details?: string; update?: Update; selfUpdate?: boolean; working?: boolean }

/** Lives in the startup window so editor WebViews may safely close. */
export function DesktopUpdaterHost() {
  const [state, setState] = useState<DialogState | null>(null)
  const busy = useRef(false)
  const updateRef = useRef<Update | null>(null)

  const check = useCallback(async () => {
    if (busy.current) return
    busy.current = true
    setState({ message: 'Checking for updates…', working: true })
    try {
      const { invoke } = await import('@tauri-apps/api/core')
      const info = await invoke<UpdateInfo>('desktop_update_info')
      if (!info.configured) {
        setState({ message: 'Updates are not configured for this build.' })
        return
      }
      const { check: checkForUpdate } = await import('@tauri-apps/plugin-updater')
      const update = await checkForUpdate({ timeout: 20_000 })
      if (!update) { setState({ message: 'VibeGene is up to date.' }); return }
      await updateRef.current?.close()
      updateRef.current = update
      setState({ message: `VibeGene ${update.version} is available.`, update, selfUpdate: info.selfUpdate })
    } catch (error) {
      setState({
        message: 'Couldn’t check for updates. Please try again later.',
        details: String(error),
      })
    } finally { busy.current = false }
  }, [])

  useEffect(() => {
    let cancelled = false
    let unlisten: (() => void) | undefined
    const consume = () => {
      if (localStorage.getItem(UPDATE_CHECK_PENDING_KEY) !== '1') return
      localStorage.removeItem(UPDATE_CHECK_PENDING_KEY)
      void check()
    }
    void import('@tauri-apps/api/event').then(({ listen }) =>
      listen(UPDATE_CHECK_REQUEST, consume, { target: { kind: 'WebviewWindow', label: 'hybrid-startup' } }),
    ).then((stop) => { if (cancelled) stop(); else { unlisten = stop; consume() } }).catch(console.error)
    return () => { cancelled = true; unlisten?.(); void updateRef.current?.close() }
  }, [check])

  const install = async (update: Update) => {
    if (busy.current) return
    busy.current = true
    let nativeInstallStarted = false
    try {
      const { confirm } = await import('@tauri-apps/plugin-dialog')
      if (!await confirm('VibeGene will ask you to save or discard changes in each open construct before installing. Continue?', {
        title: 'Install VibeGene update', kind: 'info', okLabel: 'Continue', cancelLabel: 'Cancel',
      })) return
      let downloaded = 0
      let total = 0
      setState({ message: 'Downloading update…', working: true })
      await update.download((event) => {
        if (event.event === 'Started') total = event.data.contentLength ?? 0
        if (event.event === 'Progress') downloaded += event.data.chunkLength
        if (event.event !== 'Finished') {
          const progress = total ? ` ${Math.min(100, Math.round(downloaded / total * 100))}%` : ''
          setState({ message: `Downloading update…${progress}`, working: true })
        }
      })
      setState({ message: 'Closing construct windows and syncing the database…', working: true })
      const { getAllWindows } = await import('@tauri-apps/api/window')
      const prepared = await prepareShutdownForUpdate({
        closeNextWorkspace: async () => {
          const windows = (await getAllWindows()).filter((win) => isWorkspaceWindowLabel(win.label))
          for (const win of windows) {
            if (!await win.isVisible()) continue
            await win.setFocus()
            return requestUpdateWorkspaceClose(win.label)
          }
          return 'none'
        },
        syncDatabase: async () => (await maybeSyncDatabaseOnExit()).ok,
        hasOpenWorkspaces: async () => (await countWorkspaceWindows()) > 0,
      })
      if (!prepared) { setState({ message: 'Update cancelled. Open documents or database changes were not closed safely.' }); return }
      // Repeat the check as close to installation as possible. An open editor
      // always cancels the update instead of bypassing its save prompt.
      if (await countWorkspaceWindows()) throw new Error('A construct window opened during update preparation')
      const { invoke } = await import('@tauri-apps/api/core')
      await invoke('begin_update_install')
      nativeInstallStarted = true
      setState({ message: 'Installing update…', working: true })
      await update.install()
      await invoke('restart_after_update')
    } catch (error) {
      if (nativeInstallStarted) {
        const { invoke } = await import('@tauri-apps/api/core')
        await invoke('cancel_update_install').catch(console.error)
      }
      setState({ message: 'The update couldn’t be completed. Please try again later.', details: String(error) })
    } finally { busy.current = false }
  }

  if (!state) return null
  return (
    <div className="modal-backdrop">
      <div className="translation-dialog desktop-updater-dialog" role="dialog" aria-modal="true" aria-labelledby="desktop-updater-title">
        <h2 id="desktop-updater-title">VibeGene updates</h2>
        <div className="desktop-updater-content">
          <p aria-live="polite">{state.message}</p>
          {state.update?.body && <p className="desktop-updater-release-notes">{state.update.body}</p>}
          {state.update && !state.selfUpdate && <p>This installation must be updated by downloading a new package from the VibeGene website.</p>}
          {state.details && <details className="desktop-updater-details"><summary>Technical details</summary><pre>{state.details}</pre></details>}
        </div>
        <footer className="desktop-updater-footer">
          {!state.working && <button type="button" onClick={() => { void updateRef.current?.close(); updateRef.current = null; setState(null) }}>Close</button>}
          {state.update && !state.selfUpdate && !state.working && <button type="button" onClick={() => { void import('./openExternalUrl').then(({ openExternalUrl }) => openExternalUrl('https://vibe-gene.com/')) }}>Open downloads</button>}
          {state.update && state.selfUpdate && !state.working && <button type="button" onClick={() => void install(state.update!)}>Download and install</button>}
        </footer>
      </div>
    </div>
  )
}

import { isTauriRuntime } from './tauriRuntime'

type UpdateCloseRequest = { id: string; replyTo: string }
type UpdateCloseResult = { id: string; outcome: 'approved' | 'cancelled' | 'busy' }

/** Connect an editor's existing save/discard prompt to the update coordinator. */
export async function subscribeUpdateCloseRequests(ports: {
  isBusy: () => boolean
  requestExit: (onApproved: () => void, onCancel: () => void) => void
  closeWindow: () => Promise<void>
}): Promise<() => void> {
  if (!isTauriRuntime()) return () => {}
  const { listen, emitTo } = await import('@tauri-apps/api/event')
  const { getCurrentWindow } = await import('@tauri-apps/api/window')
  const label = getCurrentWindow().label
  let busy = false
  return listen<UpdateCloseRequest>('vg-update-close-request', (event) => {
    const { id, replyTo } = event.payload
    if (!id || !replyTo) return
    const reply = (outcome: UpdateCloseResult['outcome']) =>
      emitTo(replyTo, 'vg-update-close-result', { id, outcome } satisfies UpdateCloseResult)
    if (busy || ports.isBusy()) { void reply('busy'); return }
    busy = true
    try {
      ports.requestExit(() => {
        // Deliver the decision while the WebView still exists. The coordinator
        // must subsequently verify that this window really became invisible.
        void reply('approved').then(() => ports.closeWindow()).catch((error) => {
          busy = false
          console.error('Could not close editor for update', error)
        })
      }, () => { busy = false; void reply('cancelled') })
    } catch (error) {
      busy = false
      console.error('Could not request editor close for update', error)
      void reply('busy')
    }
  }, { target: { kind: 'WebviewWindow', label } })
}

/** Request a normal editor close, waiting for its save/discard/cancel decision. */
export async function requestUpdateWorkspaceClose(label: string): Promise<'closed' | 'cancelled'> {
  const { listen, emitTo } = await import('@tauri-apps/api/event')
  const { getCurrentWindow, Window } = await import('@tauri-apps/api/window')
  const replyTo = getCurrentWindow().label
  if (label === replyTo) throw new Error('The update coordinator cannot close its own window')
  const id = crypto.randomUUID()
  const result = await new Promise<UpdateCloseResult['outcome']>((resolve, reject) => {
    void (async () => {
    let timer: ReturnType<typeof setTimeout> | undefined
    let unlisten: (() => void) | undefined
    try {
      unlisten = await listen<UpdateCloseResult>('vg-update-close-result', (event) => {
        if (event.payload.id !== id) return
        if (timer) clearTimeout(timer)
        unlisten?.()
        resolve(event.payload.outcome)
      }, { target: { kind: 'WebviewWindow', label: replyTo } })
      timer = setTimeout(() => {
        unlisten?.()
        reject(new Error(`Timed out waiting for ${label} to respond`))
      }, 600_000)
      await emitTo(label, 'vg-update-close-request', { id, replyTo } satisfies UpdateCloseRequest)
    } catch (error) {
      if (timer) clearTimeout(timer)
      unlisten?.()
      reject(error)
    }
    })()
  })
  if (result !== 'approved') return 'cancelled'
  // Approval is sent before the WebView closes. Never equate that message with
  // an actual close: wait for the native window to disappear or become hidden.
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const window = await Window.getByLabel(label)
    if (!window || !await window.isVisible()) return 'closed'
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  throw new Error(`The ${label} window did not close; update cancelled`)
}

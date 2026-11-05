import type { SequenceRecord } from '../domain/types'
import { postCrossTabMessage, subscribeCrossTabMessages } from './channel'
import type { CrossTabMessage } from './types'

export const WINDOW_HANDOFF_MESSAGE = 'vibegene:window-handoff-record'

type HandoffTarget = Pick<Window, 'closed' | 'postMessage'>

/** Subscribe before window.open; send the large record once the destination signals readiness. */
export function prepareWindowHandoffSender(
  key: string,
  record: SequenceRecord,
  origin: string,
  options: {
    subscribe?: typeof subscribeCrossTabMessages
    timeoutMs?: number
  } = {},
) {
  let target: HandoffTarget | null = null
  let ready = false
  let sent = false
  let stopped = false
  let timer: ReturnType<typeof setTimeout> | null = null
  let unsubscribe = () => {}

  function sendIfReady() {
    if (stopped || !ready || sent || !target || target.closed) return
    sent = true
    try {
      target.postMessage({ type: WINDOW_HANDOFF_MESSAGE, key, record }, origin)
    } catch {
      // IndexedDB remains the durable fallback when structured cloning fails.
      stop()
    }
  }

  unsubscribe = (options.subscribe ?? subscribeCrossTabMessages)((message: CrossTabMessage) => {
    if (stopped || !('key' in message) || message.key !== key) return
    if (message.type === 'window-handoff-ready') {
      ready = true
      sendIfReady()
    } else if (message.type === 'window-handoff-ack') {
      stop()
    }
  })
  timer = globalThis.setTimeout(stop, options.timeoutMs ?? 30_000)

  function stop() {
    if (stopped) return
    stopped = true
    if (timer !== null) globalThis.clearTimeout(timer)
    unsubscribe()
    target = null
  }

  return {
    setTarget(opened: HandoffTarget) {
      target = opened
      sendIfReady()
    },
    stop,
  }
}

export function announceWindowHandoffReady(key: string) {
  postCrossTabMessage({ type: 'window-handoff-ready', key })
}

export function acknowledgeWindowHandoff(key: string) {
  postCrossTabMessage({ type: 'window-handoff-ack', key })
}

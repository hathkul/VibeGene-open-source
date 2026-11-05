import type { CrossTabMessage } from './types'

export const CROSS_TAB_CHANNEL_NAME = 'vibegene-cross-tab'

export const crossTabChannel =
  typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(CROSS_TAB_CHANNEL_NAME) : null

export function postCrossTabMessage(message: CrossTabMessage) {
  crossTabChannel?.postMessage(message)
}

export function subscribeCrossTabMessages(listener: (message: CrossTabMessage) => void) {
  if (!crossTabChannel) return () => {}
  const handler = (event: MessageEvent<CrossTabMessage>) => listener(event.data)
  crossTabChannel.addEventListener('message', handler)
  return () => crossTabChannel.removeEventListener('message', handler)
}

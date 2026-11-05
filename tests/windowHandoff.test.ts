import { describe, expect, it, vi } from 'vitest'
import type { CrossTabMessage } from '../src/crossTab/types'
import { prepareWindowHandoffSender, WINDOW_HANDOFF_MESSAGE } from '../src/crossTab/windowHandoff'
import { defaultConstructProperties } from '../src/domain/constructProperties'
import type { SequenceRecord } from '../src/domain/types'

const record: SequenceRecord = {
  id: 'library', name: 'Library', description: '', molecule: 'dna', topology: 'circular',
  sequence: 'ATGC', features: [], primers: [], operations: [],
  construct: { ...defaultConstructProperties }, createdAt: '', updatedAt: '',
}

describe('window handoff sender', () => {
  it('posts the full record only once after readiness and stops after acknowledgement', () => {
    let receive: ((message: CrossTabMessage) => void) | undefined
    const unsubscribe = vi.fn()
    const postMessage = vi.fn()
    const sender = prepareWindowHandoffSender('handoff-1', record, 'https://example.test', {
      subscribe(listener) {
        receive = listener
        return unsubscribe
      },
    })
    sender.setTarget({ closed: false, postMessage } as unknown as Window)

    expect(postMessage).not.toHaveBeenCalled()
    receive?.({ type: 'window-handoff-ready', key: 'different' })
    expect(postMessage).not.toHaveBeenCalled()
    receive?.({ type: 'window-handoff-ready', key: 'handoff-1' })
    receive?.({ type: 'window-handoff-ready', key: 'handoff-1' })
    expect(postMessage).toHaveBeenCalledTimes(1)
    expect(postMessage).toHaveBeenCalledWith(
      { type: WINDOW_HANDOFF_MESSAGE, key: 'handoff-1', record },
      'https://example.test',
    )

    receive?.({ type: 'window-handoff-ack', key: 'handoff-1' })
    expect(unsubscribe).toHaveBeenCalledTimes(1)
    receive?.({ type: 'window-handoff-ready', key: 'handoff-1' })
    expect(postMessage).toHaveBeenCalledTimes(1)
  })

  it('keeps IndexedDB as fallback when no ready signal arrives', () => {
    vi.useFakeTimers()
    try {
      const unsubscribe = vi.fn()
      const postMessage = vi.fn()
      const sender = prepareWindowHandoffSender('handoff-2', record, 'https://example.test', {
        subscribe: () => unsubscribe,
        timeoutMs: 50,
      })
      sender.setTarget({ closed: false, postMessage } as unknown as Window)
      vi.advanceTimersByTime(50)
      expect(postMessage).not.toHaveBeenCalled()
      expect(unsubscribe).toHaveBeenCalledTimes(1)
    } finally {
      vi.useRealTimers()
    }
  })

  it('remembers readiness announced before the opened window is assigned', () => {
    let receive: ((message: CrossTabMessage) => void) | undefined
    const postMessage = vi.fn()
    const sender = prepareWindowHandoffSender('early', record, 'https://example.test', {
      subscribe(listener) {
        receive = listener
        return () => {}
      },
    })
    receive?.({ type: 'window-handoff-ready', key: 'early' })
    expect(postMessage).not.toHaveBeenCalled()
    sender.setTarget({ closed: false, postMessage } as unknown as Window)
    expect(postMessage).toHaveBeenCalledTimes(1)
    sender.stop()
  })

  it('does not send a record when the destination already loaded it from IndexedDB', () => {
    let receive: ((message: CrossTabMessage) => void) | undefined
    const postMessage = vi.fn()
    const sender = prepareWindowHandoffSender('durable', record, 'https://example.test', {
      subscribe(listener) {
        receive = listener
        return () => {}
      },
    })
    sender.setTarget({ closed: false, postMessage } as unknown as Window)
    receive?.({ type: 'window-handoff-ack', key: 'durable' })
    receive?.({ type: 'window-handoff-ready', key: 'durable' })
    expect(postMessage).not.toHaveBeenCalled()
  })
})

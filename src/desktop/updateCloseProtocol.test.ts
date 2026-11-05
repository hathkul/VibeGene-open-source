import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  handler: undefined as undefined | ((event: { payload: unknown }) => void),
  emitTo: vi.fn().mockResolvedValue(undefined),
  unlisten: vi.fn(),
}))

vi.mock('./tauriRuntime', () => ({ isTauriRuntime: () => true }))
vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(async (_event, handler) => { mocks.handler = handler; return mocks.unlisten }),
  emitTo: mocks.emitTo,
}))
vi.mock('@tauri-apps/api/window', () => ({ getCurrentWindow: () => ({ label: 'workspace-1' }) }))

import { subscribeUpdateCloseRequests } from './updateCloseProtocol'

describe('update close requests', () => {
  beforeEach(() => { mocks.handler = undefined; mocks.emitTo.mockClear(); mocks.unlisten.mockClear() })

  it('reports cancellation without closing the editor', async () => {
    const closeWindow = vi.fn()
    await subscribeUpdateCloseRequests({
      isBusy: () => false,
      requestExit: (_approve, cancel) => cancel(),
      closeWindow,
    })
    mocks.handler!({ payload: { id: 'request-1', replyTo: 'hybrid-startup' } })
    expect(mocks.emitTo).toHaveBeenCalledWith('hybrid-startup', 'vg-update-close-result', { id: 'request-1', outcome: 'cancelled' })
    expect(closeWindow).not.toHaveBeenCalled()
  })

  it('reports approval before closing the editor', async () => {
    const closeWindow = vi.fn().mockResolvedValue(undefined)
    await subscribeUpdateCloseRequests({
      isBusy: () => false,
      requestExit: (approve) => approve(),
      closeWindow,
    })
    mocks.handler!({ payload: { id: 'request-2', replyTo: 'hybrid-startup' } })
    await vi.waitFor(() => expect(closeWindow).toHaveBeenCalledOnce())
    expect(mocks.emitTo).toHaveBeenCalledWith('hybrid-startup', 'vg-update-close-result', { id: 'request-2', outcome: 'approved' })
    expect(mocks.emitTo.mock.invocationCallOrder[0]).toBeLessThan(closeWindow.mock.invocationCallOrder[0]!)
  })

  it('rejects a second prompt while the first decision is pending', async () => {
    await subscribeUpdateCloseRequests({ isBusy: () => false, requestExit: () => {}, closeWindow: vi.fn() })
    mocks.handler!({ payload: { id: 'first', replyTo: 'hybrid-startup' } })
    mocks.handler!({ payload: { id: 'second', replyTo: 'hybrid-startup' } })
    expect(mocks.emitTo).toHaveBeenCalledWith('hybrid-startup', 'vg-update-close-result', { id: 'second', outcome: 'busy' })
  })

  it('reports failure when the editor cannot show its prompt', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    await subscribeUpdateCloseRequests({ isBusy: () => false, requestExit: () => { throw new Error('unavailable') }, closeWindow: vi.fn() })
    mocks.handler!({ payload: { id: 'failed', replyTo: 'hybrid-startup' } })
    expect(mocks.emitTo).toHaveBeenCalledWith('hybrid-startup', 'vg-update-close-result', { id: 'failed', outcome: 'busy' })
    log.mockRestore()
  })
})

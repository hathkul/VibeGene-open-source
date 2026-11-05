// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  invoke: vi.fn(), check: vi.fn(), open: vi.fn(), emitTo: vi.fn(), close: vi.fn(),
}))
vi.mock('@tauri-apps/api/core', () => ({ invoke: mocks.invoke }))
vi.mock('@tauri-apps/plugin-updater', () => ({ check: mocks.check }))
vi.mock('@tauri-apps/api/event', () => ({ emitTo: mocks.emitTo }))
vi.mock('./hybridWindows', () => ({ openOrFocusHybridWindow: mocks.open }))

import { checkForDesktopUpdateInBackground, UPDATE_CHECK_PENDING_KEY } from './desktopUpdater'

describe('background desktop update checks', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
    mocks.invoke.mockResolvedValue({ configured: true })
    mocks.check.mockResolvedValue(null)
    mocks.open.mockResolvedValue(true)
    mocks.emitTo.mockResolvedValue(undefined)
    mocks.close.mockResolvedValue(undefined)
  })

  it('does not contact the server when no public key is configured', async () => {
    mocks.invoke.mockResolvedValue({ configured: false })
    await checkForDesktopUpdateInBackground()
    expect(mocks.check).not.toHaveBeenCalled()
    expect(localStorage.getItem('vg-desktop-update-last-check')).toBeNull()
  })

  it('throttles repeated checks and opens the update window for a new release', async () => {
    mocks.check.mockResolvedValue({ close: mocks.close })
    await checkForDesktopUpdateInBackground()
    await checkForDesktopUpdateInBackground()
    expect(mocks.check).toHaveBeenCalledOnce()
    expect(mocks.close).toHaveBeenCalledOnce()
    expect(mocks.open).toHaveBeenCalledWith('startup')
    expect(localStorage.getItem(UPDATE_CHECK_PENDING_KEY)).toBe('1')
  })

  it('does not interrupt the user when an update check fails', async () => {
    mocks.check.mockRejectedValue(new Error('offline'))
    const info = vi.spyOn(console, 'info').mockImplementation(() => {})
    await expect(checkForDesktopUpdateInBackground()).resolves.toBeUndefined()
    expect(mocks.open).not.toHaveBeenCalled()
    info.mockRestore()
  })
})

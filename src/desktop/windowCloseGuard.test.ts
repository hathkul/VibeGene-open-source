// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const native = vi.hoisted(() => ({
  invoke: vi.fn(async () => {}),
  listen: vi.fn<(name: string, handler: () => void, options: unknown) => Promise<() => void>>(async () => () => {}),
  destroy: vi.fn(async () => {}),
}))
vi.mock('./tauriRuntime', () => ({ isTauriRuntime: () => true }))
vi.mock('@tauri-apps/api/core', () => ({ invoke: native.invoke }))
vi.mock('@tauri-apps/api/event', () => ({ listen: native.listen }))
vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: () => ({ label: 'workspace-test', destroy: native.destroy }),
}))

import { destroyDesktopWindowSafely, installNativeCloseCoordinator, subscribeDesktopCloseRequested } from './windowCloseGuard'

describe('macOS native close coordination', () => {
  let removeHandler: (() => void) | undefined
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(navigator, 'platform', 'get').mockReturnValue('MacIntel')
  })
  afterEach(() => { removeHandler?.(); vi.restoreAllMocks() })

  it('targets the listener to one webview and hides without destroying WebKit', async () => {
    await installNativeCloseCoordinator()
    expect(native.listen).toHaveBeenCalledWith('vg-native-window-close-requested', expect.any(Function), {
      target: { kind: 'WebviewWindow', label: 'workspace-test' },
    })
    native.listen.mock.calls[0]![1]()
    await vi.waitFor(() => expect(native.invoke).toHaveBeenCalledWith('hide_desktop_window', { label: 'workspace-test' }))
    expect(native.destroy).not.toHaveBeenCalled()
  })

  it('keeps a dirty document visible until its save/discard workflow authorizes close', async () => {
    await installNativeCloseCoordinator()
    removeHandler = await subscribeDesktopCloseRequested((preventClose) => preventClose())
    native.listen.mock.calls[0]![1]()
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(native.invoke).not.toHaveBeenCalled()
    await destroyDesktopWindowSafely({ label: 'workspace-test', destroy: native.destroy })
    expect(native.invoke).toHaveBeenCalledWith('hide_desktop_window', { label: 'workspace-test' })
    expect(native.destroy).not.toHaveBeenCalled()
  })
})

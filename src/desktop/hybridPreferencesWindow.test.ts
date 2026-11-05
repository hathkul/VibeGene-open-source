// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, expect, it, vi } from 'vitest'
import { DEFAULT_APP_PREFERENCES } from '../domain/appPreferences'
import { PreferencesDialog } from '../PreferencesDialog'

const mocks = vi.hoisted(() => ({
  setSize: vi.fn(async (size: unknown) => { void size }),
  setMinSize: vi.fn(async (size: unknown) => { void size }),
  setMaxSize: vi.fn(async (size: unknown) => { void size }),
}))
vi.mock('./tauriRuntime', () => ({ isTauriRuntime: () => true }))
vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: () => mocks,
  LogicalSize: class {
    width: number
    height: number
    constructor(width: number, height: number) {
      this.width = width
      this.height = height
    }
  },
}))

import { fitCurrentHybridWindowToContent } from './hybridWindows'

describe('Preferences window fitting', () => {
  it('reports active tab changes so the native window can refit', () => {
    const onTabChange = vi.fn()
    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)
    act(() => {
      root.render(createElement(PreferencesDialog, { initial: DEFAULT_APP_PREFERENCES, onClose: () => {}, onTabChange }))
    })
    act(() => host.querySelector<HTMLButtonElement>('[role="tab"][aria-selected="false"]')!.click())
    expect(onTabChange).toHaveBeenLastCalledWith('pcr')
    act(() => host.querySelector<HTMLButtonElement>('[role="tab"][aria-selected="false"]')!.click())
    expect(onTabChange).toHaveBeenLastCalledWith('general')
    act(() => root.unmount())
    host.remove()
  })

  it('grows and shrinks to match the active tab', async () => {
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      callback(0)
      return 0
    })
    let height = 400
    const dialog = document.createElement('div')
    Object.defineProperties(dialog, {
      offsetWidth: { value: 520 }, scrollWidth: { value: 520 },
      offsetHeight: { get: () => height }, scrollHeight: { get: () => height },
    })
    dialog.getBoundingClientRect = () => ({ width: 520, height, top: 0, bottom: height } as DOMRect)
    mocks.setSize.mockImplementation(async (size) => {
      Object.defineProperty(window, 'innerHeight', { configurable: true, value: (size as { height: number }).height })
    })

    await fitCurrentHybridWindowToContent(dialog, { lockSize: true })
    expect(mocks.setSize).toHaveBeenLastCalledWith(expect.objectContaining({ width: 522, height: 402 }))
    height = 560
    await fitCurrentHybridWindowToContent(dialog, { lockSize: true })
    expect(mocks.setSize).toHaveBeenLastCalledWith(expect.objectContaining({ width: 522, height: 562 }))
    height = 400
    await fitCurrentHybridWindowToContent(dialog, { lockSize: true })
    expect(mocks.setSize).toHaveBeenLastCalledWith(expect.objectContaining({ width: 522, height: 402 }))
    vi.restoreAllMocks()
  })
})

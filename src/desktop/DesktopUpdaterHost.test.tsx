// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DesktopUpdaterHost } from './DesktopUpdaterHost'
import { UPDATE_CHECK_PENDING_KEY } from './desktopUpdater'

const mocks = vi.hoisted(() => ({ invoke: vi.fn(), check: vi.fn(), listen: vi.fn() }))
vi.mock('@tauri-apps/api/core', () => ({ invoke: mocks.invoke }))
vi.mock('@tauri-apps/plugin-updater', () => ({ check: mocks.check }))
vi.mock('@tauri-apps/api/event', () => ({ listen: mocks.listen }))

describe('desktop updater dialog', () => {
  let host: HTMLDivElement
  let root: ReturnType<typeof createRoot>

  beforeEach(() => {
    localStorage.clear()
    localStorage.setItem(UPDATE_CHECK_PENDING_KEY, '1')
    mocks.invoke.mockResolvedValue({ configured: true, selfUpdate: true })
    mocks.listen.mockResolvedValue(() => {})
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
  })

  afterEach(() => {
    act(() => root.unmount())
    host.remove()
    vi.clearAllMocks()
  })

  it('shows a readable error and keeps diagnostic details expandable', async () => {
    mocks.check.mockRejectedValue(new Error('invalid release JSON'))
    await act(async () => { root.render(<DesktopUpdaterHost />) })
    await vi.waitFor(() => expect(host.textContent).toContain('Couldn’t check for updates. Please try again later.'))
    const dialog = host.querySelector('[role="dialog"]')!
    expect(dialog.classList.contains('translation-dialog')).toBe(true)
    expect(dialog.classList.contains('desktop-updater-dialog')).toBe(true)
    expect(dialog.querySelector('details')?.open).toBe(false)
    expect(dialog.querySelector('details pre')?.textContent).toContain('invalid release JSON')
    expect(dialog.getAttribute('aria-labelledby')).toBe('desktop-updater-title')
  })

  it('retains the normal up-to-date message', async () => {
    mocks.check.mockResolvedValue(null)
    await act(async () => { root.render(<DesktopUpdaterHost />) })
    await vi.waitFor(() => expect(host.textContent).toContain('VibeGene is up to date.'))
    expect(host.querySelector('details')).toBeNull()
  })
})

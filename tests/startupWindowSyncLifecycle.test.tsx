// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  scheduleDatabaseBackgroundSync: vi.fn(),
}))

vi.mock('../src/domain/appPreferences', () => ({
  readAppPreferences: () => ({ maxRecentFiles: 10 }),
}))
vi.mock('../src/storage/projects', () => ({
  getProject: vi.fn(async () => null),
  putHandoffRecord: vi.fn(async () => undefined),
}))
vi.mock('../src/storage/sessionDraft', () => ({
  getSessionDraft: vi.fn(async () => null),
  listSessionDrafts: vi.fn(async () => []),
}))
vi.mock('../src/storage/recentFiles', () => ({
  listRecentFiles: vi.fn(() => []),
  removeRecentDatabaseProject: vi.fn(),
  removeRecentLocalFile: vi.fn(),
  touchRecentDatabaseProject: vi.fn(),
}))
vi.mock('../src/storage/libraryEvents', () => ({ writeHandoffFolderId: vi.fn() }))
vi.mock('../src/desktop/fileIo', () => ({
  openRecentLocalPath: vi.fn(async () => null),
  subscribeDesktopFileDrops: vi.fn(async () => () => undefined),
}))
vi.mock('../src/desktop/hybridWindows', () => ({
  closeCurrentHybridWindow: vi.fn(async () => undefined),
  openOrFocusHybridWindow: vi.fn(async () => true),
}))
vi.mock('../src/desktop/tauriRuntime', () => ({ isTauriRuntime: () => true }))
vi.mock('../src/desktop/windowCloseGuard', () => ({
  subscribeDesktopCloseRequested: vi.fn(async () => () => undefined),
}))
vi.mock('../src/desktop/syncOnExit', () => ({
  maybeSyncDatabaseOnExit: vi.fn(async () => ({ ok: true, conflicts: 0, syncedFolders: 0 })),
  shouldHoldCloseForDatabaseSync: vi.fn(async () => false),
  scheduleDatabaseBackgroundSync: mocks.scheduleDatabaseBackgroundSync,
}))
vi.mock('../src/desktop/workspaceWindow', () => ({
  openWorkspaceWindow: vi.fn(async () => true),
  openWorkspaceWindowWithHandoff: vi.fn(async () => true),
}))
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(async (command: string) => command === 'document_open_launch_active' ? false : undefined),
}))
vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn(async () => () => undefined) }))

import { StartupWindow } from '../src/StartupWindow'
import { openOrFocusHybridWindow } from '../src/desktop/hybridWindows'

let root: Root | undefined

beforeEach(() => {
  mocks.scheduleDatabaseBackgroundSync.mockClear()
})

afterEach(async () => {
  if (root) {
    await act(async () => root!.unmount())
    root = undefined
  }
  document.body.replaceChildren()
})

async function mountStartupWindow(): Promise<void> {
  const container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  await act(async () => {
    root!.render(<StartupWindow />)
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

describe('StartupWindow sync lifecycle', () => {
  it('can open Database again when the retained Startup window is reopened', async () => {
    vi.mocked(openOrFocusHybridWindow).mockClear()
    await mountStartupWindow()
    const button = [...document.querySelectorAll('button')].find((node) => node.textContent?.includes('Browse saved constructs'))!
    await act(async () => { button.click(); await Promise.resolve() })
    expect(button.disabled).toBe(false)
    expect(document.body.textContent).not.toContain('Opening Database…')
    await act(async () => { button.click(); await Promise.resolve() })
    expect(openOrFocusHybridWindow).toHaveBeenCalledTimes(2)
  })
  it('schedules recovery of persisted outbox work on mount without a new edit event', async () => {
    await mountStartupWindow()

    expect(mocks.scheduleDatabaseBackgroundSync).toHaveBeenCalledTimes(1)
  })

})

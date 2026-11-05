import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  openPicker: vi.fn(),
  readDroppedDesktopPaths: vi.fn(),
  putFileOpenHandoff: vi.fn(),
  openWorkspaceWindow: vi.fn(),
  isTauriRuntime: vi.fn(),
}))

vi.mock('@tauri-apps/plugin-dialog', () => ({ open: mocks.openPicker }))
vi.mock('../src/desktop/fileIo', () => ({
  readDroppedDesktopPaths: mocks.readDroppedDesktopPaths,
  bytesToFile: vi.fn(),
}))
vi.mock('../src/storage/fileOpenHandoff', () => ({ putFileOpenHandoff: mocks.putFileOpenHandoff }))
vi.mock('../src/storage/projects', () => ({ putHandoffRecord: vi.fn() }))
vi.mock('../src/desktop/workspaceWindow', () => ({
  openNewWorkspaceWindow: vi.fn(),
  openWorkspaceWindow: mocks.openWorkspaceWindow,
  openWorkspaceWindowWithHandoff: vi.fn(),
}))
vi.mock('../src/desktop/hybridWindows', () => ({ openOrFocusHybridWindow: vi.fn() }))
vi.mock('../src/desktop/tauriRuntime', () => ({ isTauriRuntime: mocks.isTauriRuntime }))

import {
  pickAndOpenSequenceFileInNewWorkspaceWindow,
  tryHandleGlobalNewFileMenuAction,
} from '../src/desktop/newFileActions'
import { KEYBOARD_SHORTCUTS } from '../src/desktop/keyboardShortcuts'
import {
  getNoWorkspaceMenuActionDisposition,
  menuActionRequiresConstructWindow,
} from '../src/desktop/globalMenuActions'

describe('pickAndOpenSequenceFileInNewWorkspaceWindow', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.isTauriRuntime.mockReturnValue(true)
    mocks.openWorkspaceWindow.mockResolvedValue(true)
  })

  it('does not read or open a workspace when the picker is cancelled', async () => {
    mocks.openPicker.mockResolvedValue(null)

    await expect(pickAndOpenSequenceFileInNewWorkspaceWindow()).resolves.toBe(false)

    expect(mocks.readDroppedDesktopPaths).not.toHaveBeenCalled()
    expect(mocks.putFileOpenHandoff).not.toHaveBeenCalled()
    expect(mocks.openWorkspaceWindow).not.toHaveBeenCalled()
  })

  it('reads the selected file, stores a handoff, and opens that file in a new workspace', async () => {
    const bytes = new Uint8Array([71, 66, 75])
    const path = '/tmp/selected-construct.gb'
    mocks.openPicker.mockResolvedValue(path)
    mocks.readDroppedDesktopPaths.mockResolvedValue([{ path, name: 'selected-construct.gb', bytes }])

    await expect(pickAndOpenSequenceFileInNewWorkspaceWindow()).resolves.toBe(true)

    expect(mocks.openPicker).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Open sequence file',
      multiple: false,
      directory: false,
      filters: expect.arrayContaining([
        expect.objectContaining({ name: 'Sequence and construct files' }),
        expect.objectContaining({ name: 'All files', extensions: ['*'] }),
      ]),
    }))
    expect(mocks.readDroppedDesktopPaths).toHaveBeenCalledWith([path])
    const [[handoffId, handoffPayload]] = mocks.putFileOpenHandoff.mock.calls
    expect(handoffId).toEqual(expect.stringMatching(/^fopen/))
    expect(handoffPayload).toEqual({ path, name: 'selected-construct.gb', bytes })
    expect(mocks.openWorkspaceWindow).toHaveBeenCalledWith({
      searchParams: { fileHandoff: handoffId, openPath: path },
      title: 'selected-construct.gb — from disk',
      focus: true,
      documentKey: { kind: 'file', path },
    })
  })

  it('does not create a workspace when the selected path cannot be read', async () => {
    mocks.openPicker.mockResolvedValue('/tmp/missing.gb')
    mocks.readDroppedDesktopPaths.mockResolvedValue([])

    await expect(pickAndOpenSequenceFileInNewWorkspaceWindow()).resolves.toBe(false)

    expect(mocks.putFileOpenHandoff).not.toHaveBeenCalled()
    expect(mocks.openWorkspaceWindow).not.toHaveBeenCalled()
  })

  it('does not create a workspace if the native picker or file read fails', async () => {
    const failure = new Error('native dialog failed')
    mocks.openPicker.mockRejectedValue(failure)

    await expect(pickAndOpenSequenceFileInNewWorkspaceWindow()).rejects.toBe(failure)

    expect(mocks.readDroppedDesktopPaths).not.toHaveBeenCalled()
    expect(mocks.putFileOpenHandoff).not.toHaveBeenCalled()
    expect(mocks.openWorkspaceWindow).not.toHaveBeenCalled()
  })

  it('keeps File → Open in the editor path when a workspace exists', async () => {
    await expect(tryHandleGlobalNewFileMenuAction('file.open')).resolves.toBe(false)
    expect(mocks.openPicker).not.toHaveBeenCalled()
  })

  it('uses one global action id for File → Open and its shortcut when no workspace exists', async () => {
    const shortcut = KEYBOARD_SHORTCUTS.find((entry) => entry.action === 'file.open')
    expect(shortcut).toBeDefined()
    expect(shortcut?.key).toBe('O')
    // Native menu clicks and the shortcut accelerator both dispatch this same id;
    // routeMenuAction uses the global picker path for this no-workspace disposition.
    expect(shortcut?.action).toBe('file.open')
    expect(getNoWorkspaceMenuActionDisposition(shortcut!.action)).toBe('global')
    expect(menuActionRequiresConstructWindow(shortcut!.action)).toBe(false)
  })
})

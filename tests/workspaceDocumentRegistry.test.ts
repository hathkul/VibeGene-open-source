/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  claimedWorkspaceWindowLabel,
  claimWorkspaceDocument,
  focusExistingWorkspaceDocument,
  releaseWorkspaceDocument,
  workspaceDocumentKeyId,
  workspaceLabelShowsOtherDocument,
  workspaceWindowLabelFor,
} from '../src/desktop/workspaceDocumentRegistry'

vi.mock('../src/desktop/tauriRuntime', () => ({
  isTauriRuntime: () => true,
}))

const getByLabel = vi.fn()
const show = vi.fn(async () => {})
const setFocus = vi.fn(async () => {})

vi.mock('@tauri-apps/api/webviewWindow', () => ({
  WebviewWindow: {
    getByLabel: (...args: unknown[]) => getByLabel(...args),
  },
}))

describe('workspaceDocumentRegistry', () => {
  beforeEach(() => {
    window.localStorage.clear()
    getByLabel.mockReset()
    show.mockReset()
    setFocus.mockReset()
  })

  it('builds stable database keys and labels', () => {
    const key = { kind: 'database' as const, projectId: 'proj_abc-123' }
    expect(workspaceDocumentKeyId(key)).toBe('db:proj_abc-123')
    expect(workspaceWindowLabelFor(key)).toBe('workspace-db-proj_abc-123')
  })

  it('normalizes file paths for identity and uses a short hash label', () => {
    const key = { kind: 'file' as const, path: '/Users/Me/Plasmids/A.dna' }
    const same = { kind: 'file' as const, path: '/Users/me/Plasmids/A.dna/' }
    expect(workspaceDocumentKeyId(key)).toBe(workspaceDocumentKeyId(same))
    expect(workspaceWindowLabelFor(key)).toMatch(/^workspace-file-[0-9a-f]{8}$/)
    expect(workspaceWindowLabelFor(key)).toBe(workspaceWindowLabelFor(same))
  })

  it('releases the previous file when the same window claims a replacement', () => {
    const windowLabel = workspaceWindowLabelFor({ kind: 'file', path: '/a.dna' })
    claimWorkspaceDocument({ kind: 'file', path: '/a.dna' }, windowLabel)
    claimWorkspaceDocument({ kind: 'file', path: '/b.dna' }, windowLabel)

    expect(claimedWorkspaceWindowLabel({ kind: 'file', path: '/a.dna' })).toBeNull()
    expect(claimedWorkspaceWindowLabel({ kind: 'file', path: '/b.dna' })).toBe(windowLabel)
    expect(workspaceLabelShowsOtherDocument({ kind: 'file', path: '/a.dna' }, windowLabel)).toBe(true)
  })

  it('does not focus a stable-label window that now shows a different file', async () => {
    const windowLabel = workspaceWindowLabelFor({ kind: 'file', path: '/a.dna' })
    claimWorkspaceDocument({ kind: 'file', path: '/a.dna' }, windowLabel)
    claimWorkspaceDocument({ kind: 'file', path: '/b.dna' }, windowLabel)

    getByLabel.mockResolvedValue({ show, setFocus })

    expect(await focusExistingWorkspaceDocument({ kind: 'file', path: '/a.dna' })).toBe(false)
    expect(getByLabel).not.toHaveBeenCalled()
    expect(show).not.toHaveBeenCalled()

    expect(await focusExistingWorkspaceDocument({ kind: 'file', path: '/b.dna' })).toBe(true)
    expect(getByLabel).toHaveBeenCalledWith(windowLabel)
    expect(show).toHaveBeenCalled()
    expect(setFocus).toHaveBeenCalled()
  })

  it('clears a stale registry entry when the claimed window is gone', async () => {
    claimWorkspaceDocument({ kind: 'file', path: '/a.dna' }, 'workspace-file-dead')
    getByLabel.mockResolvedValue(null)

    expect(await focusExistingWorkspaceDocument({ kind: 'file', path: '/a.dna' })).toBe(false)
    expect(claimedWorkspaceWindowLabel({ kind: 'file', path: '/a.dna' })).toBeNull()
  })

  it('releaseWorkspaceDocument clears all claims for a window label', () => {
    claimWorkspaceDocument({ kind: 'file', path: '/a.dna' }, 'win-1')
    releaseWorkspaceDocument('win-1')
    expect(claimedWorkspaceWindowLabel({ kind: 'file', path: '/a.dna' })).toBeNull()
  })
})

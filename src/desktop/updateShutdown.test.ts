import { describe, expect, it, vi } from 'vitest'
import { prepareShutdownForUpdate, type UpdateShutdownPorts } from './updateShutdown'

describe('prepareShutdownForUpdate', () => {
  function ports(): UpdateShutdownPorts {
    return {
      closeNextWorkspace: vi.fn().mockResolvedValue('none'),
      hasOpenWorkspaces: vi.fn().mockResolvedValue(false),
      syncDatabase: vi.fn().mockResolvedValue(true),
    }
  }

  it('waits for all workspace close decisions before syncing', async () => {
    const p = ports()
    vi.mocked(p.closeNextWorkspace).mockResolvedValueOnce('closed').mockResolvedValueOnce('closed')
    expect(await prepareShutdownForUpdate(p)).toBe(true)
    expect(p.closeNextWorkspace).toHaveBeenCalledTimes(3)
    expect(p.syncDatabase).toHaveBeenCalledOnce()
  })

  it('does not sync or install when a save prompt is cancelled', async () => {
    const p = ports()
    vi.mocked(p.closeNextWorkspace).mockResolvedValueOnce('closed').mockResolvedValueOnce('cancelled')
    expect(await prepareShutdownForUpdate(p)).toBe(false)
    expect(p.syncDatabase).not.toHaveBeenCalled()
  })

  it('refuses to proceed when a workspace remains open', async () => {
    const p = ports()
    vi.mocked(p.hasOpenWorkspaces).mockResolvedValue(true)
    expect(await prepareShutdownForUpdate(p)).toBe(false)
    expect(p.syncDatabase).not.toHaveBeenCalled()
  })

  it('refuses to proceed after failed sync or a newly opened workspace', async () => {
    const failed = ports()
    vi.mocked(failed.syncDatabase).mockResolvedValue(false)
    expect(await prepareShutdownForUpdate(failed)).toBe(false)
    const reopened = ports()
    vi.mocked(reopened.hasOpenWorkspaces).mockResolvedValueOnce(false).mockResolvedValueOnce(true)
    expect(await prepareShutdownForUpdate(reopened)).toBe(false)
  })
})

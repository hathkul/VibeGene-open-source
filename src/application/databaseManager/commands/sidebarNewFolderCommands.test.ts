import { describe, expect, it, vi } from 'vitest'
import { openDatabaseManagerSidebarNewFolderPrompt } from './sidebarNewFolderCommands'

describe('sidebar new folder commands', () => {
  it('sequences create, move-in, browse, and status', async () => {
    const open = vi.fn()
    const run = vi.fn(async (_label, action) => action())
    const report = vi.fn()
    const createFolder = vi.fn(async () => ({ id: 'f-new', name: 'Lab' }))
    const moveProjectsToFolder = vi.fn(async () => {})
    const browseFolder = vi.fn()
    const restoreSelection = vi.fn()
    const close = vi.fn()

    openDatabaseManagerSidebarNewFolderPrompt({
      movingProjectIds: ['p1', 'p2'],
      singleSelectedName: null,
      parentId: null,
      textPrompt: { open, close },
      action: { run },
      status: { report: report },
      folder: { createFolder, moveProjectsToFolder, browseFolder, restoreSelection },
    })

    expect(open).toHaveBeenCalledTimes(1)
    const request = open.mock.calls[0]![0]
    expect(request.label).toContain('2 selected files')

    await request.onConfirm('Lab')
    expect(createFolder).toHaveBeenCalledWith('Lab', null)
    expect(moveProjectsToFolder).toHaveBeenCalledWith(['p1', 'p2'], 'f-new')
    expect(restoreSelection).toHaveBeenCalledWith(['p1', 'p2'])
    expect(browseFolder).toHaveBeenCalledWith('f-new')
    expect(close).toHaveBeenCalled()
    expect(report).toHaveBeenCalledWith(expect.stringContaining('Created folder “Lab”'))
    expect(report).toHaveBeenCalledWith(expect.stringContaining('moved 2 files'))
  })
})

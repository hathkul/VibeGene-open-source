import { describe, expect, it, vi } from 'vitest'
import {
  databaseManagerFolderMoveCycleFailureStatus,
  databaseManagerFolderMoveSuccessStatus,
  databaseManagerProjectMoveSuccessStatus,
  executeDatabaseManagerMovePickerConfirm,
} from './folderMoveOrchestration'

describe('folder move orchestration', () => {
  it('reports cycle failure without success copy and keeps picker open', async () => {
    const reportStatus = vi.fn()
    const closePicker = vi.fn()
    const completed = await executeDatabaseManagerMovePickerConfirm(
      { kind: 'move-folder', folderId: 'f1' },
      'parent',
      'unfiled',
      {
        moveFolder: vi.fn(async () => null),
        moveProjects: vi.fn(),
        resolveDestinationLabel: () => 'Unfiled',
        reportStatus,
      },
    )
    expect(completed).toBe(false)
    expect(reportStatus).toHaveBeenCalledWith(databaseManagerFolderMoveCycleFailureStatus)
    if (completed) closePicker()
    expect(closePicker).not.toHaveBeenCalled()
  })

  it('reports moved folder success and allows picker close', async () => {
    const reportStatus = vi.fn()
    const closePicker = vi.fn()
    const completed = await executeDatabaseManagerMovePickerConfirm(
      { kind: 'move-folder', folderId: 'f1' },
      '',
      'unfiled',
      {
        moveFolder: vi.fn(async () => ({ name: 'Lab' })),
        moveProjects: vi.fn(),
        resolveDestinationLabel: () => 'Root',
        reportStatus,
      },
    )
    expect(completed).toBe(true)
    expect(reportStatus).toHaveBeenCalledWith(databaseManagerFolderMoveSuccessStatus('Lab'))
    if (completed) closePicker()
    expect(closePicker).toHaveBeenCalledTimes(1)
  })

  it('reports singular and plural project move messages', async () => {
    const reportStatus = vi.fn()
    await executeDatabaseManagerMovePickerConfirm(
      { kind: 'move-projects', projectIds: ['p1'] },
      'folder-a',
      'unfiled',
      {
        moveFolder: vi.fn(),
        moveProjects: vi.fn(async () => 1),
        resolveDestinationLabel: () => 'Lab',
        reportStatus,
      },
    )
    expect(reportStatus).toHaveBeenCalledWith(
      databaseManagerProjectMoveSuccessStatus({ count: 1, destinationLabel: 'Lab' }),
    )

    reportStatus.mockClear()
    await executeDatabaseManagerMovePickerConfirm(
      { kind: 'move-projects', projectIds: ['p1', 'p2'] },
      'folder-a',
      'unfiled',
      {
        moveFolder: vi.fn(),
        moveProjects: vi.fn(async () => 2),
        resolveDestinationLabel: () => 'Lab',
        reportStatus,
      },
    )
    expect(reportStatus).toHaveBeenCalledWith(
      databaseManagerProjectMoveSuccessStatus({ count: 2, destinationLabel: 'Lab' }),
    )
  })
})

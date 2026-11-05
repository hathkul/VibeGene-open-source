// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useDatabaseLibraryController } from './useDatabaseLibraryController'

describe('useDatabaseLibraryController', () => {
  let host: HTMLDivElement
  let root: ReturnType<typeof createRoot>

  afterEach(() => {
    act(() => root?.unmount())
    host?.remove()
  })

  it('routes library picks through the adapter and falls back to the in-page database', async () => {
    const openDatabaseWindow = vi.fn().mockResolvedValue(false)
    let controller: ReturnType<typeof useDatabaseLibraryController>
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)

    function Harness() {
      controller = useDatabaseLibraryController({
        initialFolderId: null,
        currentRecordId: 'record-1',
        openDatabaseWindow,
      })
      return null
    }

    await act(async () => root.render(<Harness />))
    await act(async () => {
      controller!.openDatabaseForLibraryMembers('convert')
      await Promise.resolve()
    })

    expect(openDatabaseWindow).toHaveBeenCalledWith({
      currentRecordId: 'record-1',
      alignmentPick: null,
      constructPick: null,
      libraryMemberPick: { targetRecordId: 'record-1', purpose: 'convert' },
    })
    expect(controller!.databaseLibraryMemberPick).toEqual({
      targetRecordId: 'record-1',
      purpose: 'convert',
    })
    expect(controller!.databaseOpen).toBe(true)
  })
})

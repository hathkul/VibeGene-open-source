// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DatabaseDialogsHostProps } from '../src/presentation/dialogs/DatabaseDialogsHost'
import { DatabaseDialogsHost } from '../src/presentation/dialogs/DatabaseDialogsHost'

vi.mock('../src/DatabaseManagerDialog', () => {
  throw new Error('chunk unavailable')
})

function baseProps(overrides: Partial<DatabaseDialogsHostProps> = {}): DatabaseDialogsHostProps {
  return {
    databaseOpen: false,
    databaseManagerProps: {
      projects: [],
      currentRecordId: 'rec-1',
      onRefresh: vi.fn(),
      onOpenProject: vi.fn(),
      onAddPrimersToCurrent: vi.fn(),
      onDeleteProjects: vi.fn(),
      onStatus: vi.fn(),
    },
    setDatabaseOpen: vi.fn(),
    sequenceDatabaseImportOpen: false,
    sequenceImportProps: { onOpen: vi.fn(), onOpenExternal: vi.fn() },
    setSequenceDatabaseImportOpen: vi.fn(),
    combineLibraryReadsOpen: false,
    combineLibraryProps: { members: [], onCombine: vi.fn() },
    setCombineLibraryReadsOpen: vi.fn(),
    dedupeLibraryMembersGroups: null,
    dedupeLibraryProps: { onConfirm: vi.fn() },
    setDedupeLibraryMembersGroups: vi.fn(),
    ...overrides,
  }
}

describe('DatabaseDialogsHost database manager load failure', () => {
  let host: HTMLDivElement
  let root: ReturnType<typeof createRoot>
  let consoleError: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
  })

  afterEach(() => {
    act(() => root.unmount())
    host.remove()
    consoleError.mockRestore()
  })

  it('closes the manager and reports a status when its chunk import fails', async () => {
    const onDatabaseClose = vi.fn()
    const onStatus = vi.fn()
    const props = baseProps({ databaseOpen: true, onDatabaseClose })
    props.databaseManagerProps.onStatus = onStatus
    act(() => {
      root.render(<DatabaseDialogsHost {...props} />)
    })
    expect(host.querySelector('[role="status"]')?.textContent).toBe('Loading…')

    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })
    // Host-owned failure path: close the manager, then report via onStatus.
    expect(onDatabaseClose).toHaveBeenCalledTimes(1)
    expect(onStatus).toHaveBeenCalledWith('Could not load the Database dialog.')
    expect(host.querySelector('[role="status"]')).toBeNull()
    expect(host.querySelector('.translation-dialog-backdrop')).toBeNull()
  })
})

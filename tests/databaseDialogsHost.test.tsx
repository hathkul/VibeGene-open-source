// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DatabaseDialogsHostProps } from '../src/presentation/dialogs/DatabaseDialogsHost'
import { DatabaseDialogsHost } from '../src/presentation/dialogs/DatabaseDialogsHost'

const probe = vi.hoisted(() => ({
  moduleLoads: 0,
  lastProps: null as Record<string, unknown> | null,
}))

vi.mock('../src/DatabaseManagerDialog', () => {
  probe.moduleLoads += 1
  return {
    DatabaseManagerDialog: (props: Record<string, unknown>) => {
      probe.lastProps = props
      return <div data-testid="database-manager" />
    },
  }
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

describe('DatabaseDialogsHost lazy database manager', () => {
  let host: HTMLDivElement
  let root: ReturnType<typeof createRoot>

  beforeEach(() => {
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
  })

  afterEach(() => {
    act(() => root.unmount())
    host.remove()
  })

  it('does not load the DatabaseManagerDialog chunk while the database is closed', () => {
    act(() => {
      root.render(<DatabaseDialogsHost {...baseProps()} />)
    })
    expect(probe.moduleLoads).toBe(0)
    expect(host.querySelector('[data-testid="database-manager"]')).toBeNull()
  })

  it('loads the manager on open and passes the manager props through', async () => {
    const onDatabaseClose = vi.fn()
    const props = baseProps({ databaseOpen: true, onDatabaseClose })
    act(() => {
      root.render(<DatabaseDialogsHost {...props} />)
    })
    expect(host.querySelector('[role="status"]')?.textContent).toBe('Loading…')

    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(probe.moduleLoads).toBe(1)
    expect(host.querySelector('[role="status"]')).toBeNull()
    expect(host.querySelector('[data-testid="database-manager"]')).toBeTruthy()
    expect(probe.lastProps!.projects).toBe(props.databaseManagerProps.projects)
    expect(probe.lastProps!.currentRecordId).toBe('rec-1')
    expect(probe.lastProps!.onRefresh).toBe(props.databaseManagerProps.onRefresh)

    act(() => {
      ;(probe.lastProps!.onClose as () => void)()
    })
    expect(onDatabaseClose).toHaveBeenCalledTimes(1)
  })

  it('closes through setDatabaseOpen when no onDatabaseClose is provided', async () => {
    const props = baseProps({ databaseOpen: true })
    act(() => {
      root.render(<DatabaseDialogsHost {...props} />)
    })
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })
    act(() => {
      ;(probe.lastProps!.onClose as () => void)()
    })
    expect(props.setDatabaseOpen).toHaveBeenCalledWith(false)
  })
})

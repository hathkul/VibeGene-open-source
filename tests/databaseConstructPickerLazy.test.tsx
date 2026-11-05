// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DatabaseConstructPickerDialog } from '../src/cloning/DatabaseConstructPickerDialog'

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

vi.mock('../src/desktop/tauriRuntime', () => ({
  isTauriRuntime: () => false,
}))

vi.mock('../src/storage/projects', () => ({
  deleteProject: vi.fn(),
  getProject: vi.fn(),
  getProjectFileBlob: vi.fn(async () => null),
  listProjectSummaries: vi.fn(async () => []),
}))

vi.mock('../src/storage/recentFiles', () => ({
  touchRecentDatabaseProject: vi.fn(),
}))

vi.mock('../src/desktop/hybridWindows', () => ({
  cancelDatabaseConstructPick: vi.fn(),
  openOrFocusHybridWindow: vi.fn(),
  subscribeHybridResults: vi.fn(async () => () => {}),
}))

describe('DatabaseConstructPickerDialog lazy database manager', () => {
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

  it('loads the DatabaseManagerDialog chunk only once the picker view is shown', async () => {
    // Importing the picker module (what an eager cloning dialog does) must not
    // pull the manager chunk.
    expect(probe.moduleLoads).toBe(0)

    act(() => {
      root.render(<DatabaseConstructPickerDialog onCancel={vi.fn()} onSelect={vi.fn()} />)
    })
    // While projects load, the picker shows its own loading dialog, not the manager.
    expect(host.textContent).toContain('Loading database…')

    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(probe.moduleLoads).toBe(1)
    expect(host.querySelector('[data-testid="database-manager"]')).toBeTruthy()
    expect(probe.lastProps!.projects).toEqual([])
  })
})

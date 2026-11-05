// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  cancelPicker: vi.fn(async () => true),
  openDatabase: vi.fn(async () => true),
  resultListener: undefined as ((result: Record<string, unknown>) => void | Promise<void>) | undefined,
  subscribeResults: vi.fn(async (handler: (result: Record<string, unknown>) => void | Promise<void>) => {
    mocks.resultListener = handler
    return () => undefined
  }),
}))

vi.mock('../src/desktop/tauriRuntime', () => ({
  isTauriRuntime: () => true,
}))

vi.mock('../src/desktop/hybridWindows', () => ({
  cancelDatabaseConstructPick: mocks.cancelPicker,
  openOrFocusHybridWindow: mocks.openDatabase,
  subscribeHybridResults: mocks.subscribeResults,
}))

vi.mock('../src/DatabaseManagerDialog', () => ({
  DatabaseManagerDialog: () => null,
}))

vi.mock('../src/storage/projects', () => ({
  deleteProject: vi.fn(),
  getProjectFileBlob: vi.fn(),
  getProject: vi.fn(),
  listProjectSummaries: vi.fn(async () => []),
}))

vi.mock('../src/storage/recentFiles', () => ({
  touchRecentDatabaseProject: vi.fn(),
}))

import { DatabaseConstructPickerDialog } from '../src/cloning/DatabaseConstructPickerDialog'

let root: ReturnType<typeof createRoot> | null = null
let container: HTMLDivElement | null = null

async function renderPicker(onCancel = vi.fn(), onSelectMany = vi.fn()) {
  if (!container) {
    container = document.createElement('div')
    document.body.append(container)
    root = createRoot(container)
  }
  await act(async () => {
    root!.render(
      <DatabaseConstructPickerDialog
        excludeRecordId="vector-1"
        multiple
        onCancel={onCancel}
        onSelectMany={onSelectMany}
      />,
    )
    await Promise.resolve()
  })
}

beforeEach(() => {
  mocks.cancelPicker.mockClear()
  mocks.openDatabase.mockClear()
  mocks.subscribeResults.mockClear()
  mocks.resultListener = undefined
})

afterEach(() => {
  if (root) act(() => root!.unmount())
  container?.remove()
  root = null
  container = null
})

describe('DatabaseConstructPickerDialog desktop lifecycle', () => {
  it('does not reopen the Database window when callback props change', async () => {
    await renderPicker()
    expect(mocks.openDatabase).toHaveBeenCalledTimes(1)

    await renderPicker(vi.fn(), vi.fn())
    expect(mocks.openDatabase).toHaveBeenCalledTimes(1)
  })

  it('releases its request-scoped picker session when unmounted', async () => {
    await renderPicker()
    const requestId = mocks.openDatabase.mock.calls[0]![1].constructPick.requestId

    await act(async () => {
      root!.unmount()
      root = null
      await Promise.resolve()
    })

    expect(mocks.cancelPicker).toHaveBeenCalledWith(requestId)
  })

  it('only reacts to cancellation of its own picker request', async () => {
    const onCancel = vi.fn()
    await renderPicker(onCancel)
    const requestId = mocks.openDatabase.mock.calls[0]![1].constructPick.requestId

    await act(async () => {
      await mocks.resultListener?.({
        kind: 'database',
        type: 'construct-pick-cancelled',
        requestId: 'another-picker',
      })
    })
    expect(onCancel).not.toHaveBeenCalled()

    await act(async () => {
      await mocks.resultListener?.({
        kind: 'database',
        type: 'construct-pick-cancelled',
        requestId,
      })
    })
    expect(onCancel).toHaveBeenCalledTimes(1)
  })
})

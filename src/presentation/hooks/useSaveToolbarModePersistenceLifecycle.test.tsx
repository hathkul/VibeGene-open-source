// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useSaveToolbarModePersistenceLifecycle } from './useSaveToolbarModePersistenceLifecycle'

describe('useSaveToolbarModePersistenceLifecycle', () => {
  let host: HTMLDivElement | undefined
  let root: ReturnType<typeof createRoot> | undefined

  afterEach(() => {
    act(() => root?.unmount())
    host?.remove()
    vi.clearAllMocks()
  })

  it('persists the mode on mount and when saveToolbarMode changes', async () => {
    const writeSaveToolbarMode = vi.fn()
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)

    function Harness({ mode }: { mode: 'save' | 'save-to' }) {
      useSaveToolbarModePersistenceLifecycle({ saveToolbarMode: mode, writeSaveToolbarMode })
      return null
    }

    await act(async () => { root!.render(<Harness mode="save" />); await Promise.resolve() })
    expect(writeSaveToolbarMode).toHaveBeenCalledTimes(1)
    expect(writeSaveToolbarMode).toHaveBeenLastCalledWith('save')

    await act(async () => { root!.render(<Harness mode="save-to" />); await Promise.resolve() })
    expect(writeSaveToolbarMode).toHaveBeenCalledTimes(2)
    expect(writeSaveToolbarMode).toHaveBeenLastCalledWith('save-to')
  })

  it('does not persist again when only the write adapter identity changes', async () => {
    const persistedGenerations: number[] = []
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)

    function Harness({ generation }: { generation: number }) {
      useSaveToolbarModePersistenceLifecycle({
        saveToolbarMode: 'save',
        writeSaveToolbarMode: () => {
          persistedGenerations.push(generation)
        },
      })
      return null
    }

    await act(async () => { root!.render(<Harness generation={0} />); await Promise.resolve() })
    await act(async () => { root!.render(<Harness generation={1} />); await Promise.resolve() })
    expect(persistedGenerations).toEqual([0])
  })

  it('does not rewrite storage after unmount when mode props stop updating', async () => {
    const writeSaveToolbarMode = vi.fn()
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)

    function Harness() {
      useSaveToolbarModePersistenceLifecycle({ saveToolbarMode: 'save-dna', writeSaveToolbarMode })
      return null
    }

    await act(async () => { root!.render(<Harness />); await Promise.resolve() })
    expect(writeSaveToolbarMode).toHaveBeenCalledTimes(1)
    act(() => root!.unmount())
    expect(writeSaveToolbarMode).toHaveBeenCalledTimes(1)
  })
})

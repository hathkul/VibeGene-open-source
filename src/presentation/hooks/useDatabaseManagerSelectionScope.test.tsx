// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'vitest'
import { useDatabaseManagerSelectionScope } from './useDatabaseManagerSelectionScope'

describe('useDatabaseManagerSelectionScope', () => {
  let host: HTMLDivElement
  let root: ReturnType<typeof createRoot>
  let current: ReturnType<typeof useDatabaseManagerSelectionScope> | undefined

  afterEach(() => {
    act(() => root?.unmount())
    host?.remove()
  })

  it('starts functional selection updates from an empty scope after a new request', () => {
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    function Harness({ scope }: { scope: string | null }) {
      current = useDatabaseManagerSelectionScope(scope)
      return null
    }

    act(() => root.render(<Harness scope="request-a" />))
    act(() => current!.setScopedSelectedIds(['A']))
    expect(current!.selectedIds).toEqual(['A'])
    act(() => root.render(<Harness scope="request-b" />))
    act(() => current!.setScopedSelectedIds((ids) => ids.includes('B') ? ids.filter((id) => id !== 'B') : [...ids, 'B']))
    expect(current!.selectedIds).toEqual(['B'])
  })
})

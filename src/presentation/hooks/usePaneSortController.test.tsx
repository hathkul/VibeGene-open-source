// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'vitest'
import { usePaneSortController } from './usePaneSortController'

describe('usePaneSortController', () => {
  let host: HTMLDivElement
  let root: ReturnType<typeof createRoot>

  afterEach(() => {
    act(() => root?.unmount())
    host?.remove()
  })

  it('applies consecutive same-column sort toggles from fresh direction state', () => {
    let controller: ReturnType<typeof usePaneSortController>
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    function Harness() {
      controller = usePaneSortController()
      return null
    }
    act(() => root.render(<Harness />))

    act(() => {
      controller!.toggleFeatureTabSort('location')
      controller!.toggleFeatureTabSort('location')
    })

    expect(controller!.featureTabSortDirection).toBe('asc')
  })
})

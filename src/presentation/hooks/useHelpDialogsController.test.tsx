// @vitest-environment jsdom

import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useHelpDialogsController } from './useHelpDialogsController'

describe('useHelpDialogsController', () => {
  let host: HTMLDivElement | undefined
  let root: ReturnType<typeof createRoot> | undefined

  afterEach(() => {
    act(() => root?.unmount())
    host?.remove()
  })

  it('opens and closes about without clearing unrelated help dialog flags', () => {
    let controller: ReturnType<typeof useHelpDialogsController> | undefined
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    function Harness() {
      controller = useHelpDialogsController()
      return null
    }
    act(() => { root!.render(<Harness />) })
    act(() => { controller!.setDatabaseHelpOpen(true) })
    act(() => { controller!.setAboutOpen(true) })
    expect(controller!.openSnapshot.aboutOpen).toBe(true)
    expect(controller!.openSnapshot.databaseHelpOpen).toBe(true)
    act(() => { controller!.setAboutOpen(false) })
    expect(controller!.openSnapshot.aboutOpen).toBe(false)
    expect(controller!.openSnapshot.databaseHelpOpen).toBe(true)
  })

  it('falls back to in-app genetic code tables when hybrid focus fails', async () => {
    let controller: ReturnType<typeof useHelpDialogsController> | undefined
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    function Harness() {
      controller = useHelpDialogsController()
      return null
    }
    act(() => { root!.render(<Harness />) })
    await act(async () => {
      controller!.openGeneticCodeTablesWindow({
        tryOpenHybridWindow: vi.fn(async () => false),
      })
    })
    expect(controller!.openSnapshot.geneticCodeTablesOpen).toBe(true)
  })
})

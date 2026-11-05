// @vitest-environment jsdom
import { act, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useWorkspacePanelLayoutController } from './useWorkspacePanelLayoutController'

describe('useWorkspacePanelLayoutController', () => {
  let host: HTMLDivElement
  let root: ReturnType<typeof createRoot>

  afterEach(() => {
    act(() => root?.unmount())
    host?.remove()
  })

  it('does not reopen a manually closed description panel on an unrelated render', async () => {
    let controller: ReturnType<typeof useWorkspacePanelLayoutController>
    let rerender: () => void
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    function Harness() {
      const [, setTick] = useState(0)
      rerender = () => setTick((current) => current + 1)
      controller = useWorkspacePanelLayoutController({
        recordId: 'record-1', traceDocument: false, initialMapAlignmentSidebarWidthPx: 320,
        initialDescriptionPanelWidthPx: 270, initiallyDescriptionVisible: true,
        isMobileShell: () => false, shouldShowDescriptionPanelOnOpen: () => true,
        persistDescriptionPanelWidth: vi.fn(),
        pointerTarget: { addEventListener: vi.fn(), removeEventListener: vi.fn() },
        bodyClassList: { add: vi.fn(), remove: vi.fn() },
      })
      return null
    }
    await act(async () => root.render(<Harness />))
    act(() => controller!.setDescriptionPanelVisible(false))
    expect(controller!.descriptionPanelVisible).toBe(false)
    act(() => rerender!())
    expect(controller!.descriptionPanelVisible).toBe(false)
  })
})

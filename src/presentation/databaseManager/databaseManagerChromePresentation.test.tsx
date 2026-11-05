// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { describe, expect, it, vi } from 'vitest'
import { DbColumnResizeHandle, DbSortHeader } from './DbTableChrome'
import { DbRowExportMenu, DbSelectionExportMenu } from './DbExportMenus'
import { DbToolbarMenuProvider, DbToolbarModeGroup } from './DbToolbarModeGroup'
import { DatabaseTextPromptDialog } from './DatabaseTextPromptDialog'
import type { DatabaseTextPromptModel } from './DatabaseTextPromptDialog'
import {
  mount,
  registerDatabaseManagerPresentationTestCleanup,
  setInputValue,
} from './databaseManagerPresentationTestMount'

registerDatabaseManagerPresentationTestCleanup()

describe('DbSortHeader', () => {
  it('routes sort clicks with the column id', () => {
    const onSort = vi.fn()
    const { container, unmount } = mount(
      <DbSortHeader
        label="Name"
        column="name"
        activeColumn="name"
        direction="asc"
        onSort={onSort}
      />,
    )
    const button = container.querySelector('button.db-table-sort-header') as HTMLButtonElement
    act(() => {
      button.click()
    })
    expect(onSort).toHaveBeenCalledWith('name')
    expect(button.getAttribute('aria-sort')).toBe('ascending')
    unmount()
  })
})

describe('DbColumnResizeHandle', () => {
  it('reports resize deltas through onResize', () => {
    const onResize = vi.fn()
    const { container, unmount } = mount(
      <DbColumnResizeHandle columnId="name" width={120} onResize={onResize} />,
    )
    const handle = container.querySelector('.db-col-resize-handle') as HTMLSpanElement
    handle.setPointerCapture = vi.fn()
    handle.releasePointerCapture = vi.fn()
    act(() => {
      handle.dispatchEvent(
        new PointerEvent('pointerdown', { clientX: 100, bubbles: true, pointerId: 1 }),
      )
    })
    act(() => {
      handle.dispatchEvent(
        new PointerEvent('pointermove', { clientX: 130, bubbles: true, pointerId: 1 }),
      )
    })
    expect(onResize).toHaveBeenCalledWith('name', 150)
    unmount()
  })
})

describe('DbRowExportMenu', () => {
  it('routes export menu selections to onExport with format', async () => {
    const onExport = vi.fn(async () => undefined)
    const { container, unmount } = mount(
      <DbRowExportMenu projectName="pA" onExport={onExport} />,
    )
    const trigger = container.querySelector('.db-file-export > button') as HTMLButtonElement
    act(() => {
      trigger.click()
    })
    const genbank = Array.from(container.querySelectorAll('[role="menuitem"]')).find((node) =>
      node.textContent?.includes('GenBank'),
    ) as HTMLButtonElement
    await act(async () => {
      genbank.click()
    })
    expect(onExport).toHaveBeenCalledWith('gb')
    unmount()
  })

  it('closes on Escape', () => {
    const onExport = vi.fn(async () => undefined)
    const { container, unmount } = mount(
      <DbRowExportMenu projectName="pA" onExport={onExport} />,
    )
    act(() => {
      ;(container.querySelector('.db-file-export > button') as HTMLButtonElement).click()
    })
    expect(container.querySelector('[role="menu"]')).not.toBeNull()
    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    })
    expect(container.querySelector('[role="menu"]')).toBeNull()
    unmount()
  })
})

describe('DbSelectionExportMenu', () => {
  it('routes bulk export to onExport', async () => {
    const onExport = vi.fn(async () => undefined)
    const { container, unmount } = mount(
      <DbSelectionExportMenu
        selectionCount={2}
        selectionTitle="Export two"
        onExport={onExport}
      />,
    )
    act(() => {
      ;(container.querySelector('.db-selection-export > button') as HTMLButtonElement).click()
    })
    const fasta = Array.from(container.querySelectorAll('[role="menuitem"]')).find((node) =>
      node.textContent?.includes('FASTA'),
    ) as HTMLButtonElement
    await act(async () => {
      fasta.click()
    })
    expect(onExport).toHaveBeenCalledWith('fasta')
    unmount()
  })
})

describe('DbToolbarModeGroup', () => {
  it('runs the active mode from the main button', () => {
    const onRun = vi.fn()
    const { container, unmount } = mount(
      <DbToolbarMenuProvider>
        <DbToolbarModeGroup
          menuId="import"
          value="a"
          disabled={false}
          onChange={() => undefined}
          onRun={onRun}
          modes={[
            { id: 'a', label: 'Mode A', title: 'A', icon: <span>A</span> },
            { id: 'b', label: 'Mode B', title: 'B', icon: <span>B</span> },
          ]}
        />
      </DbToolbarMenuProvider>,
    )
    act(() => {
      ;(container.querySelector('.db-toolbar-mode-main') as HTMLButtonElement).click()
    })
    expect(onRun).toHaveBeenCalledWith('a', expect.objectContaining({ shiftKey: expect.any(Boolean) }))
    unmount()
  })

  it('closes the mode menu on Escape', () => {
    const { container, unmount } = mount(
      <DbToolbarMenuProvider>
        <DbToolbarModeGroup
          menuId="import"
          value="a"
          onChange={() => undefined}
          onRun={() => undefined}
          modes={[
            { id: 'a', label: 'Mode A', title: 'A', icon: <span>A</span> },
            { id: 'b', label: 'Mode B', title: 'B', icon: <span>B</span> },
          ]}
        />
      </DbToolbarMenuProvider>,
    )
    act(() => {
      ;(container.querySelector('.db-toolbar-mode-chevron') as HTMLButtonElement).click()
    })
    expect(container.querySelector('.db-toolbar-mode-menu')).not.toBeNull()
    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    })
    expect(container.querySelector('.db-toolbar-mode-menu')).toBeNull()
    unmount()
  })
})

describe('DatabaseTextPromptDialog', () => {
  it('keeps edited draft across parent re-renders with the same prompt identity', () => {
    const stablePrompt: DatabaseTextPromptModel = {
      title: 'Rename',
      label: 'Name',
      initial: 'alpha',
    }
    function Host({ prompt, renderNonce }: { prompt: DatabaseTextPromptModel; renderNonce: number }) {
      return (
        <div data-render-nonce={renderNonce}>
          <DatabaseTextPromptDialog
            prompt={prompt}
            busy={false}
            onConfirm={() => undefined}
            onCancel={() => undefined}
          />
        </div>
      )
    }
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root: Root = createRoot(host)
    act(() => {
      root.render(<Host prompt={stablePrompt} renderNonce={0} />)
    })
    const input = host.querySelector('input') as HTMLInputElement
    act(() => {
      setInputValue(input, 'edited-name')
    })
    expect(input.value).toBe('edited-name')
    act(() => {
      root.render(<Host prompt={stablePrompt} renderNonce={1} />)
    })
    expect((host.querySelector('input') as HTMLInputElement).value).toBe('edited-name')
    const replacementPrompt: DatabaseTextPromptModel = {
      title: 'Rename',
      label: 'Name',
      initial: 'replacement',
    }
    act(() => {
      root.render(<Host prompt={replacementPrompt} renderNonce={2} />)
    })
    expect((host.querySelector('input') as HTMLInputElement).value).toBe('replacement')
    act(() => {
      root.unmount()
    })
    host.remove()
  })

  it('submits trimmed values and supports cancel', () => {
    const onConfirm = vi.fn()
    const onCancel = vi.fn()
    const { container, unmount } = mount(
      <DatabaseTextPromptDialog
        prompt={{ title: 'Rename', label: 'Name', initial: '  beta  ' }}
        busy={false}
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    )
    const input = container.querySelector('input') as HTMLInputElement
    act(() => {
      ;(container.querySelector('.primary') as HTMLButtonElement).click()
    })
    expect(onConfirm).toHaveBeenCalledWith('beta')

    act(() => {
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    })
    expect(onCancel).toHaveBeenCalled()
    unmount()
  })
})

// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { describe, expect, it, vi } from 'vitest'
import { FolderTreeRows } from './FolderTreeRows'
import { FolderSyncPreflightDialog } from './FolderSyncPreflightDialog'
import { DatabaseManagerSidebar } from './DatabaseManagerSidebar'
import type { FolderSyncPreflightViewModel } from './folderSyncPreflightTypes'
import {
  mount,
  registerDatabaseManagerPresentationTestCleanup,
} from './databaseManagerPresentationTestMount'

registerDatabaseManagerPresentationTestCleanup()

describe('FolderTreeRows', () => {
  const nodes = [
    {
      id: 'root',
      name: 'Root',
      children: [{ id: 'child', name: 'Child', children: [] }],
    },
  ]

  it('selects folders and toggles expansion', () => {
    const onSelect = vi.fn()
    const onToggle = vi.fn()
    const { container, unmount } = mount(
      <FolderTreeRows
        nodes={nodes}
        depth={0}
        selectedFolderId={null}
        expandedIds={new Set()}
        onSelect={onSelect}
        onToggle={onToggle}
      />,
    )
    act(() => {
      ;(container.querySelector('.db-tree-twistie') as HTMLButtonElement).click()
    })
    expect(onToggle).toHaveBeenCalledWith('root')
    act(() => {
      ;(container.querySelector('.db-tree-label') as HTMLButtonElement).click()
    })
    expect(onSelect).toHaveBeenCalledWith('root')
    unmount()
  })
})

function makeSyncModel(
  overrides: Partial<FolderSyncPreflightViewModel> = {},
): FolderSyncPreflightViewModel {
  return {
    intent: 'sync-from',
    externalPath: '/tmp/source',
    direction: 'from',
    showPrimerListCount: true,
    primerListCount: 0,
    counts: {
      addToDb: 0,
      updateDb: 0,
      createOnDisk: 0,
      overwriteDisk: 0,
      removeFromDb: 0,
      ignore: 0,
      conflict: 1,
    },
    missingDiskConflicts: false,
    presentDiskConflicts: true,
    applyAllDatabaseLabel: 'Keep database',
    applyAllFilesystemLabel: 'Use folder',
    conflicts: [
      {
        id: 'c1',
        relativePath: 'a.dna',
        issueLabel: 'Both sides changed',
        supported: true,
        allowedChoices: ['database', 'filesystem'],
        hasDiskFile: true,
      },
    ],
    initialChoices: { c1: 'filesystem' },
    ...overrides,
  }
}

describe('FolderSyncPreflightDialog', () => {
  it('keeps conflict choice across parent re-renders with the same model identity', () => {
    const stableModel = makeSyncModel()
    const onApply = vi.fn()
    function Host({ model, renderNonce }: { model: FolderSyncPreflightViewModel; renderNonce: number }) {
      return (
        <div data-render-nonce={renderNonce}>
          <FolderSyncPreflightDialog
            model={model}
            busy={false}
            onCancel={() => undefined}
            onApply={onApply}
          />
        </div>
      )
    }
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root: Root = createRoot(host)
    act(() => {
      root.render(<Host model={stableModel} renderNonce={0} />)
    })
    act(() => {
      ;(host.querySelector('input[type="radio"][value="database"]') as HTMLInputElement).click()
    })
    act(() => {
      root.render(<Host model={stableModel} renderNonce={1} />)
    })
    expect(
      (host.querySelector('input[type="radio"][value="database"]') as HTMLInputElement).checked,
    ).toBe(true)
    act(() => {
      ;(host.querySelector('.primary') as HTMLButtonElement).click()
    })
    expect(onApply).toHaveBeenCalledWith([{ conflictId: 'c1', choice: 'database' }])
    act(() => {
      root.unmount()
    })
    host.remove()
  })

  it('resets choices when a new preflight model instance is supplied', () => {
    const firstModel = makeSyncModel({ initialChoices: { c1: 'filesystem' } })
    const secondModel = makeSyncModel({
      initialChoices: { c2: 'database' },
      conflicts: [
        {
          id: 'c2',
          relativePath: 'b.dna',
          issueLabel: 'Both sides changed',
          supported: true,
          allowedChoices: ['database', 'filesystem'],
          hasDiskFile: true,
        },
      ],
    })
    function Host({ model }: { model: FolderSyncPreflightViewModel }) {
      return (
        <FolderSyncPreflightDialog
          model={model}
          busy={false}
          onCancel={() => undefined}
          onApply={() => undefined}
        />
      )
    }
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root: Root = createRoot(host)
    act(() => {
      root.render(<Host model={firstModel} />)
    })
    act(() => {
      ;(host.querySelector('input[type="radio"][value="database"]') as HTMLInputElement).click()
    })
    act(() => {
      root.render(<Host model={secondModel} />)
    })
    expect(
      (host.querySelector('input[type="radio"][value="database"]') as HTMLInputElement).checked,
    ).toBe(true)
    expect(
      (host.querySelector('input[type="radio"][value="filesystem"]') as HTMLInputElement).checked,
    ).toBe(false)
    act(() => {
      root.unmount()
    })
    host.remove()
  })

  it('applies selected conflict resolutions', () => {
    const onApply = vi.fn()
    const { container, unmount } = mount(
      <FolderSyncPreflightDialog
        model={makeSyncModel()}
        busy={false}
        onCancel={() => undefined}
        onApply={onApply}
      />,
    )
    act(() => {
      const database = container.querySelector(
        'input[type="radio"][value="database"]',
      ) as HTMLInputElement
      database.click()
    })
    act(() => {
      ;(container.querySelector('.primary') as HTMLButtonElement).click()
    })
    expect(onApply).toHaveBeenCalledWith([{ conflictId: 'c1', choice: 'database' }])
    unmount()
  })

  it('re-enables apply after a failed async apply command', async () => {
    const onApply = vi.fn(() => Promise.reject(new Error('sync failed')))
    const { container, unmount } = mount(
      <FolderSyncPreflightDialog
        model={makeSyncModel({ conflicts: [], initialChoices: {} })}
        busy={false}
        onCancel={() => undefined}
        onApply={onApply}
      />,
    )
    const applyButton = container.querySelector('.primary') as HTMLButtonElement
    await act(async () => {
      applyButton.click()
    })
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(onApply).toHaveBeenCalledTimes(1)
    expect(applyButton.disabled).toBe(false)
    expect(applyButton.textContent).toBe('Apply sync')
    unmount()
  })

  it('dismisses from the backdrop when idle', () => {
    const onCancel = vi.fn()
    const { container, unmount } = mount(
      <FolderSyncPreflightDialog
        model={makeSyncModel({ conflicts: [], initialChoices: {} })}
        busy={false}
        onCancel={onCancel}
        onApply={() => undefined}
      />,
    )
    act(() => {
      ;(container.querySelector('.db-sync-dialog-backdrop') as HTMLDivElement).dispatchEvent(
        new PointerEvent('pointerdown', { bubbles: true }),
      )
    })
    expect(onCancel).toHaveBeenCalled()
    unmount()
  })
})

describe('DatabaseManagerSidebar', () => {
  it('renders folder actions beside New folder for a selected folder', () => {
    const { container, unmount } = mount(
      <DatabaseManagerSidebar
        model={{
          viewMode: 'dna',
          browse: { kind: 'folder', folderId: 'folder-1' },
          folderTree: [],
          selectedFolderId: 'folder-1',
          expandedFolderIds: new Set(),
          builtinTree: [],
          expandedBuiltinIds: new Set(),
          selectedBuiltinGroupId: null,
          sidebarTags: [],
          busy: false,
          selectedProjectCount: 0,
          isMobileShell: false,
          folderActions: {
            visible: true,
            showSourceFolderButton: true,
            sourceFolderLabel: 'Set source folder',
            sourceFolderTitle: 'Set source folder',
            busy: false,
          },
        }}
        commands={{
          onBrowseAll: vi.fn(), onBrowseUnfiled: vi.fn(), onBrowseFolder: vi.fn(),
          onToggleFolderExpanded: vi.fn(), onBrowseBuiltinGroup: vi.fn(), onBrowseAllBuiltin: vi.fn(),
          onToggleBuiltinExpanded: vi.fn(), onBrowseCommonPrimers: vi.fn(), onBrowseTag: vi.fn(),
          onNewFolder: vi.fn(), onChooseSourceFolder: vi.fn(), onRenameFolder: vi.fn(),
          onMoveFolder: vi.fn(), onDeleteFolder: vi.fn(),
        }}
      />,
    )
    expect(container.querySelector('[aria-label="Rename folder"]')).not.toBeNull()
    expect(container.querySelector('[aria-label="Move folder"]')).not.toBeNull()
    expect(container.querySelector('[aria-label="Delete folder"]')).not.toBeNull()
    unmount()
  })

  it('keeps folder actions visible but disabled outside a selected folder', () => {
    const { container, unmount } = mount(
      <DatabaseManagerSidebar
        model={{
          viewMode: 'dna',
          browse: { kind: 'all' },
          folderTree: [],
          selectedFolderId: null,
          expandedFolderIds: new Set(),
          builtinTree: [],
          expandedBuiltinIds: new Set(),
          selectedBuiltinGroupId: null,
          sidebarTags: [],
          busy: false,
          selectedProjectCount: 0,
          isMobileShell: false,
          folderActions: {
            visible: true,
            showSourceFolderButton: false,
            sourceFolderLabel: 'Set source folder',
            sourceFolderTitle: 'Set source folder',
            busy: true,
          },
        }}
        commands={{
          onBrowseAll: vi.fn(), onBrowseUnfiled: vi.fn(), onBrowseFolder: vi.fn(),
          onToggleFolderExpanded: vi.fn(), onBrowseBuiltinGroup: vi.fn(), onBrowseAllBuiltin: vi.fn(),
          onToggleBuiltinExpanded: vi.fn(), onBrowseCommonPrimers: vi.fn(), onBrowseTag: vi.fn(),
          onNewFolder: vi.fn(), onRenameFolder: vi.fn(), onMoveFolder: vi.fn(), onDeleteFolder: vi.fn(),
        }}
      />,
    )
    expect((container.querySelector('[aria-label="Rename folder"]') as HTMLButtonElement).disabled).toBe(true)
    expect((container.querySelector('[aria-label="Move folder"]') as HTMLButtonElement).disabled).toBe(true)
    expect((container.querySelector('[aria-label="Delete folder"]') as HTMLButtonElement).disabled).toBe(true)
    unmount()
  })

  it('shows primer-tag empty copy and routes tag browse', () => {
    const onBrowseTag = vi.fn()
    const { container, unmount } = mount(
      <DatabaseManagerSidebar
        model={{
          viewMode: 'primers',
          browse: { kind: 'all' },
          folderTree: [],
          selectedFolderId: null,
          expandedFolderIds: new Set(),
          builtinTree: [],
          expandedBuiltinIds: new Set(),
          selectedBuiltinGroupId: null,
          sidebarTags: [],
          busy: false,
          selectedProjectCount: 0,
          isMobileShell: false,
        }}
        commands={{
          onBrowseAll: vi.fn(),
          onBrowseUnfiled: vi.fn(),
          onBrowseFolder: vi.fn(),
          onToggleFolderExpanded: vi.fn(),
          onBrowseBuiltinGroup: vi.fn(),
          onBrowseAllBuiltin: vi.fn(),
          onToggleBuiltinExpanded: vi.fn(),
          onBrowseCommonPrimers: vi.fn(),
          onBrowseTag,
          onNewFolder: vi.fn(),
        }}
      />,
    )
    expect(container.textContent).toContain('No primer tags yet.')
    unmount()

    const { container: tagged, unmount: unmountTagged } = mount(
      <DatabaseManagerSidebar
        model={{
          viewMode: 'dna',
          browse: { kind: 'all' },
          folderTree: [],
          selectedFolderId: null,
          expandedFolderIds: new Set(),
          builtinTree: [],
          expandedBuiltinIds: new Set(),
          selectedBuiltinGroupId: null,
          sidebarTags: ['lab'],
          busy: false,
          selectedProjectCount: 0,
          isMobileShell: false,
        }}
        commands={{
          onBrowseAll: vi.fn(),
          onBrowseUnfiled: vi.fn(),
          onBrowseFolder: vi.fn(),
          onToggleFolderExpanded: vi.fn(),
          onBrowseBuiltinGroup: vi.fn(),
          onBrowseAllBuiltin: vi.fn(),
          onToggleBuiltinExpanded: vi.fn(),
          onBrowseCommonPrimers: vi.fn(),
          onBrowseTag,
          onNewFolder: vi.fn(),
        }}
      />,
    )
    const tagButtons = [...tagged.querySelectorAll('.db-tree-item')].filter((node) =>
      node.textContent?.includes('lab'),
    )
    act(() => {
      ;(tagButtons[0] as HTMLButtonElement).click()
    })
    expect(onBrowseTag).toHaveBeenCalledWith('lab')
    unmountTagged()
  })
})

// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { act, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DatabaseManagerDialog } from './DatabaseManagerDialog'
import { readDatabaseExpandedFolderIds } from './storage/databaseUiPrefs'

type FolderNode = { id: string; children: FolderNode[] }

vi.mock('./desktop/databaseManagerStartup', () => ({
  loadDatabaseManagerStartupData: async () => ({
    folders: [
      { id: 'root', name: 'Root', parentId: null, updatedAt: '' },
      { id: 'child', name: 'Child', parentId: 'root', updatedAt: '' },
      { id: 'leaf', name: 'Leaf', parentId: 'child', updatedAt: '' },
    ],
    primerTags: new Map(),
    recoveries: [],
  }),
}))

vi.mock('./storage/projects', async () => {
  const actual = await vi.importActual<typeof import('./storage/projects')>('./storage/projects')
  return {
    ...actual,
    queryProjectSummaryPage: async () => ({ rows: [], total: 0 }),
  }
})

vi.mock('./presentation/databaseManager', () => ({
  DatabaseManagerShellLayout: ({ sidebar }: {
    sidebar: {
      model: { folderTree: FolderNode[]; expandedFolderIds: ReadonlySet<string> }
      commands: {
        onBrowseFolder: (id: string) => void
        onBrowseAll: () => void
        onToggleFolderExpanded: (id: string) => void
      }
    }
  }) => (
    <div>
      <button type="button" onClick={() => sidebar.commands.onBrowseFolder('leaf')}>Reveal leaf</button>
      <button type="button" onClick={sidebar.commands.onBrowseAll}>Clear reveal</button>
      <button type="button" onClick={() => sidebar.commands.onToggleFolderExpanded('root')}>Toggle root</button>
      {sidebar.model.folderTree.map((node) => {
        const renderNode = (current: FolderNode): ReactNode => (
          <div key={current.id} data-expanded={sidebar.model.expandedFolderIds.has(current.id)}>
            {current.id}
            {current.children.map((child) => renderNode(child))}
          </div>
        )
        return renderNode(node)
      })}
    </div>
  ),
  DatabaseTextPromptDialog: () => null,
  FolderSyncPreflightDialog: () => null,
  mapBuiltInTableRows: (rows: unknown) => rows,
  mapPrimerTableRows: (rows: unknown) => rows,
  mapProteinTableRows: (rows: unknown) => rows,
  mapProjectTableRows: (rows: unknown) => rows,
}))

describe('DatabaseManagerDialog folder reveal persistence', () => {
  let host: HTMLDivElement
  let root: ReturnType<typeof createRoot>

  afterEach(() => {
    act(() => root?.unmount())
    host?.remove()
    localStorage.clear()
  })

  it('keeps revealed ancestors expanded after the folder selection is cleared', async () => {
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: () => ({
        matches: false,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
      }),
    })
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    await act(async () => {
      root.render(
        <DatabaseManagerDialog
          projects={[]}
          currentRecordId={null}
          onClose={() => undefined}
          onRefresh={() => undefined}
          onOpenProject={() => undefined}
          onAddPrimersToCurrent={() => undefined}
          onDeleteProjects={() => undefined}
        />,
      )
      await Promise.resolve()
    })
    const reveal = host.querySelector('button') as HTMLButtonElement
    act(() => reveal.click())
    expect(host.querySelector('[data-expanded="true"]')).not.toBeNull()
    const clear = [...host.querySelectorAll('button')].find((button) => button.textContent === 'Clear reveal')!
    act(() => clear.click())
    expect(host.querySelectorAll('[data-expanded="true"]')).toHaveLength(2)
    act(() => (host.querySelectorAll('button')[2] as HTMLButtonElement).click())
    expect(host.querySelector('[data-expanded="false"]')).not.toBeNull()
    expect(readDatabaseExpandedFolderIds().has('root')).toBe(false)
  })
})

import { themeFixturePalette } from '../../test-support/themeFixturePalette'
// @vitest-environment jsdom
import { act } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { DatabasePrimersTablePane } from './DatabasePrimersTablePane'
import { DatabaseTablePagination } from './DatabaseTablePagination'
import { DatabaseManagerRecordsPane } from './DatabaseManagerRecordsPane'
import { DatabaseFilesTablePane, type DatabaseFilesTableCommands } from './DatabaseFilesTablePane'
import type {
  DatabaseManagerFilesPaneModel,
  DatabaseManagerPrimersPaneModel,
  DatabaseManagerProteinsPaneModel,
} from './databaseManagerTableTypes'
import { mount, registerDatabaseManagerPresentationTestCleanup } from './databaseManagerPresentationTestMount'

registerDatabaseManagerPresentationTestCleanup()

describe('DatabasePrimersTablePane', () => {
  it('renders common-primer empty message', () => {
    const { container, unmount } = mount(
      <DatabasePrimersTablePane
        model={
          {
            empty: {
              kind: 'empty',
              message: 'No common primers yet. Use Primers → Add to Common Primers to save oligos here.',
            },
            rows: [],
            tableWidth: 400,
            viewportWidth: 400,
            checkColWidth: 40,
            columnOrder: ['name', 'sequence', 'actions'],
            columnWidths: { name: 80, sequence: 200, actions: 80 },
            sortColumn: 'name',
            sortDirection: 'asc',
            selection: { allVisibleSelected: false, someVisibleSelected: false },
            selectedKeys: [],
            columnReorder: { dragColumnId: null, dropTargetId: null },
          } as unknown as DatabaseManagerPrimersPaneModel
        }
        commands={{
          onToggleSelectAll: vi.fn(),
          onToggleRowSelected: vi.fn(),
          onSelectRow: vi.fn(),
          onOpenRow: vi.fn(),
          onBrowseTag: vi.fn(),
          onSort: vi.fn(),
          onResizeColumn: vi.fn(),
          onReorderColumn: vi.fn(),
          onReorderDragStart: vi.fn(),
          onReorderDragOver: vi.fn(),
          onReorderDragEnd: vi.fn(),
        }}
      />,
    )
    expect(container.textContent).toContain('No common primers yet.')
    unmount()
  })

  it('routes row selection with primer key', () => {
    const onSelectRow = vi.fn()
    const { container, unmount } = mount(
      <DatabasePrimersTablePane
        model={
          {
            empty: null,
            rows: [
              {
                key: 'primer-1',
                name: 'fwd',
                sequence: 'ACGT',
                color: themeFixturePalette.greenRgb,
                fileLabel: 'file.dna',
                fileTitle: 'file.dna',
                tags: [],
              },
            ],
            tableWidth: 400,
            viewportWidth: 400,
            checkColWidth: 40,
            columnOrder: ['name', 'sequence', 'actions'],
            columnWidths: { name: 80, sequence: 200, actions: 80 },
            sortColumn: 'name',
            sortDirection: 'asc',
            selection: { allVisibleSelected: false, someVisibleSelected: false },
            selectedKeys: [],
            columnReorder: { dragColumnId: null, dropTargetId: null },
          } as unknown as DatabaseManagerPrimersPaneModel
        }
        commands={{
          onToggleSelectAll: vi.fn(),
          onToggleRowSelected: vi.fn(),
          onSelectRow,
          onOpenRow: vi.fn(),
          onBrowseTag: vi.fn(),
          onSort: vi.fn(),
          onResizeColumn: vi.fn(),
          onReorderColumn: vi.fn(),
          onReorderDragStart: vi.fn(),
          onReorderDragOver: vi.fn(),
          onReorderDragEnd: vi.fn(),
        }}
      />,
    )
    act(() => {
      ;(container.querySelector('tbody tr') as HTMLTableRowElement).dispatchEvent(
        new MouseEvent('click', { bubbles: true }),
      )
    })
    expect(onSelectRow).toHaveBeenCalledWith('primer-1', expect.any(Object))
    unmount()
  })
})

describe('DatabaseTablePagination', () => {
  it('routes page navigation callbacks', () => {
    const onGoToPage = vi.fn()
    const { container, unmount } = mount(
      <DatabaseTablePagination
        model={{ total: 200, page: 1, pageCount: 4, start: 50, end: 100, pageSize: 50 }}
        commands={{ onGoToPage }}
      />,
    )
    act(() => {
      ;(container.querySelector('button[aria-label="Previous page"]') as HTMLButtonElement).click()
    })
    expect(onGoToPage).toHaveBeenCalledWith(0)
    unmount()
  })
})

function filesTableFixture(overrides: {
  model?: Partial<DatabaseManagerFilesPaneModel>
  commands?: Partial<DatabaseFilesTableCommands>
}) {
  const onToggleRowSelected = vi.fn()
  const onToggleSelectAll = vi.fn()
  const model: DatabaseManagerFilesPaneModel = {
    empty: null,
    rows: [
      {
        id: 'project-a',
        constructName: 'Construct A',
        showConstructName: true,
        fileName: 'a.dna',
        formatLabel: 'DNA',
        folderLabel: 'Unfiled',
        tags: [],
        updatedLabel: 'today',
        sequenceLengthLabel: '1 kb',
        fileSizeLabel: '1 kB',
        isCurrent: false,
        isLibrary: false,
        libraryExpanded: false,
        libraryMembersLoading: false,
        libraryMembers: null,
        selected: false,
        rowActionLabel: 'Open',
        rowActionDisabled: false,
      },
      {
        id: 'project-b',
        constructName: 'Construct B',
        showConstructName: true,
        fileName: 'b.dna',
        formatLabel: 'DNA',
        folderLabel: 'Unfiled',
        tags: [],
        updatedLabel: 'today',
        sequenceLengthLabel: '2 kb',
        fileSizeLabel: '2 kB',
        isCurrent: false,
        isLibrary: false,
        libraryExpanded: false,
        libraryMembersLoading: false,
        libraryMembers: null,
        selected: true,
        rowActionLabel: 'Open',
        rowActionDisabled: false,
      },
    ],
    tableWidth: 400,
    viewportWidth: 400,
    checkColWidth: 40,
    columnOrder: ['name', 'actions'],
    columnWidths: { name: 200, format: 80, folder: 80, tags: 80, updated: 80, size: 80, fileSize: 80, actions: 160 },
    sortColumn: 'name',
    sortDirection: 'asc',
    selection: { allVisibleSelected: false, someVisibleSelected: true },
    selectedIds: ['project-b'],
    columnReorder: { dragColumnId: null, dropTargetId: null },
    pickRowToggleMode: false,
    fileCheckboxReplaceSelection: false,
    showHeaderSelectAll: true,
    ...overrides.model,
  }
  const commands = {
    onToggleSelectAll,
    onToggleRowSelected,
    onSelectProject: vi.fn(),
    onProjectDoubleClick: vi.fn(),
    onToggleLibraryExpanded: vi.fn(),
    onBrowseTag: vi.fn(),
    onRowPrimaryAction: vi.fn(),
    onTogglePickSelection: vi.fn(),
    onExportProject: vi.fn(),
    onDeleteProject: vi.fn(),
    onOpenLibraryMember: vi.fn(),
    onLibraryMemberDoubleClick: vi.fn(),
    onSort: vi.fn(),
    onResizeColumn: vi.fn(),
    onReorderColumn: vi.fn(),
    onReorderDragStart: vi.fn(),
    onReorderDragOver: vi.fn(),
    onReorderDragEnd: vi.fn(),
    onStatus: vi.fn(),
    ...overrides.commands,
  }
  return { model, commands, onToggleRowSelected, onToggleSelectAll }
}

describe('DatabaseFilesTablePane', () => {
  it('routes normal browse checkbox toggles without replaceSelection', () => {
    const { onToggleRowSelected, container, unmount } = (() => {
      const fixture = filesTableFixture({})
      const mounted = mount(<DatabaseFilesTablePane model={fixture.model} commands={fixture.commands} />)
      return { ...fixture, ...mounted }
    })()
    const checkboxes = container.querySelectorAll('tbody input[type="checkbox"]')
    act(() => {
      ;(checkboxes[0] as HTMLInputElement).click()
    })
    expect(onToggleRowSelected).toHaveBeenCalledWith('project-a', true, false)
    act(() => {
      ;(checkboxes[1] as HTMLInputElement).click()
    })
    expect(onToggleRowSelected).toHaveBeenCalledWith('project-b', false, false)
    unmount()
  })

  it('routes single construct pick checkbox with replaceSelection', () => {
    const fixture = filesTableFixture({
      model: { fileCheckboxReplaceSelection: true, showHeaderSelectAll: false, pickRowToggleMode: false },
    })
    const { container, unmount } = mount(
      <DatabaseFilesTablePane model={fixture.model} commands={fixture.commands} />,
    )
    const checkbox = container.querySelector('tbody input[type="checkbox"]') as HTMLInputElement
    act(() => {
      checkbox.click()
    })
    expect(fixture.onToggleRowSelected).toHaveBeenCalledWith('project-a', true, true)
    expect(container.querySelector('thead input[type="checkbox"]')).toBeNull()
    unmount()
  })

  it('routes library-member pick checkbox as accumulation not replacement', () => {
    const fixture = filesTableFixture({
      model: {
        pickRowToggleMode: true,
        fileCheckboxReplaceSelection: false,
        showHeaderSelectAll: true,
        rows: filesTableFixture({}).model.rows.map((row) => ({
          ...row,
          rowActionLabel: row.selected ? 'Remove' : 'Select',
        })),
      },
    })
    const { container, unmount } = mount(
      <DatabaseFilesTablePane model={fixture.model} commands={fixture.commands} />,
    )
    act(() => {
      ;(container.querySelector('tbody input[type="checkbox"]') as HTMLInputElement).click()
    })
    expect(fixture.onToggleRowSelected).toHaveBeenCalledWith('project-a', true, false)
    unmount()
  })

  it('routes header select-all when enabled', () => {
    const fixture = filesTableFixture({})
    const { container, unmount } = mount(
      <DatabaseFilesTablePane model={fixture.model} commands={fixture.commands} />,
    )
    act(() => {
      ;(container.querySelector('thead input[type="checkbox"]') as HTMLInputElement).click()
    })
    expect(fixture.onToggleSelectAll).toHaveBeenCalledTimes(1)
    unmount()
  })

  it('uses pick row action toggle in library-member pick mode', () => {
    const fixture = filesTableFixture({
      model: {
        pickRowToggleMode: true,
        rows: filesTableFixture({}).model.rows.map((row) => ({
          ...row,
          rowActionLabel: 'Select',
        })),
      },
    })
    const { container, unmount } = mount(
      <DatabaseFilesTablePane model={fixture.model} commands={fixture.commands} />,
    )
    const actionButton = container.querySelector('tbody button') as HTMLButtonElement
    act(() => {
      actionButton.click()
    })
    expect(fixture.commands.onTogglePickSelection).toHaveBeenCalledWith('project-a')
    expect(fixture.commands.onRowPrimaryAction).not.toHaveBeenCalled()
    unmount()
  })
})

describe('DatabaseManagerRecordsPane', () => {
  it('switches rendered pane by view mode', () => {
    const fileListRef = { current: null }
    const commands = {
      primers: {
        onToggleSelectAll: vi.fn(),
        onToggleRowSelected: vi.fn(),
        onSelectRow: vi.fn(),
        onOpenRow: vi.fn(),
        onBrowseTag: vi.fn(),
        onSort: vi.fn(),
        onResizeColumn: vi.fn(),
        onReorderColumn: vi.fn(),
        onReorderDragStart: vi.fn(),
        onReorderDragOver: vi.fn(),
        onReorderDragEnd: vi.fn(),
      },
      proteins: {
        onToggleSelectAll: vi.fn(),
        onToggleRowSelected: vi.fn(),
        onSelectRow: vi.fn(),
        onOpenRow: vi.fn(),
        onCopyRowSequence: vi.fn(),
        onSort: vi.fn(),
        onResizeColumn: vi.fn(),
        onReorderColumn: vi.fn(),
        onReorderDragStart: vi.fn(),
        onReorderDragOver: vi.fn(),
        onReorderDragEnd: vi.fn(),
      },
      builtin: { onOpenRow: vi.fn(), onOpenRowDoubleClick: vi.fn() },
      files: {
        onToggleSelectAll: vi.fn(),
        onToggleRowSelected: vi.fn(),
        onSelectProject: vi.fn(),
        onProjectDoubleClick: vi.fn(),
        onToggleLibraryExpanded: vi.fn(),
        onBrowseTag: vi.fn(),
        onRowPrimaryAction: vi.fn(),
        onTogglePickSelection: vi.fn(),
        onExportProject: vi.fn(),
        onDeleteProject: vi.fn(),
        onOpenLibraryMember: vi.fn(),
        onLibraryMemberDoubleClick: vi.fn(),
        onSort: vi.fn(),
        onResizeColumn: vi.fn(),
        onReorderColumn: vi.fn(),
        onReorderDragStart: vi.fn(),
        onReorderDragOver: vi.fn(),
        onReorderDragEnd: vi.fn(),
        onStatus: vi.fn(),
      },
    }
    const emptyPrimers = {
      empty: { kind: 'empty' as const, message: 'No primers in this view.' },
      rows: [],
      tableWidth: 100,
      viewportWidth: 100,
      checkColWidth: 40,
      columnOrder: ['name', 'actions'],
      columnWidths: { name: 80, actions: 80 },
      sortColumn: 'name',
      sortDirection: 'asc',
      selection: { allVisibleSelected: false, someVisibleSelected: false },
      selectedKeys: [],
      columnReorder: { dragColumnId: null, dropTargetId: null },
    } as unknown as DatabaseManagerPrimersPaneModel
    const { container, unmount } = mount(
      <DatabaseManagerRecordsPane
        fileListRef={fileListRef}
        viewMode="primers"
        browseKind="files"
        primersModel={emptyPrimers}
        proteinsModel={
          {
            ...emptyPrimers,
            empty: { kind: 'empty', message: 'No translated CDSes in this view.' },
          } as unknown as DatabaseManagerProteinsPaneModel
        }
        builtinModel={{ emptyMessage: 'No built-in plasmids in this category.', rows: [] }}
        filesModel={
          {
            empty: { kind: 'empty', message: 'No files in this view.' },
            rows: [],
            tableWidth: 100,
            viewportWidth: 100,
            checkColWidth: 40,
            columnOrder: ['name', 'actions'],
            columnWidths: { name: 80, actions: 80 },
            sortColumn: 'name',
            sortDirection: 'asc',
            selection: { allVisibleSelected: false, someVisibleSelected: false },
            selectedIds: [],
            columnReorder: { dragColumnId: null, dropTargetId: null },
            pickRowToggleMode: false,
            fileCheckboxReplaceSelection: false,
            showHeaderSelectAll: true,
          } as unknown as DatabaseManagerFilesPaneModel
        }
        commands={commands}
      />,
    )
    expect(container.textContent).toContain('No primers in this view.')
    unmount()
  })
})

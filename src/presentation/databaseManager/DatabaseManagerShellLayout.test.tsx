// @vitest-environment jsdom
import { act, useState, type ReactElement } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, expect, it, vi } from 'vitest'
import { DatabaseManagerShellLayout } from './DatabaseManagerShellLayout'

function mount(ui: ReactElement) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  act(() => {
    root.render(ui)
  })
  return { container, unmount: () => { act(() => root.unmount()); container.remove() } }
}

const shellMainFixture = {
  toolbar: {
    model: {
      pick: { libraryMember: null, construct: null },
      viewMode: {
        active: 'dna' as const,
        busy: false,
        dnaDisabled: false,
        primersDisabled: false,
        proteinsDisabled: false,
        cdsesDisabled: false,
      },
      sync: {
        isTauri: false,
        folderDirectoryImportAvailable: false,
        selectedFolderHasSyncSource: false,
        importDatabaseTitle: '',
        exportDatabaseTitle: '',
        modes: { import: 'import' as const, inbound: 'sync-to-database' as const, outbound: 'export-database' as const },
      },
      folder: {
        visible: false,
        showSourceFolderButton: false,
        sourceFolderLabel: '',
        sourceFolderTitle: '',
        busy: false,
      },
      historyRecovery: { visible: false, projectCount: 0, busy: false },
      fileSelection: {
        visible: false,
        count: 0,
        showAlignment: false,
        exportSelectionTitle: '',
        renameDisabled: true,
        renameTitle: '',
        moveLabel: '',
        tagsLabel: '',
        trimLabel: '',
        deleteTitle: '',
        deleteLabel: '',
        busy: false,
      },
      primerSelection: {
        visible: false,
        count: 0,
        renameDisabled: true,
        renameTitle: '',
        tagsLabel: '',
        addToCurrentDisabled: true,
        addToCurrentTitle: '',
        addToCommonDisabled: true,
        addToCommonTitle: '',
        showRemoveCommon: false,
        busy: false,
      },
      proteinSelection: { visible: false, count: 0, showAlignment: false, busy: false },
    },
    commands: {
      pick: {},
      viewMode: {
        onSelectDna: () => {},
        onSelectPrimers: () => {},
        onSelectProteins: () => {},
        onSelectCdses: () => {},
      },
      sync: {
        onImportModeChange: () => {},
        onRunImportMode: () => {},
        onInboundModeChange: () => {},
        onRunInboundMode: () => {},
        onOutboundModeChange: () => {},
        onRunOutboundMode: () => {},
      },
      folder: {
        onChooseSourceFolder: () => {},
        onRenameFolder: () => {},
        onMoveFolder: () => {},
        onDeleteFolder: () => {},
      },
      historyRecovery: { onRestore: () => {}, onDiscard: () => {} },
      fileSelection: {
        onAddToAlignment: () => {},
        onExport: async () => {},
        onStatus: () => {},
        onRename: () => {},
        onMove: () => {},
        onEditTags: () => {},
        onTrimHistory: () => {},
        onDelete: () => {},
      },
      primerSelection: {
        onRename: () => {},
        onEditTags: () => {},
        onAddToCurrent: () => {},
        onAddToCommon: () => {},
        onRemoveFromCommon: () => {},
      },
      proteinSelection: { onAddToAlignment: () => {}, onOpen: () => {}, onCopySequences: () => {} },
    },
    folderSync: {
      visible: false,
      model: {
        loading: false,
        mapping: null,
        selectedFolderIsTopLevel: true,
        topLevelFolderName: '',
        tombstones: [],
        busy: false,
      },
      commands: { onRestoreTombstone: () => {} },
    },
  },
  records: {
    viewMode: 'dna' as const,
    browseKind: 'files' as const,
    primersModel: {
      empty: null,
      rows: [],
      tableWidth: 0,
      viewportWidth: 0,
      checkColWidth: 0,
      columnOrder: [],
      columnWidths: { name: 120, sequence: 120, length: 60, tm: 60, gc: 60, tags: 80, files: 80, actions: 80 },
      sortColumn: 'name' as const,
      sortDirection: 'asc' as const,
      selection: { allVisibleSelected: false, someVisibleSelected: false },
      selectedKeys: [],
      columnReorder: { dragColumnId: null, dropTargetId: null },
    },
    proteinsModel: {
      empty: null,
      rows: [],
      tableWidth: 0,
      viewportWidth: 0,
      checkColWidth: 0,
      columnOrder: [],
      columnWidths: { name: 120, sequence: 120, length: 60, mass: 60, product: 80, files: 80, actions: 80 },
      sortColumn: 'name' as const,
      sortDirection: 'asc' as const,
      selection: { allVisibleSelected: false, someVisibleSelected: false },
      selectedKeys: [],
      columnReorder: { dragColumnId: null, dropTargetId: null },
    },
    builtinModel: { emptyMessage: null, rows: [] },
    filesModel: {
      empty: null,
      rows: [],
      tableWidth: 0,
      viewportWidth: 0,
      checkColWidth: 0,
      columnOrder: [],
      columnWidths: { name: 120, format: 80, folder: 100, tags: 80, updated: 100, size: 60, fileSize: 80, actions: 80 },
      sortColumn: 'name' as const,
      sortDirection: 'asc' as const,
      selection: { allVisibleSelected: false, someVisibleSelected: false },
      selectedIds: [],
      columnReorder: { dragColumnId: null, dropTargetId: null },
      pickRowToggleMode: false,
      fileCheckboxReplaceSelection: false,
      showHeaderSelectAll: true,
    },
    commands: {
      primers: {
        onToggleSelectAll: () => {},
        onToggleRowSelected: () => {},
        onSelectRow: () => {},
        onOpenRow: () => {},
        onBrowseTag: () => {},
        onSort: () => {},
        onResizeColumn: () => {},
        onReorderColumn: () => {},
        onReorderDragStart: () => {},
        onReorderDragOver: () => {},
        onReorderDragEnd: () => {},
      },
      proteins: {
        onToggleSelectAll: () => {},
        onToggleRowSelected: () => {},
        onSelectRow: () => {},
        onOpenRow: () => {},
        onCopyRowSequence: () => {},
        onSort: () => {},
        onResizeColumn: () => {},
        onReorderColumn: () => {},
        onReorderDragStart: () => {},
        onReorderDragOver: () => {},
        onReorderDragEnd: () => {},
      },
      builtin: { onOpenRow: () => {}, onOpenRowDoubleClick: () => {} },
      files: {
        onToggleSelectAll: () => {},
        onToggleRowSelected: () => {},
        onSelectProject: () => {},
        onProjectDoubleClick: () => {},
        onToggleLibraryExpanded: () => {},
        onBrowseTag: () => {},
        onRowPrimaryAction: () => {},
        onTogglePickSelection: () => {},
        onExportProject: async () => {},
        onDeleteProject: () => {},
        onOpenLibraryMember: () => {},
        onLibraryMemberDoubleClick: () => {},
        onSort: () => {},
        onResizeColumn: () => {},
        onReorderColumn: () => {},
        onReorderDragStart: () => {},
        onReorderDragOver: () => {},
        onReorderDragEnd: () => {},
        onStatus: () => {},
      },
    },
    paginationModel: {
      total: 0,
      page: 0,
      pageCount: 1,
      start: 0,
      end: 0,
      pageSize: 50,
    },
    paginationCommands: { onGoToPage: () => {} },
  },
  recordsFileListRef: { current: null },
}

describe('DatabaseManagerShellLayout mobile shell', () => {
  it('transitions mobile pane to records after tree select', () => {
    const onMobilePaneChange = vi.fn()
    function MobileHarness() {
      const [mobilePane, setMobilePane] = useState<'folders' | 'records'>('folders')
      const handleMobilePaneChange = (pane: 'folders' | 'records') => {
        onMobilePaneChange(pane)
        setMobilePane(pane)
      }
      return (
        <DatabaseManagerShellLayout
          hybridWindow={false}
          isMobileShell
          mobilePane={mobilePane}
          onMobilePaneChange={handleMobilePaneChange}
          sidebarWidth={240}
          header={null}
          sidebar={{
            model: {
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
              isMobileShell: true,
            },
            commands: {
              onBrowseAll: () => {},
              onBrowseUnfiled: () => {},
              onBrowseFolder: () => {},
              onToggleFolderExpanded: () => {},
              onBrowseBuiltinGroup: () => {},
              onBrowseAllBuiltin: () => {},
              onToggleBuiltinExpanded: () => {},
              onBrowseCommonPrimers: () => {},
              onBrowseTag: () => {},
              onNewFolder: () => {},
              onMobileTreeSelect: () => handleMobilePaneChange('records'),
            },
          }}
          sidebarResize={{
            onPointerDown: () => {},
            onPointerMove: () => {},
            onPointerUp: () => {},
            onPointerCancel: () => {},
          }}
          main={shellMainFixture}
        />
      )
    }
    const { container, unmount } = mount(<MobileHarness />)
    expect(container.querySelector('.db-manager-body.mobile-pane-folders')).toBeTruthy()
    const body = container.querySelector('.db-manager-body')!
    const sidebar = container.querySelector('.db-manager-sidebar')
    const resizer = container.querySelector('.db-manager-sidebar-resizer')
    const main = container.querySelector('.db-file-list')?.closest('.db-manager-main') ?? container.querySelector('.db-manager-main')
    expect(sidebar).toBeTruthy()
    expect(resizer?.getAttribute('aria-label')).toBe('Resize sidebar')
    const ordered = [...body.children]
    expect(ordered.indexOf(sidebar!)).toBeLessThan(ordered.indexOf(resizer!))
    if (main) expect(ordered.indexOf(resizer!)).toBeLessThan(ordered.indexOf(main))
    const treeItem = container.querySelector('.db-tree-item')
    act(() => {
      treeItem?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(onMobilePaneChange).toHaveBeenCalledWith('records')
    expect(container.querySelector('.db-manager-body.mobile-pane-records')).toBeTruthy()
    unmount()
  })

  it('applies mobile pane class on static mount', () => {
    const { container, unmount } = mount(
      <DatabaseManagerShellLayout
        hybridWindow={false}
        isMobileShell
        mobilePane="folders"
        onMobilePaneChange={() => {}}
        sidebarWidth={240}
        header={null}
        sidebar={{
          model: {
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
            isMobileShell: true,
          },
          commands: {
            onBrowseAll: () => {},
            onBrowseUnfiled: () => {},
            onBrowseFolder: () => {},
            onToggleFolderExpanded: () => {},
            onBrowseBuiltinGroup: () => {},
            onBrowseAllBuiltin: () => {},
            onToggleBuiltinExpanded: () => {},
            onBrowseCommonPrimers: () => {},
            onBrowseTag: () => {},
            onNewFolder: () => {},
          },
        }}
        sidebarResize={{
          onPointerDown: () => {},
          onPointerMove: () => {},
          onPointerUp: () => {},
          onPointerCancel: () => {},
        }}
        main={shellMainFixture}
      />,
    )
    expect(container.querySelector('.db-manager-body.mobile-pane-folders')).toBeTruthy()
    unmount()
  })
})

import {
  routeProjectDoubleClick,
  routeProjectPrimaryAction,
} from './constructPickRouting'
import type { DatabaseManagerConstructPickContext } from '../presentation/pickContext'
import type { LibraryPrimer } from '../../../domain/libraryPrimer'

export type DatabaseManagerRecordsRegionCommandPorts = {
  onDragPrimersToWorkspace?: (primers: LibraryPrimer[]) => void
  onDragProjectsToWorkspace?: (projectIds: string[]) => void
  constructPick: DatabaseManagerConstructPickContext | null
  libraryMemberPickActive: boolean
  toggleSelectAll: () => void
  setSelectedIds: (ids: string[] | ((current: string[]) => string[])) => void
  setSelectionAnchorId: (id: string | null) => void
  selectVisibleRow: (
    key: string,
    event: { shiftKey: boolean; metaKey: boolean; ctrlKey: boolean },
  ) => void
  selectProject: (
    projectId: string,
    event: { shiftKey: boolean; metaKey: boolean; ctrlKey: boolean },
  ) => void
  findPrimerKey: (key: string) => { key: string } | null
  openPrimerEditor: (primer: { key: string }) => void
  findProteinKey: (key: string) => { key: string; name: string; sequence: string } | null
  openProtein: (protein: { key: string; name: string; sequence: string }) => void
  copyProteinSequence: (protein: { name: string; sequence: string }) => void
  findBuiltInId: (id: string) => { id: string } | null
  openBuiltIn: (entry: { id: string }) => void | Promise<void>
  runBuiltInAction: (label: string, action: () => Promise<void>) => void
  browseTag: (tag: string) => void
  togglePrimerSort: (column: string) => void
  toggleProteinSort: (column: string) => void
  toggleFileSort: (column: string) => void
  resizePrimerColumn: (column: string, width: number) => void
  resizeProteinColumn: (column: string, width: number) => void
  resizeFileColumn: (column: string, width: number) => void
  reorderPrimerColumn: (toId: string) => void
  reorderProteinColumn: (toId: string) => void
  reorderFileColumn: (toId: string) => void
  setDragColumnId: (id: string | null) => void
  setDropTargetId: (id: string | null) => void
  endColumnReorderDrag: () => void
  addConstructById: (projectId: string) => void
  openProjectById: (projectId: string) => void
  toggleLibraryExpanded: (projectId: string) => void
  togglePickSelection: (projectId: string) => void
  exportProject: (projectId: string, format: string) => void | Promise<void>
  deleteProject: (projectId: string) => void
  openLibraryMember: (projectId: string, memberId: string) => void
  libraryMemberBlocked: (projectId: string, memberId: string) => boolean
  reportStatus: (message: string) => void
}

export function buildDatabaseManagerRecordsRegionCommands(ports: DatabaseManagerRecordsRegionCommandPorts) {
  return {
    primers: {
      onDragPrimersToWorkspace: ports.onDragPrimersToWorkspace,
      onToggleSelectAll: ports.toggleSelectAll,
      onToggleRowSelected: (key: string, checked: boolean) => {
        if (checked) {
          ports.setSelectedIds((current) => (current.includes(key) ? current : [...current, key]))
          ports.setSelectionAnchorId(key)
        } else {
          ports.setSelectedIds((current) => current.filter((id) => id !== key))
        }
      },
      onSelectRow: (key: string, event: { shiftKey: boolean; metaKey: boolean; ctrlKey: boolean }) =>
        ports.selectVisibleRow(key, event),
      onOpenRow: (key: string) => {
        const primer = ports.findPrimerKey(key)
        if (primer) ports.openPrimerEditor(primer)
      },
      onBrowseTag: ports.browseTag,
      onSort: ports.togglePrimerSort,
      onResizeColumn: ports.resizePrimerColumn,
      onReorderColumn: ports.reorderPrimerColumn,
      onReorderDragStart: ports.setDragColumnId,
      onReorderDragOver: ports.setDropTargetId,
      onReorderDragEnd: ports.endColumnReorderDrag,
    },
    proteins: {
      onToggleSelectAll: ports.toggleSelectAll,
      onToggleRowSelected: (key: string, checked: boolean) => {
        if (checked) {
          ports.setSelectedIds((current) => (current.includes(key) ? current : [...current, key]))
          ports.setSelectionAnchorId(key)
        } else {
          ports.setSelectedIds((current) => current.filter((id) => id !== key))
        }
      },
      onSelectRow: (key: string, event: { shiftKey: boolean; metaKey: boolean; ctrlKey: boolean }) =>
        ports.selectVisibleRow(key, event),
      onOpenRow: (key: string) => {
        const protein = ports.findProteinKey(key)
        if (protein) void ports.openProtein(protein)
      },
      onCopyRowSequence: (key: string) => {
        const protein = ports.findProteinKey(key)
        if (protein) ports.copyProteinSequence(protein)
      },
      onSort: ports.toggleProteinSort,
      onResizeColumn: ports.resizeProteinColumn,
      onReorderColumn: ports.reorderProteinColumn,
      onReorderDragStart: ports.setDragColumnId,
      onReorderDragOver: ports.setDropTargetId,
      onReorderDragEnd: ports.endColumnReorderDrag,
    },
    builtin: {
      onOpenRow: (id: string) => {
        const entry = ports.findBuiltInId(id)
        if (entry) {
          void ports.runBuiltInAction('open built-in plasmid', async () => {
            await ports.openBuiltIn(entry)
          })
        }
      },
      onOpenRowDoubleClick: (id: string) => {
        const entry = ports.findBuiltInId(id)
        if (entry) {
          void ports.runBuiltInAction('open built-in plasmid', async () => {
            await ports.openBuiltIn(entry)
          })
        }
      },
    },
    files: {
      onDragProjectsToWorkspace: ports.onDragProjectsToWorkspace,
      onToggleSelectAll: ports.toggleSelectAll,
      onToggleRowSelected: (projectId: string, checked: boolean, replaceSelection?: boolean) => {
        if (replaceSelection) {
          ports.setSelectedIds(checked ? [projectId] : [])
          ports.setSelectionAnchorId(checked ? projectId : null)
          return
        }
        if (checked) {
          ports.setSelectedIds((current) =>
            current.includes(projectId) ? current : [...current, projectId],
          )
          ports.setSelectionAnchorId(projectId)
        } else {
          ports.setSelectedIds((current) => current.filter((id) => id !== projectId))
        }
      },
      onSelectProject: (projectId: string, event: { shiftKey: boolean; metaKey: boolean; ctrlKey: boolean }) =>
        ports.selectProject(projectId, event),
      onProjectDoubleClick: (projectId: string) => {
        const route = routeProjectDoubleClick({
          constructPick: ports.constructPick,
          libraryMemberPickActive: ports.libraryMemberPickActive,
        })
        if (route === 'blocked') return
        if (route === 'add-construct') void ports.addConstructById(projectId)
        else void ports.openProjectById(projectId)
      },
      onToggleLibraryExpanded: ports.toggleLibraryExpanded,
      onBrowseTag: ports.browseTag,
      onRowPrimaryAction: (projectId: string) => {
        const route = routeProjectPrimaryAction({ constructPick: ports.constructPick })
        if (route === 'add-construct') void ports.addConstructById(projectId)
        else void ports.openProjectById(projectId)
      },
      onTogglePickSelection: ports.togglePickSelection,
      onExportProject: (projectId: string, format: string) => void ports.exportProject(projectId, format),
      onDeleteProject: ports.deleteProject,
      onOpenLibraryMember: ports.openLibraryMember,
      onLibraryMemberDoubleClick: (projectId: string, memberId: string) => {
        if (ports.libraryMemberBlocked(projectId, memberId)) return
        void ports.openLibraryMember(projectId, memberId)
      },
      onSort: ports.toggleFileSort,
      onResizeColumn: ports.resizeFileColumn,
      onReorderColumn: ports.reorderFileColumn,
      onReorderDragStart: ports.setDragColumnId,
      onReorderDragOver: ports.setDropTargetId,
      onReorderDragEnd: ports.endColumnReorderDrag,
      onStatus: ports.reportStatus,
    },
  }
}

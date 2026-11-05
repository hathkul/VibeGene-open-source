import type { DatabaseBrowseMode } from '../browsePresentation'
import {
  databaseManagerExportSelectionRoute,
  databaseManagerRenameSelectionProjectId,
} from '../presentation/exportActionOrchestration'
import type { DatabaseManagerConstructPickContext } from '../presentation/pickContext'
import type {
  DatabaseManagerActionPort,
  DatabaseManagerFileSelectionCommandPort,
  DatabaseManagerFolderToolbarCommandPort,
  DatabaseManagerPickCommandPort,
  DatabaseManagerPrimerCommandPort,
  DatabaseManagerProteinCommandPort,
  DatabaseManagerSelectionPort,
  DatabaseManagerStatusPort,
  DatabaseManagerSyncCommandPort,
  DatabaseManagerTextPromptPort,
  DatabaseManagerViewModeCommandPort,
} from '../ports/databaseManagerCommandPorts'
import { routeConstructPickAdd } from './constructPickRouting'
import {
  commonPrimerAddStatus,
  commonPrimerRemoveStatus,
  fileRenameSuccessStatus,
  folderDeleteSuccessStatus,
  folderRenameSuccessStatus,
  primerTagsUpdateStatus,
  projectTagsUpdateStatus,
  proteinCopyStatus,
} from './fileSelectionMessages'

export type DatabaseManagerToolbarPickCommandState = {
  constructPick: DatabaseManagerConstructPickContext | null
  selectedProjectIds: readonly string[]
}

export function buildDatabaseManagerToolbarPickCommands(
  state: DatabaseManagerToolbarPickCommandState,
  port: DatabaseManagerPickCommandPort,
) {
  return {
    onAddLibraryMembers: () => void port.addLibraryMembers(),
    onAddConstruct: () => {
      const route = routeConstructPickAdd({
        constructPick: state.constructPick,
        selectedProjectIds: state.selectedProjectIds,
      })
      if (route.kind === 'add-multiple') void port.addSelectedConstructs()
      else if (route.kind === 'add-single') void port.addConstructById(route.projectId)
    },
    onCancelConstructPick: port.onCancelConstructPick,
  }
}

export function buildDatabaseManagerToolbarViewModeCommands(port: DatabaseManagerViewModeCommandPort) {
  return {
    onSelectDna: () => port.setViewMode('dna'),
    onSelectPrimers: () => port.setViewMode('primers'),
    onSelectProteins: () => port.setViewMode('proteins'),
    onSelectCdses: () => port.setViewMode('cdses'),
  }
}

export function buildDatabaseManagerToolbarSyncCommands(port: DatabaseManagerSyncCommandPort) {
  return {
    onImportModeChange: port.setImportMode,
    onRunImportMode: (mode: Parameters<DatabaseManagerSyncCommandPort['runImportMode']>[0]) =>
      port.runImportMode(mode),
    onInboundModeChange: port.setInboundMode,
    onRunInboundMode: (mode: Parameters<DatabaseManagerSyncCommandPort['runInboundMode']>[0]) =>
      void port.runInboundMode(mode),
    onOutboundModeChange: port.setOutboundMode,
    onRunOutboundMode: (mode: Parameters<DatabaseManagerSyncCommandPort['runOutboundMode']>[0]) =>
      void port.runOutboundMode(mode),
  }
}

export type DatabaseManagerFolderToolbarCommandState = {
  browse: DatabaseBrowseMode
  folderId: string | null
  folderName: string | null
  parentId: string
}

export function buildDatabaseManagerToolbarFolderCommands(
  state: DatabaseManagerFolderToolbarCommandState,
  ports: {
    folder: DatabaseManagerFolderToolbarCommandPort
    textPrompt: DatabaseManagerTextPromptPort
    action: DatabaseManagerActionPort
    status: DatabaseManagerStatusPort
  },
) {
  return {
    onChooseSourceFolder: () => void ports.folder.chooseSourceFolder(),
    onRenameFolder: () => {
      if (state.browse.kind !== 'folder' || !state.folderId || !state.folderName) return
      ports.textPrompt.open({
        title: 'Rename folder',
        label: 'Folder name',
        initial: state.folderName,
        confirmLabel: 'Rename',
        onConfirm: async (name) => {
          await ports.action.run('rename folder', async () => {
            await ports.folder.renameFolder(state.folderId!, name)
            ports.textPrompt.close()
            ports.status.report(folderRenameSuccessStatus(name))
          })
        },
      })
    },
    onMoveFolder: () => {
      if (state.browse.kind !== 'folder' || !state.folderId) return
      ports.folder.openMoveFolderPicker(state.folderId, state.parentId)
    },
    onDeleteFolder: () =>
      void ports.action.run('delete folder', async () => {
        if (state.browse.kind !== 'folder' || !state.folderId || !state.folderName) return
        if (!ports.folder.confirmDeleteFolder(state.folderName)) return
        await ports.folder.deleteFolder(state.folderId)
        ports.folder.setBrowseAll()
        ports.status.report(folderDeleteSuccessStatus(state.folderName))
      }),
  }
}

export type DatabaseManagerFileSelectionCommandState = {
  selectedProjectIds: readonly string[]
  unfiledFolderId: string
  tagSuggestions: readonly string[]
}

export function buildDatabaseManagerToolbarFileSelectionCommands(
  state: DatabaseManagerFileSelectionCommandState,
  ports: {
    file: DatabaseManagerFileSelectionCommandPort
    textPrompt: DatabaseManagerTextPromptPort
    action: DatabaseManagerActionPort
    status: DatabaseManagerStatusPort
  },
) {
  const count = state.selectedProjectIds.length
  return {
    onAddToAlignment: () => void ports.file.addToAlignment(),
    onExport: async (format: Parameters<DatabaseManagerFileSelectionCommandPort['exportProjects']>[1]) => {
      const route = databaseManagerExportSelectionRoute(state.selectedProjectIds, format)
      const { message } = await ports.file.exportProjects(route.projectIds, route.format)
      ports.status.report(message)
    },
    onStatus: ports.status.report,
    onRename: () => {
      const projectId = databaseManagerRenameSelectionProjectId(state.selectedProjectIds)
      if (!projectId) return
      ports.textPrompt.open({
        title: 'Rename file',
        label: 'File name',
        initial: ports.file.fileNameForProject(projectId),
        secondaryLabel: 'Construct name',
        secondaryInitial: ports.file.constructNameForProject(projectId),
        confirmLabel: 'Rename',
        onConfirm: async (name, constructName) => {
          await ports.action.run('rename file', async () => {
            const renamed = constructName === undefined
              ? await ports.file.renameProjectFile(projectId, name)
              : await ports.file.renameProjectFile(projectId, name, constructName)
            ports.textPrompt.close()
            ports.status.report(
              fileRenameSuccessStatus({
                fileName: renamed?.fileName ?? name,
                constructName: ports.file.constructNameForProject(projectId),
              }),
            )
          })
        },
      })
    },
    onMove: () => {
      ports.file.openMoveProjectsPicker(
        state.selectedProjectIds,
        ports.file.resolveMoveTargetFolder(state.selectedProjectIds),
      )
    },
    onEditTags: () => {
      const shared = ports.file.sharedTagsForProjects(state.selectedProjectIds)
      ports.textPrompt.open({
        title: count === 1 ? 'Edit tags' : `Edit tags (${count} files)`,
        label: 'Tags (comma-separated)',
        initial: shared.join(', '),
        allowEmpty: true,
        confirmLabel: 'Save',
        suggestions: [...state.tagSuggestions],
        onConfirm: async (raw) => {
          await ports.action.run('edit tags', async () => {
            const tags = ports.file.normalizeTagsFromRaw(raw)
            const updated = await ports.file.setProjectTags(state.selectedProjectIds, tags)
            ports.textPrompt.close()
            ports.status.report(projectTagsUpdateStatus({ count: updated, cleared: tags.length === 0 }))
          })
        },
      })
    },
    onTrimHistory: () => void ports.file.trimHistory(),
    onDelete: () => void ports.file.deleteProjects(state.selectedProjectIds),
  }
}

export type DatabaseManagerPrimerToolbarCommandState = {
  selectedCount: number
  tagSuggestions: readonly string[]
}

export function buildDatabaseManagerToolbarPrimerCommands(
  state: DatabaseManagerPrimerToolbarCommandState,
  ports: {
    primer: DatabaseManagerPrimerCommandPort
    textPrompt: DatabaseManagerTextPromptPort
    action: DatabaseManagerActionPort
    status: DatabaseManagerStatusPort
    selection: DatabaseManagerSelectionPort
  },
) {
  return {
    onRename: () => {
      if (state.selectedCount !== 1) return
      const primer = ports.primer.primerAt(0)
      if (!primer || !ports.primer.isCommonPrimer(0) || !primer.commonId) return
      ports.textPrompt.open({
        title: 'Rename common primer',
        label: 'Primer name',
        initial: primer.name,
        confirmLabel: 'Rename',
        onConfirm: async (name) => {
          await ports.action.run('rename common primer', async () => {
            const previousKey = primer.key
            const previousTags = ports.primer.tagsForPrimerKey(previousKey)
            const saved = await ports.primer.upsertCommonPrimer({
              id: primer.commonId,
              name,
              sequence: primer.sequence,
              color: primer.color,
              description: primer.description,
            })
            const nextKey = ports.primer.primerIdentityKey(saved.name, saved.sequence)
            if (nextKey !== previousKey) {
            if (previousTags.length) await ports.primer.setPrimerKeysTags([nextKey], [...previousTags])
            await ports.primer.setPrimerKeysTags([previousKey], [])
            }
            await ports.primer.refreshPrimerLibrary()
            ports.selection.setSelectedIds([nextKey])
            ports.selection.setSelectionAnchorId(nextKey)
            ports.textPrompt.close()
            ports.status.report(`Renamed common primer to “${name}”.`)
          })
        },
      })
    },
    onEditTags: () => {
      const keys = Array.from({ length: state.selectedCount }, (_, index) => ports.primer.primerAt(index)?.key).filter(
        (key): key is string => Boolean(key),
      )
      const shared = ports.primer.commonTagsForKeys(keys)
      ports.textPrompt.open({
        title:
          state.selectedCount === 1
            ? 'Edit primer tags'
            : `Edit primer tags (${state.selectedCount})`,
        label: 'Tags (comma-separated)',
        initial: shared.join(', '),
        allowEmpty: true,
        confirmLabel: 'Save',
        suggestions: [...state.tagSuggestions],
        onConfirm: async (raw) => {
          await ports.action.run('edit primer tags', async () => {
            const tags = ports.primer.normalizeTagsFromRaw(raw)
            const updated = await ports.primer.setPrimerKeysTags([...keys], [...tags])
            await ports.primer.refreshPrimerTags()
            ports.textPrompt.close()
            ports.status.report(primerTagsUpdateStatus({ count: updated, cleared: tags.length === 0 }))
          })
        },
      })
    },
    onAddToCurrent: () => ports.primer.addPrimersToCurrent(),
    onAddToCommon: () =>
      void ports.action.run('add to common primers', async () => {
        const drafts = Array.from({ length: state.selectedCount }, (_, position) => position)
          .filter((position) => !ports.primer.isCommonPrimer(position))
          .map((position) => ports.primer.primerAt(position))
          .filter((primer): primer is NonNullable<typeof primer> => Boolean(primer))
          .map((primer) => ({
            name: primer.name,
            sequence: primer.sequence,
            color: primer.color,
            description: primer.description,
          }))
        if (!drafts.length) {
          ports.status.report('Selected primers are already in Common primers.')
          return
        }
        const { added, skipped } = await ports.primer.addCommonPrimers(drafts)
        await ports.primer.refreshPrimerLibrary()
        const message = commonPrimerAddStatus({
          addedNames: added.map((item) => item.name),
          skipped,
        })
        if (message === 'already-common') {
          ports.status.report('Selected primers are already in Common primers.')
          return
        }
        ports.status.report(message)
      }),
    onRemoveFromCommon: () =>
      void ports.action.run('remove common primers', async () => {
        const ids = Array.from({ length: state.selectedCount }, (_, index) => ports.primer.primerAt(index)?.commonId)
          .filter((id): id is string => Boolean(id))
        if (!ids.length) return
        if (!ports.primer.confirmRemoveCommon(ids.length)) return
        const count = await ports.primer.deleteCommonPrimers(ids)
        await ports.primer.refreshPrimerLibrary()
        ports.selection.setSelectedIds([])
        ports.status.report(commonPrimerRemoveStatus(count))
      }),
  }
}

export function buildDatabaseManagerToolbarProteinCommands(
  state: { selectedIndices: readonly number[] },
  ports: {
    protein: DatabaseManagerProteinCommandPort
    status: DatabaseManagerStatusPort
  },
) {
  return {
    onAddToAlignment: () => void ports.protein.addToAlignment(),
    onOpen: () => {
      for (const index of state.selectedIndices) void ports.protein.openProteinAt(index)
    },
    onCopySequences: () => {
      void ports.protein.copySequencesAt(state.selectedIndices).then(
        () => {
          const count = state.selectedIndices.length
          const single = count === 1 ? ports.protein.proteinAt(state.selectedIndices[0]!) : null
          ports.status.report(
            proteinCopyStatus({ count, singleName: single?.name ?? null }),
          )
        },
        () => ports.status.report('Could not copy to the clipboard.'),
      )
    },
  }
}

export function buildDatabaseManagerToolbarHistoryRecoveryCommands(port: {
  restore: () => void | Promise<void>
  discard: () => void | Promise<void>
}) {
  return {
    onRestore: () => void port.restore(),
    onDiscard: () => void port.discard(),
  }
}

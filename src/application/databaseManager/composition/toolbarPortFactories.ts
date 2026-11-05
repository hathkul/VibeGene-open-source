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

export type DatabaseManagerProjectSelectionRow = {
  id: string
  folderId: string | null
  name: string
}

export type DatabaseManagerPrimerSelectionRow = {
  key: string
  name: string
  sequence: string
  color: string
  description?: string
  commonId?: string
  isCommon: boolean
}

export type DatabaseManagerProteinSelectionRow = {
  name: string
  sequence: string
}

export type DatabaseManagerToolbarPortBundle = {
  textPrompt: DatabaseManagerTextPromptPort
  action: DatabaseManagerActionPort
  status: DatabaseManagerStatusPort
  selection: DatabaseManagerSelectionPort
  pick: DatabaseManagerPickCommandPort
  viewMode: DatabaseManagerViewModeCommandPort
  sync: DatabaseManagerSyncCommandPort
  folder: DatabaseManagerFolderToolbarCommandPort
  history: { restore: () => void | Promise<void>; discard: () => void | Promise<void> }
  file: DatabaseManagerFileSelectionCommandPort
  primer: DatabaseManagerPrimerCommandPort
  protein: DatabaseManagerProteinCommandPort
}

export function createDatabaseManagerToolbarPortBundle(input: {
  textPrompt: DatabaseManagerTextPromptPort
  action: DatabaseManagerActionPort
  status: DatabaseManagerStatusPort
  selection: DatabaseManagerSelectionPort
  pick: DatabaseManagerPickCommandPort
  viewMode: DatabaseManagerViewModeCommandPort
  sync: DatabaseManagerSyncCommandPort
  folder: DatabaseManagerFolderToolbarCommandPort
  history: { restore: () => void | Promise<void>; discard: () => void | Promise<void> }
  unfiledFolderId: string
  projectRows: readonly DatabaseManagerProjectSelectionRow[]
  file: Omit<
    DatabaseManagerFileSelectionCommandPort,
    'resolveMoveTargetFolder' | 'sharedTagsForProjects' | 'constructNameForProject'
  > & {
    sharedTagsForProjectIds: (projectIds: readonly string[]) => readonly string[]
  }
  primerRows: readonly DatabaseManagerPrimerSelectionRow[]
  primer: Omit<
    DatabaseManagerPrimerCommandPort,
    'isCommonPrimer' | 'primerAt' | 'tagsForPrimerKey' | 'commonTagsForKeys'
  > & {
    tagsForPrimerKey: (key: string) => readonly string[]
    commonTagsForKeys: (keys: readonly string[]) => readonly string[]
  }
  proteinRows: readonly DatabaseManagerProteinSelectionRow[]
  protein: Omit<DatabaseManagerProteinCommandPort, 'proteinAt' | 'proteinCount'>
}): DatabaseManagerToolbarPortBundle {
  const projectById = new Map(input.projectRows.map((row) => [row.id, row]))
  return {
    textPrompt: input.textPrompt,
    action: input.action,
    status: input.status,
    selection: input.selection,
    pick: input.pick,
    viewMode: input.viewMode,
    sync: input.sync,
    folder: input.folder,
    history: input.history,
    file: {
      ...input.file,
      resolveMoveTargetFolder: (projectIds) => {
        const projects = projectIds
          .map((id) => projectById.get(id))
          .filter((row): row is DatabaseManagerProjectSelectionRow => Boolean(row))
        const shared = projects.every((project) => project.folderId === projects[0]?.folderId)
        return shared ? (projects[0]?.folderId ?? input.unfiledFolderId) : input.unfiledFolderId
      },
      sharedTagsForProjects: (projectIds) => input.file.sharedTagsForProjectIds(projectIds),
      fileNameForProject: (projectId) => input.file.fileNameForProject(projectId),
      constructNameForProject: (projectId) => projectById.get(projectId)?.name ?? '',
    },
    primer: {
      ...input.primer,
      isCommonPrimer: (index) => Boolean(input.primerRows[index]?.isCommon),
      primerAt: (index) => {
        const primer = input.primerRows[index]
        if (!primer) return null
        return {
          key: primer.key,
          name: primer.name,
          sequence: primer.sequence,
          color: primer.color,
          description: primer.description,
          commonId: primer.commonId,
        }
      },
      tagsForPrimerKey: input.primer.tagsForPrimerKey,
      commonTagsForKeys: input.primer.commonTagsForKeys,
    },
    protein: {
      ...input.protein,
      proteinAt: (index) => {
        const protein = input.proteinRows[index]
        return protein ? { name: protein.name, sequence: protein.sequence } : null
      },
      proteinCount: () => input.proteinRows.length,
    },
  }
}

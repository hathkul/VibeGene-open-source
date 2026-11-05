import {
  databaseManagerNewFolderPromptModel,
  databaseManagerNewFolderSuccessStatus,
} from '../presentation/sidebarNewFolderOrchestration'
import type { DatabaseManagerActionPort, DatabaseManagerStatusPort, DatabaseManagerTextPromptPort } from '../ports/databaseManagerCommandPorts'

export type DatabaseManagerSidebarNewFolderPort = {
  createFolder: (name: string, parentId: string | null) => Promise<{ id: string; name: string }>
  moveProjectsToFolder: (projectIds: readonly string[], folderId: string) => Promise<void>
  browseFolder: (folderId: string) => void
  restoreSelection: (projectIds: readonly string[]) => void
}

export function openDatabaseManagerSidebarNewFolderPrompt(input: {
  movingProjectIds: readonly string[]
  singleSelectedName: string | null
  parentId: string | null
  textPrompt: DatabaseManagerTextPromptPort
  action: DatabaseManagerActionPort
  status: DatabaseManagerStatusPort
  folder: DatabaseManagerSidebarNewFolderPort
}) {
  const prompt = databaseManagerNewFolderPromptModel({
    movingCount: input.movingProjectIds.length,
    singleSelectedName: input.singleSelectedName,
  })
  input.textPrompt.open({
    ...prompt,
    onConfirm: async (name) => {
      await input.action.run('create folder', async () => {
        const folder = await input.folder.createFolder(name, input.parentId)
        if (input.movingProjectIds.length > 0) {
          await input.folder.moveProjectsToFolder(input.movingProjectIds, folder.id)
          input.folder.restoreSelection(input.movingProjectIds)
        }
        input.folder.browseFolder(folder.id)
        input.textPrompt.close()
        input.status.report(
          databaseManagerNewFolderSuccessStatus({
            folderName: folder.name,
            movedCount: input.movingProjectIds.length,
          }),
        )
      })
    },
  })
}

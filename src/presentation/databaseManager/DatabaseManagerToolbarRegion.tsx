import { DatabaseFolderSyncStatus } from './DatabaseFolderSyncStatus'
import { DatabaseManagerToolbar } from './DatabaseManagerToolbar'
import type {
  DatabaseFolderSyncStatusCommands,
  DatabaseFolderSyncStatusModel,
} from './DatabaseFolderSyncStatus'
import type {
  DatabaseManagerToolbarCommands,
  DatabaseManagerToolbarModel,
} from './databaseManagerToolbarTypes'

export type DatabaseManagerToolbarRegionProps = {
  model: DatabaseManagerToolbarModel
  commands: DatabaseManagerToolbarCommands
  folderSync: {
    visible: boolean
    model: DatabaseFolderSyncStatusModel
    commands: DatabaseFolderSyncStatusCommands
  }
}

export function DatabaseManagerToolbarRegion({
  model,
  commands,
  folderSync,
}: DatabaseManagerToolbarRegionProps) {
  return (
    <>
      <DatabaseManagerToolbar model={model} commands={commands} />
      {folderSync.visible ? (
        <DatabaseFolderSyncStatus model={folderSync.model} commands={folderSync.commands} />
      ) : null}
    </>
  )
}

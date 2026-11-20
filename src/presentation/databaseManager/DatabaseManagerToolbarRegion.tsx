import { DatabaseFolderSyncStatus } from './DatabaseFolderSyncStatus'
import type { ReactNode } from 'react'
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
  searchControl?: ReactNode
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
  searchControl,
}: DatabaseManagerToolbarRegionProps) {
  return (
    <>
      <DatabaseManagerToolbar model={model} commands={commands} searchControl={searchControl} />
      {folderSync.visible ? (
        <DatabaseFolderSyncStatus model={folderSync.model} commands={folderSync.commands} />
      ) : null}
    </>
  )
}

import type { RefObject } from 'react'
import { DatabaseBuiltinTablePane, type DatabaseBuiltinTableCommands } from './DatabaseBuiltinTablePane'
import { DatabaseFilesTablePane, type DatabaseFilesTableCommands } from './DatabaseFilesTablePane'
import { DatabasePrimersTablePane, type DatabasePrimersTableCommands } from './DatabasePrimersTablePane'
import { DatabaseProteinsTablePane, type DatabaseProteinsTableCommands } from './DatabaseProteinsTablePane'
import type {
  DatabaseManagerBuiltInPaneModel,
  DatabaseManagerFilesPaneModel,
  DatabaseManagerPrimersPaneModel,
  DatabaseManagerProteinsPaneModel,
} from './databaseManagerTableTypes'
import type { DatabaseManagerViewMode } from './types'

export type DatabaseManagerRecordsPaneCommands = {
  primers: DatabasePrimersTableCommands
  proteins: DatabaseProteinsTableCommands
  builtin: DatabaseBuiltinTableCommands
  files: DatabaseFilesTableCommands
}

export type DatabaseManagerRecordsPaneProps = {
  fileListRef: RefObject<HTMLDivElement | null>
  viewMode: DatabaseManagerViewMode
  browseKind: 'builtin' | 'files' | 'other'
  primersModel: DatabaseManagerPrimersPaneModel
  proteinsModel: DatabaseManagerProteinsPaneModel
  builtinModel: DatabaseManagerBuiltInPaneModel
  filesModel: DatabaseManagerFilesPaneModel
  commands: DatabaseManagerRecordsPaneCommands
}

export function DatabaseManagerRecordsPane({
  fileListRef,
  viewMode,
  browseKind,
  primersModel,
  proteinsModel,
  builtinModel,
  filesModel,
  commands,
}: DatabaseManagerRecordsPaneProps) {
  return (
    <div className={`db-file-list${viewMode === 'cdses' ? ' is-cds-list' : ''}`} ref={fileListRef}>
      {viewMode === 'primers' ? (
        <DatabasePrimersTablePane model={primersModel} commands={commands.primers} />
      ) : viewMode === 'cdses' ? (
        <DatabaseProteinsTablePane model={proteinsModel} commands={commands.proteins} />
      ) : browseKind === 'builtin' ? (
        <DatabaseBuiltinTablePane model={builtinModel} commands={commands.builtin} />
      ) : (
        <DatabaseFilesTablePane model={filesModel} commands={commands.files} />
      )}
    </div>
  )
}

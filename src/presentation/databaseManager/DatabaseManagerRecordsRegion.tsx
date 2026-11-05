import { useMemo, type RefObject } from 'react'
import { DatabaseManagerRecordsPane, type DatabaseManagerRecordsPaneProps } from './DatabaseManagerRecordsPane'
import {
  DatabaseTablePagination,
  type DatabaseTablePaginationCommands,
} from './DatabaseTablePagination'
import type { DatabaseManagerPaginationModel } from './databaseManagerTableTypes'

function scrollDatabaseManagerFileListToTop(fileListRef: RefObject<HTMLDivElement | null>) {
  const node = fileListRef.current
  if (!node) return
  node.scrollTo({ top: 0, left: node.scrollLeft })
}

export type DatabaseManagerRecordsRegionProps = DatabaseManagerRecordsPaneProps & {
  paginationModel: DatabaseManagerPaginationModel
  paginationCommands: DatabaseTablePaginationCommands
}

export function DatabaseManagerRecordsRegion({
  paginationModel,
  paginationCommands,
  fileListRef,
  ...recordsPane
}: DatabaseManagerRecordsRegionProps) {
  const paginationCommandsWithScroll = useMemo(
    (): DatabaseTablePaginationCommands => ({
      onGoToPage: (page) => {
        paginationCommands.onGoToPage(page)
        scrollDatabaseManagerFileListToTop(fileListRef)
      },
    }),
    [fileListRef, paginationCommands],
  )

  return (
    <>
      <DatabaseManagerRecordsPane {...recordsPane} fileListRef={fileListRef} />
      <DatabaseTablePagination model={paginationModel} commands={paginationCommandsWithScroll} />
    </>
  )
}

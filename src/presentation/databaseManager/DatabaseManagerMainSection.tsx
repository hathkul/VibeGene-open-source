import type { RefObject } from 'react'
import {
  DatabaseManagerRecordsRegion,
  type DatabaseManagerRecordsRegionProps,
} from './DatabaseManagerRecordsRegion'
import { DatabaseManagerToolbarRegion, type DatabaseManagerToolbarRegionProps } from './DatabaseManagerToolbarRegion'

export type DatabaseManagerMainSectionProps = {
  toolbar: DatabaseManagerToolbarRegionProps
  records: Omit<DatabaseManagerRecordsRegionProps, 'fileListRef'>
  recordsFileListRef: RefObject<HTMLDivElement | null>
}

export function DatabaseManagerMainSection({
  toolbar,
  records,
  recordsFileListRef,
}: DatabaseManagerMainSectionProps) {
  return (
    <section className="db-manager-main">
      <DatabaseManagerToolbarRegion {...toolbar} />
      <DatabaseManagerRecordsRegion {...records} fileListRef={recordsFileListRef} />
    </section>
  )
}

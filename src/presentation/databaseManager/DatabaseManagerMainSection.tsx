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
  search?: { value: string; scope: 'current' | 'global'; onChange: (value: string) => void; onScopeChange: (scope: 'current' | 'global') => void }
}

export function DatabaseManagerMainSection({
  toolbar,
  records,
  recordsFileListRef,
  search,
}: DatabaseManagerMainSectionProps) {
  return (
    <section className="db-manager-main">
      <DatabaseManagerToolbarRegion {...toolbar} searchControl={search && <div className="db-search-bar">
        <input type="search" aria-label="Search database" placeholder="Search names, filenames or tags" value={search.value} onChange={(event) => search.onChange(event.target.value)} />
        <select aria-label="Search scope" value={search.scope} onChange={(event) => search.onScopeChange(event.target.value as 'current' | 'global')}>
          <option value="current">Current folder / view</option>
          <option value="global">All folders</option>
        </select>
      </div>} />
      <DatabaseManagerRecordsRegion {...records} fileListRef={recordsFileListRef} />
    </section>
  )
}

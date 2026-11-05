import type { ComponentProps } from 'react'
import type { DatabaseManagerDialog } from '../../DatabaseManagerDialog'
import { SequenceDatabaseImportDialog } from '../../SequenceDatabaseImportDialog'
import { CombineLibraryReadsDialog } from '../../components/CombineLibraryReadsDialog'
import { DeduplicateLibraryMembersDialog } from '../../components/DeduplicateLibraryMembersDialog'
import { lazyDialog } from '../../ui/lazyDialog'

const LazyDatabaseManagerDialog = lazyDialog(
  () => import('../../DatabaseManagerDialog'),
  (module) => module.DatabaseManagerDialog,
)

type DatabaseManagerProps = ComponentProps<typeof DatabaseManagerDialog>
type SequenceImportProps = ComponentProps<typeof SequenceDatabaseImportDialog>
type CombineLibraryProps = ComponentProps<typeof CombineLibraryReadsDialog>
type DedupeLibraryProps = ComponentProps<typeof DeduplicateLibraryMembersDialog>

export type DatabaseDialogsHostProps = {
  databaseOpen: boolean
  databaseManagerProps: Omit<DatabaseManagerProps, 'onClose'>
  setDatabaseOpen: (open: boolean) => void
  onDatabaseClose?: () => void
  sequenceDatabaseImportOpen: boolean
  sequenceImportProps: Omit<SequenceImportProps, 'onCancel'>
  setSequenceDatabaseImportOpen: (open: boolean) => void
  combineLibraryReadsOpen: boolean
  combineLibraryProps: Omit<CombineLibraryProps, 'onCancel'>
  setCombineLibraryReadsOpen: (open: boolean) => void
  dedupeLibraryMembersGroups: DedupeLibraryProps['groups'] | null
  dedupeLibraryProps: Omit<DedupeLibraryProps, 'groups' | 'onCancel'>
  setDedupeLibraryMembersGroups: (groups: DedupeLibraryProps['groups'] | null) => void
}

/** Hosts database browsing/import and library maintenance dialogs. */
export function DatabaseDialogsHost(props: DatabaseDialogsHostProps) {
  const closeDatabaseManager = props.onDatabaseClose ?? (() => props.setDatabaseOpen(false))
  return (
    <>
      {props.combineLibraryReadsOpen && <CombineLibraryReadsDialog {...props.combineLibraryProps} onCancel={() => props.setCombineLibraryReadsOpen(false)} />}
      {props.dedupeLibraryMembersGroups && <DeduplicateLibraryMembersDialog {...props.dedupeLibraryProps} groups={props.dedupeLibraryMembersGroups} onCancel={() => props.setDedupeLibraryMembersGroups(null)} />}
      {props.databaseOpen && <LazyDatabaseManagerDialog {...props.databaseManagerProps} onClose={closeDatabaseManager} onLoadError={() => {
        closeDatabaseManager()
        props.databaseManagerProps.onStatus?.('Could not load the Database dialog.')
      }} />}
      {props.sequenceDatabaseImportOpen && <SequenceDatabaseImportDialog {...props.sequenceImportProps} onCancel={() => props.setSequenceDatabaseImportOpen(false)} />}
    </>
  )
}

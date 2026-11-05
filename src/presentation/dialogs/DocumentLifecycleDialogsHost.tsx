import type { SequenceRecord } from '../../domain/types'
import type { NativeOverwriteAvailability } from '../../domain/projectSaveSemantics'
import type { ProjectFileFormat } from '../../domain/fileFormats'
import type { StoredProjectSummary } from '../../application/ports/projectPersistence'
import { SaveToDatabaseDialog } from '../../SaveToDatabaseDialog'
import { RenameFileDialog } from '../../RenameFileDialog'
import { NativeFormatSaveDialog } from '../../NativeFormatSaveDialog'
import { UnsavedChangesDialog } from '../../UnsavedChangesDialog'

export type DocumentLifecycleDialogsHostProps = {
  record: SequenceRecord
  saveToDialogOpen: boolean
  currentDocumentFileName: () => string
  resolvedLibraryFolderId: () => string | null | undefined
  databaseSaveBusy: boolean
  cancelDatabaseSaveFlow: () => void
  handleSaveToFolder: (folderId: string | null, fileName: string) => void | Promise<void>
  setSaveToDialogOpen: (open: boolean) => void
  renameFileDialogOpen: boolean
  documentSaveBinding: 'database' | 'disk' | 'new'
  handleRenameFile: (fileName: string) => void
  setRenameFileDialogOpen: (open: boolean) => void
  nativeFormatSaveProject: StoredProjectSummary | null
  nativeOverwriteAvailability: (format: ProjectFileFormat) => NativeOverwriteAvailability
  snapGeneExtensionForMolecule: (molecule: SequenceRecord['molecule']) => 'dna' | 'prot'
  saveNativeFormatDecision: (decision: 'copy' | 'overwrite') => void
  setNativeFormatSaveProject: (project: StoredProjectSummary | null) => void
  pendingDocumentExit: { context?: 'document' | 'window-close' | 'app-quit' } | null
  resolveDocumentExit: (decision: 'cancel' | 'discard' | 'save-file' | 'save-as-file' | 'save-to-database') => void | Promise<void>
}

/** Hosts save, rename, native-format, and unsaved-exit dialogs. */
export function DocumentLifecycleDialogsHost(props: DocumentLifecycleDialogsHostProps) {
  const { record } = props
  return (
    <>
      {props.saveToDialogOpen && <SaveToDatabaseDialog recordName={record.name} initialFileName={props.currentDocumentFileName()} initialFolderId={props.resolvedLibraryFolderId() ?? null} allowCreateFolder busy={props.databaseSaveBusy} onCancel={props.cancelDatabaseSaveFlow} onConfirm={props.handleSaveToFolder} />}
      {props.renameFileDialogOpen && <RenameFileDialog initialFileName={props.currentDocumentFileName()} molecule={record.molecule} detail={props.documentSaveBinding === 'disk' ? 'Renames the file on disk. The construct name in Description is unchanged.' : 'Renames the Database file. The construct name in Description is unchanged.'} onCancel={() => props.setRenameFileDialogOpen(false)} onConfirm={props.handleRenameFile} />}
      {props.nativeFormatSaveProject && <NativeFormatSaveDialog fileName={props.nativeFormatSaveProject.fileName ?? props.nativeFormatSaveProject.name} native={props.nativeOverwriteAvailability(props.nativeFormatSaveProject.fileFormat ?? 'unknown')} copyExtension={props.snapGeneExtensionForMolecule(record.molecule)} busy={props.databaseSaveBusy} onCancel={props.cancelDatabaseSaveFlow} onSaveCopy={() => props.saveNativeFormatDecision('copy')} onOverwriteNative={() => props.saveNativeFormatDecision('overwrite')} />}
      {props.pendingDocumentExit && <UnsavedChangesDialog recordName={record.name} context={props.pendingDocumentExit.context ?? 'document'} snapGeneExtension={props.snapGeneExtensionForMolecule(record.molecule)} saveBinding={props.documentSaveBinding} onCancel={() => void props.resolveDocumentExit('cancel')} onDiscard={() => void props.resolveDocumentExit('discard')} onSaveFile={() => void props.resolveDocumentExit('save-file')} onSaveAsFile={() => void props.resolveDocumentExit('save-as-file')} onSaveToDatabase={() => void props.resolveDocumentExit('save-to-database')} />}
    </>
  )
}

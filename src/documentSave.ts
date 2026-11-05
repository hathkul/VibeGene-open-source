import {
  saveDiskDocument,
  type SaveDiskDocumentRequest,
  type SaveDiskDocumentResult,
} from './application/documentSave/saveDiskDocument'
import { serializeProjectFile } from './domain/fileFormats'
import { resolveMappedFolderDefaultSavePath } from './storage/databaseExport'
import { saveBytesAs, desktopPathExists, writeBytesToPath } from './desktop/fileIo'
import { isTauriRuntime } from './desktop/tauriRuntime'

export type MountedDocumentSaveRequest = SaveDiskDocumentRequest & {
  documentSaveBinding: 'disk' | 'database' | 'new'
  adoptWorkspaceDiskPath: (path: string) => void
}

/** Compose the Save workflow with browser, desktop and mapped-folder APIs. */
export function saveMountedDocument(
  request: MountedDocumentSaveRequest,
): Promise<SaveDiskDocumentResult> {
  return saveDiskDocument(request, {
    serialize: serializeProjectFile,
    mappedFolderDefaultSavePath: async (fileName) => {
      if (!isTauriRuntime() || request.documentSaveBinding !== 'database') return undefined
      return (await resolveMappedFolderDefaultSavePath({ projectId: request.record.id, fileName })) ?? undefined
    },
    saveAs: saveBytesAs,
    desktopPathExists,
    writeBytesToPath,
    adoptWorkspaceDiskPath: request.adoptWorkspaceDiskPath,
  })
}

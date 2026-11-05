import {
  applyDiskSaveFileNameToStubConstruct,
  diskSaveConversionMessage,
  replaceFileExtension,
  resolveDiskSaveTarget,
  snapGeneExtensionForMolecule,
  snapGeneFormatForMolecule,
} from '../../domain/projectSaveSemantics'
import type {
  ProjectFileFormat,
  ProjectFileSerializationResult,
  ProjectFileSerializeOptions,
} from '../../domain/fileFormats'
import type { SequenceRecord } from '../../domain/types'
import type { TraceFileRecord } from '../../domain/traceTypes'

export type SaveDiskDocumentRequest = {
  record: SequenceRecord
  traces: TraceFileRecord[]
  workspaceDiskPath: string | null
  forceDialog?: boolean
  traceDocument?: boolean
  snapGeneOptions?: ProjectFileSerializeOptions['snapGene']
}

export type SaveDiskDocumentPorts = {
  serialize: (
    format: ProjectFileFormat,
    record: SequenceRecord,
    options?: ProjectFileSerializeOptions,
  ) => ProjectFileSerializationResult
  mappedFolderDefaultSavePath: (fileName: string) => Promise<string | undefined>
  saveAs: (
    fileName: string,
    bytes: Uint8Array,
    type: string,
    options?: { defaultPath?: string },
  ) => Promise<string | null>
  desktopPathExists: (path: string) => Promise<boolean>
  writeBytesToPath: (path: string, bytes: Uint8Array) => Promise<void>
  /** Adopt a native path at the same point the legacy shell did. */
  adoptWorkspaceDiskPath: (path: string) => void
}

export type SaveDiskDocumentResult =
  | { kind: 'saved'; path: string; format: ProjectFileFormat; record: SequenceRecord; conversionMessage: string | null }
  | { kind: 'rejected'; message: string }
  | { kind: 'cancelled'; message?: string }
  | { kind: 'error'; message: string }

function serializedBytes(
  ports: SaveDiskDocumentPorts,
  format: ProjectFileFormat,
  record: SequenceRecord,
  snapGeneOptions: ProjectFileSerializeOptions['snapGene'],
): Uint8Array | { error: string } {
  const serialized = ports.serialize(format, record, { snapGene: snapGeneOptions })
  return serialized.ok ? serialized.bytes : { error: serialized.error }
}

/**
 * Plan and execute Save / Save As for a standalone document.
 *
 * This workflow owns format resolution, conversion, serialization and file I/O
 * sequencing. The workspace shell supplies its path-adoption port and owns the
 * remaining React state commits, so this module remains independent of the UI.
 */
export async function saveDiskDocument(
  request: SaveDiskDocumentRequest,
  ports: SaveDiskDocumentPorts,
): Promise<SaveDiskDocumentResult> {
  if (request.traceDocument) {
    return {
      kind: 'rejected',
      message: 'Trace documents are read-only. Open as sequence before saving.',
    }
  }

  let exportRecord: SequenceRecord = { ...request.record, traceFiles: request.traces }
  const extension = snapGeneExtensionForMolecule(exportRecord.molecule)
  let format: ProjectFileFormat = snapGeneFormatForMolecule(exportRecord.molecule)
  const snapGeneOptions = request.snapGeneOptions
  let path = request.workspaceDiskPath
  let choseNewPath = false
  let conversionMessage: string | null = null

  if (!path || request.forceDialog) {
    const bytes = serializedBytes(ports, format, exportRecord, snapGeneOptions)
    if ('error' in bytes) return { kind: 'error', message: bytes.error }
    const sourceDefaultPath = path
      ? path.toLowerCase().endsWith(`.${extension}`) ? path : replaceFileExtension(path, extension)
      : undefined
    const defaultName = sourceDefaultPath?.replace(/^.*[/\\]/, '') ?? `${exportRecord.name}.${extension}`
    const defaultPath = sourceDefaultPath ?? await ports.mappedFolderDefaultSavePath(defaultName)
    path = await ports.saveAs(defaultName, bytes, 'application/octet-stream', { defaultPath })
    if (!path) return { kind: 'cancelled' }
    choseNewPath = true
    ports.adoptWorkspaceDiskPath(path)
  } else {
    // Preserve the opened format when it can represent the document. Otherwise
    // save a sibling SnapGene file so text extensions never receive binary bytes.
    const target = resolveDiskSaveTarget(path, exportRecord)
    format = target.format
    if (target.convertedFrom) {
      if (await ports.desktopPathExists(target.path)) {
        const bytes = serializedBytes(ports, format, exportRecord, snapGeneOptions)
        if ('error' in bytes) return { kind: 'error', message: bytes.error }
        const chosen = await ports.saveAs(
          target.path.replace(/^.*[/\\]/, ''),
          bytes,
          'application/octet-stream',
          { defaultPath: target.path },
        )
        if (!chosen) return { kind: 'cancelled', message: 'Save cancelled.' }
        path = chosen
        choseNewPath = true
      } else {
        path = target.path
      }
      conversionMessage = diskSaveConversionMessage({ ...target, path })
      ports.adoptWorkspaceDiskPath(path)
    }
  }

  // File → New adopts the selected file stem so the title follows the file.
  const namedRecord = applyDiskSaveFileNameToStubConstruct(exportRecord, path)
  const nameChanged = namedRecord.name !== exportRecord.name
  exportRecord = namedRecord

  if (!choseNewPath || nameChanged) {
    const bytes = serializedBytes(ports, format, exportRecord, snapGeneOptions)
    if ('error' in bytes) return { kind: 'error', message: bytes.error }
    await ports.writeBytesToPath(path, bytes)
  }

  return { kind: 'saved', path, format, record: exportRecord, conversionMessage }
}

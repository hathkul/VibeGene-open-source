import { useCallback } from 'react'
import type { SequenceRecord } from '../../domain/types'
import type { TraceFileRecord } from '../../domain/traceTypes'
import type { DisplaySettings } from '../sequence'
import type { ProjectFileFormat, ProjectFileSerializeOptions } from '../../domain/fileFormats'
import type { MountedDocumentSaveRequest } from '../../documentSave'

type SerializedExport = ProjectFileSerializeResult
type ProjectFileSerializeResult = { ok: true; bytes: Uint8Array } | { ok: false; error: string }

export type DocumentDiskPersistenceOptions = {
  record: SequenceRecord
  traceDocument: boolean
  displaySettings: DisplaySettings
  workspaceDiskPath: string | null
  documentSaveBinding: 'disk' | 'database' | 'new'
  traceFilesWithFreshAlignments: () => TraceFileRecord[]
  withPackedLibraryMemberFeatures: (record: SequenceRecord, traces: TraceFileRecord[]) => SequenceRecord
  snapGeneExtensionForMolecule: (molecule: SequenceRecord['molecule']) => string
  snapGeneFormatForMolecule: (molecule: SequenceRecord['molecule']) => ProjectFileFormat
  snapGeneExportOptions: (displaySettings: DisplaySettings, record: SequenceRecord) => ProjectFileSerializeOptions['snapGene']
  serializeProjectFile: (format: ProjectFileFormat, record: SequenceRecord, options?: ProjectFileSerializeOptions) => SerializedExport
  saveMountedDocument: (request: MountedDocumentSaveRequest) => Promise<{
    kind: 'saved' | 'rejected' | 'cancelled' | 'error'
    path?: string
    record?: SequenceRecord
    conversionMessage?: string | null
    message?: string
  }>
  mappedFolderDefaultSavePath: (fileName: string) => Promise<string | undefined>
  downloadBytes: (fileName: string, bytes: Uint8Array, mimeType: string, options?: { defaultPath?: string }) => Promise<string | null>
  downloadText: (fileName: string, text: string, mimeType: string, options?: { defaultPath?: string }) => Promise<string | null>
  exportGenBank: (record: SequenceRecord) => string
  exportFasta: (record: SequenceRecord) => string
  isNativeDesktop: () => boolean
  setRecord: (updater: (record: SequenceRecord) => SequenceRecord) => void
  setWorkspaceDiskPath: (path: string | null) => void
  markClean: (record: SequenceRecord, traces: TraceFileRecord[]) => void
  touchRecentLocalFile: (path: string, fileName: string) => void
  setStatus: (status: string) => void
  completeDatabaseSave: () => Promise<void>
  actionProfileSync: <T>(name: string, category: string, run: () => T, detail: string) => T
}

/** Owns disk-backed save and export orchestration while App supplies concrete I/O ports. */
export function useDocumentDiskPersistenceController(options: DocumentDiskPersistenceOptions) {
  const mappedFolderDefaultSavePath = useCallback(
    (fileName: string) => options.mappedFolderDefaultSavePath(fileName),
    [options],
  )

  const handleExportSnapGene = useCallback(async () => {
    const tracesForExport = options.traceFilesWithFreshAlignments()
    const exportRecord = options.withPackedLibraryMemberFeatures({ ...options.record, traceFiles: tracesForExport }, tracesForExport)
    const extension = options.snapGeneExtensionForMolecule(exportRecord.molecule)
    const format = options.snapGeneFormatForMolecule(exportRecord.molecule)
    const serialized = options.serializeProjectFile(format, exportRecord, {
      snapGene: options.snapGeneExportOptions(options.displaySettings, exportRecord),
    })
    if (!serialized.ok) {
      options.setStatus(serialized.error)
      return null
    }
    const fileName = `${options.record.name}.${extension}`
    const defaultPath = await mappedFolderDefaultSavePath(fileName)
    const path = await options.downloadBytes(fileName, serialized.bytes, 'application/octet-stream', { defaultPath })
    if (path === null && options.isNativeDesktop()) return null
    if (path) options.touchRecentLocalFile(path, `${options.record.name}.${extension}`)
    options.setStatus(path ? `Saved ${path}` : `Saved ${options.record.name}.${extension}`)
    return path
  }, [options, mappedFolderDefaultSavePath])

  const handleSaveDiskFile = useCallback(async (saveOptions: { forceDialog?: boolean } = {}) => {
    if (options.traceDocument) {
      options.setStatus('Trace documents are read-only. Open as sequence before saving.')
      return false
    }
    const tracesForSave = options.traceFilesWithFreshAlignments()
    const result = await options.saveMountedDocument({
      record: { ...options.record, traceFiles: tracesForSave },
      traces: tracesForSave,
      workspaceDiskPath: options.workspaceDiskPath,
      forceDialog: saveOptions.forceDialog,
      traceDocument: options.traceDocument,
      documentSaveBinding: options.documentSaveBinding,
      adoptWorkspaceDiskPath: options.setWorkspaceDiskPath,
      snapGeneOptions: options.snapGeneExportOptions(options.displaySettings, { ...options.record, traceFiles: tracesForSave }),
    })
    if (result.kind === 'rejected' || result.kind === 'error') {
      options.setStatus(result.message ?? 'Could not save document.')
      return false
    }
    if (result.kind === 'cancelled') {
      if (result.message) options.setStatus(result.message)
      return false
    }
    const path = result.path!
    const savedRecord = result.record!
    if (savedRecord.name !== options.record.name) options.setRecord((current) => ({ ...current, name: savedRecord.name }))
    options.touchRecentLocalFile(path, path.replace(/^.*[/\\]/, ''))
    options.markClean({ ...options.record, name: savedRecord.name, traceFiles: tracesForSave }, tracesForSave)
    options.setStatus(result.conversionMessage ?? `Saved ${path}`)
    await options.completeDatabaseSave()
    return true
  }, [options])

  const handleExportGenBank = useCallback(async () => {
    const extension = options.record.molecule === 'protein' ? 'gp' : 'gb'
    const fileName = `${options.record.name}.${extension}`
    const defaultPath = await mappedFolderDefaultSavePath(fileName)
    const path = await options.downloadText(fileName, options.exportGenBank(options.record), 'text/plain', { defaultPath })
    if (path === null && options.isNativeDesktop()) return
    if (path) options.touchRecentLocalFile(path, `${options.record.name}.${extension}`)
    options.setStatus(path ? `Saved ${path}` : `Saved ${options.record.name}.${extension}`)
  }, [options, mappedFolderDefaultSavePath])

  const handleExportFasta = useCallback(async () => {
    const fileName = `${options.record.name}.fasta`
    const defaultPath = await mappedFolderDefaultSavePath(fileName)
    const path = await options.downloadText(fileName, options.exportFasta(options.record), 'text/plain', { defaultPath })
    if (path === null && options.isNativeDesktop()) return
    if (path) options.touchRecentLocalFile(path, `${options.record.name}.fasta`)
    options.setStatus(path ? `Saved ${path}` : `Saved ${options.record.name}.fasta`)
  }, [options, mappedFolderDefaultSavePath])

  const exportSnapGeneFile = useCallback(async () => {
    const tracesForExport = options.traceFilesWithFreshAlignments()
    const exportRecord = options.withPackedLibraryMemberFeatures({ ...options.record, traceFiles: tracesForExport }, tracesForExport)
    const extension = options.snapGeneExtensionForMolecule(exportRecord.molecule)
    const format = options.snapGeneFormatForMolecule(exportRecord.molecule)
    const bytes = options.actionProfileSync(
      'exportSnapGene',
      'export',
      () => {
        const serialized = options.serializeProjectFile(format, exportRecord, {
          snapGene: options.snapGeneExportOptions(options.displaySettings, exportRecord),
        })
        if (!serialized.ok) throw new Error(serialized.error)
        return serialized.bytes
      },
      `${exportRecord.sequence.length} ${exportRecord.molecule === 'protein' ? 'aa' : 'bp'}`,
    )
    return options.downloadBytes(`${options.record.name}.${extension}`, bytes, 'application/octet-stream')
  }, [options])

  return { mappedFolderDefaultSavePath, handleExportSnapGene, handleSaveDiskFile, handleExportGenBank, handleExportFasta, exportSnapGeneFile }
}

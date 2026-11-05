import { hasNonDefaultDnaEnds, resolveDnaEnds } from './dnaEnds'
import {
  canWriteProjectFileFormat,
  inferProjectFileFormat,
  projectFileFormatDefinition,
  type ProjectFileFormat,
} from './fileFormats'
import type { MoleculeType, SequenceRecord } from './types'

export type ExistingDatabaseProjectFile = {
  id: string
  folderId?: string | null
  tags?: string[]
  fileName?: string
  fileFormat?: ProjectFileFormat
  fileProvenance?: 'created' | 'imported' | 'sync-folder' | 'legacy'
}

export type WorkspaceSaveDisposition =
  | 'choose-database-folder'
  | 'save-snapgene'
  | 'choose-native-save'

/** Where the active document is primarily stored in standalone mode. */
export type WorkspaceDocumentBinding = 'disk' | 'database' | 'new'

/** Display the filename (including extension) when the document has one. */
export function workspaceTitleName(input: {
  constructName: string
  traceFileName?: string | null
  diskPath?: string | null
  databaseFileName?: string | null
  importedFileName?: string | null
}): string {
  const file = input.traceFileName?.trim() || input.diskPath?.trim()
    || input.databaseFileName?.trim() || input.importedFileName?.trim()
  return (file ? basename(file) : '') || input.constructName.trim() || 'Untitled'
}

export function workspaceDocumentBinding(input: {
  libraryFolderId: string | null | undefined
  workspaceDiskPath?: string | null
}): WorkspaceDocumentBinding {
  if (input.libraryFolderId !== undefined) return 'database'
  if (input.workspaceDiskPath?.trim()) return 'disk'
  return 'new'
}

/**
 * Native / browser window title for an open construct.
 * Standalone appends the storage source so Database vs disk duplicates are obvious.
 */
export function workspaceWindowTitle(
  name: string,
  options?: {
    isDirty?: boolean
    binding?: WorkspaceDocumentBinding
    /** When false, omit the Database/disk source suffix (e.g. web). Default true. */
    showSource?: boolean
  },
): string {
  const base = `${name.trim() || 'Untitled'}${options?.isDirty ? '*' : ''}`
  if (options?.showSource === false) return base
  if (options?.binding === 'database') return `${base} — from Database`
  if (options?.binding === 'disk') return `${base} — from disk`
  return base
}

export type SaveToolbarModeOption = {
  id: 'save' | 'save-dna' | 'save-to'
  label: string
  title: string
}

export function saveToolbarModeOptions(
  binding: WorkspaceDocumentBinding,
  molecule: MoleculeType | undefined,
): SaveToolbarModeOption[] {
  const extension = snapGeneExtensionForMolecule(molecule)
  if (binding === 'database') {
    return [
      { id: 'save', label: 'Save', title: 'Save to the same database folder' },
      { id: 'save-to', label: 'Save to…', title: 'Choose a database folder' },
      {
        id: 'save-dna',
        label: `Save as .${extension}`,
        title: `Export a SnapGene .${extension} file`,
      },
    ]
  }
  return [
    { id: 'save', label: 'Save', title: 'Save to the same file on disk' },
    { id: 'save-dna', label: 'Save as…', title: `Save as a SnapGene .${extension} file` },
    { id: 'save-to', label: 'Save to database…', title: 'Save a copy in the Vibegene database' },
  ]
}

export function nativeSaveToMenuLabel(binding: WorkspaceDocumentBinding): string {
  return binding === 'database' ? 'Save to…' : 'Save to database…'
}

export function nativeSaveSnapGeneMenuLabel(
  binding: WorkspaceDocumentBinding,
  molecule: MoleculeType | undefined,
): string {
  if (binding === 'database') {
    return molecule === 'protein' ? 'Save as SnapGene .prot file' : 'Save as SnapGene .dna file'
  }
  return 'Save as…'
}

export function snapGeneFormatForMolecule(
  molecule: MoleculeType | undefined,
): 'snapgene' | 'snapgene-protein' {
  return molecule === 'protein' ? 'snapgene-protein' : 'snapgene'
}

export function snapGeneExtensionForMolecule(
  molecule: MoleculeType | undefined,
): 'dna' | 'prot' {
  return molecule === 'protein' ? 'prot' : 'dna'
}

/**
 * Keep SnapGene DNA/protein extensions aligned with molecule type.
 * Leaves GenBank/GenPept/FASTA/etc. names unchanged.
 */
export function coerceSnapGeneFileNameForMolecule(
  fileName: string,
  molecule: MoleculeType | undefined,
): string {
  if (molecule !== 'protein' && molecule !== 'dna') return fileName
  const normalized = fileName.replace(/\\/g, '/')
  const slash = normalized.lastIndexOf('/')
  const dir = slash >= 0 ? normalized.slice(0, slash + 1) : ''
  const base = slash >= 0 ? normalized.slice(slash + 1) : normalized
  const dot = base.lastIndexOf('.')
  if (dot <= 0 || dot >= base.length - 1) return fileName
  const stem = base.slice(0, dot)
  const extension = base.slice(dot + 1).toLowerCase()
  if (molecule === 'protein' && extension === 'dna') return `${dir}${stem}.prot`
  if (molecule === 'dna' && extension === 'prot') return `${dir}${stem}.dna`
  return fileName
}

type DiskSaveRecord = Pick<
  SequenceRecord,
  'molecule' | 'topology' | 'features' | 'primers' | 'traceFiles' | 'protein' | 'strandColors' | 'dnaEnds'
>

/**
 * Document content that `format` cannot store, as user-facing nouns.
 * Empty when saving in `format` loses nothing the user edits in VibeGene.
 */
export function contentLostInDiskFormat(record: DiskSaveRecord, format: ProjectFileFormat): string[] {
  const family = projectFileFormatDefinition(format).family
  if (family === 'snapgene' || family === 'vibegene') return []
  const sequenceOnly = family === 'plain-sequence' || family === 'fasta'
  const lost: string[] = []
  if (sequenceOnly && record.features.length) lost.push('features')
  if (record.primers.length) lost.push('primers')
  if (record.traceFiles?.length) lost.push('sequencing traces')
  if (record.molecule === 'protein' && record.protein?.bonds?.length) lost.push('bonds')
  if (sequenceOnly && record.molecule !== 'protein' && record.topology === 'circular') {
    lost.push('circular topology')
  }
  if (record.strandColors?.topStrand.length || record.strandColors?.bottomStrand.length) {
    lost.push('sequence colors')
  }
  if (
    record.molecule === 'dna'
    && record.topology === 'linear'
    && hasNonDefaultDnaEnds(resolveDnaEnds(record))
  ) {
    lost.push('DNA end overhangs')
  }
  return lost
}

export type DiskSaveTarget = {
  path: string
  format: ProjectFileFormat
  /** Set when the opened file cannot hold the document; that file is left unchanged. */
  convertedFrom?: { path: string; format: ProjectFileFormat; lost: string[] }
}

export function replaceFileExtension(path: string, extension: string): string {
  const normalized = path.replace(/\\/g, '/')
  const slash = normalized.lastIndexOf('/')
  const base = path.slice(slash + 1)
  const dot = base.lastIndexOf('.')
  const stem = dot > 0 ? base.slice(0, dot) : base
  return `${path.slice(0, slash + 1)}${stem}.${extension}`
}

/**
 * Where and how Save writes a document bound to `path` on disk.
 * Keeps the opened format when it can hold the document; otherwise switches to a
 * sibling SnapGene file so a `.seq`/`.fasta`/`.gb` never receives `.dna` bytes.
 */
export function resolveDiskSaveTarget(path: string, record: DiskSaveRecord): DiskSaveTarget {
  const snapGeneFormat = snapGeneFormatForMolecule(record.molecule)
  const format = inferProjectFileFormat(path)
  const definition = projectFileFormatDefinition(format)
  if (definition.family === 'snapgene') return { path, format: snapGeneFormat }
  const writableForMolecule =
    canWriteProjectFileFormat(format) && !(format === 'genpept' && record.molecule !== 'protein')
  const lost = writableForMolecule
    ? contentLostInDiskFormat(record, format)
    : [`${definition.label} files cannot be written`]
  if (!lost.length) return { path, format }
  return {
    path: replaceFileExtension(path, snapGeneExtensionForMolecule(record.molecule)),
    format: snapGeneFormat,
    convertedFrom: { path, format, lost },
  }
}

function joinNouns(items: readonly string[]): string {
  if (items.length <= 1) return items[0] ?? ''
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`
}

/** Status line after Save switched an opened non-SnapGene file to SnapGene. */
export function diskSaveConversionMessage(target: DiskSaveTarget): string | null {
  const from = target.convertedFrom
  if (!from) return null
  const savedName = basename(target.path)
  const originalName = basename(from.path)
  const label = projectFileFormatDefinition(from.format).label
  const why = from.format === 'unknown' || !canWriteProjectFileFormat(from.format)
    ? `${label} files cannot be written`
    : `${label} files cannot store ${joinNouns(from.lost)}`
  return `Saved as ${savedName} — ${why}. ${originalName} was left unchanged.`
}

export function workspaceSaveDisposition(
  existing: ExistingDatabaseProjectFile | null | undefined,
): WorkspaceSaveDisposition {
  if (!existing) return 'choose-database-folder'
  return existing.fileFormat === 'snapgene' || existing.fileFormat === 'snapgene-protein'
    ? 'save-snapgene'
    : 'choose-native-save'
}

function basename(value: string): string {
  const normalized = value.replace(/\\/g, '/')
  return normalized.slice(normalized.lastIndexOf('/') + 1)
}

export function projectFileStem(fileName: string): string {
  const name = basename(fileName).trim()
  const dot = name.lastIndexOf('.')
  return (dot > 0 ? name.slice(0, dot) : name).trim() || 'Untitled'
}

/** Placeholder construct names used for File → New before the first real save. */
export function isStubConstructName(name: string): boolean {
  const trimmed = name.trim()
  if (!trimmed) return true
  return (
    trimmed === 'Untitled'
    || trimmed === 'Untitled protein'
    || trimmed === 'Untitled library'
  )
}

/**
 * When an untitled/new construct is first saved to disk (or Save As), adopt the
 * file stem as the construct name.
 * Leaves a user-edited construct name unchanged.
 */
export function applyDiskSaveFileNameToStubConstruct<T extends Pick<SequenceRecord, 'name'>>(
  record: T,
  diskPath: string | null | undefined,
): T {
  if (!isStubConstructName(record.name)) return record
  const stem = projectFileStem(diskPath ?? '')
  if (!stem || isStubConstructName(stem) || stem === record.name) return record
  return { ...record, name: stem }
}

/**
 * Pick a same-folder SnapGene filename using stable, case-insensitive identity.
 * The result is independent of the ordering of occupied names.
 */
export function chooseDatabaseCopyFileName(
  sourceFileName: string,
  occupiedFileNames: readonly string[],
  extension: 'dna' | 'prot' = 'dna',
): string {
  const stem = projectFileStem(sourceFileName)
  const occupied = new Set(
    occupiedFileNames.map((fileName) => basename(fileName).normalize('NFC').toLowerCase()),
  )
  const preferred = `${stem}.${extension}`
  if (!occupied.has(preferred.normalize('NFC').toLowerCase())) return preferred
  for (let suffix = 2; ; suffix += 1) {
    const candidate = `${stem} (${suffix}).${extension}`
    if (!occupied.has(candidate.normalize('NFC').toLowerCase())) return candidate
  }
}

export type NativeOverwriteAvailability = {
  available: boolean
  label: string
  reason?: string
}

export function nativeOverwriteAvailability(
  format: ProjectFileFormat,
): NativeOverwriteAvailability {
  const definition = projectFileFormatDefinition(format)
  return {
    available: canWriteProjectFileFormat(format),
    label: definition.label,
    ...(!definition.writable
      ? {
          reason:
            definition.unsupportedWriteReason ??
            `${definition.label} files cannot be safely written.`,
        }
      : {}),
  }
}

export type PreparedDatabaseProjectSave = {
  kind: 'copy' | 'overwrite'
  record: SequenceRecord
  folderId: string | null
  tags: string[]
  fileName: string
  fileFormat: ProjectFileFormat
  fileBytes: Uint8Array
  fileSyncState: 'local-only' | 'modified'
  fileProvenance: 'created' | 'imported' | 'sync-folder' | 'legacy'
  clearSourceMetadata: boolean
}

export function prepareDatabaseProjectSave(input: {
  record: SequenceRecord
  existing: ExistingDatabaseProjectFile
  decision: 'copy' | 'overwrite'
  bytes: Uint8Array
  copyFileName?: string
  copyFileFormat?: 'snapgene' | 'snapgene-protein'
  freshProjectId?: string
  createdAt?: string
}): PreparedDatabaseProjectSave {
  const format = input.existing.fileFormat ?? 'unknown'
  if (input.decision === 'overwrite') {
    if (!input.existing.fileName) {
      throw new Error('The database project has no original filename to overwrite.')
    }
    const availability = nativeOverwriteAvailability(format)
    if (!availability.available) throw new Error(availability.reason)
    return {
      kind: 'overwrite',
      record: { ...input.record, id: input.existing.id },
      folderId: input.existing.folderId ?? null,
      tags: [...(input.existing.tags ?? [])],
      fileName: input.existing.fileName,
      fileFormat: format,
      fileBytes: new Uint8Array(input.bytes),
      fileSyncState: 'modified',
      fileProvenance: input.existing.fileProvenance ?? 'legacy',
      clearSourceMetadata: false,
    }
  }

  if (!input.freshProjectId || !input.copyFileName || !input.createdAt) {
    throw new Error('A fresh id, filename, and timestamp are required for a SnapGene copy.')
  }
  const copyFormat = input.copyFileFormat ?? snapGeneFormatForMolecule(input.record.molecule)
  return {
    kind: 'copy',
    record: {
      ...input.record,
      id: input.freshProjectId,
      createdAt: input.createdAt,
      updatedAt: input.createdAt,
    },
    folderId: input.existing.folderId ?? null,
    tags: [...(input.existing.tags ?? [])],
    fileName: input.copyFileName,
    fileFormat: copyFormat,
    fileBytes: new Uint8Array(input.bytes),
    fileSyncState: 'local-only',
    fileProvenance: 'created',
    clearSourceMetadata: true,
  }
}

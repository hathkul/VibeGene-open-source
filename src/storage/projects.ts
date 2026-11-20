import Dexie, { type Table } from 'dexie'
import type { SequenceRecord } from '../domain/types'
import { normalizeSequenceRecord } from '../domain/constructProperties'
import type { WorkspaceDocumentOrigin } from '../domain/workspaceDocumentOrigin'
import { isDnaLibraryRecord } from '../domain/dnaLibrary'
import {
  detachProteinSourceRecords,
  type DetachedProteinSourceRecord,
} from '../domain/proteinSourceHandoff'
import {
  inferProjectFileFormat,
  projectFileFormatLabel,
  type ProjectFileFormat,
} from '../domain/fileFormats'
import { coerceSnapGeneFileNameForMolecule } from '../domain/projectSaveSemantics'
import { createId, nowIso } from '../domain/sequence'
import type { OpenTabSession } from '../crossTab/types'
import type { RichClipboardFragment, SharedFragment } from '../crossTab/types'
import { listCustomMwLadders } from './customMwLadders'
import type { StoredFolder } from './projectLibrary'
import { notifyLibraryChanged } from './libraryEvents'
import { writeManagedDatabaseFile } from './managedDatabaseMirror'
import { constructSyncContentKey } from './databaseImportSemanticHash'
import type {
  ProjectFileProvenance,
  ProjectFileSyncState,
  ProjectSummaryBrowseMolecule,
  ProjectSummaryBrowseScope,
  ProjectSummaryBrowseSort,
  SaveProjectExtras,
  StoredProject,
  StoredProjectSummary,
} from '../application/ports/projectPersistence'
export type {
  ProjectFileProvenance,
  ProjectFileSyncState,
  ProjectSummaryBrowseMolecule,
  ProjectSummaryBrowseScope,
  ProjectSummaryBrowseSort,
  SaveProjectExtras,
  StoredProject,
  StoredProjectSummary,
} from '../application/ports/projectPersistence'

export type { ProjectFileFormat } from '../domain/fileFormats'
export type StoredProjectFileBlob = {
  /** One exact source-file payload per project; no re-encoding is performed. */
  projectId: string
  fileName: string
  fileFormat: ProjectFileFormat
  bytes: Uint8Array
  byteLength: number
  contentHash?: string
  updatedAt: string
}

export type StoredProjectFileBaseline = {
  projectId: string
  fileName: string
  fileFormat: ProjectFileFormat
  /** SHA-256 of the exact bytes at the last common DB/disk state. */
  contentHash: string
  /** SHA-256 of the semantic SequenceRecord at that same common state. */
  semanticRecordHash: string
  /** Path within the mapped sync root, using `/` separators. */
  relativePath?: string
  capturedAt: string
}

export type StoredProjectFileTombstone = {
  id: string
  /** Top-level database folder whose mapping owns this path. */
  rootFolderId: string
  relativePath: string
  fileName: string
  fileFormat: ProjectFileFormat
  deletedAt: string
  projectId?: string
  contentHash?: string
  /** Distinguishes user deletion, a moved path, and a missing mapped disk file. */
  reason?: 'database-delete' | 'path-change' | 'disk-delete'
}

export type StoredFolderSyncMapping = {
  /** Must refer to a top-level StoredFolder. */
  folderId: string
  /** User-selected external folder path. */
  externalPath: string
  createdAt: string
  updatedAt: string
  lastSyncedAt?: string
}

/** Durable, coalesced outbound work for a mapped database root. */
export type StoredFolderSyncPending = {
  id: string
  rootFolderId: string
  projectId: string
  queuedAt: string
}

const INVALID_FILE_NAME_CHARS = /[<>:"/\\|?*]/g
export { inferProjectFileFormat } from '../domain/fileFormats'

function replaceInvalidFileNameChars(value: string): string {
  return [...value]
    .map((character) => (character.charCodeAt(0) < 32 ? '_' : character))
    .join('')
    .replace(INVALID_FILE_NAME_CHARS, '_')
}

function fallbackProjectFileName(
  projectName: string,
  molecule: SequenceRecord['molecule'] = 'dna',
): string {
  const withoutKnownExtension = projectName.replace(
    /\.(dna|prot|json|gb|gbk|gbff|gbank|gbs|gbwithparts|gen|genbank|ape|flat|embl|emb|ebl|dat|fasta|fa|fas|fna|ffn|fsa|mpfa|seq|txt|gp|gpff|faa|pep|protein)$/i,
    '',
  )
  const cleaned = replaceInvalidFileNameChars(withoutKnownExtension.trim())
    .replace(/\s+/g, ' ')
    .replace(/^\.+/, '')
    .replace(/[. ]+$/g, '')
  return `${cleaned || 'Untitled'}.${molecule === 'protein' ? 'prot' : molecule === 'dna' ? 'dna' : 'json'}`
}

/** Return a safe basename with an extension while retaining a real imported name when possible. */
export function normalizeProjectFileName(
  fileName: string | null | undefined,
  projectName: string,
  molecule: SequenceRecord['molecule'] = 'dna',
): string {
  const basename = (fileName ?? '').replace(/\\/g, '/').split('/').pop() ?? ''
  const cleaned = replaceInvalidFileNameChars(basename.trim())
    .replace(/^\.+/, '')
    .replace(/[. ]+$/g, '')
  if (!cleaned) return fallbackProjectFileName(projectName, molecule)
  const dot = cleaned.lastIndexOf('.')
  const withExtension =
    dot > 0 && dot < cleaned.length - 1
      ? cleaned
      : `${cleaned}.${molecule === 'protein' ? 'prot' : molecule === 'dna' ? 'dna' : 'json'}`
  return coerceSnapGeneFileNameForMolecule(withExtension, molecule)
}

export type ProjectSummaryPageQuery = {
  molecule: ProjectSummaryBrowseMolecule
  scope: ProjectSummaryBrowseScope
  sortBy: ProjectSummaryBrowseSort
  direction: 'asc' | 'desc'
  page: number
  pageSize: number
  /** Case-insensitive text search across filename, construct name and tags. */
  search?: string
  /** Displayed nested folder paths, needed only for Folder sorting. */
  folderSortKeys?: Readonly<Record<string, string>>
}

export type ProjectSummaryPage = {
  rows: StoredProjectSummary[]
  total: number
  page: number
}

/** Full construct body, loaded on Open / Export / cloning pickers. */
export type StoredProjectRecordRow = {
  id: string
  record: SequenceRecord
}

export type StoredHistoryTrimRecovery = {
  id: string
  batchId: string
  projectId: string
  projectName: string
  createdAt: string
  expiresAt: string
  project: StoredProject
}

export type HistoryTrimRecoveryBatch = {
  batchId: string
  createdAt: string
  expiresAt: string
  projectCount: number
  projectNames: string[]
}

/** One-shot construct handoff for `?history=<id>` new-tab opens (IndexedDB-backed). */
export type StoredHandoff = {
  id: string
  createdAt: string
  record: SequenceRecord
  documentOrigin?: WorkspaceDocumentOrigin
  sourceBlobKeys?: string[]
  sourceIndexes?: number[]
  sourceState?: 'pending' | 'ready' | 'failed'
}

export type StoredProteinSourceBlob = {
  key: string
  createdAt: string
  record: SequenceRecord
}

/** Tags on a library primer identity (`primerIdentityKey`), independent of source files. */
export type StoredPrimerLibraryTags = {
  key: string
  tags: string[]
}

/** User common primers, stored detached from any construct. */
export type StoredCommonPrimer = {
  id: string
  name: string
  sequence: string
  color: string
  description: string
  specificity?: import('../domain/primer3/specificity').SavedPrimerSpecificity
  updatedAt: string
}

export const SESSION_DRAFT_ID = '__vibegene-session-draft__'
export const SESSION_DRAFT_PREFIX = '__vibegene-draft__:'

export function isSessionDraftId(id: string): boolean {
  return id === SESSION_DRAFT_ID || id.startsWith(SESSION_DRAFT_PREFIX)
}

type LegacyStoredProject = {
  id: string
  name: string
  updatedAt: string
  record?: SequenceRecord
  folderId?: string | null
  tags?: string[]
  sequenceLength?: number
  molecule?: SequenceRecord['molecule']
  topology?: SequenceRecord['topology']
  customMwLadders?: import('../domain/mwLadders').MwLadder[]
  syncSourceHash?: string
  syncRelativePath?: string
}

function summaryFromRecord(
  record: SequenceRecord,
  extras?: {
    folderId?: string | null
    tags?: string[]
    customMwLadders?: import('../domain/mwLadders').MwLadder[]
    syncSourceHash?: string | null
    syncRelativePath?: string | null
    fileName?: string | null
    fileFormat?: ProjectFileFormat | null
    fileSyncState?: ProjectFileSyncState
    fileProvenance?: ProjectFileProvenance
  },
): StoredProjectSummary {
  const fileName = normalizeProjectFileName(
    extras?.fileName ?? extras?.syncRelativePath,
    record.name,
    record.molecule,
  )
  const tags = extras?.tags ?? []
  const molecule = record.molecule ?? 'dna'
  const fileFormat = extras?.fileFormat ?? inferProjectFileFormat(fileName)
  return {
    id: record.id,
    name: record.name,
    updatedAt: record.updatedAt,
    folderId: extras?.folderId ?? null,
    tags,
    sequenceLength: record.sequence?.length ?? 0,
    molecule,
    topology: record.topology,
    ...(isDnaLibraryRecord(record) ? { documentRole: 'library' as const } : {}),
    ...(extras?.customMwLadders?.length ? { customMwLadders: extras.customMwLadders } : {}),
    ...(extras?.syncSourceHash ? { syncSourceHash: extras.syncSourceHash } : {}),
    ...(extras?.syncRelativePath ? { syncRelativePath: extras.syncRelativePath } : {}),
    fileName,
    fileFormat,
    fileSyncState: extras?.fileSyncState ?? 'local-only',
    fileProvenance: extras?.fileProvenance ?? 'created',
    browseMolecule: molecule === 'protein' ? 'protein' : 'nucleic',
    browseName: fileName.toLocaleLowerCase(),
    browseFormat: projectFileFormatLabel(fileFormat).toLocaleLowerCase(),
    browseTags: tags.map((tag) => tag.toLocaleLowerCase()).join('\0'),
  }
}

/** Normalize pre-v9 summaries lazily as well as during the small metadata upgrade. */
export function normalizeStoredProjectSummary(
  project: StoredProjectSummary,
): StoredProjectSummary {
  const fileName = normalizeProjectFileName(
    project.fileName ?? project.syncRelativePath,
    project.name,
    project.molecule,
  )
  // syncSourceHash was historically populated for ordinary imports too; only a
  // remembered relative path proves that the row belonged to folder sync.
  const hasSyncSource = Boolean(project.syncRelativePath)
  const tags = project.tags ?? []
  const molecule = project.molecule ?? 'dna'
  const fileFormat = project.fileFormat ?? inferProjectFileFormat(fileName)
  const { documentRole: _documentRole, ...projectWithoutRole } = project
  void _documentRole
  return {
    ...projectWithoutRole,
    folderId: project.folderId ?? null,
    tags,
    sequenceLength: project.sequenceLength ?? 0,
    molecule,
    topology: project.topology ?? 'circular',
    ...(project.documentRole === 'library' ? { documentRole: 'library' as const } : {}),
    ...(project.syncSourceHash ? { syncSourceHash: project.syncSourceHash } : {}),
    ...(project.syncRelativePath ? { syncRelativePath: project.syncRelativePath } : {}),
    fileName,
    fileFormat,
    fileSyncState: project.fileSyncState ?? (hasSyncSource ? 'synced' : 'local-only'),
    fileProvenance: project.fileProvenance ?? (hasSyncSource ? 'sync-folder' : 'legacy'),
    browseMolecule: molecule === 'protein' ? 'protein' : 'nucleic',
    browseName: fileName.toLocaleLowerCase(),
    browseFormat: projectFileFormatLabel(fileFormat).toLocaleLowerCase(),
    browseTags: tags.map((tag) => tag.toLocaleLowerCase()).join('\0'),
  }
}

class VibeGeneDatabase extends Dexie {
  /** List/index rows without sequence bodies. */
  projects!: Table<StoredProjectSummary, string>
  /** Full SequenceRecord payloads keyed by project id. */
  projectRecords!: Table<StoredProjectRecordRow, string>
  folders!: Table<StoredFolder, string>
  openTabs!: Table<OpenTabSession, string>
  sharedFragments!: Table<SharedFragment, string>
  richClipboardFragments!: Table<RichClipboardFragment, string>
  handoffs!: Table<StoredHandoff, string>
  proteinSourceBlobs!: Table<StoredProteinSourceBlob, string>
  primerLibraryTags!: Table<StoredPrimerLibraryTags, string>
  commonPrimers!: Table<StoredCommonPrimer, string>
  folderPrimerLists!: Table<import('./folderPrimerLists').StoredFolderPrimerList, string>
  projectFileBlobs!: Table<StoredProjectFileBlob, string>
  projectFileBaselines!: Table<StoredProjectFileBaseline, string>
  projectFileTombstones!: Table<StoredProjectFileTombstone, string>
  folderSyncMappings!: Table<StoredFolderSyncMapping, string>
  folderSyncPending!: Table<StoredFolderSyncPending, string>
  /** Cached translated-CDS hits per construct; refreshed on save/delete. */
  proteinProjectIndex!: Table<import('./databaseProteins').StoredProteinProjectIndex, string>
  /** Cached primer hits per construct; refreshed on save/delete. */
  primerProjectIndex!: Table<import('./databasePrimers').StoredPrimerProjectIndex, string>
  historyTrimRecoveries!: Table<StoredHistoryTrimRecovery, string>

  constructor() {
    super('vibegene')
    this.version(1).stores({
      projects: 'id, name, updatedAt',
    })
    this.version(2).stores({
      projects: 'id, name, updatedAt',
      openTabs: 'tabId, updatedAt',
      sharedFragments: 'id, sharedAt',
    })
    this.version(3).stores({
      projects: 'id, name, updatedAt',
      openTabs: 'tabId, updatedAt',
      sharedFragments: 'id, sharedAt',
      handoffs: 'id, createdAt',
    })
    this.version(4).stores({
      projects: 'id, name, updatedAt, folderId, *tags',
      folders: 'id, parentId, name, updatedAt',
      openTabs: 'tabId, updatedAt',
      sharedFragments: 'id, sharedAt',
      handoffs: 'id, createdAt',
    })
    this.version(5)
      .stores({
        projects: 'id, name, updatedAt, folderId, *tags',
        projectRecords: 'id',
        folders: 'id, parentId, name, updatedAt',
        openTabs: 'tabId, updatedAt',
        sharedFragments: 'id, sharedAt',
        handoffs: 'id, createdAt',
      })
      .upgrade(async (tx) => {
        const legacyRows = (await tx.table('projects').toArray()) as LegacyStoredProject[]
        const summaries = tx.table('projects')
        const bodies = tx.table('projectRecords')
        for (const row of legacyRows) {
          if (!row.record) continue
          const record = normalizeSequenceRecord(row.record)
          await bodies.put({ id: row.id, record })
          await summaries.put(
            summaryFromRecord(record, {
              folderId: row.folderId ?? null,
              tags: row.tags ?? [],
              customMwLadders: row.customMwLadders,
            }),
          )
        }
      })
    this.version(6).stores({
      projects: 'id, name, updatedAt, folderId, *tags',
      projectRecords: 'id',
      folders: 'id, parentId, name, updatedAt',
      openTabs: 'tabId, updatedAt',
      sharedFragments: 'id, sharedAt',
      handoffs: 'id, createdAt',
      primerLibraryTags: 'key, *tags',
    })
    this.version(7).stores({
      projects: 'id, name, updatedAt, folderId, *tags',
      projectRecords: 'id',
      folders: 'id, parentId, name, updatedAt',
      openTabs: 'tabId, updatedAt',
      sharedFragments: 'id, sharedAt',
      handoffs: 'id, createdAt',
      primerLibraryTags: 'key, *tags',
      commonPrimers: 'id, name, updatedAt',
    })
    this.version(8).stores({
      projects: 'id, name, updatedAt, folderId, *tags',
      projectRecords: 'id',
      folders: 'id, parentId, name, updatedAt',
      openTabs: 'tabId, updatedAt',
      sharedFragments: 'id, sharedAt',
      handoffs: 'id, createdAt',
      primerLibraryTags: 'key, *tags',
      commonPrimers: 'id, name, updatedAt',
      folderPrimerLists: 'id, folderId, [folderId+relativePath], relativePath, name, updatedAt',
    })
    this.version(9)
      .stores({
        projects:
          'id, name, updatedAt, folderId, *tags, fileName, fileFormat, fileSyncState',
        projectRecords: 'id',
        folders: 'id, parentId, name, updatedAt',
        openTabs: 'tabId, updatedAt',
        sharedFragments: 'id, sharedAt',
        handoffs: 'id, createdAt',
        primerLibraryTags: 'key, *tags',
        commonPrimers: 'id, name, updatedAt',
        folderPrimerLists:
          'id, folderId, [folderId+relativePath], relativePath, name, updatedAt',
        projectFileBlobs: 'projectId, contentHash, updatedAt',
        projectFileBaselines: 'projectId, contentHash, capturedAt',
        projectFileTombstones:
          'id, rootFolderId, [rootFolderId+relativePath], projectId, deletedAt',
        folderSyncMappings: 'folderId, updatedAt',
      })
      .upgrade(async (tx) => {
        // Summary-only metadata backfill: exact source bytes remain opt-in and are
        // intentionally not synthesized by re-exporting every legacy project.
        const summaries = tx.table('projects')
        const rows = (await summaries.toArray()) as StoredProjectSummary[]
        for (const row of rows) {
          await summaries.put(normalizeStoredProjectSummary(row))
        }
      })
    this.version(10).stores({
      projects:
        'id, name, updatedAt, folderId, *tags, fileName, fileFormat, fileSyncState',
      projectRecords: 'id',
      folders: 'id, parentId, name, updatedAt',
      openTabs: 'tabId, updatedAt',
      sharedFragments: 'id, sharedAt',
      handoffs: 'id, createdAt',
      primerLibraryTags: 'key, *tags',
      commonPrimers: 'id, name, updatedAt',
      folderPrimerLists:
        'id, folderId, [folderId+relativePath], relativePath, name, updatedAt',
      projectFileBlobs: 'projectId, contentHash, updatedAt',
      projectFileBaselines: 'projectId, contentHash, capturedAt',
      projectFileTombstones:
        'id, rootFolderId, [rootFolderId+relativePath], projectId, deletedAt',
      folderSyncMappings: 'folderId, updatedAt',
      proteinProjectIndex: 'projectId',
    })
    this.version(11).stores({
      projects:
        'id, name, updatedAt, folderId, *tags, fileName, fileFormat, fileSyncState',
      projectRecords: 'id',
      folders: 'id, parentId, name, updatedAt',
      openTabs: 'tabId, updatedAt',
      sharedFragments: 'id, sharedAt',
      handoffs: 'id, createdAt',
      proteinSourceBlobs: 'key, createdAt',
      primerLibraryTags: 'key, *tags',
      commonPrimers: 'id, name, updatedAt',
      folderPrimerLists:
        'id, folderId, [folderId+relativePath], relativePath, name, updatedAt',
      projectFileBlobs: 'projectId, contentHash, updatedAt',
      projectFileBaselines: 'projectId, contentHash, capturedAt',
      projectFileTombstones:
        'id, rootFolderId, [rootFolderId+relativePath], projectId, deletedAt',
      folderSyncMappings: 'folderId, updatedAt',
      proteinProjectIndex: 'projectId',
    })
    this.version(12).stores({
      projects:
        'id, name, updatedAt, folderId, *tags, fileName, fileFormat, fileSyncState',
      projectRecords: 'id',
      folders: 'id, parentId, name, updatedAt',
      openTabs: 'tabId, updatedAt',
      sharedFragments: 'id, sharedAt',
      handoffs: 'id, createdAt',
      proteinSourceBlobs: 'key, createdAt',
      primerLibraryTags: 'key, *tags',
      commonPrimers: 'id, name, updatedAt',
      folderPrimerLists:
        'id, folderId, [folderId+relativePath], relativePath, name, updatedAt',
      projectFileBlobs: 'projectId, contentHash, updatedAt',
      projectFileBaselines: 'projectId, contentHash, capturedAt',
      projectFileTombstones:
        'id, rootFolderId, [rootFolderId+relativePath], projectId, deletedAt',
      folderSyncMappings: 'folderId, updatedAt',
      proteinProjectIndex: 'projectId',
      historyTrimRecoveries: 'id, batchId, projectId, createdAt, expiresAt',
    })
    this.version(13).stores({
      projects:
        'id, name, updatedAt, folderId, *tags, fileName, fileFormat, fileSyncState',
      projectRecords: 'id',
      folders: 'id, parentId, name, updatedAt',
      openTabs: 'tabId, updatedAt',
      sharedFragments: 'id, sharedAt',
      handoffs: 'id, createdAt',
      proteinSourceBlobs: 'key, createdAt',
      primerLibraryTags: 'key, *tags',
      commonPrimers: 'id, name, updatedAt',
      folderPrimerLists:
        'id, folderId, [folderId+relativePath], relativePath, name, updatedAt',
      projectFileBlobs: 'projectId, contentHash, updatedAt',
      projectFileBaselines: 'projectId, contentHash, capturedAt',
      projectFileTombstones:
        'id, rootFolderId, [rootFolderId+relativePath], projectId, deletedAt',
      folderSyncMappings: 'folderId, updatedAt',
      proteinProjectIndex: 'projectId',
      primerProjectIndex: 'projectId',
      historyTrimRecoveries: 'id, batchId, projectId, createdAt, expiresAt',
    })
    this.version(14)
      .stores({
        projects:
          'id, name, updatedAt, folderId, *tags, fileName, fileFormat, fileSyncState, browseMolecule, [browseMolecule+browseName], [browseMolecule+browseFormat+browseName], [browseMolecule+updatedAt+browseName], [browseMolecule+sequenceLength+browseName], [browseMolecule+browseTags+browseName]',
        projectRecords: 'id',
        folders: 'id, parentId, name, updatedAt',
        openTabs: 'tabId, updatedAt',
        sharedFragments: 'id, sharedAt',
        handoffs: 'id, createdAt',
        proteinSourceBlobs: 'key, createdAt',
        primerLibraryTags: 'key, *tags',
        commonPrimers: 'id, name, updatedAt',
        folderPrimerLists:
          'id, folderId, [folderId+relativePath], relativePath, name, updatedAt',
        projectFileBlobs: 'projectId, contentHash, updatedAt',
        projectFileBaselines: 'projectId, contentHash, capturedAt',
        projectFileTombstones:
          'id, rootFolderId, [rootFolderId+relativePath], projectId, deletedAt',
        folderSyncMappings: 'folderId, updatedAt',
        proteinProjectIndex: 'projectId',
        primerProjectIndex: 'projectId',
        historyTrimRecoveries: 'id, batchId, projectId, createdAt, expiresAt',
      })
      .upgrade(async (tx) => {
        const summaries = tx.table('projects')
        await summaries.toCollection().modify((row: StoredProjectSummary) => {
          Object.assign(row, normalizeStoredProjectSummary(row))
        })
      })
    this.version(15).stores({
      projects:
        'id, name, updatedAt, folderId, *tags, fileName, fileFormat, fileSyncState, browseMolecule, [browseMolecule+browseName], [browseMolecule+browseFormat+browseName], [browseMolecule+updatedAt+browseName], [browseMolecule+sequenceLength+browseName], [browseMolecule+browseTags+browseName]',
      projectRecords: 'id',
      folders: 'id, parentId, name, updatedAt',
      openTabs: 'tabId, updatedAt',
      sharedFragments: 'id, sharedAt',
      richClipboardFragments: 'id, copiedAt',
      handoffs: 'id, createdAt',
      proteinSourceBlobs: 'key, createdAt',
      primerLibraryTags: 'key, *tags',
      commonPrimers: 'id, name, updatedAt',
      folderPrimerLists:
        'id, folderId, [folderId+relativePath], relativePath, name, updatedAt',
      projectFileBlobs: 'projectId, contentHash, updatedAt',
      projectFileBaselines: 'projectId, contentHash, capturedAt',
      projectFileTombstones:
        'id, rootFolderId, [rootFolderId+relativePath], projectId, deletedAt',
      folderSyncMappings: 'folderId, updatedAt',
      proteinProjectIndex: 'projectId',
      primerProjectIndex: 'projectId',
      historyTrimRecoveries: 'id, batchId, projectId, createdAt, expiresAt',
    })
    this.version(16)
      .stores({
        projects:
          'id, name, updatedAt, folderId, *tags, fileName, fileFormat, fileSyncState, browseMolecule, [browseMolecule+browseName], [browseMolecule+browseFormat+browseName], [browseMolecule+updatedAt+browseName], [browseMolecule+sequenceLength+browseName], [browseMolecule+browseTags+browseName]',
        projectRecords: 'id',
        folders: 'id, parentId, name, updatedAt',
        openTabs: 'tabId, updatedAt',
        sharedFragments: 'id, sharedAt',
        richClipboardFragments: 'id, copiedAt',
        handoffs: 'id, createdAt',
        proteinSourceBlobs: 'key, createdAt',
        primerLibraryTags: 'key, *tags',
        commonPrimers: 'id, name, updatedAt',
        folderPrimerLists:
          'id, folderId, [folderId+relativePath], relativePath, name, updatedAt',
        projectFileBlobs: 'projectId, contentHash, updatedAt',
        projectFileBaselines: 'projectId, contentHash, capturedAt',
        projectFileTombstones:
          'id, rootFolderId, [rootFolderId+relativePath], projectId, deletedAt',
        folderSyncMappings: 'folderId, updatedAt',
        proteinProjectIndex: 'projectId',
        primerProjectIndex: 'projectId',
        historyTrimRecoveries: 'id, batchId, projectId, createdAt, expiresAt',
      })
      .upgrade(async (tx) => {
        const summaries = tx.table('projects')
        const records = tx.table('projectRecords')
        const libraryIds = new Set<string>()
        await records.toCollection().each((row: { id: string; record?: SequenceRecord }) => {
          if (row.record && isDnaLibraryRecord(row.record)) libraryIds.add(row.id)
        })
        await summaries.toCollection().modify((row: StoredProjectSummary) => {
          Object.assign(row, normalizeStoredProjectSummary(row))
          if (libraryIds.has(row.id)) row.documentRole = 'library'
          else delete row.documentRole
        })
      })
    this.version(17).stores({
      projects:
        'id, name, updatedAt, folderId, *tags, fileName, fileFormat, fileSyncState, browseMolecule, [browseMolecule+browseName], [browseMolecule+browseFormat+browseName], [browseMolecule+updatedAt+browseName], [browseMolecule+sequenceLength+browseName], [browseMolecule+browseTags+browseName]',
      projectRecords: 'id', folders: 'id, parentId, name, updatedAt',
      openTabs: 'tabId, updatedAt', sharedFragments: 'id, sharedAt',
      richClipboardFragments: 'id, copiedAt', handoffs: 'id, createdAt',
      proteinSourceBlobs: 'key, createdAt', primerLibraryTags: 'key, *tags',
      commonPrimers: 'id, name, updatedAt',
      folderPrimerLists: 'id, folderId, [folderId+relativePath], relativePath, name, updatedAt',
      projectFileBlobs: 'projectId, contentHash, updatedAt',
      projectFileBaselines: 'projectId, contentHash, capturedAt',
      projectFileTombstones: 'id, rootFolderId, [rootFolderId+relativePath], projectId, deletedAt',
      folderSyncMappings: 'folderId, updatedAt', proteinProjectIndex: 'projectId',
      primerProjectIndex: 'projectId',
      historyTrimRecoveries: 'id, batchId, projectId, createdAt, expiresAt',
      folderSyncPending: 'id, rootFolderId, projectId, queuedAt',
    })
      .upgrade(async (tx) => {
        const [projects, folders, mappings] = await Promise.all([
          tx.table('projects').toArray(),
          tx.table('folders').toArray(),
          tx.table('folderSyncMappings').toArray(),
        ]) as [StoredProjectSummary[], StoredFolder[], StoredFolderSyncMapping[]]
        const mappedRoots = new Set(mappings.map((mapping) => mapping.folderId))
        const parentById = new Map<string, string | null>(folders.map((folder) => [folder.id, folder.parentId]))
        const queuedAt = nowIso()
        const pending = [] as StoredFolderSyncPending[]
        for (const project of projects) {
          if (project.fileSyncState === 'synced' || !project.folderId) continue
          let cursor: string | null = project.folderId
          const visited = new Set<string>()
          while (cursor && !visited.has(cursor)) {
            visited.add(cursor)
            if (!parentById.has(cursor)) break
            const parentId: string | null = parentById.get(cursor)!
            if (parentId === null) {
              if (mappedRoots.has(cursor)) {
                pending.push({
                  id: `${cursor}\0${project.id}`,
                  rootFolderId: cursor,
                  projectId: project.id,
                  queuedAt,
                })
              }
              break
            }
            cursor = parentId
          }
        }
        if (pending.length) await tx.table('folderSyncPending').bulkPut(pending)
      })
  }
}

export const db = new VibeGeneDatabase()

export async function deleteExpiredHistoryTrimRecoveries(now = new Date()): Promise<number> {
  const expired = await db.historyTrimRecoveries
    .where('expiresAt')
    .belowOrEqual(now.toISOString())
    .primaryKeys()
  if (expired.length) await db.historyTrimRecoveries.bulkDelete(expired)
  return expired.length
}

export async function createHistoryTrimRecoveryBatch(
  projects: readonly StoredProject[],
  retentionDays: number,
): Promise<HistoryTrimRecoveryBatch | null> {
  await deleteExpiredHistoryTrimRecoveries()
  const days = Number.isFinite(retentionDays) ? Math.max(0, Math.floor(retentionDays)) : 0
  if (!projects.length || days === 0) return null
  const createdAt = nowIso()
  const expiresAt = new Date(Date.parse(createdAt) + days * 86_400_000).toISOString()
  const batchId = createId('history-recovery')
  const rows = projects.map((project) => ({
    id: `${batchId}:${project.id}`,
    batchId,
    projectId: project.id,
    projectName: project.name,
    createdAt,
    expiresAt,
    project,
  }))
  await db.historyTrimRecoveries.bulkPut(rows)
  return {
    batchId,
    createdAt,
    expiresAt,
    projectCount: rows.length,
    projectNames: rows.map((row) => row.projectName),
  }
}

export async function listHistoryTrimRecoveryBatches(): Promise<HistoryTrimRecoveryBatch[]> {
  await deleteExpiredHistoryTrimRecoveries()
  const rows = await db.historyTrimRecoveries.orderBy('createdAt').reverse().toArray()
  const batches = new Map<string, HistoryTrimRecoveryBatch>()
  for (const row of rows) {
    const existing = batches.get(row.batchId)
    if (existing) {
      existing.projectCount += 1
      existing.projectNames.push(row.projectName)
    } else {
      batches.set(row.batchId, {
        batchId: row.batchId,
        createdAt: row.createdAt,
        expiresAt: row.expiresAt,
        projectCount: 1,
        projectNames: [row.projectName],
      })
    }
  }
  return [...batches.values()].sort((left, right) => right.createdAt.localeCompare(left.createdAt))
}

export async function deleteHistoryTrimRecoveryBatch(batchId: string): Promise<void> {
  await db.historyTrimRecoveries.where('batchId').equals(batchId).delete()
}

export async function restoreHistoryTrimRecoveryBatch(batchId: string): Promise<{
  restoredNames: string[]
  failures: Array<{ name: string; error: string }>
}> {
  const rows = await db.historyTrimRecoveries.where('batchId').equals(batchId).toArray()
  const result = { restoredNames: [] as string[], failures: [] as Array<{ name: string; error: string }> }
  for (const row of rows) {
    const project = row.project
    try {
      await saveProject(project.record, {
        folderId: project.folderId ?? null,
        tags: project.tags ?? [],
        customMwLadders: project.customMwLadders,
        fileName: project.fileName,
        fileFormat: project.fileFormat,
        fileProvenance: project.fileProvenance,
        fileBytes: null,
      })
      result.restoredNames.push(row.projectName)
      await db.historyTrimRecoveries.delete(row.id)
    } catch (error) {
      result.failures.push({
        name: row.projectName,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }
  return result
}

export type AcceptProjectFileSyncInput = {
  projectId: string
  rootFolderId: string
  relativePath: string
  bytes: Uint8Array
  contentHash: string
  semanticRecordHash: string
  sourceUpdatedAt?: string
  /** Stable semantic snapshot captured before the outbound disk write. */
  sourceContentKey?: string
  fileName?: string
  fileFormat?: ProjectFileFormat
  capturedAt?: string
  /** Historical path whose unchanged baseline bytes were relocated before this commit. */
  retiredSourcePath?: string
}

function projectFilePathKey(path: string): string {
  return path
    .replace(/\\/g, '/')
    .replace(/^\/+/, '')
    .split('/')
    .filter((segment) => segment !== '' && segment !== '.')
    .join('/')
    .normalize('NFC')
    .toLowerCase()
}

export function acceptedSyncPathMatchesTombstone(
  tombstone: Pick<StoredProjectFileTombstone, 'rootFolderId' | 'relativePath'>,
  rootFolderId: string,
  relativePath: string,
): boolean {
  return (
    tombstone.rootFolderId === rootFolderId &&
    projectFilePathKey(tombstone.relativePath) === projectFilePathKey(relativePath)
  )
}

function proteinSourceBlobKey(
  source: SequenceRecord,
  sequenceDigest: string | undefined,
): string {
  const nativeHistory = source.snapGeneNativeHistory
  const packetShape = nativeHistory?.nodePackets
    .map((packet) => `${packet.nodeId}:${packet.payload.byteLength}`)
    .join(',') ?? ''
  const historyShape = (node: NonNullable<SequenceRecord['history']>): string =>
    `${node.id}[${node.children.map(historyShape).join(',')}]`
  const identity = [
    source.id,
    source.updatedAt,
    sequenceDigest ?? '',
    source.history?.id ?? '',
    source.history ? historyShape(source.history) : '',
    nativeHistory?.treeFingerprint ?? '',
    packetShape,
  ].join(':')
  let hash = 0x811c9dc5
  for (let index = 0; index < identity.length; index += 1) {
    hash ^= identity.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return `protein-source:${(hash >>> 0).toString(16).padStart(8, '0')}:${source.id}`
}

async function persistDetachedProteinSources(
  handoffId: string,
  detached: readonly DetachedProteinSourceRecord[],
  sourceBlobKeys: readonly string[],
) {
  try {
    const existing = new Set(
      await db.proteinSourceBlobs.where('key').anyOf([...sourceBlobKeys]).primaryKeys(),
    )
    const createdAt = nowIso()
    const missing = detached.flatMap((entry, index) => {
      const key = sourceBlobKeys[index]!
      return existing.has(key) ? [] : [{ key, createdAt, record: entry.record }]
    })
    if (missing.length) await db.proteinSourceBlobs.bulkPut(missing)
    // Dexie's key-path type expansion cycles through SequenceRecord.history.children.
    await (db.handoffs as unknown as { update: (key: string, changes: { sourceState: string }) => Promise<unknown> })
      .update(handoffId, { sourceState: 'ready' })
  } catch {
    await (db.handoffs as unknown as { update: (key: string, changes: { sourceState: string }) => Promise<unknown> })
      .update(handoffId, { sourceState: 'failed' })
  }
}

export async function putHandoffRecord(id: string, record: SequenceRecord, documentOrigin?: WorkspaceDocumentOrigin) {
  // Store a small protein shell first so a new desktop window can paint while its
  // immutable source-DNA records are copied or reused from the blob cache.
  const normalized = normalizeSequenceRecord(record)
  const { record: shell, detached } = detachProteinSourceRecords(normalized)
  const translationSources = normalized.protein?.translationDerivation?.sources ?? []
  const sourceBlobKeys = detached.map((entry) => proteinSourceBlobKey(entry.record, translationSources[entry.sourceIndex]?.sequenceDigest))
  await db.handoffs.put({
    id,
    createdAt: normalized.updatedAt || new Date().toISOString(),
    record: shell,
    ...(documentOrigin ? { documentOrigin } : {}),
    ...(sourceBlobKeys.length
      ? {
          sourceBlobKeys,
          sourceIndexes: detached.map((entry) => entry.sourceIndex),
          sourceState: 'pending' as const,
        }
      : {}),
  })
  if (detached.length) void persistDetachedProteinSources(id, detached, sourceBlobKeys)
}

export type TakenHandoffRecord = { record: SequenceRecord; sourceHydrationPending: boolean; documentOrigin?: WorkspaceDocumentOrigin }

export async function takeHandoffRecord(id: string): Promise<TakenHandoffRecord | null> {
  const row = await db.handoffs.get(id)
  if (!row) return null
  const sourceHydrationPending = Boolean(row.sourceBlobKeys?.length)
  if (!sourceHydrationPending) await db.handoffs.delete(id)
  return { record: row.record, sourceHydrationPending, documentOrigin: row.documentOrigin }
}

/** Wait briefly for a browser tab opened before its IndexedDB handoff commit completes. */
export async function waitForHandoffRecord(
  id: string,
  timeoutMs = 5_000,
): Promise<TakenHandoffRecord | null> {
  const startedAt = Date.now()
  while (true) {
    const remainingMs = Math.max(0, timeoutMs - (Date.now() - startedAt))
    const timedOut = Symbol('handoff-timeout')
    let timeoutHandle: ReturnType<typeof globalThis.setTimeout> | undefined
    const handoff = await Promise.race([
      takeHandoffRecord(id),
      new Promise<typeof timedOut>((resolve) => {
        timeoutHandle = globalThis.setTimeout(() => resolve(timedOut), remainingMs)
      }),
    ])
    if (timeoutHandle !== undefined) globalThis.clearTimeout(timeoutHandle)
    if (handoff === timedOut) return null
    if (handoff) return handoff
    if (Date.now() - startedAt >= timeoutMs) return null
    await new Promise<void>((resolve) => globalThis.setTimeout(resolve, 25))
  }
}

function waitForProteinSourceBlobs(id: string): Promise<StoredHandoff | null> {
  return new Promise((resolve, reject) => {
    const startedAt = Date.now()
    const check = async () => {
      const row = await db.handoffs.get(id)
      if (!row) {
        resolve(null)
        return
      }
      if (row.sourceState === 'ready') {
        resolve(row)
        return
      }
      if (row.sourceState === 'failed' || Date.now() - startedAt > 30_000) {
        reject(new Error('Source DNA history could not be transferred.'))
        return
      }
      globalThis.setTimeout(() => void check(), 20)
    }
    void check()
  })
}

export async function takeHandoffProteinSources(
  id: string,
): Promise<DetachedProteinSourceRecord[]> {
  const row = await waitForProteinSourceBlobs(id)
  if (!row?.sourceBlobKeys?.length) return []
  const blobs = await db.proteinSourceBlobs.bulkGet(row.sourceBlobKeys)
  if (blobs.some((blob) => !blob)) throw new Error('Source DNA history is incomplete.')
  const detached = blobs.map((blob, sourceIndex) => ({
    sourceIndex: row.sourceIndexes?.[sourceIndex] ?? sourceIndex,
    record: blob!.record,
  }))
  await db.handoffs.delete(id)
  return detached
}

export async function saveProject(
  record: SequenceRecord,
  extras?: SaveProjectExtras,
): Promise<SequenceRecord> {
  const updatedAt = nowIso()
  const normalized = normalizeSequenceRecord({ ...record, updatedAt })
  const existing = await db.projects.get(normalized.id)
  const customMwLadders = extras?.customMwLadders ?? listCustomMwLadders()
  const folderId = extras?.folderId !== undefined ? extras.folderId : (existing?.folderId ?? null)
  const tags = extras?.tags !== undefined ? extras.tags : (existing?.tags ?? [])
  const syncSourceHash =
    extras?.syncSourceHash !== undefined ? extras.syncSourceHash : (existing?.syncSourceHash ?? null)
  const syncRelativePath =
    extras?.syncRelativePath !== undefined
      ? extras.syncRelativePath
      : (existing?.syncRelativePath ?? null)
  const fileName = normalizeProjectFileName(
    extras?.fileName !== undefined
      ? extras.fileName
      : extras?.syncRelativePath !== undefined
        ? extras.syncRelativePath
        : existing?.fileName ?? syncRelativePath,
    normalized.name,
    normalized.molecule,
  )
  const fileFormat =
    extras?.fileFormat ??
    (existing?.fileName === fileName ? existing.fileFormat : undefined) ??
    inferProjectFileFormat(fileName)
  const fileSyncState =
    extras?.fileSyncState ??
    (extras?.syncSourceHash
      ? 'synced'
      : existing?.fileSyncState === 'synced'
        ? 'modified'
        : existing?.fileSyncState) ??
    'local-only'
  const fileProvenance =
    extras?.fileProvenance ??
    existing?.fileProvenance ??
    (syncRelativePath ? 'sync-folder' : extras?.fileBytes ? 'imported' : 'created')
  const summary = summaryFromRecord(normalized, {
    folderId,
    tags,
    customMwLadders: customMwLadders.length ? customMwLadders : undefined,
    syncSourceHash,
    syncRelativePath,
    fileName,
    fileFormat,
    fileSyncState,
    fileProvenance,
  })
  await db.transaction(
    'rw',
    [db.projects, db.projectRecords, db.projectFileBlobs, db.projectFileBaselines,
      db.folders, db.folderSyncMappings, db.folderSyncPending],
    async () => {
      if (extras?.expectedProjectUpdatedAt) {
        const current = await db.projectRecords.get(normalized.id)
        if (!current || current.record.updatedAt !== extras.expectedProjectUpdatedAt) throw new Error('This database construct changed in another window. Reopen it before saving.')
      }
      await db.projects.put(summary)
      await db.projectRecords.put({ id: normalized.id, record: normalized })
      if (extras?.fileBytes === null) {
        await db.projectFileBlobs.delete(normalized.id)
      } else if (extras?.fileBytes !== undefined) {
        const bytes = new Uint8Array(extras.fileBytes)
        const contentHash =
          extras.baseline?.contentHash ??
          (fileSyncState === 'synced' ? syncSourceHash : null)
        await db.projectFileBlobs.put({
          projectId: normalized.id,
          fileName,
          fileFormat,
          bytes,
          byteLength: bytes.byteLength,
          ...(contentHash ? { contentHash } : {}),
          updatedAt,
        })
      }
      if (extras?.baseline === null) {
        await db.projectFileBaselines.delete(normalized.id)
      } else if (extras?.baseline !== undefined) {
        await db.projectFileBaselines.put({
          projectId: normalized.id,
          fileName,
          fileFormat,
          contentHash: extras.baseline.contentHash,
          semanticRecordHash: extras.baseline.semanticRecordHash,
          ...(extras.baseline.relativePath ?? syncRelativePath
            ? { relativePath: extras.baseline.relativePath ?? syncRelativePath ?? undefined }
            : {}),
          capturedAt: extras.baseline.capturedAt ?? updatedAt,
        })
      }
      if (fileSyncState !== 'synced' && folderId) {
        const folders = await db.folders.toArray()
        const byId = new Map(folders.map((folder) => [folder.id, folder]))
        let cursor: string | null = folderId
        const visited = new Set<string>()
        while (cursor && !visited.has(cursor)) {
          visited.add(cursor)
          const folder = byId.get(cursor)
          if (!folder) break
          if (folder.parentId === null) {
            if (await db.folderSyncMappings.get(folder.id)) {
              const id = `${folder.id}\0${normalized.id}`
              await db.folderSyncPending.put({
                id, rootFolderId: folder.id, projectId: normalized.id, queuedAt: updatedAt,
              })
            }
            break
          }
          cursor = folder.parentId
        }
      }
    },
  )
  try {
    const [{ indexProteinsForProject }, { indexPrimersForProject }] = await Promise.all([
      import('./databaseProteins'),
      import('./databasePrimers'),
    ])
    await Promise.all([
      indexProteinsForProject(normalized),
      indexPrimersForProject(normalized),
    ])
  } catch {
    // Derived indexes are best-effort; Database can backfill missing rows on next use.
  }
  if (fileSyncState === 'local-only') {
    try {
      const folders = await db.folders.toArray()
      const byId = new Map(folders.map((folder) => [folder.id, folder]))
      let rootFolderId = folderId
      const visited = new Set<string>()
      while (rootFolderId) {
        if (visited.has(rootFolderId)) {
          rootFolderId = null
          break
        }
        visited.add(rootFolderId)
        const folder = byId.get(rootFolderId)
        if (!folder) {
          rootFolderId = null
          break
        }
        if (folder.parentId === null) break
        rootFolderId = folder.parentId
      }
      const hasExternalMapping = rootFolderId
        ? Boolean(await db.folderSyncMappings.get(rootFolderId))
        : false
      if (!hasExternalMapping) {
        const mirrorBytes: Uint8Array = extras?.fileBytes instanceof Uint8Array
          ? new Uint8Array(extras.fileBytes)
          : (await import('../domain/parsers')).exportSnapGene(normalized)
        const { hashSyncSourceBytes } = await import('./syncSourceHash')
        const contentHash = await hashSyncSourceBytes(mirrorBytes)
        if (extras?.fileBytes === undefined) {
          await putProjectFileBlob({
            projectId: normalized.id,
            fileName,
            fileFormat,
            bytes: mirrorBytes,
            byteLength: mirrorBytes.byteLength,
            contentHash,
            updatedAt,
          })
        }
        await writeManagedDatabaseFile(
          rootFolderId ?? 'unfiled',
          `${normalized.id}/${fileName}`,
          mirrorBytes,
        )
      }
    } catch (error) {
      console.warn('Could not mirror local database file', error)
    }
  }
  notifyLibraryChanged()
  return normalized
}

/**
 * Commit an accepted disk state after a verified write. This does not bump the
 * construct's semantic `updatedAt`; the exact bytes become the new authority.
 */
export async function acceptProjectFileSync(input: AcceptProjectFileSyncInput): Promise<void> {
  const summary = await db.projects.get(input.projectId)
  if (!summary) throw new Error('Construct not found in database')
  const capturedAt = input.capturedAt ?? nowIso()
  const fileName = normalizeProjectFileName(
    input.fileName ?? input.relativePath,
    summary.name,
    summary.molecule,
  )
  const fileFormat = input.fileFormat ?? inferProjectFileFormat(fileName)
  const bytes = new Uint8Array(input.bytes)
  await db.transaction(
    'rw',
    [db.projects, db.projectRecords, db.projectFileBlobs, db.projectFileBaselines,
      db.projectFileTombstones, db.folderSyncPending],
    async () => {
      const current = await db.projects.get(input.projectId)
      if (!current) throw new Error('Construct not found in database')
      const currentRecord = input.sourceContentKey
        ? await db.projectRecords.get(input.projectId)
        : null
      const unchangedSinceWrite =
        (!input.sourceUpdatedAt || current.updatedAt === input.sourceUpdatedAt) &&
        (!input.sourceContentKey || currentRecord?.record &&
          constructSyncContentKey(currentRecord.record) === input.sourceContentKey)
      const oldBaseline = unchangedSinceWrite
        ? await db.projectFileBaselines.get(input.projectId)
        : undefined
      const next = unchangedSinceWrite
        ? normalizeStoredProjectSummary({
            ...current,
            syncSourceHash: input.contentHash,
            syncRelativePath: input.relativePath,
            fileName,
            fileFormat,
            fileSyncState: 'synced',
            fileProvenance: 'sync-folder',
          })
        : current
      if (unchangedSinceWrite) {
        await db.projects.put(next)
        await db.projectFileBlobs.put({
          projectId: input.projectId,
          fileName,
          fileFormat,
          bytes,
          byteLength: bytes.byteLength,
          contentHash: input.contentHash,
          updatedAt: capturedAt,
        })
        await db.projectFileBaselines.put({
          projectId: input.projectId,
          fileName,
          fileFormat,
          contentHash: input.contentHash,
          semanticRecordHash: input.semanticRecordHash,
          relativePath: input.relativePath,
          capturedAt,
        })
        const retiredSourcePath = input.retiredSourcePath?.trim()
        if (
          retiredSourcePath &&
          retiredSourcePath !== input.relativePath &&
          oldBaseline?.contentHash
        ) {
          await db.projectFileTombstones.put({
            id: createId('tombstone'),
            rootFolderId: input.rootFolderId,
            relativePath: retiredSourcePath,
            fileName: oldBaseline.fileName ?? retiredSourcePath.split(/[\\/]/).pop() ?? fileName,
            fileFormat: oldBaseline.fileFormat ?? inferProjectFileFormat(retiredSourcePath),
            deletedAt: capturedAt,
            projectId: input.projectId,
            contentHash: oldBaseline.contentHash,
            reason: 'path-change',
          })
        }
        await db.folderSyncPending.delete(`${input.rootFolderId}\0${input.projectId}`)
      }
      // On a stale snapshot, leave all sync metadata and baselines untouched;
      // a concurrent path change must remain authoritative for the next pass.
      const tombstones = unchangedSinceWrite
        ? await db.projectFileTombstones
        .where('projectId')
        .equals(input.projectId)
        .toArray()
        : []
      const acceptedPathTombstones = tombstones.filter((row) =>
        acceptedSyncPathMatchesTombstone(row, input.rootFolderId, input.relativePath),
      )
      await db.projectFileTombstones.bulkDelete(acceptedPathTombstones.map((row) => row.id))
    },
  )
  notifyLibraryChanged()
}

/** Update Sync-folder byte hash without bumping construct updatedAt. */
export async function setProjectSyncSourceHash(projectId: string, syncSourceHash: string | null) {
  const summary = await db.projects.get(projectId)
  if (!summary) return
  const next: StoredProjectSummary = normalizeStoredProjectSummary({ ...summary })
  if (syncSourceHash) {
    next.syncSourceHash = syncSourceHash
    next.fileSyncState = 'synced'
    if (next.fileProvenance === 'legacy') next.fileProvenance = 'sync-folder'
  } else {
    delete next.syncSourceHash
    if (next.fileSyncState === 'synced') next.fileSyncState = 'modified'
  }
  await db.projects.put(normalizeStoredProjectSummary(next))
}

/** Update Sync-folder relative path without bumping construct updatedAt. */
export async function setProjectSyncRelativePath(projectId: string, syncRelativePath: string | null) {
  const summary = await db.projects.get(projectId)
  if (!summary) return
  const next: StoredProjectSummary = normalizeStoredProjectSummary({ ...summary })
  if (syncRelativePath) {
    next.syncRelativePath = syncRelativePath
    next.fileName = normalizeProjectFileName(syncRelativePath, next.name, next.molecule)
    next.fileFormat = inferProjectFileFormat(next.fileName)
    next.fileProvenance = 'sync-folder'
  } else {
    delete next.syncRelativePath
  }
  await db.projects.put(normalizeStoredProjectSummary(next))
}

/** Lightweight list for Database UI — does not deserialize sequence bodies. */
export async function listProjectSummaries(): Promise<StoredProjectSummary[]> {
  const projects = await db.projects.orderBy('updatedAt').reverse().toArray()
  return projects
    .filter((project) => !isSessionDraftId(project.id))
    .map(normalizeStoredProjectSummary)
}

function projectMatchesBrowseScope(
  project: StoredProjectSummary,
  scope: ProjectSummaryBrowseScope,
): boolean {
  if (isSessionDraftId(project.id)) return false
  if (scope.kind === 'all') return true
  if (scope.kind === 'unfiled') return !project.folderId
  if (scope.kind === 'folder') return project.folderId === scope.folderId
  const tagKey = scope.tag.toLocaleLowerCase()
  return (project.tags ?? []).some((tag) => tag.toLocaleLowerCase() === tagKey)
}

function indexedProjectBrowseCollection(query: ProjectSummaryPageQuery) {
  const molecule = query.molecule
  const minText = ''
  const maxText = '\uffff'
  if (query.sortBy === 'name') {
    return db.projects
      .where('[browseMolecule+browseName]')
      .between([molecule, minText], [molecule, maxText], true, true)
  }
  if (query.sortBy === 'format') {
    return db.projects
      .where('[browseMolecule+browseFormat+browseName]')
      .between([molecule, minText, minText], [molecule, maxText, maxText], true, true)
  }
  if (query.sortBy === 'size') {
    return db.projects
      .where('[browseMolecule+sequenceLength+browseName]')
      .between(
        [molecule, 0, minText],
        [molecule, Number.MAX_SAFE_INTEGER, maxText],
        true,
        true,
      )
  }
  if (query.sortBy === 'tags') {
    return db.projects
      .where('[browseMolecule+browseTags+browseName]')
      .between([molecule, minText, minText], [molecule, maxText, maxText], true, true)
  }
  return db.projects
    .where('[browseMolecule+updatedAt+browseName]')
    .between([molecule, minText, minText], [molecule, maxText, maxText], true, true)
}

/** Count and read one sorted Database file page without materializing the full matching library. */
export async function queryProjectSummaryPage(
  query: ProjectSummaryPageQuery,
): Promise<ProjectSummaryPage> {
  const pageSize = Math.max(1, Math.floor(query.pageSize))
  const requestedPage = Math.max(0, Math.floor(query.page))
  const search = query.search?.trim().toLocaleLowerCase() ?? ''
  const matchesScope = (project: StoredProjectSummary) =>
    projectMatchesBrowseScope(project, query.scope) && (!search ||
      [project.name, project.fileName, ...(project.tags ?? [])].some((value) => value?.toLocaleLowerCase().includes(search)))

  return db.transaction('r', [db.projects, db.projectFileBlobs], async () => {
    const total = await db.projects
      .where('browseMolecule')
      .equals(query.molecule)
      .filter(matchesScope)
      .count()
    const pageCount = Math.max(1, Math.ceil(total / pageSize))
    const page = Math.min(requestedPage, pageCount - 1)
    const start = page * pageSize

    if (query.sortBy === 'folder' || query.sortBy === 'fileSize') {
      const matching = await db.projects
        .where('browseMolecule')
        .equals(query.molecule)
        .filter(matchesScope)
        .toArray()
      const sign = query.direction === 'asc' ? 1 : -1
      const folderKeys = query.folderSortKeys ?? {}
      const blobLengths = query.sortBy === 'fileSize'
        ? new Map(
            (await db.projectFileBlobs.bulkGet(matching.map((project) => project.id)))
              .flatMap((blob) => blob ? [[blob.projectId, blob.byteLength] as const] : []),
          )
        : null
      matching.sort((left, right) => {
        if (query.sortBy === 'fileSize') {
          const leftSize = blobLengths?.get(left.id)
          const rightSize = blobLengths?.get(right.id)
          const sizeComparison = leftSize == null
            ? rightSize == null ? 0 : 1
            : rightSize == null ? -1 : leftSize - rightSize
          return sign * sizeComparison || (left.browseName ?? '').localeCompare(right.browseName ?? '') || left.id.localeCompare(right.id)
        }
        const leftFolder = folderKeys[left.folderId ?? ''] ?? ''
        const rightFolder = folderKeys[right.folderId ?? ''] ?? ''
        return (
          sign * leftFolder.localeCompare(rightFolder, undefined, { sensitivity: 'base' }) ||
          (left.browseName ?? '').localeCompare(right.browseName ?? '') ||
          left.id.localeCompare(right.id)
        )
      })
      return {
        rows: matching.slice(start, start + pageSize).map(normalizeStoredProjectSummary),
        total,
        page,
      }
    }

    let ordered = indexedProjectBrowseCollection(query)
    if (query.direction === 'desc') ordered = ordered.reverse()
    const rows = await ordered
      .filter(matchesScope)
      .offset(start)
      .limit(pageSize)
      .toArray()
    return { rows: rows.map(normalizeStoredProjectSummary), total, page }
  })
}

export async function getProject(id: string): Promise<StoredProject | null> {
  const [summary, body] = await Promise.all([db.projects.get(id), db.projectRecords.get(id)])
  if (!summary || !body?.record) return null
  const normalizedSummary = normalizeStoredProjectSummary(summary)
  let record = normalizeSequenceRecord(body.record)
  const source = await db.projectFileBlobs.get(id)
  if (
    normalizedSummary.fileFormat === 'genbank' &&
    source &&
    normalizedSummary.updatedAt === source.updatedAt
  ) {
    const { isSnapGeneBytes, parseSequenceBytes } = await import('../domain/parsers')
    const bytes = new Uint8Array(source.bytes)
    if (isSnapGeneBytes(bytes)) {
      const parsed = parseSequenceBytes(bytes.buffer, source.fileName)
      record = normalizeSequenceRecord({
        ...parsed,
        id: record.id,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
      })
      const repairedSummary = normalizeStoredProjectSummary({
        ...normalizedSummary,
        name: record.name,
        sequenceLength: record.sequence.length,
        topology: record.topology,
        fileFormat: 'snapgene',
      })
      await db.transaction('rw', [db.projects, db.projectRecords], async () => {
        await db.projects.put(repairedSummary)
        await db.projectRecords.put({ id, record })
      })
      return { ...repairedSummary, record }
    }
  }
  return {
    ...normalizedSummary,
    record,
  }
}

/**
 * Full projects for pickers that still need every construct in memory.
 * Prefer listProjectSummaries + getProject for Database browsing.
 */
export async function listProjects(): Promise<StoredProject[]> {
  const summaries = await listProjectSummaries()
  const projects: StoredProject[] = []
  for (const summary of summaries) {
    const body = await db.projectRecords.get(summary.id)
    if (!body?.record) continue
    projects.push({
      ...normalizeStoredProjectSummary(summary),
      record: normalizeSequenceRecord(body.record),
    })
  }
  return projects
}

export function buildUserDeletionTombstone(input: {
  summary: StoredProjectSummary
  baseline: StoredProjectFileBaseline | null
  rootFolderId: string
  tombstoneId: string
  deletedAt: string
}): StoredProjectFileTombstone | null {
  const { summary, baseline } = input
  const relativePath = baseline?.relativePath ?? summary.syncRelativePath
  if (!relativePath || summary.fileSyncState === 'local-only') return null
  return {
    id: input.tombstoneId,
    rootFolderId: input.rootFolderId,
    relativePath,
    fileName:
      summary.fileName ??
      baseline?.fileName ??
      normalizeProjectFileName(null, summary.name, summary.molecule),
    fileFormat: summary.fileFormat ?? baseline?.fileFormat ?? 'unknown',
    deletedAt: input.deletedAt,
    reason: 'database-delete',
    projectId: summary.id,
    ...(baseline?.contentHash ?? summary.syncSourceHash
      ? { contentHash: baseline?.contentHash ?? summary.syncSourceHash }
      : {}),
  }
}

/**
 * Delete a database row only. A mapped, source-linked row is tombstoned first
 * so a source file left on disk is ignored by later folder syncs.
 */
export async function deleteProject(id: string) {
  const [summary, baseline, folders] = await Promise.all([
    db.projects.get(id),
    db.projectFileBaselines.get(id),
    db.folders.toArray(),
  ])
  let tombstone: StoredProjectFileTombstone | null = null
  if (summary && summary.folderId) {
    const byId = new Map(folders.map((folder) => [folder.id, folder]))
    const visited = new Set<string>()
    let cursor: string | null = summary.folderId
    while (cursor && !visited.has(cursor)) {
      visited.add(cursor)
      const folder = byId.get(cursor)
      if (!folder) break
      if (folder.parentId === null) {
        if (await db.folderSyncMappings.get(folder.id)) {
          tombstone = buildUserDeletionTombstone({
            summary,
            baseline: baseline ?? null,
            rootFolderId: folder.id,
            tombstoneId: createId('tombstone'),
            deletedAt: nowIso(),
          })
        }
        break
      }
      cursor = folder.parentId
    }
  }
  await db.transaction(
    'rw',
    [
      db.projects,
      db.projectRecords,
      db.projectFileBlobs,
      db.projectFileBaselines,
      db.projectFileTombstones,
      db.folderSyncPending,
    ],
    async () => {
      if (tombstone) await db.projectFileTombstones.put(tombstone)
      await db.folderSyncPending.where('projectId').equals(id).delete()
      await db.projects.delete(id)
      await db.projectRecords.delete(id)
      await db.projectFileBlobs.delete(id)
      await db.projectFileBaselines.delete(id)
    },
  )
  try {
    const [{ removeProteinIndexForProject }, { removePrimerIndexForProject }] = await Promise.all([
      import('./databaseProteins'),
      import('./databasePrimers'),
    ])
    await Promise.all([
      removeProteinIndexForProject(id),
      removePrimerIndexForProject(id),
    ])
  } catch {
    // ignore
  }
  notifyLibraryChanged()
}

/**
 * Remove rows because the linked source file was confirmed absent.
 * Unlike a user-initiated Database deletion, cleanup must not create an ignore
 * tombstone: restoring the file on disk should make it importable again.
 */
export async function deleteProjectForSyncCleanup(id: string): Promise<void> {
  await db.transaction(
    'rw',
    [db.projects, db.projectRecords, db.projectFileBlobs, db.projectFileBaselines, db.folderSyncPending],
    async () => {
      await db.folderSyncPending.where('projectId').equals(id).delete()
      await db.projects.delete(id)
      await db.projectRecords.delete(id)
      await db.projectFileBlobs.delete(id)
      await db.projectFileBaselines.delete(id)
    },
  )
  try {
    const [{ removeProteinIndexForProject }, { removePrimerIndexForProject }] = await Promise.all([
      import('./databaseProteins'),
      import('./databasePrimers'),
    ])
    await Promise.all([
      removeProteinIndexForProject(id),
      removePrimerIndexForProject(id),
    ])
  } catch {
    // ignore
  }
  notifyLibraryChanged()
}

/** Bulk-delete constructs for Sync clean-up, without creating tombstones. */
export async function deleteProjects(ids: readonly string[]) {
  if (ids.length === 0) return
  const CHUNK = 40
  for (let index = 0; index < ids.length; index += CHUNK) {
    const chunk = ids.slice(index, index + CHUNK)
    await db.transaction(
      'rw',
      [db.projects, db.projectRecords, db.projectFileBlobs, db.projectFileBaselines, db.folderSyncPending],
      async () => {
        await Promise.all([
          db.folderSyncPending.where('projectId').anyOf(chunk).delete(),
          db.projects.bulkDelete(chunk),
          db.projectRecords.bulkDelete(chunk),
          db.projectFileBlobs.bulkDelete(chunk),
          db.projectFileBaselines.bulkDelete(chunk),
        ])
      },
    )
  }
  try {
    const [{ removeProteinIndexForProjects }, { removePrimerIndexForProjects }] = await Promise.all([
      import('./databaseProteins'),
      import('./databasePrimers'),
    ])
    await Promise.all([
      removeProteinIndexForProjects(ids),
      removePrimerIndexForProjects(ids),
    ])
  } catch {
    // ignore
  }
  notifyLibraryChanged()
}

export async function putProjectFileBlob(blob: StoredProjectFileBlob): Promise<void> {
  const bytes = new Uint8Array(blob.bytes)
  await db.projectFileBlobs.put({
    ...blob,
    bytes,
    byteLength: bytes.byteLength,
  })
}

export async function getProjectFileBlob(
  projectId: string,
): Promise<StoredProjectFileBlob | null> {
  const blob = await db.projectFileBlobs.get(projectId)
  return blob ? { ...blob, bytes: new Uint8Array(blob.bytes) } : null
}

/** Read retained source-file byte lengths for a Database page without loading blob bodies. */
export async function getProjectFileBlobByteLengths(
  projectIds: readonly string[],
): Promise<Record<string, number>> {
  if (projectIds.length === 0) return {}
  const blobs = await db.projectFileBlobs.bulkGet([...new Set(projectIds)])
  return Object.fromEntries(
    blobs.flatMap((blob) =>
      blob && Number.isFinite(blob.byteLength) ? [[blob.projectId, blob.byteLength] as const] : [],
    ),
  )
}

export async function deleteProjectFileBlob(projectId: string): Promise<void> {
  await db.projectFileBlobs.delete(projectId)
}

export async function putProjectFileBaseline(
  baseline: StoredProjectFileBaseline,
): Promise<void> {
  await db.projectFileBaselines.put(baseline)
}

export async function getProjectFileBaseline(
  projectId: string,
): Promise<StoredProjectFileBaseline | null> {
  return (await db.projectFileBaselines.get(projectId)) ?? null
}

/** Restore an imported file baseline after the legacy initial-mapping queue bug. */
export async function restoreImportedProjectFileBaseline(input: {
  projectId: string
  rootFolderId: string
  relativePath: string
  fileName: string
  fileFormat: ProjectFileFormat
  contentHash: string
  semanticRecordHash: string
  expectedUpdatedAt: string
  expectedMappingUpdatedAt: string
}): Promise<boolean> {
  return db.transaction(
    'rw',
    [db.projects, db.projectFileBlobs, db.projectFileBaselines, db.folderSyncMappings, db.folderSyncPending],
    async () => {
      const [project, blob, mapping, pending] = await Promise.all([
        db.projects.get(input.projectId),
        db.projectFileBlobs.get(input.projectId),
        db.folderSyncMappings.get(input.rootFolderId),
        db.folderSyncPending.get(`${input.rootFolderId}\0${input.projectId}`),
      ])
      if (
        !project ||
        !blob ||
        !mapping ||
        !pending ||
        project.updatedAt !== input.expectedUpdatedAt ||
        project.fileSyncState !== 'local-only' ||
        project.fileProvenance !== 'imported' ||
        project.fileName !== input.fileName ||
        project.fileFormat !== input.fileFormat ||
        blob.fileName !== input.fileName ||
        blob.fileFormat !== input.fileFormat ||
        blob.contentHash !== input.contentHash ||
        mapping.createdAt !== mapping.updatedAt ||
        mapping.updatedAt !== input.expectedMappingUpdatedAt ||
        !mapping.lastSyncedAt
      ) {
        return false
      }
      await db.projects.put(normalizeStoredProjectSummary({
        ...project,
        syncSourceHash: input.contentHash,
        syncRelativePath: input.relativePath,
        fileSyncState: 'synced',
        fileProvenance: 'sync-folder',
      }))
      await db.projectFileBaselines.put({
        projectId: input.projectId,
        fileName: input.fileName,
        fileFormat: input.fileFormat,
        contentHash: input.contentHash,
        semanticRecordHash: input.semanticRecordHash,
        relativePath: input.relativePath,
        capturedAt: mapping.lastSyncedAt,
      })
      await db.folderSyncPending.delete(`${input.rootFolderId}\0${input.projectId}`)
      return true
    },
  )
}

export async function deleteProjectFileBaseline(projectId: string): Promise<void> {
  await db.projectFileBaselines.delete(projectId)
}

export async function putProjectFileTombstone(
  tombstone: Omit<StoredProjectFileTombstone, 'id'> & { id?: string },
): Promise<StoredProjectFileTombstone> {
  const stored: StoredProjectFileTombstone = {
    ...tombstone,
    id: tombstone.id ?? createId('tombstone'),
  }
  await db.projectFileTombstones.put(stored)
  return stored
}

export async function listProjectFileTombstones(
  rootFolderId: string,
): Promise<StoredProjectFileTombstone[]> {
  return db.projectFileTombstones.where('rootFolderId').equals(rootFolderId).toArray()
}

export async function deleteProjectFileTombstone(id: string): Promise<void> {
  await db.projectFileTombstones.delete(id)
}

export async function clearProjectFileTombstones(
  rootFolderId: string,
  relativePath?: string,
): Promise<number> {
  if (relativePath !== undefined) {
    return db.projectFileTombstones
      .where('[rootFolderId+relativePath]')
      .equals([rootFolderId, relativePath])
      .delete()
  }
  return db.projectFileTombstones.where('rootFolderId').equals(rootFolderId).delete()
}

export async function putFolderSyncMapping(mapping: StoredFolderSyncMapping): Promise<void> {
  const folder = await db.folders.get(mapping.folderId)
  if (!folder) throw new Error('Folder not found')
  if (folder.parentId !== null) {
    throw new Error('Only top-level folders can own sync mappings')
  }
  await db.folderSyncMappings.put(mapping)
}

export async function getFolderSyncMapping(
  folderId: string,
): Promise<StoredFolderSyncMapping | null> {
  const folder = await db.folders.get(folderId)
  if (!folder || folder.parentId !== null) return null
  return (await db.folderSyncMappings.get(folderId)) ?? null
}

export async function listFolderSyncPendingProjects(
  rootFolderId: string,
): Promise<StoredProjectSummary[]> {
  const pending = await db.folderSyncPending.where('rootFolderId').equals(rootFolderId).toArray()
  if (!pending.length) return []
  const rows = await db.projects.bulkGet(pending.map((row) => row.projectId))
  return rows.filter((row): row is StoredProjectSummary => Boolean(row)).map(normalizeStoredProjectSummary)
}

export async function acknowledgeFolderSyncPending(
  rootFolderId: string,
  projectId: string,
): Promise<void> {
  await db.folderSyncPending.delete(`${rootFolderId}\0${projectId}`)
}

export async function hasPendingFolderSyncWork(rootFolderId?: string): Promise<boolean> {
  const pending = rootFolderId
    ? (await db.folderSyncPending.where('rootFolderId').equals(rootFolderId).count()) > 0
    : (await db.folderSyncPending.count()) > 0
  if (pending) return true
  const tombstones = rootFolderId
    ? await db.projectFileTombstones.where('rootFolderId').equals(rootFolderId).toArray()
    : await db.projectFileTombstones.toArray()
  return tombstones.some((row) => row.reason === 'path-change')
}

export async function listFolderSyncMappings(): Promise<StoredFolderSyncMapping[]> {
  const [folders, mappings] = await Promise.all([
    db.folders.toArray(),
    db.folderSyncMappings.toArray(),
  ])
  const validRootIds = new Set(
    folders.filter((folder) => folder.parentId === null).map((folder) => folder.id),
  )
  return mappings.filter((mapping) => validRootIds.has(mapping.folderId))
}

export async function deleteFolderSyncMapping(folderId: string): Promise<void> {
  await db.transaction('rw', [db.folderSyncMappings, db.folderSyncPending], async () => {
    await db.folderSyncMappings.delete(folderId)
    // Removing the mapping explicitly detaches its queued work; construct data
    // remains in the Database and is re-queued if a mapping is added again.
    await db.folderSyncPending.where('rootFolderId').equals(folderId).delete()
  })
}

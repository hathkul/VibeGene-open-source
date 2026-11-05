import type { DnaDocumentRole } from '../../domain/dnaComparisonTypes'
import type { ProjectFileFormat } from '../../domain/fileFormats'
import type { MwLadder } from '../../domain/mwLadders'
import type { SequenceRecord } from '../../domain/types'

export type ProjectFileSyncState = 'local-only' | 'synced' | 'modified' | 'conflict'
export type ProjectFileProvenance = 'created' | 'imported' | 'sync-folder' | 'legacy'

export type ProjectSummaryBrowseMolecule = 'nucleic' | 'protein'
export type ProjectSummaryBrowseSort = 'name' | 'format' | 'folder' | 'tags' | 'updated' | 'size' | 'fileSize'
export type ProjectSummaryBrowseScope =
  | { kind: 'all' }
  | { kind: 'unfiled' }
  | { kind: 'folder'; folderId: string }
  | { kind: 'tag'; tag: string }

/** Lightweight row for Database browsing — no sequence payload. */
export type StoredProjectSummary = {
  id: string
  name: string
  updatedAt: string
  /** Folder id, or null/undefined for unfiled. */
  folderId?: string | null
  /** User tags for browsing in the Database manager. */
  tags?: string[]
  sequenceLength: number
  molecule: SequenceRecord['molecule']
  topology: SequenceRecord['topology']
  /** DNA library documents (`dna.documentRole === 'library'`). */
  documentRole?: DnaDocumentRole
  /** User-defined agarose MW markers saved with the project. */
  customMwLadders?: MwLadder[]
  /** SHA-256 of the last Sync folder file bytes for this construct. */
  syncSourceHash?: string
  /** Path of the last Sync/import source file relative to the sync root. */
  syncRelativePath?: string
  /** Real source/export basename, including its extension. */
  fileName?: string
  /** Normalized semantic format inferred from fileName unless explicitly supplied. */
  fileFormat?: ProjectFileFormat
  fileSyncState?: ProjectFileSyncState
  fileProvenance?: ProjectFileProvenance
  browseMolecule?: ProjectSummaryBrowseMolecule
  browseName?: string
  browseFormat?: string
  browseTags?: string
}

export type StoredProject = StoredProjectSummary & {
  /** Full construct body, loaded on Open / Export / cloning pickers. */
  record: SequenceRecord
}

export type SaveProjectFileBaseline = {
  contentHash: string
  semanticRecordHash: string
  relativePath?: string | null
  capturedAt?: string
}

export type SaveProjectExtras = {
  /** Reject the write if another window changed the project after this revision. */
  expectedProjectUpdatedAt?: string
  customMwLadders?: MwLadder[]
  folderId?: string | null
  tags?: string[]
  /** When set, remember the Sync-folder file hash (null clears it). */
  syncSourceHash?: string | null
  /** When set, remember the Sync-folder relative path (null clears it). */
  syncRelativePath?: string | null
  fileName?: string | null
  fileFormat?: ProjectFileFormat | null
  fileSyncState?: ProjectFileSyncState
  fileProvenance?: ProjectFileProvenance
  /** Exact imported/source bytes. Undefined preserves; null removes. */
  fileBytes?: Uint8Array | null
  /** Last common file baseline. Undefined preserves; null removes. */
  baseline?: SaveProjectFileBaseline | null
}

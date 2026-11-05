export type DbSortDirection = 'asc' | 'desc'

export type DatabaseProjectExportFormat = 'dna' | 'gb' | 'fasta'

export const DATABASE_PROJECT_EXPORT_OPTIONS: {
  format: DatabaseProjectExportFormat
  label: string
}[] = [
  { format: 'dna', label: 'SnapGene (.dna / .prot)' },
  { format: 'gb', label: 'GenBank (.gb)' },
  { format: 'fasta', label: 'FASTA (.fasta)' },
]

export const DATABASE_COLUMN_DRAG_MIME = 'text/vibegene-db-column'

export type DatabaseManagerFolderTreeNode = {
  id: string
  name: string
  children: DatabaseManagerFolderTreeNode[]
}

export type DatabaseManagerBuiltinTreeNode = {
  id: string
  name: string
  children: DatabaseManagerBuiltinTreeNode[]
}

export type DatabaseManagerViewMode = 'dna' | 'primers' | 'proteins' | 'cdses'

export type DatabaseManagerFileColumnId =
  | 'name'
  | 'format'
  | 'folder'
  | 'tags'
  | 'updated'
  | 'size'
  | 'fileSize'
  | 'actions'

export type DatabaseManagerPrimerColumnId =
  | 'name'
  | 'sequence'
  | 'length'
  | 'tm'
  | 'gc'
  | 'tags'
  | 'files'
  | 'actions'

export type DatabaseManagerImportToolbarMode = 'import' | 'import-folder'
export type DatabaseManagerInboundToolbarMode =
  | 'import-database'
  | 'sync-to-database'
  | 'sync-cleanup-database'
export type DatabaseManagerOutboundToolbarMode = 'export-database' | 'sync-to-folder'

export type DatabaseManagerToolbarModes = {
  import: DatabaseManagerImportToolbarMode
  inbound: DatabaseManagerInboundToolbarMode
  outbound: DatabaseManagerOutboundToolbarMode
}

export type DatabaseManagerProteinColumnId =
  | 'name'
  | 'sequence'
  | 'length'
  | 'mass'
  | 'product'
  | 'files'
  | 'actions'

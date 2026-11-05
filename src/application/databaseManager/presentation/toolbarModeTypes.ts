/** Neutral toolbar mode values aligned with presentation `DatabaseManagerToolbarModes`. */
export type AppDatabaseManagerImportToolbarMode = 'import' | 'import-folder'

export type AppDatabaseManagerInboundToolbarMode =
  | 'import-database'
  | 'sync-to-database'
  | 'sync-cleanup-database'

export type AppDatabaseManagerOutboundToolbarMode = 'export-database' | 'sync-to-folder'

export type AppDatabaseManagerToolbarModes = {
  import: AppDatabaseManagerImportToolbarMode
  inbound: AppDatabaseManagerInboundToolbarMode
  outbound: AppDatabaseManagerOutboundToolbarMode
}

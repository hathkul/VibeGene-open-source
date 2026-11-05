export type SaveToolbarMode = 'save' | 'save-dna' | 'save-to'
export type DocumentSaveBinding = 'disk' | 'database' | 'new'

export type SaveToolbarAction =
  | 'read-only'
  | 'save-database'
  | 'save-database-copy'
  | 'export-database-dna'
  | 'save-disk'
  | 'save-disk-as'

/** Resolve toolbar intent without consulting React state or an I/O adapter. */
export function planSaveToolbarAction(
  traceDocument: boolean,
  binding: DocumentSaveBinding,
  mode: SaveToolbarMode,
): SaveToolbarAction {
  if (traceDocument) return 'read-only'
  if (binding === 'database') {
    if (mode === 'save-dna') return 'export-database-dna'
    if (mode === 'save-to') return 'save-database-copy'
    return 'save-database'
  }
  if (mode === 'save-to') return 'save-database-copy'
  return mode === 'save-dna' ? 'save-disk-as' : 'save-disk'
}

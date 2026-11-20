const WINDOW_SIZE_KEY = 'vibegene:database-window-size'
const MODAL_SIZE_KEY = 'vibegene:database-modal-size'
const EXPANDED_FOLDERS_KEY = 'vibegene:database-expanded-folders'
const COLUMN_WIDTHS_KEY = 'vibegene:database-column-widths'
const PRIMER_COLUMN_WIDTHS_KEY = 'vibegene:database-primer-column-widths'
const PROTEIN_COLUMN_WIDTHS_KEY = 'vibegene:database-protein-column-widths'
const COLUMN_ORDER_KEY = 'vibegene:database-column-order'
const PRIMER_COLUMN_ORDER_KEY = 'vibegene:database-primer-column-order'
const PROTEIN_COLUMN_ORDER_KEY = 'vibegene:database-protein-column-order'
const SIDEBAR_WIDTH_KEY = 'vibegene:database-sidebar-width'
const VIEW_MODE_KEY = 'vibegene:database-view-mode'
const TOOLBAR_MODE_KEY = 'vibegene:database-toolbar-modes'

export const DATABASE_UI_PREFS_CHANGED_EVENT = 'vibegene:database-ui-prefs-changed'

export type DatabaseViewMode = 'dna' | 'primers' | 'proteins' | 'cdses'

export function moleculeBelongsInDatabaseFileView(
  molecule: 'dna' | 'rna' | 'protein',
  viewMode: DatabaseViewMode,
): boolean {
  if (viewMode === 'proteins') return molecule === 'protein'
  if (viewMode === 'dna') return molecule !== 'protein'
  return false
}

export type DatabaseFileColumnId =
  | 'name'
  | 'format'
  | 'folder'
  | 'tags'
  | 'updated'
  | 'size'
  | 'fileSize'
  | 'actions'
export type DatabasePrimerColumnId =
  | 'name'
  | 'sequence'
  | 'length'
  | 'tm'
  | 'gc'
  | 'tags'
  | 'files'
  | 'actions'
export type DatabaseProteinColumnId =
  | 'name'
  | 'sequence'
  | 'length'
  | 'mass'
  | 'product'
  | 'files'
  | 'actions'

export const DEFAULT_DATABASE_FILE_COLUMN_ORDER: DatabaseFileColumnId[] = [
  'name',
  'format',
  'folder',
  'size',
  'fileSize',
  'tags',
  'updated',
  'actions',
]

export const DEFAULT_DATABASE_PRIMER_COLUMN_ORDER: DatabasePrimerColumnId[] = [
  'name',
  'sequence',
  'length',
  'tm',
  'gc',
  'tags',
  'files',
  'actions',
]

export const DEFAULT_DATABASE_PROTEIN_COLUMN_ORDER: DatabaseProteinColumnId[] = [
  'name',
  'sequence',
  'length',
  'mass',
  'product',
  'files',
  'actions',
]

export const DEFAULT_DATABASE_FILE_COLUMN_WIDTHS: Record<DatabaseFileColumnId, number> = {
  name: 250,
  format: 116,
  folder: 130,
  tags: 150,
  updated: 160,
  size: 88,
  fileSize: 88,
  actions: 144,
}

export const DATABASE_FILE_COLUMN_MIN_WIDTH: Record<DatabaseFileColumnId, number> = {
  name: 120,
  format: 84,
  folder: 72,
  tags: 72,
  updated: 110,
  size: 64,
  fileSize: 64,
  actions: 144,
}

export const DEFAULT_DATABASE_PRIMER_COLUMN_WIDTHS: Record<DatabasePrimerColumnId, number> = {
  name: 160,
  sequence: 280,
  length: 72,
  tm: 88,
  gc: 64,
  tags: 130,
  files: 140,
  actions: 88,
}

export const DATABASE_PRIMER_COLUMN_MIN_WIDTH: Record<DatabasePrimerColumnId, number> = {
  name: 88,
  sequence: 120,
  length: 56,
  tm: 64,
  gc: 48,
  tags: 72,
  files: 72,
  actions: 72,
}

export const DEFAULT_DATABASE_PROTEIN_COLUMN_WIDTHS: Record<DatabaseProteinColumnId, number> = {
  name: 160,
  sequence: 280,
  length: 72,
  mass: 88,
  product: 150,
  files: 140,
  actions: 120,
}

export const DATABASE_PROTEIN_COLUMN_MIN_WIDTH: Record<DatabaseProteinColumnId, number> = {
  name: 88,
  sequence: 120,
  length: 56,
  mass: 64,
  product: 72,
  files: 72,
  actions: 120,
}

export type DatabaseUiSettings = {
  fileColumnOrder?: DatabaseFileColumnId[]
  fileColumnWidths?: Partial<Record<DatabaseFileColumnId, number>>
  primerColumnOrder?: DatabasePrimerColumnId[]
  primerColumnWidths?: Partial<Record<DatabasePrimerColumnId, number>>
  proteinColumnOrder?: DatabaseProteinColumnId[]
  proteinColumnWidths?: Partial<Record<DatabaseProteinColumnId, number>>
}

/**
 * Convert database UI JSON from a settings file into the preferences this adapter owns.
 * Keeping this at the storage boundary prevents the domain settings format from depending
 * on browser preference implementation details.
 */
export function parseDatabaseUiSettings(value: unknown): DatabaseUiSettings | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  const raw = value as Record<string, unknown>
  const settings: DatabaseUiSettings = {}
  if (Array.isArray(raw.fileColumnOrder)) {
    settings.fileColumnOrder = normalizeDatabaseFileColumnOrder(raw.fileColumnOrder)
  }
  if (Array.isArray(raw.primerColumnOrder)) {
    settings.primerColumnOrder = normalizeColumnOrder(
      raw.primerColumnOrder,
      DEFAULT_DATABASE_PRIMER_COLUMN_ORDER,
    )
  }
  if (
    raw.fileColumnWidths &&
    typeof raw.fileColumnWidths === 'object' &&
    !Array.isArray(raw.fileColumnWidths)
  ) {
    const widths: NonNullable<DatabaseUiSettings['fileColumnWidths']> = {}
    for (const [key, entry] of Object.entries(raw.fileColumnWidths)) {
      if (typeof entry === 'number' && Number.isFinite(entry)) {
        widths[key as keyof typeof widths] = entry
      }
    }
    if (Object.keys(widths).length) settings.fileColumnWidths = widths
  }
  if (
    raw.primerColumnWidths &&
    typeof raw.primerColumnWidths === 'object' &&
    !Array.isArray(raw.primerColumnWidths)
  ) {
    const widths: NonNullable<DatabaseUiSettings['primerColumnWidths']> = {}
    for (const [key, entry] of Object.entries(raw.primerColumnWidths)) {
      if (typeof entry === 'number' && Number.isFinite(entry)) {
        widths[key as keyof typeof widths] = entry
      }
    }
    if (Object.keys(widths).length) settings.primerColumnWidths = widths
  }
  return Object.keys(settings).length ? settings : undefined
}

export function normalizeColumnOrder<T extends string>(
  preferred: unknown,
  defaults: readonly T[],
): T[] {
  const allowed = new Set(defaults)
  const seen = new Set<T>()
  const next: T[] = []
  if (Array.isArray(preferred)) {
    for (const item of preferred) {
      if (typeof item !== 'string' || !allowed.has(item as T) || seen.has(item as T)) continue
      seen.add(item as T)
      next.push(item as T)
    }
  }
  for (const id of defaults) {
    if (!seen.has(id)) next.push(id)
  }
  return next
}

/** Keep the phase-5 Format column beside Name when migrating a saved legacy order. */
export function normalizeDatabaseFileColumnOrder(preferred: unknown): DatabaseFileColumnId[] {
  let normalized = normalizeColumnOrder(preferred, DEFAULT_DATABASE_FILE_COLUMN_ORDER)
  if (
    Array.isArray(preferred) &&
    !preferred.includes('format') &&
    normalized.includes('name')
  ) {
    const withoutFormat: DatabaseFileColumnId[] = normalized.filter((id) => id !== 'format')
    withoutFormat.splice(withoutFormat.indexOf('name') + 1, 0, 'format')
    normalized = withoutFormat
  }
  if (Array.isArray(preferred)) {
    const withoutSize: DatabaseFileColumnId[] = normalized.filter((id) => id !== 'size' && id !== 'fileSize')
    const folderIndex = withoutSize.indexOf('folder')
    withoutSize.splice(folderIndex + 1, 0, 'size', 'fileSize')
    return withoutSize
  }
  return normalized
}

export function moveColumnInOrder<T extends string>(order: readonly T[], fromId: T, toId: T): T[] {
  if (fromId === toId) return [...order]
  const from = order.indexOf(fromId)
  const to = order.indexOf(toId)
  if (from < 0 || to < 0) return [...order]
  const next = [...order]
  const [moved] = next.splice(from, 1)
  next.splice(to, 0, moved!)
  return next
}

function notifyDatabaseUiPrefsChanged() {
  try {
    window.dispatchEvent(new Event(DATABASE_UI_PREFS_CHANGED_EVENT))
  } catch {
    // ignore
  }
}

export type DatabaseInboundToolbarMode = 'import-database' | 'sync-to-database' | 'sync-cleanup-database'
export type DatabaseImportToolbarMode = 'import' | 'import-folder'
export type DatabaseOutboundToolbarMode = 'export-database' | 'sync-to-folder'

export type DatabaseToolbarModes = {
  inbound: DatabaseInboundToolbarMode
  import: DatabaseImportToolbarMode
  outbound: DatabaseOutboundToolbarMode
}

const DEFAULT_TOOLBAR_MODES: DatabaseToolbarModes = {
  inbound: 'sync-to-database',
  import: 'import',
  outbound: 'export-database',
}

export type DatabaseUiSize = {
  width: number
  height: number
}

function readSize(key: string, fallback: DatabaseUiSize, min: DatabaseUiSize): DatabaseUiSize {
  try {
    const raw = window.localStorage.getItem(key)
    if (!raw) return fallback
    const parsed = JSON.parse(raw) as Partial<DatabaseUiSize>
    const width = typeof parsed.width === 'number' ? parsed.width : fallback.width
    const height = typeof parsed.height === 'number' ? parsed.height : fallback.height
    return {
      width: Math.max(min.width, Math.round(width)),
      height: Math.max(min.height, Math.round(height)),
    }
  } catch {
    return fallback
  }
}

function writeSize(key: string, size: DatabaseUiSize) {
  try {
    window.localStorage.setItem(
      key,
      JSON.stringify({
        width: Math.round(size.width),
        height: Math.round(size.height),
      }),
    )
  } catch {
    // ignore quota / private mode
  }
}

export function readDatabaseWindowSize(fallback: DatabaseUiSize, min: DatabaseUiSize): DatabaseUiSize {
  return readSize(WINDOW_SIZE_KEY, fallback, min)
}

export function writeDatabaseWindowSize(size: DatabaseUiSize) {
  writeSize(WINDOW_SIZE_KEY, size)
}

export function readDatabaseModalSize(fallback: DatabaseUiSize, min: DatabaseUiSize): DatabaseUiSize {
  return readSize(MODAL_SIZE_KEY, fallback, min)
}

export function writeDatabaseModalSize(size: DatabaseUiSize) {
  writeSize(MODAL_SIZE_KEY, size)
}

export function readDatabaseExpandedFolderIds(): Set<string> {
  try {
    const raw = window.localStorage.getItem(EXPANDED_FOLDERS_KEY)
    if (!raw) return new Set()
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return new Set()
    return new Set(parsed.filter((id): id is string => typeof id === 'string' && id.length > 0))
  } catch {
    return new Set()
  }
}

export function writeDatabaseExpandedFolderIds(ids: ReadonlySet<string>) {
  try {
    window.localStorage.setItem(EXPANDED_FOLDERS_KEY, JSON.stringify([...ids]))
  } catch {
    // ignore
  }
}

export function readDatabaseColumnWidths<T extends string>(
  fallback: Record<T, number>,
  mins: Record<T, number>,
): Record<T, number> {
  try {
    const raw = window.localStorage.getItem(COLUMN_WIDTHS_KEY)
    if (!raw) return { ...fallback }
    const parsed = JSON.parse(raw) as Record<string, unknown>
    const next = { ...fallback }
    for (const key of Object.keys(fallback) as T[]) {
      const value = parsed[key]
      if (typeof value === 'number' && Number.isFinite(value)) {
        next[key] = Math.max(mins[key] ?? 0, Math.round(value))
      }
    }
    return next
  } catch {
    return { ...fallback }
  }
}

export function writeDatabaseColumnWidths(widths: Record<string, number>) {
  try {
    const rounded: Record<string, number> = {}
    for (const [key, value] of Object.entries(widths)) {
      if (typeof value === 'number' && Number.isFinite(value)) {
        rounded[key] = Math.round(value)
      }
    }
    window.localStorage.setItem(COLUMN_WIDTHS_KEY, JSON.stringify(rounded))
  } catch {
    // ignore
  }
}

export function readDatabasePrimerColumnWidths<T extends string>(
  fallback: Record<T, number>,
  mins: Record<T, number>,
): Record<T, number> {
  try {
    const raw = window.localStorage.getItem(PRIMER_COLUMN_WIDTHS_KEY)
    if (!raw) return { ...fallback }
    const parsed = JSON.parse(raw) as Record<string, unknown>
    const next = { ...fallback }
    for (const key of Object.keys(fallback) as T[]) {
      const value = parsed[key]
      if (typeof value === 'number' && Number.isFinite(value)) {
        next[key] = Math.max(mins[key] ?? 0, Math.round(value))
      }
    }
    return next
  } catch {
    return { ...fallback }
  }
}

export function writeDatabasePrimerColumnWidths(widths: Record<string, number>) {
  try {
    const rounded: Record<string, number> = {}
    for (const [key, value] of Object.entries(widths)) {
      if (typeof value === 'number' && Number.isFinite(value)) {
        rounded[key] = Math.round(value)
      }
    }
    window.localStorage.setItem(PRIMER_COLUMN_WIDTHS_KEY, JSON.stringify(rounded))
  } catch {
    // ignore
  }
}

export function readDatabaseProteinColumnWidths<T extends string>(
  fallback: Record<T, number>,
  mins: Record<T, number>,
): Record<T, number> {
  try {
    const raw = window.localStorage.getItem(PROTEIN_COLUMN_WIDTHS_KEY)
    if (!raw) return { ...fallback }
    const parsed = JSON.parse(raw) as Record<string, unknown>
    const next = { ...fallback }
    for (const key of Object.keys(fallback) as T[]) {
      const value = parsed[key]
      if (typeof value === 'number' && Number.isFinite(value)) {
        next[key] = Math.max(mins[key] ?? 0, Math.round(value))
      }
    }
    return next
  } catch {
    return { ...fallback }
  }
}

export function writeDatabaseProteinColumnWidths(widths: Record<string, number>) {
  try {
    const rounded: Record<string, number> = {}
    for (const [key, value] of Object.entries(widths)) {
      if (typeof value === 'number' && Number.isFinite(value)) {
        rounded[key] = Math.round(value)
      }
    }
    window.localStorage.setItem(PROTEIN_COLUMN_WIDTHS_KEY, JSON.stringify(rounded))
  } catch {
    // ignore
  }
}

export function readDatabaseSidebarWidth(fallback: number, min: number, max: number): number {
  try {
    const raw = window.localStorage.getItem(SIDEBAR_WIDTH_KEY)
    if (!raw) return fallback
    const value = Number(raw)
    if (!Number.isFinite(value)) return fallback
    return Math.max(min, Math.min(max, Math.round(value)))
  } catch {
    return fallback
  }
}

export function writeDatabaseSidebarWidth(width: number) {
  try {
    window.localStorage.setItem(SIDEBAR_WIDTH_KEY, String(Math.round(width)))
  } catch {
    // ignore
  }
}

export function readDatabaseViewMode(): DatabaseViewMode {
  try {
    const raw = window.localStorage.getItem(VIEW_MODE_KEY)
    if (raw === 'primers') return 'primers'
    if (raw === 'protein-files') return 'proteins'
    if (raw === 'cdses') return 'cdses'
    // Before protein files had their own view, "proteins" meant translated CDSes.
    if (raw === 'proteins') return 'cdses'
    // Legacy File mode key.
    if (raw === 'files' || raw === 'dna') return 'dna'
    return 'dna'
  } catch {
    return 'dna'
  }
}

export function writeDatabaseViewMode(mode: DatabaseViewMode) {
  try {
    window.localStorage.setItem(VIEW_MODE_KEY, mode === 'proteins' ? 'protein-files' : mode)
  } catch {
    // ignore
  }
}

function isInboundMode(value: unknown): value is DatabaseInboundToolbarMode {
  return value === 'import-database' || value === 'sync-to-database' || value === 'sync-cleanup-database'
}

function isImportMode(value: unknown): value is DatabaseImportToolbarMode {
  return value === 'import' || value === 'import-folder'
}

function isOutboundMode(value: unknown): value is DatabaseOutboundToolbarMode {
  return value === 'export-database' || value === 'sync-to-folder'
}

export function readDatabaseToolbarModes(): DatabaseToolbarModes {
  try {
    const raw = window.localStorage.getItem(TOOLBAR_MODE_KEY)
    if (!raw) return { ...DEFAULT_TOOLBAR_MODES }
    const parsed = JSON.parse(raw) as Partial<DatabaseToolbarModes>
    return {
      inbound: isInboundMode(parsed.inbound) ? parsed.inbound : DEFAULT_TOOLBAR_MODES.inbound,
      import: isImportMode(parsed.import) ? parsed.import : DEFAULT_TOOLBAR_MODES.import,
      outbound: isOutboundMode(parsed.outbound) ? parsed.outbound : DEFAULT_TOOLBAR_MODES.outbound,
    }
  } catch {
    return { ...DEFAULT_TOOLBAR_MODES }
  }
}

export function writeDatabaseToolbarModes(modes: DatabaseToolbarModes) {
  try {
    window.localStorage.setItem(TOOLBAR_MODE_KEY, JSON.stringify(modes))
  } catch {
    // ignore
  }
}

export function readDatabaseFileColumnOrder(): DatabaseFileColumnId[] {
  try {
    const raw = window.localStorage.getItem(COLUMN_ORDER_KEY)
    if (!raw) return [...DEFAULT_DATABASE_FILE_COLUMN_ORDER]
    return normalizeDatabaseFileColumnOrder(JSON.parse(raw))
  } catch {
    return [...DEFAULT_DATABASE_FILE_COLUMN_ORDER]
  }
}

export function writeDatabaseFileColumnOrder(order: readonly DatabaseFileColumnId[]) {
  try {
    window.localStorage.setItem(
      COLUMN_ORDER_KEY,
      JSON.stringify(normalizeDatabaseFileColumnOrder(order)),
    )
  } catch {
    // ignore
  }
}

export function readDatabasePrimerColumnOrder(): DatabasePrimerColumnId[] {
  try {
    const raw = window.localStorage.getItem(PRIMER_COLUMN_ORDER_KEY)
    if (!raw) return [...DEFAULT_DATABASE_PRIMER_COLUMN_ORDER]
    return normalizeColumnOrder(JSON.parse(raw), DEFAULT_DATABASE_PRIMER_COLUMN_ORDER)
  } catch {
    return [...DEFAULT_DATABASE_PRIMER_COLUMN_ORDER]
  }
}

export function writeDatabasePrimerColumnOrder(order: readonly DatabasePrimerColumnId[]) {
  try {
    window.localStorage.setItem(
      PRIMER_COLUMN_ORDER_KEY,
      JSON.stringify(normalizeColumnOrder(order, DEFAULT_DATABASE_PRIMER_COLUMN_ORDER)),
    )
  } catch {
    // ignore
  }
}

export function readDatabaseProteinColumnOrder(): DatabaseProteinColumnId[] {
  try {
    const raw = window.localStorage.getItem(PROTEIN_COLUMN_ORDER_KEY)
    if (!raw) return [...DEFAULT_DATABASE_PROTEIN_COLUMN_ORDER]
    return normalizeColumnOrder(JSON.parse(raw), DEFAULT_DATABASE_PROTEIN_COLUMN_ORDER)
  } catch {
    return [...DEFAULT_DATABASE_PROTEIN_COLUMN_ORDER]
  }
}

export function writeDatabaseProteinColumnOrder(order: readonly DatabaseProteinColumnId[]) {
  try {
    window.localStorage.setItem(
      PROTEIN_COLUMN_ORDER_KEY,
      JSON.stringify(normalizeColumnOrder(order, DEFAULT_DATABASE_PROTEIN_COLUMN_ORDER)),
    )
  } catch {
    // ignore
  }
}

function mergeWidths<T extends string>(
  fallback: Record<T, number>,
  mins: Record<T, number>,
  patch: Partial<Record<T, number>> | undefined,
): Record<T, number> {
  const next = { ...fallback }
  if (!patch) return next
  for (const key of Object.keys(fallback) as T[]) {
    const value = patch[key]
    if (typeof value === 'number' && Number.isFinite(value)) {
      next[key] = Math.max(mins[key] ?? 0, Math.round(value))
    }
  }
  return next
}

/** Snapshot for vibegene-settings.json (only non-default fields). */
export function readDatabaseUiSettingsForExport(): DatabaseUiSettings | undefined {
  const fileColumnOrder = readDatabaseFileColumnOrder()
  const primerColumnOrder = readDatabasePrimerColumnOrder()
  const proteinColumnOrder = readDatabaseProteinColumnOrder()
  const fileColumnWidths = readDatabaseColumnWidths(
    DEFAULT_DATABASE_FILE_COLUMN_WIDTHS,
    DATABASE_FILE_COLUMN_MIN_WIDTH,
  )
  const primerColumnWidths = readDatabasePrimerColumnWidths(
    DEFAULT_DATABASE_PRIMER_COLUMN_WIDTHS,
    DATABASE_PRIMER_COLUMN_MIN_WIDTH,
  )
  const proteinColumnWidths = readDatabaseProteinColumnWidths(
    DEFAULT_DATABASE_PROTEIN_COLUMN_WIDTHS,
    DATABASE_PROTEIN_COLUMN_MIN_WIDTH,
  )

  const fileOrderChanged =
    fileColumnOrder.join('\0') !== DEFAULT_DATABASE_FILE_COLUMN_ORDER.join('\0')
  const primerOrderChanged =
    primerColumnOrder.join('\0') !== DEFAULT_DATABASE_PRIMER_COLUMN_ORDER.join('\0')
  const proteinOrderChanged =
    proteinColumnOrder.join('\0') !== DEFAULT_DATABASE_PROTEIN_COLUMN_ORDER.join('\0')

  const fileWidthPatch: Partial<Record<DatabaseFileColumnId, number>> = {}
  for (const key of Object.keys(DEFAULT_DATABASE_FILE_COLUMN_WIDTHS) as DatabaseFileColumnId[]) {
    if (fileColumnWidths[key] !== DEFAULT_DATABASE_FILE_COLUMN_WIDTHS[key]) {
      fileWidthPatch[key] = fileColumnWidths[key]
    }
  }
  const primerWidthPatch: Partial<Record<DatabasePrimerColumnId, number>> = {}
  for (const key of Object.keys(DEFAULT_DATABASE_PRIMER_COLUMN_WIDTHS) as DatabasePrimerColumnId[]) {
    if (primerColumnWidths[key] !== DEFAULT_DATABASE_PRIMER_COLUMN_WIDTHS[key]) {
      primerWidthPatch[key] = primerColumnWidths[key]
    }
  }
  const proteinWidthPatch: Partial<Record<DatabaseProteinColumnId, number>> = {}
  for (const key of Object.keys(DEFAULT_DATABASE_PROTEIN_COLUMN_WIDTHS) as DatabaseProteinColumnId[]) {
    if (proteinColumnWidths[key] !== DEFAULT_DATABASE_PROTEIN_COLUMN_WIDTHS[key]) {
      proteinWidthPatch[key] = proteinColumnWidths[key]
    }
  }

  const settings: DatabaseUiSettings = {
    ...(fileOrderChanged ? { fileColumnOrder } : {}),
    ...(Object.keys(fileWidthPatch).length ? { fileColumnWidths: fileWidthPatch } : {}),
    ...(primerOrderChanged ? { primerColumnOrder } : {}),
    ...(Object.keys(primerWidthPatch).length ? { primerColumnWidths: primerWidthPatch } : {}),
    ...(proteinOrderChanged ? { proteinColumnOrder } : {}),
    ...(Object.keys(proteinWidthPatch).length ? { proteinColumnWidths: proteinWidthPatch } : {}),
  }
  return Object.keys(settings).length ? settings : undefined
}

export function applyDatabaseUiSettings(settings: DatabaseUiSettings | undefined | null) {
  if (!settings) return false
  let changed = false
  if (settings.fileColumnOrder) {
    writeDatabaseFileColumnOrder(settings.fileColumnOrder)
    changed = true
  }
  if (settings.primerColumnOrder) {
    writeDatabasePrimerColumnOrder(settings.primerColumnOrder)
    changed = true
  }
  if (settings.proteinColumnOrder) {
    writeDatabaseProteinColumnOrder(settings.proteinColumnOrder)
    changed = true
  }
  if (settings.fileColumnWidths) {
    const merged = mergeWidths(
      DEFAULT_DATABASE_FILE_COLUMN_WIDTHS,
      DATABASE_FILE_COLUMN_MIN_WIDTH,
      settings.fileColumnWidths,
    )
    writeDatabaseColumnWidths(merged)
    changed = true
  }
  if (settings.primerColumnWidths) {
    const merged = mergeWidths(
      DEFAULT_DATABASE_PRIMER_COLUMN_WIDTHS,
      DATABASE_PRIMER_COLUMN_MIN_WIDTH,
      settings.primerColumnWidths,
    )
    writeDatabasePrimerColumnWidths(merged)
    changed = true
  }
  if (settings.proteinColumnWidths) {
    const merged = mergeWidths(
      DEFAULT_DATABASE_PROTEIN_COLUMN_WIDTHS,
      DATABASE_PROTEIN_COLUMN_MIN_WIDTH,
      settings.proteinColumnWidths,
    )
    writeDatabaseProteinColumnWidths(merged)
    changed = true
  }
  if (changed) notifyDatabaseUiPrefsChanged()
  return changed
}

import { isTauriRuntime } from './tauriRuntime'
import type { BackgroundThrottlingPolicy } from '@tauri-apps/api/window'
import { destroyDesktopWindowSafely } from './windowCloseGuard'
import { emptyAgaroseGelSeedRecord } from '../domain/agaroseGelLibrary'
import type { SequenceRecord } from '../domain/types'
import { readDatabaseWindowSize } from '../storage/databaseUiPrefs'
import type {
  DatabaseAlignmentPick,
  DatabaseLibraryMemberPick,
  HybridWindowKind,
  HybridWindowResult,
  PrimerPropertiesPayload,
} from '../application/ports/hybridWindows'
export type {
  DatabaseAlignmentConstruct,
  DatabaseAlignmentPick,
  DatabaseAlignmentPickMode,
  DatabaseLibraryMemberPick,
  HybridWindowKind,
  HybridWindowResult,
  PrimerPropertiesPayload,
} from '../application/ports/hybridWindows'

export type HybridWindowSpec = {
  kind: HybridWindowKind
  /** Tauri webview label (alphanumeric + -_:/). */
  label: string
  title: string
  width: number
  height: number
  minWidth?: number
  minHeight?: number
  /** Defaults to true. */
  resizable?: boolean
  /**
   * After mount, resize the OS window to the dialog's natural size.
   * Skips create-time max size lock so fit can grow or shrink.
   */
  fitToContent?: boolean
}

export const HYBRID_WINDOW_SPECS: Record<HybridWindowKind, HybridWindowSpec> = {
  startup: {
    kind: 'startup',
    label: 'hybrid-startup',
    title: 'VibeGene',
    width: 1100,
    height: 820,
    minWidth: 960,
    minHeight: 720,
  },
  'letter-codes': {
    kind: 'letter-codes',
    label: 'hybrid-letter-codes',
    title: 'Letter codes',
    width: 460,
    height: 640,
    minWidth: 360,
    minHeight: 240,
    resizable: false,
    fitToContent: true,
  },
  'genetic-code-tables': {
    kind: 'genetic-code-tables',
    label: 'hybrid-genetic-code-tables',
    title: 'Genetic code tables',
    width: 960,
    height: 720,
    minWidth: 640,
    minHeight: 360,
    resizable: false,
    fitToContent: true,
  },
  'enzyme-database': {
    kind: 'enzyme-database',
    label: 'hybrid-enzyme-database',
    title: 'Enzyme Database',
    width: 960,
    height: 720,
    minWidth: 640,
    minHeight: 480,
  },
  'common-features-browse': {
    kind: 'common-features-browse',
    label: 'hybrid-common-features-browse',
    title: 'Browse Common Features',
    width: 1100,
    height: 780,
    minWidth: 800,
    minHeight: 560,
  },
  'agarose-gel': {
    kind: 'agarose-gel',
    label: 'hybrid-agarose-gel',
    title: 'Simulate DNA gel',
    width: 1280,
    height: 860,
    minWidth: 960,
    minHeight: 640,
  },
  database: {
    kind: 'database',
    label: 'hybrid-database',
    title: 'Database',
    width: 1280,
    height: 760,
    minWidth: 1100,
    minHeight: 520,
  },
  'new-dna-file': {
    kind: 'new-dna-file',
    label: 'hybrid-new-dna-file',
    title: 'New DNA File',
    width: 752,
    height: 560,
    minWidth: 752,
    minHeight: 420,
    resizable: false,
    fitToContent: true,
  },
  'new-protein-file': {
    kind: 'new-protein-file',
    label: 'hybrid-new-protein-file',
    title: 'New Protein File',
    width: 752,
    height: 520,
    minWidth: 640,
    minHeight: 360,
    resizable: false,
    fitToContent: true,
  },
  'primer-properties': {
    kind: 'primer-properties',
    label: 'hybrid-primer-properties',
    title: 'Primer Properties',
    width: 980,
    height: 420,
    minWidth: 640,
    minHeight: 280,
    resizable: false,
    fitToContent: true,
  },
  preferences: {
    kind: 'preferences',
    label: 'hybrid-preferences',
    title: 'Preferences',
    width: 520,
    height: 480,
    minWidth: 420,
    minHeight: 200,
    resizable: false,
    fitToContent: true,
  },
}

const QUERY_KEY = 'vgWindow'
const PAYLOAD_PREFIX = 'vibegene:hybrid-payload:'
const RESULT_EVENT = 'vg-hybrid-result'

export type EnzymeDatabasePayload = {
  initialEnzymeName?: string | null
}

export type DatabaseConstructPick = {
  /** Correlates a standalone Database result with the cloning dialog that requested it. */
  requestId: string
  /** Workspace construct whose cloning dialog requested the source. */
  targetRecordId: string
  /** Restrict selection to constructs with the topology required by the cloning input. */
  topology?: SequenceRecord['topology']
  /** Allow choosing several constructs before returning them to the cloning dialog. */
  multiple?: boolean
  /**
   * When true, the open/current construct (and targetRecordId) remain selectable.
   * Used by gel bulk add; cloning keeps the default exclude behavior.
   */
  allowCurrent?: boolean
  /** Blue confirm button label (default: "Add to cloning"). */
  confirmLabel?: string
  /** Cancel button label (default: "Cancel cloning selection"). */
  cancelLabel?: string
  /** Database window title while picking. */
  title?: string
  /**
   * Restrict selectable molecules. Omit for cloning-compatible DNA constructs
   * (non-protein). Pass `['dna', 'protein']` to allow either.
   */
  molecules?: Array<'dna' | 'protein'>
}

export type DatabasePayload = {
  currentRecordId?: string | null
  /** When set, Database shows Add to alignment for the focused editor. */
  alignmentPick?: DatabaseAlignmentPick | null
  /** When set, Database acts as a construct picker for a cloning dialog. */
  constructPick?: DatabaseConstructPick | null
  /** When set, Database shows Add for inserting DNA constructs into the open library. */
  libraryMemberPick?: DatabaseLibraryMemberPick | null
}

export type AgaroseGelPayload = {
  /** Snapshot of the construct that opened the gel. Optional for blank standalone opens. */
  currentRecord?: SequenceRecord
  /** Main-window tab id so the gel can list other open constructs. */
  currentTabId?: string
  /** Bumps on each open so a focused existing window remounts with a fresh snapshot. */
  openedAt?: number
  /** Prefill sample lanes (e.g. selected library members or a history digest). */
  initialSamples?: Array<{ label: string; record: SequenceRecord; enzymeNames?: string[] }>
  /** Extra picker entries for DNA library members. */
  libraryMemberSources?: Array<{ label: string; record: SequenceRecord }>
  /** Override label for the current-window / consensus source. */
  currentSourceLabel?: string
}

/** Payload for opening the gel with no construct preloaded (blank lanes). */
export function createStandaloneAgaroseGelPayload(
  overrides?: Partial<AgaroseGelPayload>,
): AgaroseGelPayload {
  return {
    currentRecord: emptyAgaroseGelSeedRecord(),
    currentTabId: 'standalone',
    openedAt: Date.now(),
    initialSamples: [],
    ...overrides,
  }
}

export type HybridWindowPayloadMap = {
  startup: Record<string, never>
  'letter-codes': Record<string, never>
  'genetic-code-tables': Record<string, never>
  'enzyme-database': EnzymeDatabasePayload
  'common-features-browse': Record<string, never>
  'agarose-gel': AgaroseGelPayload
  database: DatabasePayload
  'new-dna-file': Record<string, never>
  'new-protein-file': Record<string, never>
  'primer-properties': PrimerPropertiesPayload
  preferences: Record<string, never>
}

export function hybridWindowKindFromUrl(search = window.location.search): HybridWindowKind | null {
  try {
    const value = new URLSearchParams(search).get(QUERY_KEY)
    if (!value) return null
    return value in HYBRID_WINDOW_SPECS ? (value as HybridWindowKind) : null
  } catch {
    return null
  }
}

export function isHybridWindowRuntime(): boolean {
  return hybridWindowKindFromUrl() != null
}

function payloadKey(kind: HybridWindowKind): string {
  return `${PAYLOAD_PREFIX}${kind}`
}

export function writeHybridPayload<K extends HybridWindowKind>(
  kind: K,
  payload: HybridWindowPayloadMap[K],
): void {
  try {
    window.localStorage.setItem(payloadKey(kind), JSON.stringify(payload ?? {}))
  } catch {
    // ignore quota / private mode
  }
}

export async function notifyHybridPayloadUpdated(kind: HybridWindowKind): Promise<void> {
  if (!isTauriRuntime()) return
  try {
    const { WebviewWindow } = await import('@tauri-apps/api/webviewWindow')
    const existing = await WebviewWindow.getByLabel(HYBRID_WINDOW_SPECS[kind].label)
    if (!existing) return
    await existing.emit('vg-hybrid-payload-updated', { kind })
  } catch {
    // Window may be closed.
  }
}

export function readHybridPayload<K extends HybridWindowKind>(kind: K): HybridWindowPayloadMap[K] | null {
  try {
    const raw = window.localStorage.getItem(payloadKey(kind))
    if (!raw) return null
    return JSON.parse(raw) as HybridWindowPayloadMap[K]
  } catch {
    return null
  }
}

export function readPrimerPropertiesPayload(): PrimerPropertiesPayload | null {
  const payload = readHybridPayload('primer-properties')
  if (!payload || typeof payload.sequence !== 'string') return null
  const bindings = Array.isArray(payload.bindings) ? payload.bindings : undefined
  const preferredStrand =
    payload.preferredStrand === 'forward' || payload.preferredStrand === 'reverse'
      ? payload.preferredStrand
      : undefined
  return {
    name: typeof payload.name === 'string' && payload.name.trim() ? payload.name : 'Primer',
    sequence: payload.sequence,
    color: typeof payload.color === 'string' ? payload.color : undefined,
    description: typeof payload.description === 'string' ? payload.description : undefined,
    templateSequence:
      typeof payload.templateSequence === 'string' && payload.templateSequence.trim()
        ? payload.templateSequence
        : undefined,
    preferredStrand,
    bindings,
  }
}

export function clearHybridPayload(kind: HybridWindowKind): void {
  try {
    window.localStorage.removeItem(payloadKey(kind))
  } catch {
    // ignore
  }
}

/**
 * End one Database construct-picker session without disturbing a newer picker request.
 * The Database window remains open and returns to its normal browsing mode.
 */
export async function cancelDatabaseConstructPick(requestId: string): Promise<boolean> {
  const payload = readHybridPayload('database')
  if (payload?.constructPick?.requestId !== requestId) return false

  writeHybridPayload('database', {
    ...payload,
    constructPick: null,
  })
  await notifyHybridPayloadUpdated('database')
  try {
    await emitHybridResult({
      kind: 'database',
      type: 'construct-pick-cancelled',
      requestId,
    })
  } catch {
    // The requesting editor may already be closing; the persisted mode is still cleared.
  }
  return true
}

/**
 * Finish a construct-picker selection.  This is intentionally distinct from
 * cancellation: the caller has already sent the selected project to the
 * requesting editor, so closing the temporary Database window must not run
 * the normal Database-close flow (or send a competing cancellation event).
 */
export async function completeDatabaseConstructPick(requestId: string): Promise<boolean> {
  const payload = readHybridPayload('database')
  if (payload?.constructPick?.requestId !== requestId) return false

  clearHybridPayload('database')
  try {
    await closeCurrentHybridWindow('database')
  } catch {
    // The requesting editor already received the selection. The picker window
    // may have been closed by the OS at the same time, which needs no retry.
  }
  return true
}

function hybridUrl(kind: HybridWindowKind): string {
  const url = new URL(window.location.href)
  url.search = ''
  url.hash = ''
  url.searchParams.set(QUERY_KEY, kind)
  // Keep pathname + origin; drop unrelated query.
  return `${url.pathname}?${url.searchParams.toString()}`
}

/**
 * Open a hybrid window in Tauri, or return false so the caller can fall back to an in-app modal.
 * If the window already exists, focus it and refresh its payload.
 */
export async function openOrFocusHybridWindow<K extends HybridWindowKind>(
  kind: K,
  payload?: HybridWindowPayloadMap[K],
  options?: { isCancelled?: () => boolean },
): Promise<boolean> {
  if (!isTauriRuntime() || options?.isCancelled?.()) return false
  const { invoke } = await import('@tauri-apps/api/core')
  await invoke('begin_user_window_open')
  try {
    return await openOrFocusHybridWindowUnderGate(kind, payload, options)
  } finally {
    await invoke('end_user_window_open')
  }
}

async function openOrFocusHybridWindowUnderGate<K extends HybridWindowKind>(
  kind: K,
  payload?: HybridWindowPayloadMap[K],
  options?: { isCancelled?: () => boolean },
): Promise<boolean> {

  writeHybridPayload(kind, (payload ?? {}) as HybridWindowPayloadMap[K])

  const spec = HYBRID_WINDOW_SPECS[kind]
  const { WebviewWindow } = await import('@tauri-apps/api/webviewWindow')
  if (options?.isCancelled?.()) return false
  const existing = await WebviewWindow.getByLabel(spec.label)
  if (existing) {
    if (options?.isCancelled?.()) return false
    try {
      await existing.show()
      await existing.setFocus()
      await existing.emit('vg-hybrid-payload-updated', { kind })
    } catch {
      // Window may be closing; create a fresh one below.
    }
    const stillThere = await WebviewWindow.getByLabel(spec.label)
    if (stillThere) return !options?.isCancelled?.()
  }

  if (options?.isCancelled?.()) return false

  const lockOuterSize = spec.resizable === false && !spec.fitToContent
  const preferredSize =
    kind === 'database'
      ? readDatabaseWindowSize(
          { width: spec.width, height: spec.height },
          { width: spec.minWidth ?? 640, height: spec.minHeight ?? 420 },
        )
      : { width: spec.width, height: spec.height }
  const webview = new WebviewWindow(spec.label, {
    backgroundThrottling: 'disabled' as BackgroundThrottlingPolicy,
    url: hybridUrl(kind),
    title: spec.title,
    width: preferredSize.width,
    height: preferredSize.height,
    minWidth: spec.minWidth,
    minHeight: spec.minHeight,
    maxWidth: lockOuterSize ? preferredSize.width : undefined,
    maxHeight: lockOuterSize ? preferredSize.height : undefined,
    focus: true,
    resizable: spec.resizable !== false,
    center: true,
    // Required for OS file drops (HTML5 onDrop does not receive Finder/Explorer files).
    dragDropEnabled: true,
  })

  await new Promise<void>((resolve, reject) => {
    const onCreated = () => resolve()
    const onError = (event: { payload: unknown }) => {
      reject(new Error(typeof event.payload === 'string' ? event.payload : 'Failed to create hybrid window'))
    }
    void webview.once('tauri://created', onCreated)
    void webview.once('tauri://error', onError)
  })

  if (options?.isCancelled?.()) {
    try {
      await destroyDesktopWindowSafely(webview)
    } catch {
      // It may already have been closed while creation completed.
    }
    return false
  }

  return true
}

export async function emitHybridResult(result: HybridWindowResult): Promise<void> {
  if (!isTauriRuntime()) return
  const { emit } = await import('@tauri-apps/api/event')
  await emit(RESULT_EVENT, result)
}

const DATABASE_PROJECTS_DRAG_EVENT = 'vg-database-projects-dragged'
const DATABASE_PRIMERS_DRAG_EVENT = 'vg-database-primers-dragged'

export async function emitDatabaseProjectsDrag(projectIds: readonly string[]): Promise<void> {
  if (!isTauriRuntime()) return
  const { emit } = await import('@tauri-apps/api/event')
  await emit(DATABASE_PROJECTS_DRAG_EVENT, { projectIds: [...projectIds] })
}

export async function emitDatabasePrimersDrag(primers: readonly import('../domain/libraryPrimer').LibraryPrimer[]): Promise<void> {
  if (!isTauriRuntime()) return
  const { emit } = await import('@tauri-apps/api/event')
  await emit(DATABASE_PRIMERS_DRAG_EVENT, { primers })
}

export async function subscribeDatabaseProjectsDrag(
  handler: (projectIds: string[]) => void | Promise<void>,
): Promise<() => void> {
  if (!isTauriRuntime()) return () => {}
  const { listen } = await import('@tauri-apps/api/event')
  return listen<{ projectIds?: unknown }>(DATABASE_PROJECTS_DRAG_EVENT, (event) => {
    const projectIds = Array.isArray(event.payload?.projectIds)
      ? event.payload.projectIds.filter((id): id is string => typeof id === 'string' && id.trim().length > 0)
      : []
    if (projectIds.length) void handler(projectIds)
  })
}

export async function subscribeDatabasePrimersDrag(
  handler: (primers: import('../domain/libraryPrimer').LibraryPrimer[]) => void | Promise<void>,
): Promise<() => void> {
  if (!isTauriRuntime()) return () => {}
  const { listen } = await import('@tauri-apps/api/event')
  return listen<{ primers?: unknown }>(DATABASE_PRIMERS_DRAG_EVENT, (event) => {
    if (!Array.isArray(event.payload?.primers)) return
    const primers = event.payload.primers.filter((primer): primer is import('../domain/libraryPrimer').LibraryPrimer => (
      Boolean(primer)
      && typeof primer.name === 'string'
      && typeof primer.sequence === 'string'
      && primer.name.trim().length > 0
      && primer.sequence.trim().length > 0
    ))
    if (primers.length) void handler(primers)
  })
}

export async function subscribeHybridResults(
  handler: (result: HybridWindowResult) => void | Promise<void>,
): Promise<() => void> {
  if (!isTauriRuntime()) return () => {}
  const { listen } = await import('@tauri-apps/api/event')
  return listen<HybridWindowResult>(RESULT_EVENT, (event) => {
    void handler(event.payload)
  })
}

export async function closeCurrentHybridWindow(kind?: HybridWindowKind): Promise<void> {
  if (!isTauriRuntime()) {
    window.close()
    return
  }

  const hybridLabels = new Set(Object.values(HYBRID_WINDOW_SPECS).map((spec) => spec.label))
  const { WebviewWindow } = await import('@tauri-apps/api/webviewWindow')

  const destroyLabeled = async (label: string): Promise<boolean> => {
    if (!hybridLabels.has(label)) return false
    const win = await WebviewWindow.getByLabel(label)
    if (!win) return false
    await destroyDesktopWindowSafely(win)
    return true
  }

  if (kind && (await destroyLabeled(HYBRID_WINDOW_SPECS[kind].label))) return

  const { getCurrentWindow } = await import('@tauri-apps/api/window')
  const current = getCurrentWindow()
  // Never close the workspace/main window from a hybrid dialog Close button.
  if (hybridLabels.has(current.label)) {
    await destroyDesktopWindowSafely(current)
  }
}

function measureContentSize(el: HTMLElement): { width: number; height: number } {
  const rect = el.getBoundingClientRect()
  return {
    width: Math.max(el.offsetWidth, el.scrollWidth, Math.ceil(rect.width)),
    height: Math.max(el.offsetHeight, el.scrollHeight, Math.ceil(rect.height)),
  }
}

/**
 * Resize the current hybrid window so its inner size fits `el` tightly.
 * When `lockSize` is true, min/max are set to the fitted size (non-resizable feel).
 */
export async function fitCurrentHybridWindowToContent(
  el: HTMLElement,
  options?: { lockSize?: boolean },
): Promise<{ width: number; height: number } | null> {
  if (!isTauriRuntime()) return null

  const { getCurrentWindow, LogicalSize } = await import('@tauri-apps/api/window')
  const win = getCurrentWindow()

  // Clear create-time constraints so we can shrink or grow.
  await win.setMinSize(null)
  await win.setMaxSize(null)

  const rect = el.getBoundingClientRect()
  const measured = measureContentSize(el)
  // 2px slack is enough for logical↔physical rounding without an empty strip.
  const pad = 2
  const width = Math.max(280, Math.ceil(measured.width + pad))
  let height = Math.max(160, Math.ceil(rect.top + measured.height + pad))
  let next = new LogicalSize(width, height)
  await win.setSize(next)

  // After the OS applies the size, correct any remaining overflow or excess.
  await new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
  })
  const bottom = el.getBoundingClientRect().bottom
  const overflow = Math.ceil(bottom - window.innerHeight)
  if (overflow > 0) {
    height += overflow + pad
    next = new LogicalSize(width, height)
    await win.setSize(next)
  } else if (overflow < -pad) {
    // Shrink toward content so we don't leave a large empty margin.
    height = Math.max(160, height + overflow + pad)
    next = new LogicalSize(width, height)
    await win.setSize(next)
  }

  if (options?.lockSize) {
    await win.setMinSize(next)
    await win.setMaxSize(next)
  }

  return { width: next.width, height: next.height }
}

export async function subscribeHybridPayloadUpdates(
  kind: HybridWindowKind,
  handler: () => void | Promise<void>,
): Promise<() => void> {
  if (!isTauriRuntime()) return () => {}
  const { listen } = await import('@tauri-apps/api/event')
  return listen<{ kind: HybridWindowKind }>('vg-hybrid-payload-updated', (event) => {
    if (event.payload?.kind === kind) void handler()
  })
}

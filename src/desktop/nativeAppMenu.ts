import { isTauriRuntime } from './tauriRuntime'
import { isTraceDocumentMutationAction } from './traceDocument'
import { isWorkspaceWindowLabel } from './workspaceWindows'
import {
  nativeSaveSnapGeneMenuLabel,
  nativeSaveToMenuLabel,
} from '../domain/projectSaveSemantics'
import { getKeyboardShortcut, toTauriAccelerator } from './keyboardShortcuts'
import type {
  NativeAppMenuAction as ProtocolNativeAppMenuAction,
  NativeAppMenuEnabledState as ProtocolNativeAppMenuEnabledState,
} from '../application/ports/nativeMenu'
import type { NativeAppMenuRecentSummary as ProtocolNativeAppMenuRecentSummary } from '../application/ports/lifecycle'
export type { NativeAppMenuAction, NativeAppMenuEnabledState } from '../application/ports/nativeMenu'
export type { NativeAppMenuRecentSummary } from '../application/ports/lifecycle'
type NativeAppMenuAction = ProtocolNativeAppMenuAction
type NativeAppMenuEnabledState = ProtocolNativeAppMenuEnabledState

type SubmenuHandle = {
  items(): Promise<unknown[]>
  removeAt(position: number): Promise<unknown>
  append(items: unknown): Promise<void>
  setEnabled(enabled: boolean): Promise<void>
}

let recentSubmenuHandle: SubmenuHandle | null = null
let draftsSubmenuHandle: SubmenuHandle | null = null
let lastDraftSummaries: NativeAppMenuDraftSummary[] = []
let lastRecentSummaries: NativeAppMenuRecentSummary[] = []

export type NativeAppMenuDraftSummary = {
  name: string
  updatedAt: string
}

type NativeAppMenuRecentSummary = ProtocolNativeAppMenuRecentSummary

type MenuItemHandle = {
  setEnabled(enabled: boolean): Promise<void>
  setText?(text: string): Promise<void>
  setChecked?(checked: boolean): Promise<void>
}

const handles = new Map<string, MenuItemHandle>()
let installed = false
let lastDispatch: ((action: NativeAppMenuAction) => void) | null = null
let installGeneration = 0

const NATIVE_MENU_ACTION_EVENT = 'vg-native-menu-action'
const LAST_FOCUSED_WORKSPACE_KEY = 'vg-last-focused-workspace'

export function isMacOsDesktop(): boolean {
  if (!isTauriRuntime()) return false
  const platform = navigator.platform || ''
  const ua = navigator.userAgent || ''
  return /Mac|iPhone|iPad|iPod/i.test(platform) || ua.includes('Mac OS X')
}

export function isNativeDesktopApp(): boolean {
  return isTauriRuntime()
}

function actionOf(id: string): NativeAppMenuAction {
  return id as NativeAppMenuAction
}

/** Remember which document window the user last focused (shared across webviews). */
export async function rememberFocusedWorkspaceWindow(): Promise<void> {
  if (!isNativeDesktopApp()) return
  try {
    const { getCurrentWindow } = await import('@tauri-apps/api/window')
    const win = getCurrentWindow()
    if (!isWorkspaceWindowLabel(win.label)) return
    if (!(await win.isFocused())) return
    localStorage.setItem(LAST_FOCUSED_WORKSPACE_KEY, win.label)
  } catch {
    // ignore
  }
}

async function emitMenuActionToWindow(label: string, action: NativeAppMenuAction): Promise<void> {
  const { emitTo } = await import('@tauri-apps/api/event')
  // Window.emit() broadcasts to every webview. Menu actions must hit one document only.
  await emitTo(label, NATIVE_MENU_ACTION_EVENT, { action })
}

/**
 * Send a menu action to the focused workspace window (or the last one the user
 * focused). Each document window is a separate webview; binding clicks to
 * `lastDispatch` in the window that last built the menu sends Actions
 * (e.g. Delete Fragment) to the wrong construct after a product window opens.
 */
async function routeMenuAction(action: NativeAppMenuAction): Promise<void> {
  // Hybrid-capable / new-file actions never depend on a workspace webview.
  try {
    const { tryHandleGlobalStandaloneMenuAction } = await import('./globalMenuActions')
    if (await tryHandleGlobalStandaloneMenuAction(action)) return
  } catch {
    // Fall through to workspace routing / lastDispatch.
  }

  try {
    const { getAllWindows } = await import('@tauri-apps/api/window')
    const windows = await getAllWindows()
    const workspaceWindows = windows.filter((win) => isWorkspaceWindowLabel(win.label))

    const focusedDatabaseWindow = windows.find((win) => win.label === 'hybrid-database')
    const { shouldOpenFileInNewWorkspaceFromWindow } = await import('./globalMenuActions')
    if (
      focusedDatabaseWindow &&
      shouldOpenFileInNewWorkspaceFromWindow(action, focusedDatabaseWindow.label) &&
      await focusedDatabaseWindow.isFocused()
    ) {
      try {
        const { pickAndOpenSequenceFileInNewWorkspaceWindow } = await import('./newFileActions')
        await pickAndOpenSequenceFileInNewWorkspaceWindow()
      } catch (error) {
        console.error('Could not open sequence file from Database window', error)
      }
      return
    }

    // Database/startup only: special-case Open; replay other App-owned dialogs
    // in pDemo only when the no-workspace policy explicitly asks for it.
    if (workspaceWindows.length === 0) {
      if (action === 'file.open') {
        // With no App.tsx workspace, use the native picker and raw-file handoff
        // directly. This preserves Database on cancel and avoids a pDemo shell.
        try {
          const { pickAndOpenSequenceFileInNewWorkspaceWindow } = await import('./newFileActions')
          await pickAndOpenSequenceFileInNewWorkspaceWindow()
        } catch (error) {
          console.error('Could not open sequence file from menu', error)
        }
        return
      }
      const {
        getNoWorkspaceMenuActionDisposition,
        openDemoWorkspaceForMenuAction,
      } = await import('./globalMenuActions')
      const disposition = getNoWorkspaceMenuActionDisposition(action)
      if (disposition === 'workspace') {
        await openDemoWorkspaceForMenuAction(action)
        return
      }
      if (disposition === 'global') {
        // Usually the standalone handler above consumed it. This keeps the
        // hybrid owner's process-scoped Quit callback as a fallback.
        lastDispatch?.(action)
        return
      }
      // Disabled actions must not fall through to the hybrid window's dispatch.
      return
    }

    for (const win of workspaceWindows) {
      if (!(await win.isFocused())) continue
      await emitMenuActionToWindow(win.label, action)
      return
    }

    const remembered = localStorage.getItem(LAST_FOCUSED_WORKSPACE_KEY)
    const rememberedWin = remembered
      ? workspaceWindows.find((win) => win.label === remembered)
      : undefined
    if (rememberedWin) {
      await emitMenuActionToWindow(rememberedWin.label, action)
      return
    }

    lastDispatch?.(action)
  } catch {
    lastDispatch?.(action)
  }
}

async function clearSubmenu(submenu: SubmenuHandle) {
  let items = await submenu.items()
  while (items.length > 0) {
    await submenu.removeAt(items.length - 1)
    items = await submenu.items()
  }
}

async function item(
  id: NativeAppMenuAction,
  text: string,
  options?: { accelerator?: string; enabled?: boolean; skipShortcut?: boolean },
) {
  const { MenuItem } = await import('@tauri-apps/api/menu')
  const entry = await MenuItem.new({
    id,
    text,
    enabled: options?.enabled ?? true,
    accelerator: (() => {
      const shortcut = getKeyboardShortcut(id)
      return shortcut && !options?.skipShortcut ? toTauriAccelerator(shortcut) : options?.accelerator
    })(),
    action: (clickedId) => {
      void routeMenuAction(actionOf(clickedId))
    },
  })
  handles.set(id, entry)
  return entry
}

async function checkItem(
  id: NativeAppMenuAction,
  text: string,
  checked: boolean,
  options?: { accelerator?: string; enabled?: boolean; skipShortcut?: boolean },
) {
  const { CheckMenuItem } = await import('@tauri-apps/api/menu')
  const entry = await CheckMenuItem.new({
    id,
    text,
    checked,
    enabled: options?.enabled ?? true,
    accelerator: (() => {
      const shortcut = getKeyboardShortcut(id)
      return shortcut && !options?.skipShortcut ? toTauriAccelerator(shortcut) : options?.accelerator
    })(),
    action: (clickedId) => {
      void routeMenuAction(actionOf(clickedId))
    },
  })
  handles.set(id, entry)
  return entry
}

async function sep() {
  const { PredefinedMenuItem } = await import('@tauri-apps/api/menu')
  return PredefinedMenuItem.new({ item: 'Separator' })
}

/**
 * Invoke `handler` for native menu actions only when this workspace window is focused.
 */
export async function subscribeNativeAppMenuActions(
  handler: (action: NativeAppMenuAction) => void,
): Promise<() => void> {
  if (!isNativeDesktopApp()) return () => {}
  const { getCurrentWindow } = await import('@tauri-apps/api/window')
  const win = getCurrentWindow()
  if (!isWorkspaceWindowLabel(win.label)) return () => {}
  // Listen on this window only. Global event.listen() receives every webview's events.
  return win.listen<{ action: NativeAppMenuAction }>(NATIVE_MENU_ACTION_EVENT, (event) => {
    const action = event.payload?.action
    if (!action) return
    handler(action)
  })
}

/**
 * Keep a living native-menu owner when only hybrid windows (e.g. Database/Library) remain.
 * New-file actions are handled inside `routeMenuAction` before workspace routing; this
 * reclaim ensures MenuItem callbacks still run after the last construct window closes.
 */
export async function installHybridFallbackNativeAppMenu(): Promise<() => void> {
  if (!isNativeDesktopApp()) return () => {}

  let cancelled = false
  let initialMenuInstallInProgress = false
  let unlistenFocus: (() => void) | undefined

  const claim = (initial = false) => {
    if (initial) initialMenuInstallInProgress = true
    void installNativeAppMenu((action) => {
      // Quit is process-scoped and must work when only a hybrid/startup window remains.
      if (action === 'app.quit') {
        void import('./syncOnExit').then(({ quitNativeAppAfterDatabaseSync }) => quitNativeAppAfterDatabaseSync())
      }
    }, { reclaim: true, hybridFallback: true, ...(initial ? { initial: true } : {}) })
      .catch(async (error) => {
        console.error('Could not install startup native menu', error)
        if (!initial) return
        try {
          const { getCurrentWindow } = await import('@tauri-apps/api/window')
          const win = getCurrentWindow()
          await win.show()
          await win.setFocus()
        } catch {
          // Keep the menu failure as the useful diagnostic.
        }
      })
      .finally(() => {
        if (initial) initialMenuInstallInProgress = false
      })
  }

  try {
    const { getCurrentWindow } = await import('@tauri-apps/api/window')
    const win = getCurrentWindow()
    const stopFocus = await win.onFocusChanged(({ payload: focused }) => {
      if (cancelled || !focused || initialMenuInstallInProgress) return
      claim()
    })
    if (cancelled) {
      stopFocus()
      return () => {}
    }
    unlistenFocus = stopFocus
    if (await win.isFocused()) claim()
    else if (!(await win.isVisible())) claim(true)
  } catch {
    claim(true)
  }

  return () => {
    cancelled = true
    unlistenFocus?.()
  }
}

export type InstallNativeAppMenuOptions = {
  /** Rebuild the shared app menu so enable/checked sync belongs to this window. */
  reclaim?: boolean
  isProteinDocument?: boolean
  /** Install only while a focused or initially hidden Database/startup window has no editor peer. */
  hybridFallback?: boolean
  /** Allow a newly-created hidden window to install its menu before it is shown. */
  initial?: boolean
}

/**
 * Install the VibeGene native application menu (replaces File/Edit/View/Window/Help defaults).
 * Workspace windows reclaim on focus. Database/startup may install the fallback
 * owner when no construct workspace remains.
 */
export async function installNativeAppMenu(
  dispatch: (action: NativeAppMenuAction) => void,
  options?: InstallNativeAppMenuOptions,
): Promise<void> {
  if (!isNativeDesktopApp()) return
  // Do not tear down a workspace owner's menu state if a Database window
  // briefly receives focus while an editor still exists.
  let showInitialWindow: (() => Promise<void>) | undefined
  if (options?.hybridFallback) {
    try {
      const { getCurrentWindow, getAllWindows } = await import('@tauri-apps/api/window')
      const win = getCurrentWindow()
      const focused = await win.isFocused()
      const visible = await win.isVisible()
      const installBeforeShow = options.initial === true && !visible
      if (
        (win.label !== 'hybrid-database' && win.label !== 'hybrid-startup') ||
        (!focused && !installBeforeShow)
      ) return
      const windows = await getAllWindows()
      if (windows.some((candidate) => isWorkspaceWindowLabel(candidate.label))) return
      if (installBeforeShow) showInitialWindow = async () => {
        await win.show()
        await win.setFocus()
      }
    } catch {
      return
    }
  }
  const generation = ++installGeneration
  lastDispatch = dispatch
  if (options?.reclaim) {
    installed = false
    handles.clear()
    recentSubmenuHandle = null
    draftsSubmenuHandle = null
  }
  if (installed) return
  lastDispatch = dispatch

  const { Menu, Submenu, PredefinedMenuItem } = await import('@tauri-apps/api/menu')
  const protein = options?.isProteinDocument ?? false
  const mac = isMacOsDesktop()

  const appMenu = mac ? await Submenu.new({
    text: 'VibeGene',
    items: [
      await item('app.about', 'About VibeGene'),
      await sep(),
      await item('app.whats-new', "What's New…"),
      await sep(),
      await item('file.preferences', 'Preferences…'),
      await sep(),
      await PredefinedMenuItem.new({ item: 'Services' }),
      await sep(),
      await PredefinedMenuItem.new({ item: 'Hide' }),
      await PredefinedMenuItem.new({ item: 'HideOthers' }),
      await PredefinedMenuItem.new({ item: 'ShowAll' }),
      await sep(),
      await item('app.quit', 'Quit VibeGene', { accelerator: 'CmdOrCtrl+Q' }),
    ],
  }) : null

  const recentMenu = await Submenu.new({
    text: 'Open Recent',
    items: [],
  })
  recentSubmenuHandle = recentMenu

  const draftsMenu = await Submenu.new({
    text: 'Drafts',
    items: [],
  })
  draftsSubmenuHandle = draftsMenu

  const fileMenu = await Submenu.new({
    text: 'File',
    items: [
      await item('file.open', 'Open…', { accelerator: 'CmdOrCtrl+O' }),
      recentMenu,
      await sep(),
      await item('file.save', 'Save', { accelerator: 'CmdOrCtrl+S' }),
      await item('file.save-to', 'Save to…'),
      await item('file.rename', 'Rename file…', { enabled: false }),
      await sep(),
      await item('file.new-dna', 'New DNA file…'),
      await item('file.new-dna-library', 'New DNA library…'),
      await item('file.convert-to-library', 'Convert to library…', { enabled: false }),
      await item('file.new-protein', 'New Protein file…'),
      await item('file.import-database', 'Import from Sequence Database…', { accelerator: 'Shift+CmdOrCtrl+O' }),
      await item('file.new-from-selection', 'New file from selection', { enabled: false }),
      await sep(),
      draftsMenu,
      await sep(),
      await item('file.save-dna', protein ? 'Save as SnapGene .prot file' : 'Save as SnapGene .dna file'),
      await item('file.save-genbank', protein ? 'Save as GenPept file' : 'Save as GenBank (.gb)'),
      await item('file.save-fasta', protein ? 'Save protein FASTA (.fasta)' : 'Save as FASTA (.fasta)'),
      await sep(),
      await item('file.database', 'Database…'),
      ...(mac ? [] : [await item('file.preferences', 'Preferences…')]),
      await item('file.new-window', 'New window'),
      await sep(),
      await PredefinedMenuItem.new({ item: 'CloseWindow' }),
      ...(mac ? [] : [await sep(), await item('app.quit', 'Quit', { accelerator: 'CmdOrCtrl+Q' })]),
    ],
  })

  const editMenu = await Submenu.new({
    text: 'Edit',
    items: [
      await item('edit.undo', 'Undo', { accelerator: 'CmdOrCtrl+Z', enabled: false }),
      await item('edit.redo', 'Redo', { accelerator: 'Shift+CmdOrCtrl+Z', enabled: false }),
      await sep(),
      // Standard edit commands so Cmd/Ctrl+C/V/X/A work in inputs (e.g. Primer Properties).
      await PredefinedMenuItem.new({ item: 'Cut' }),
      await PredefinedMenuItem.new({ item: 'Copy' }),
      await PredefinedMenuItem.new({ item: 'Paste' }),
      await PredefinedMenuItem.new({ item: 'SelectAll' }),
      await sep(),
      ...(protein
        ? [
            await item('edit.copy-top', 'Copy amino-acid sequence', { enabled: false }),
            await item('edit.copy-translation', 'Copy selection as FASTA', { enabled: false }),
          ]
        : [
            await item('edit.copy-top', "Copy top strand", { enabled: false }),
            await item('edit.copy-bottom-53', "Copy bottom strand 5'→3'", { enabled: false }),
            await item('edit.copy-bottom-35', "Copy bottom strand 3'→5'", { enabled: false }),
            await item('edit.copy-translation', 'Copy translation', { enabled: false }),
          ]),
      await sep(),
      await item('edit.select-range', 'Select range…'),
      await item('edit.invert-selection', 'Invert selection', { enabled: false }),
      await sep(),
      await item('edit.uppercase', 'Make uppercase', { enabled: false }),
      await item('edit.lowercase', 'Make lowercase', { enabled: false }),
      ...(protein ? [] : [
        await item('edit.crop-library', 'Crop library', { enabled: false }),
        await item('edit.set-dna-color', 'Set DNA color'),
        await sep(),
        await item('edit.toggle-topology', 'Linearize at origin'),
        await item('edit.flip-sequence', 'Flip sequence'),
        await item('edit.edit-dna-ends', 'Edit DNA ends', { enabled: false }),
        await item('edit.set-origin-caret', 'Set origin to caret', { enabled: false }),
      ]),
    ],
  })

  const viewMenu = await Submenu.new({
    text: 'View',
    items: [
      await checkItem('view.tab.map', 'Map', true),
      await checkItem('view.tab.sequence', 'Sequence', false),
      ...(protein ? [await checkItem('view.tab.properties', 'Properties', false)] : [await checkItem('view.tab.enzymes', 'Enzymes', false)]),
      await checkItem('view.tab.features', 'Features', false),
      ...(protein ? [] : [await checkItem('view.tab.primers', 'Primers', false)]),
      await checkItem('view.tab.history', 'History', false, { skipShortcut: protein }),
      await sep(),
      await item('view.edit-map-label', 'Edit map label…'),
      await checkItem('view.toggle-alignments', protein ? 'Show comparative alignments' : 'Show alignments', false),
      await checkItem('view.toggle-description', 'Description panel', true),
      ...(protein ? [
        await sep(),
        await checkItem('view.toggle-features', 'Show features', true),
        await checkItem('view.toggle-feature-labels', 'Show feature labels', true),
        await checkItem('view.toggle-protein-colors', 'Amino-acid colors', true),
        await checkItem('view.toggle-protein-visual-controls', 'Visual controls', false),
      ] : [await sep(), await item('view.translation-options', 'Translation options…')]),
    ],
  })

  const proteinMenu = await Submenu.new({
    text: 'Protein',
    items: [
      await item('protein.add-feature', 'Add Feature…'),
      await item('protein.add-bond', 'Add Bond…'),
      await sep(),
      await item('protein.mark-variable', 'Mark Selection as Variability', { enabled: false }),
      await item('protein.clear-variable', 'Clear Variability Regions', { enabled: false }),
      await sep(),
      await item('protein.comparative-alignment', 'Comparative Alignment…'),
      await item('protein.properties', 'Protein Properties'),
      await sep(),
      await item('protein.annotate-uniprot-whole', 'Annotate Whole Protein from Databases…'),
      await item('protein.annotate-uniprot-selection', 'Annotate Selection from Databases…', { enabled: false }),
      await sep(),
      await item('protein.annotate-imgt-auto', 'Annotate Auto-detected Binder (IMGT)…'),
      await item('protein.annotate-kabat-auto', 'Annotate Auto-detected Antibody (Kabat)…'),
    ],
  })

  const enzymesMenu = await Submenu.new({
    text: 'Enzymes',
    items: [
      await item('enzymes.choose', 'Choose Enzymes…', { accelerator: 'CmdOrCtrl+E' }),
      await sep(),
      await item('enzymes.set.all', 'All Commercial'),
      await item('enzymes.set.nonredundant', 'Nonredundant Commercial'),
      await item('enzymes.set.type-iis', 'Type IIS'),
      await item('enzymes.set.unique', 'Unique Cutters'),
      await item('enzymes.set.unique-dual', 'Unique & Dual Cutters'),
      await item('enzymes.set.six-plus', '6+ Cutters'),
      await item('enzymes.set.unique-six-plus', 'Unique 6+ Cutters'),
      await sep(),
      await item('enzymes.toggle-visibility', 'Hide Enzymes'),
      await sep(),
      await item('enzymes.save-set', 'Save Enzyme Set…', { enabled: false }),
      await item('enzymes.export-set', 'Export Enzyme Set…', { enabled: false }),
      await item('enzymes.manage-sets', 'Manage Enzyme Sets…'),
      await item('enzymes.priorities', 'Enzyme priorities…'),
      await sep(),
      await item('enzymes.noncutters', 'Noncutters'),
      await sep(),
      await item('enzymes.restriction-tab', 'Restriction Enzymes'),
      await item('enzymes.database', 'Enzyme Database', { accelerator: 'Shift+CmdOrCtrl+E' }),
    ],
  })

  const featuresMenu = await Submenu.new({
    text: 'Features',
    items: [
      await item('features.add', 'Add Feature…', { accelerator: 'CmdOrCtrl+T' }),
      await item('features.edit', 'Edit Features…', { enabled: false }),
      await item('features.duplicate', 'Duplicate Feature…', {
        accelerator: 'Shift+CmdOrCtrl+T',
        enabled: false,
      }),
      await item('features.remove', 'Remove Features', { enabled: false }),
      await sep(),
      await item('features.create-segment', 'Create Feature Segment…', { enabled: false }),
      await item('features.delete-segment', 'Delete Feature Segment…', { enabled: false }),
      await item('features.merge-segments', 'Merge Feature Segments…', { enabled: false }),
      await item('features.merge', 'Merge Features…', { enabled: false }),
      await sep(),
      ...(protein ? [
        await item('features.add-bond', 'Add Bond…'),
      ] : [
        await item('features.add-cleavage', 'Add Cleavage Site…'),
        await item('features.remove-cleavage', 'Remove Cleavage Sites…', { enabled: false }),
      ]),
      await sep(),
      await item('features.color', 'Feature Color…', { enabled: false }),
      await sep(),
      await item('features.show-selected', 'Show Selected Features', { enabled: false }),
      await item('features.hide-selected', 'Hide Selected Features', { enabled: false }),
      await sep(),
      await item('features.import-file', 'Import Features from Another File…'),
      await item('features.export-data', 'Export Feature Data…', { enabled: false }),
      ...(protein ? [] : [
        await item('features.splice-introns', 'Splice to Remove Introns…', { enabled: false }),
        await sep(),
        await item('features.annotate-databases-whole', 'Annotate Whole Sequence from Databases…'),
        await item('features.annotate-databases-selection', 'Annotate Selection from Databases…', { enabled: false }),
        await item('features.annotate-translated-orfs', 'Annotate Translated ORFs in Whole Sequence…'),
        await item('features.annotate-translated-orfs-selection', 'Annotate Translated ORFs in Selection…', { enabled: false }),
        await item('features.detect-common', 'Detect Common Features…'),
        await item('features.add-to-common', 'Add to Common Features…', { enabled: false }),
        await item('features.browse-common', 'Browse Common Features'),
      ]),
    ],
  })

  const { listCommonPrimers } = await import('../storage/commonPrimers')
  const { collectTagsAmongCommonPrimers, loadPrimerTagMap } = await import('../storage/databasePrimers')
  const [commonLibrary, primerTagMap] = await Promise.all([listCommonPrimers(), loadPrimerTagMap()])
  const commonDetectTags = collectTagsAmongCommonPrimers(commonLibrary, primerTagMap)
  const detectCommonPrimersMenu = await Submenu.new({
    text: 'Detect Common Primers',
    items: [
      await item('primers.detect-common', 'All'),
      ...(commonDetectTags.length
        ? [
            await sep(),
            ...(await Promise.all(
              commonDetectTags.map((tag) =>
                item(`primers.detect-common.tag:${tag}` as NativeAppMenuAction, tag),
              ),
            )),
          ]
        : []),
    ],
  })

  const primersMenu = await Submenu.new({
    text: 'Primers',
    items: [
      await item('primers.add', 'Add Primer…'),
      await item('primers.pick', 'Pick Primers…', { enabled: false }),
      await item('primers.edit', 'Edit Primers…', { enabled: false }),
      await item('primers.duplicate', 'Duplicate Primer…', { enabled: false }),
      await item('primers.remove', 'Remove Primers', { enabled: false }),
      await sep(),
      await item('primers.color', 'Primer Color…', { enabled: false }),
      await item('primers.hybridization', 'Hybridization Parameters…'),
      await sep(),
      await item('primers.show-selected', 'Show Selected Primers', { enabled: false }),
      await item('primers.hide-selected', 'Hide Selected Primers', { enabled: false }),
      await sep(),
      await item('primers.import-file', 'Import Primers from Another File…'),
      await item('primers.import-list', 'Import Primers from a List…'),
      await sep(),
      detectCommonPrimersMenu,
      await item('primers.add-to-common', 'Add to Common Primers…', { enabled: false }),
      await sep(),
      await item('primers.export', 'Export Selected Primers…', { enabled: false }),
    ],
  })

  const crisprMenu = await Submenu.new({
    text: 'CRISPR',
    items: [
      await item('crispr.detect', 'Detect CRISPR…'),
      await sep(),
      await item('crispr.add-sgrna', 'Add sgRNA…'),
      await item('crispr.design-sgrna', 'Design sgRNA…'),
      await item('crispr.clone-sgrna', 'Clone sgRNA…', { enabled: false }),
      await item('crispr.excise-region', 'Excise Region…', { enabled: false }),
      await item('crispr.sanger-alleles', 'Alleles from Sanger Data…'),
      await sep(),
      await item('crispr.export-sgrnas', 'Export sgRNAs…', { enabled: false }),
    ],
  })

  const gibsonMenu = await Submenu.new({
    text: 'Gibson-style assembly',
    items: [
      await item('actions.gibson.classic', 'Classic Gibson'),
      await item('actions.gibson.nebuilder', 'NEBuilder HiFi'),
      await item('actions.gibson.infusion', 'In-Fusion'),
    ],
  })
  const tagcMenu = await Submenu.new({
    text: 'AT/GC cloning',
    items: [
      await item('actions.tagc.ta', 'TA Cloning'),
      await item('actions.tagc.gc', 'GC Cloning'),
    ],
  })
  const gatewayMenu = await Submenu.new({
    text: 'Gateway cloning',
    items: [
      await item('actions.gateway.bp', 'BP Cloning'),
      await item('actions.gateway.lr', 'LR Cloning'),
    ],
  })

  const actionsMenu = await Submenu.new({
    text: 'Actions',
    items: [
      await item('actions.restriction-cloning', 'Restriction Cloning…'),
      await item('actions.delete-fragment', 'Delete Restriction Fragment…'),
      await item('actions.destroy-site', 'Destroy Restriction Site…'),
      await item('actions.linear-ligation', 'Linear Ligation…'),
      gibsonMenu,
      tagcMenu,
      gatewayMenu,
      await item('actions.pcr', 'PCR…'),
      await item('actions.mutagenesis', 'Mutagenesis…'),
    ],
  })

  const toolsMenu = await Submenu.new({
    text: 'Tools',
    items: [
      ...(protein ? [await item('tools.protein-properties', 'Protein properties')] : [
        await item('tools.agarose-gel', 'Simulate DNA gel'),
        await item('tools.dna-mw', 'Show DNA molecular weight'),
      ]),
      await item('tools.letter-codes', 'Letter codes'),
      ...(protein ? [] : [await item('tools.genetic-code', 'Genetic code tables')]),
    ],
  })

  const settingsMenu = await Submenu.new({
    text: 'Settings',
    items: [
      await item('settings.download', 'Download settings file'),
      await item('settings.load', 'Load settings file…'),
    ],
  })

  const windowMenu = await Submenu.new({
    text: 'Window',
    items: [
      await PredefinedMenuItem.new({ item: 'Minimize' }),
      await PredefinedMenuItem.new({ item: 'Maximize' }),
      await PredefinedMenuItem.new({ item: 'Fullscreen' }),
      await sep(),
      await PredefinedMenuItem.new({ item: 'CloseWindow' }),
    ],
  })

  const helpMenu = await Submenu.new({
    text: 'Help',
    items: [
      await item('help.check-updates', 'Check for Updates…'),
      await sep(),
      await item('help.dna-library-format', '.dna library format'),
      await item('help.history-derived-workflows', 'Recipes & gels from History'),
      await item('help.database', 'Database'),
      await item('help.crispr-workflow', 'CRISPR workflow'),
      await item('help.alignments', 'Trace & MSA alignments'),
      await item('help.keyboard-shortcuts', 'Keyboard Shortcuts…'),
      await item('help.about', 'About…'),
      await item('help.report-bug', 'Report a bug…'),
      await item('help.source-code', 'Source code on GitHub'),
      await item('help.telegram-group', 'Telegram group'),
      await item('help.support', 'Support…'),
    ],
  })

  const menu = await Menu.new({
    items: [
      ...(appMenu ? [appMenu] : []),
      fileMenu,
      editMenu,
      viewMenu,
      ...(protein ? [proteinMenu] : [enzymesMenu]),
      featuresMenu,
      ...(protein ? [] : [primersMenu, crisprMenu, actionsMenu]),
      toolsMenu,
      settingsMenu,
      windowMenu,
      helpMenu,
    ],
  })
  // Menu construction is asynchronous. Discard an older DNA/protein build if a
  // newer document state requested another menu while this one was being built.
  if (generation !== installGeneration) return
  let hybridFallbackOwner = false
  try {
    const { getCurrentWindow } = await import('@tauri-apps/api/window')
    const win = getCurrentWindow()
    const focused = await win.isFocused()
    const visible = await win.isVisible()
    const installBeforeShow = options?.initial === true && !visible
    if (installBeforeShow) showInitialWindow = async () => {
      await win.show()
      await win.setFocus()
    }
    if (isWorkspaceWindowLabel(win.label)) {
      // macOS has one process-wide app menu. An unfocused document must never
      // overwrite the menu owned by the focused DNA/protein workspace.
      if (!focused && !installBeforeShow) return
    } else if (options?.hybridFallback && (win.label === 'hybrid-database' || win.label === 'hybrid-startup')) {
      if (!focused && !installBeforeShow) return
      const { getAllWindows } = await import('@tauri-apps/api/window')
      const windows = await getAllWindows()
      if (windows.some((candidate) => isWorkspaceWindowLabel(candidate.label))) return
      hybridFallbackOwner = true
    } else {
      return
    }
  } catch {
    return
  }
  await menu.setAsAppMenu()
  // Initial windows stay hidden until their native menu is assigned. Reveal
  // immediately here so later menu-state/database IPC cannot stall startup.
  await showInitialWindow?.()
  installed = true
  document.documentElement.classList.toggle('vg-macos-native-menu', mac)
  document.documentElement.classList.add('vg-native-menu')
  if (hybridFallbackOwner) {
    await syncNativeAppMenuNoWorkspaceAvailability()
    await recentSubmenuHandle?.setEnabled(false)
    await draftsSubmenuHandle?.setEnabled(false)
  }
  await syncNativeAppMenuDrafts(lastDraftSummaries)
  await syncNativeAppMenuRecent(lastRecentSummaries)
}

/** Disable editor-only commands and their native accelerators without a document. */
async function syncNativeAppMenuNoWorkspaceAvailability(): Promise<void> {
  const { getNoWorkspaceMenuActionDisposition } = await import('./globalMenuActions')
  await Promise.all([...handles].map(async ([id, handle]) => {
    await handle.setEnabled(getNoWorkspaceMenuActionDisposition(id) !== 'disabled')
  }))
}

export async function syncNativeAppMenuEnabled(state: NativeAppMenuEnabledState): Promise<void> {
  if (!installed) return
  try {
    const { getCurrentWindow } = await import('@tauri-apps/api/window')
    const win = getCurrentWindow()
    if (!isWorkspaceWindowLabel(win.label)) return
    if (!(await win.isFocused())) return
  } catch {
    return
  }

  const set = async (id: NativeAppMenuAction, enabled: boolean) => {
    const handle = handles.get(id)
    if (handle) await handle.setEnabled(enabled)
  }
  const text = async (id: NativeAppMenuAction, value: string) => {
    const handle = handles.get(id)
    if (handle?.setText) await handle.setText(value)
  }
  const checked = async (id: NativeAppMenuAction, value: boolean) => {
    const handle = handles.get(id)
    if (handle?.setChecked) await handle.setChecked(value)
  }

  await Promise.all([
    set('file.new-from-selection', state.canCreateFromSelection),
    set('file.convert-to-library', state.canConvertToLibrary),
    set('edit.undo', state.canUndo),
    set('edit.redo', state.canRedo),
    set('edit.copy-top', state.canCopySelection),
    set('edit.copy-bottom-53', state.canCopySelection),
    set('edit.copy-bottom-35', state.canCopySelection),
    set('edit.copy-translation', state.isProteinDocument ? state.canCopySelection : state.canCopyTranslation),
    set('edit.select-range', state.hasSequence),
    set('edit.invert-selection', state.canInvertSelection),
    set('edit.crop-library', state.canCropLibrary),
    set('edit.uppercase', state.hasSelection),
    set('edit.lowercase', state.hasSelection),
    set('edit.flip-sequence', state.hasSequence),
    set('edit.edit-dna-ends', state.isLinear && state.hasSequence),
    set('edit.set-origin-caret', state.isCircular && state.hasSequence),
    text('edit.toggle-topology', state.isCircular ? 'Linearize at origin' : 'Circularize'),
    text('enzymes.toggle-visibility', state.enzymesVisible ? 'Hide Enzymes' : 'Show Enzymes'),
    text(
      'file.save-dna',
      nativeSaveSnapGeneMenuLabel(state.workspaceDocumentBinding, state.isProteinDocument ? 'protein' : 'dna'),
    ),
    text('file.save-to', nativeSaveToMenuLabel(state.workspaceDocumentBinding)),
    set('file.rename', state.canRenameFile),
    text(
      'file.save-genbank',
      state.isProteinDocument ? 'Save as GenPept file' : 'Save as GenBank (.gb)',
    ),
    set('enzymes.save-set', state.canSaveEnzymeSet),
    set('enzymes.export-set', state.canSaveEnzymeSet),
    set('features.edit', state.hasFeatureSelected),
    set('crispr.clone-sgrna', Boolean(state.canCloneSgRna)),
    set('crispr.excise-region', Boolean(state.canExciseSgRnaRegion)),
    set('crispr.export-sgrnas', Boolean(state.canExportSgRnas)),
    set('features.duplicate', state.hasFeatureSelected),
    set('features.remove', state.hasFeatureSelected),
    set('features.create-segment', state.hasSelectionRange),
    set('features.delete-segment', state.hasSelectionPoint),
    set('features.merge-segments', state.hasSelectionRange),
    set('features.merge', state.canMergeFeatures),
    set('features.remove-cleavage', state.canRemoveCleavageSite),
    set('features.color', state.hasFeatureSelected),
    set('features.show-selected', state.canShowSelectedFeatures),
    set('features.hide-selected', state.canHideSelectedFeatures),
    set('features.export-data', state.hasFeatureSelected),
    set('features.splice-introns', state.hasFeatureSelected),
    set('features.annotate-databases-selection', state.hasSelectionRange),
    set('features.annotate-translated-orfs-selection', state.hasSelectionRange),
    set('features.add-to-common', state.hasFeatureSelected),
    set('primers.pick', state.hasSelectionRange),
    set('primers.edit', state.hasPrimerSelected),
    set('primers.duplicate', state.hasPrimerSelected),
    set('primers.remove', state.hasPrimerSelected),
    set('primers.color', state.hasPrimerSelected),
    set('primers.show-selected', state.canShowSelectedPrimers),
    set('primers.hide-selected', state.canHideSelectedPrimers),
    set('primers.export', state.hasPrimerSelected),
    set('primers.add-to-common', state.hasPrimerSelected),
    checked('view.tab.map', state.activeTab === 'Map'),
    checked('view.tab.sequence', state.activeTab === 'Sequence'),
    checked('view.tab.properties', state.activeTab === 'Properties'),
    checked('view.tab.enzymes', state.activeTab === 'Enzymes'),
    checked('view.tab.features', state.activeTab === 'Features'),
    checked('view.tab.primers', state.activeTab === 'Primers'),
    checked('view.tab.history', state.activeTab === 'History'),
    checked('view.toggle-alignments', state.alignmentsVisible),
    checked('view.toggle-description', state.descriptionPanelVisible),
    set('view.toggle-description', state.canToggleDescriptionPanel),
    checked('view.toggle-features', state.featuresVisible),
    checked('view.toggle-feature-labels', state.featureLabelsVisible),
    checked('view.toggle-protein-colors', state.proteinColorsVisible),
    checked('view.toggle-protein-visual-controls', state.proteinVisualControlsVisible),
    set('protein.mark-variable', state.hasSelectionRange),
    set('protein.annotate-uniprot-selection', state.hasSelectionRange),
    set('protein.clear-variable', state.hasProteinVariableRegions),
  ])

  if (state.isReadOnlyDocument) {
    await Promise.all([...handles].map(async ([id, handle]) => {
      if (isTraceDocumentMutationAction(id)) await handle.setEnabled(false)
    }))
  }
}

export async function syncNativeAppMenuDrafts(drafts: NativeAppMenuDraftSummary[]): Promise<void> {
  lastDraftSummaries = drafts
  if (!installed || !draftsSubmenuHandle) return
  try {
    const { getCurrentWindow } = await import('@tauri-apps/api/window')
    const win = getCurrentWindow()
    if (!isWorkspaceWindowLabel(win.label)) return
    if (!(await win.isFocused())) return
  } catch {
    return
  }

  await clearSubmenu(draftsSubmenuHandle)
  if (!drafts.length) {
    await draftsSubmenuHandle.setEnabled(false)
    return
  }

  await draftsSubmenuHandle.setEnabled(true)
  for (let index = 0; index < drafts.length; index++) {
    const draft = drafts[index]!
    const date = new Date(draft.updatedAt)
    const when = Number.isNaN(date.getTime()) ? draft.updatedAt : date.toLocaleString()
    const id = `drafts.restore.${index}` as NativeAppMenuAction
    await draftsSubmenuHandle.append(await item(id, `${draft.name} — ${when}`))
  }
}

export async function syncNativeAppMenuRecent(recent: NativeAppMenuRecentSummary[]): Promise<void> {
  lastRecentSummaries = recent
  if (!installed || !recentSubmenuHandle) return
  try {
    const { getCurrentWindow } = await import('@tauri-apps/api/window')
    const win = getCurrentWindow()
    if (!isWorkspaceWindowLabel(win.label)) return
    if (!(await win.isFocused())) return
  } catch {
    return
  }

  await clearSubmenu(recentSubmenuHandle)
  if (!recent.length) {
    await recentSubmenuHandle.setEnabled(false)
    return
  }

  await recentSubmenuHandle.setEnabled(true)
  for (let index = 0; index < recent.length; index++) {
    const entry = recent[index]!
    const prefix = entry.kind === 'database' ? 'Database: ' : ''
    const suffix = entry.detail ? ` — ${entry.detail}` : ''
    const id = `recent.open.${index}` as NativeAppMenuAction
    await recentSubmenuHandle.append(await item(id, `${prefix}${entry.name}${suffix}`))
  }
}

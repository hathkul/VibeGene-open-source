import { openExternalUrl } from './openExternalUrl'
import { SOURCE_REPOSITORY_URL } from '../domain/externalLinks'
import { createStandaloneAgaroseGelPayload, openOrFocusHybridWindow } from './hybridWindows'
import { tryHandleGlobalNewFileMenuAction } from './newFileActions'
import { openWorkspaceWindow } from './workspaceWindow'
import type { NativeAppMenuAction } from './nativeAppMenu'

const KOFI_SUPPORT_URL = 'https://ko-fi.com/vibegene'

/**
 * Menu actions that open hybrid/tool windows or external URLs and do not need
 * a construct workspace webview.
 */
export async function tryHandleGlobalStandaloneMenuAction(action: string): Promise<boolean> {
  if (await tryHandleGlobalNewFileMenuAction(action)) return true

  switch (action) {
    case 'help.check-updates': {
      const { requestDesktopUpdateCheck } = await import('./desktopUpdater')
      await requestDesktopUpdateCheck()
      return true
    }
    case 'help.support':
      await openExternalUrl(KOFI_SUPPORT_URL)
      return true
    case 'help.source-code':
      await openExternalUrl(SOURCE_REPOSITORY_URL)
      return true
    case 'file.preferences':
      await openOrFocusHybridWindow('preferences')
      return true
    case 'file.database':
      await openOrFocusHybridWindow('database', {
        currentRecordId: null,
        alignmentPick: null,
        constructPick: null,
        libraryMemberPick: null,
      })
      return true
    case 'tools.letter-codes':
      await openOrFocusHybridWindow('letter-codes')
      return true
    case 'tools.genetic-code':
      await openOrFocusHybridWindow('genetic-code-tables')
      return true
    case 'tools.agarose-gel':
      await openOrFocusHybridWindow('agarose-gel', createStandaloneAgaroseGelPayload())
      return true
    case 'features.browse-common':
      await openOrFocusHybridWindow('common-features-browse')
      return true
    case 'enzymes.database':
      await openOrFocusHybridWindow('enzyme-database')
      return true
    default:
      return false
  }
}

export type NoWorkspaceMenuActionDisposition = 'global' | 'workspace' | 'disabled'

/** File → Open from Database should create a separate editor, not replace an existing one. */
export function shouldOpenFileInNewWorkspaceFromWindow(
  action: string,
  focusedWindowLabel: string | undefined,
): boolean {
  return action === 'file.open' && focusedWindowLabel === 'hybrid-database'
}

/**
 * Policy for every native menu action when Database/startup is the only app
 * window. Global actions are handled without an editor, workspace actions open
 * pDemo and replay the command there, and document commands stay unavailable.
 * Keep this explicit: prefix-based routing used to open demo documents for
 * selection-dependent commands and silently dropped several other actions.
 */
const GLOBAL_NO_WORKSPACE_ACTIONS = new Set([
  'app.quit',
  // Uses the native picker when no editor workspace exists. When an editor
  // exists, Database-focused Open is also routed to a separate editor.
  'file.open',
  'file.new-dna',
  'file.new-dna-library',
  'file.new-protein',
  'file.new-window',
  'file.database',
  'file.preferences',
  'help.support',
  'help.source-code',
  'help.check-updates',
  'tools.agarose-gel',
  'tools.letter-codes',
  'tools.genetic-code',
  'features.browse-common',
  'enzymes.database',
])

const WORKSPACE_NO_WORKSPACE_ACTIONS = new Set([
  // Database import uses an App.tsx dialog; open an editor shell to host it.
  'file.import-database',
  // Help dialogs and molecular actions are intentionally surfaced from the
  // normal editor shell when invoked from a Database-only session.
  'app.about',
  'app.whats-new',
  'help.about',
  'help.telegram-group',
  'help.dna-library-format',
  'help.history-derived-workflows',
  'help.database',
  'help.crispr-workflow',
  'help.alignments',
  'help.keyboard-shortcuts',
  'help.report-bug',
  'settings.download',
  'settings.load',
  'actions.restriction-cloning',
  'actions.delete-fragment',
  'actions.destroy-site',
  'actions.linear-ligation',
  'actions.gibson.classic',
  'actions.gibson.nebuilder',
  'actions.gibson.infusion',
  'actions.tagc.ta',
  'actions.tagc.gc',
  'actions.gateway.bp',
  'actions.gateway.lr',
  'actions.pcr',
  'actions.mutagenesis',
])

/**
 * No-workspace routing and menu-availability policy, including dynamic rows.
 * Unknown and document-dependent commands are disabled by default.
 */
export function getNoWorkspaceMenuActionDisposition(action: string): NoWorkspaceMenuActionDisposition {
  if (GLOBAL_NO_WORKSPACE_ACTIONS.has(action)) return 'global'
  if (WORKSPACE_NO_WORKSPACE_ACTIONS.has(action)) return 'workspace'
  if (/^(recent\.open|drafts\.restore)\.\d+$/.test(action)) return 'workspace'

  // Tools that inspect an open molecule are context-dependent. Letter-code,
  // genetic-code, and standalone gel tools are already listed as global.
  return 'disabled'
}

/** Backwards-compatible predicate used by menu routing and existing tests. */
export function menuActionRequiresConstructWindow(action: string): boolean {
  return getNoWorkspaceMenuActionDisposition(action) === 'workspace'
}

export function isPlausiblePendingMenuAction(raw: string): raw is NativeAppMenuAction {
  return /^[a-z0-9][a-z0-9.:_-]{0,118}$/i.test(raw)
}

/** Read and strip `?pendingMenuAction=` so it is not re-run on reload. */
export function takePendingMenuActionFromUrl(
  search = typeof window !== 'undefined' ? window.location.search : '',
): NativeAppMenuAction | null {
  try {
    const params = new URLSearchParams(search)
    const raw = params.get('pendingMenuAction')
    if (!raw || !isPlausiblePendingMenuAction(raw)) return null
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href)
      if (url.searchParams.has('pendingMenuAction')) {
        url.searchParams.delete('pendingMenuAction')
        const next = `${url.pathname}${url.search}${url.hash}`
        window.history.replaceState({}, '', next)
      }
    }
    return raw
  } catch {
    return null
  }
}

/**
 * Open a fresh workspace (boots pDemo) and ask it to run `action` after mount.
 */
export async function openDemoWorkspaceForMenuAction(action: NativeAppMenuAction): Promise<boolean> {
  const opened = await openWorkspaceWindow({
    searchParams: { pendingMenuAction: action },
    title: 'VibeGene',
    focus: true,
  })
  return opened !== false
}

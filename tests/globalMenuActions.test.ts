/** @vitest-environment jsdom */
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  getNoWorkspaceMenuActionDisposition,
  isPlausiblePendingMenuAction,
  menuActionRequiresConstructWindow,
  takePendingMenuActionFromUrl,
} from '../src/desktop/globalMenuActions'
import { KEYBOARD_SHORTCUTS } from '../src/desktop/keyboardShortcuts'

/** Keep routing policy tests tied to the actions actually exposed by the native menu. */
function staticNativeMenuActionIds(): string[] {
  const source = readFileSync('src/desktop/nativeAppMenu.ts', 'utf8')
  const ids = [...source.matchAll(/await (?:checkItem|item)\('([^']+)'/g)].map((match) => match[1]!)
  return [...new Set(ids)]
}

describe('menuActionRequiresConstructWindow', () => {
  it('flags workspace-replayed Help and Actions dialogs', () => {
    expect(menuActionRequiresConstructWindow('help.about')).toBe(true)
    expect(menuActionRequiresConstructWindow('help.database')).toBe(true)
    expect(menuActionRequiresConstructWindow('actions.pcr')).toBe(true)
    expect(menuActionRequiresConstructWindow('app.whats-new')).toBe(true)
  })

  it('does not require a construct for quit', () => {
    expect(menuActionRequiresConstructWindow('app.quit')).toBe(false)
  })
})

describe('database-only native menu routing policy', () => {
  it('handles Open globally while replaying Import from Database in a workspace', () => {
    expect(getNoWorkspaceMenuActionDisposition('file.open')).toBe('global')
    expect(menuActionRequiresConstructWindow('file.open')).toBe(false)
    expect(getNoWorkspaceMenuActionDisposition('file.import-database')).toBe('workspace')
    expect(menuActionRequiresConstructWindow('file.import-database')).toBe(true)
  })

  it('keeps actions with standalone handlers global', () => {
    const globalActions = [
      'app.quit',
      'file.open',
      'file.new-dna',
      'file.new-dna-library',
      'file.new-protein',
      'file.new-window',
      'file.database',
      'file.preferences',
      'help.support',
      'tools.agarose-gel',
      'tools.letter-codes',
      'tools.genetic-code',
      'features.browse-common',
      'enzymes.database',
    ]
    for (const action of globalActions) {
      expect(getNoWorkspaceMenuActionDisposition(action), action).toBe('global')
      expect(menuActionRequiresConstructWindow(action), action).toBe(false)
    }
  })

  it('marks document commands disabled without an editor instead of silently dispatching them', () => {
    const documentCommands = [
      'file.save',
      'file.save-to',
      'file.save-dna',
      'file.save-genbank',
      'file.save-fasta',
      'edit.undo',
      'edit.redo',
      'view.tab.map',
      'view.tab.sequence',
      'enzymes.choose',
      'features.add',
      'crispr.detect',
      'crispr.add-sgrna',
      'crispr.design-sgrna',
      'crispr.clone-sgrna',
      'crispr.export-sgrnas',
      'primers.add',
      'protein.add-feature',
      'tools.dna-mw',
      'tools.protein-properties',
    ]
    for (const action of documentCommands) {
      expect(getNoWorkspaceMenuActionDisposition(action), action).toBe('disabled')
      expect(menuActionRequiresConstructWindow(action), action).toBe(false)
    }
  })

  it('assigns every static native menu action a no-workspace disposition', () => {
    const actions = staticNativeMenuActionIds()
    expect(actions.length).toBeGreaterThan(50)
    for (const action of actions) {
      const disposition = getNoWorkspaceMenuActionDisposition(action)
      expect(['global', 'workspace', 'disabled'], action).toContain(disposition)
      expect(menuActionRequiresConstructWindow(action), action).toBe(disposition === 'workspace')
    }
    expect(getNoWorkspaceMenuActionDisposition('primers.detect-common.tag:QC')).toBe('disabled')
    expect(getNoWorkspaceMenuActionDisposition('recent.open.0')).toBe('workspace')
    expect(getNoWorkspaceMenuActionDisposition('drafts.restore.0')).toBe('workspace')
  })

  it('gives menu items and keyboard shortcuts the same route policy by action id', () => {
    const menuActions = new Set(staticNativeMenuActionIds())
    for (const shortcut of KEYBOARD_SHORTCUTS) {
      expect(menuActions.has(shortcut.action), shortcut.action).toBe(true)
      expect(['global', 'workspace', 'disabled']).toContain(
        getNoWorkspaceMenuActionDisposition(shortcut.action),
      )
    }
    expect(getNoWorkspaceMenuActionDisposition('file.open')).toBe(
      getNoWorkspaceMenuActionDisposition(KEYBOARD_SHORTCUTS.find((item) => item.action === 'file.open')!.action),
    )
    expect(getNoWorkspaceMenuActionDisposition('file.import-database')).toBe(
      getNoWorkspaceMenuActionDisposition(KEYBOARD_SHORTCUTS.find((item) => item.action === 'file.import-database')!.action),
    )
  })
})

describe('takePendingMenuActionFromUrl', () => {
  it('reads and strips a pending menu action from the query string', () => {
    window.history.replaceState({}, '', '/index.html?bootSplash=0&pendingMenuAction=help.about')
    expect(takePendingMenuActionFromUrl()).toBe('help.about')
    expect(window.location.search.includes('pendingMenuAction')).toBe(false)
    expect(window.location.search.includes('bootSplash=0')).toBe(true)
  })

  it('rejects implausible action ids', () => {
    expect(isPlausiblePendingMenuAction('help.about')).toBe(true)
    expect(isPlausiblePendingMenuAction('primers.detect-common.tag:foo')).toBe(true)
    expect(isPlausiblePendingMenuAction('../evil')).toBe(false)
    expect(takePendingMenuActionFromUrl('?pendingMenuAction=not valid')).toBeNull()
  })
})

import { describe, expect, it } from 'vitest'
import {
  allBrowseLabel,
  browseLocationLabel,
  databaseWindowTitle,
} from './browsePresentation'
import { exportBaseName, uniquifyExportFileNames } from './exportNamePlanning'
import { effectiveFlexibleColumnWidths } from './columnWidthPlanning'
import { primerFileNamesSortKey, proteinFileNamesSortKey } from './sourceSortKeys'
import {
  folderSyncApplyAllLabel,
  folderSyncConflictChoiceLabel,
  folderSyncConflictReasonLabel,
  folderSyncIntentLabel,
} from './folderSyncPresentation'

describe('database manager browse presentation', () => {
  const folderPath = (id: string) => (id === 'f1' ? 'Projects / Lab' : 'Unfiled')

  it('labels browse locations', () => {
    expect(browseLocationLabel({ kind: 'all' }, folderPath)).toBe('All DNA')
    expect(browseLocationLabel({ kind: 'unfiled' }, folderPath)).toBe('Unfiled')
    expect(browseLocationLabel({ kind: 'tag', tag: 'cloning' }, folderPath)).toBe('cloning')
    expect(browseLocationLabel({ kind: 'common' }, folderPath)).toBe('Common primers')
    expect(browseLocationLabel({ kind: 'folder', folderId: 'f1' }, folderPath)).toBe('Projects / Lab')
    expect(browseLocationLabel({ kind: 'builtin', group: 'gateway' }, folderPath)).toBe(
      'Gateway cloning vectors',
    )
  })

  it('builds view-mode-specific all labels and window titles', () => {
    expect(allBrowseLabel('primers')).toBe('All primers')
    expect(allBrowseLabel('proteins')).toBe('All proteins')
    expect(allBrowseLabel('cdses')).toBe('All CDSes')
    expect(allBrowseLabel('dna')).toBe('All DNA')

    expect(
      databaseWindowTitle({ kind: 'all' }, folderPath, 12, 0, 'dna'),
    ).toBe('All DNA (12) — Database')
    expect(
      databaseWindowTitle({ kind: 'folder', folderId: 'f1' }, folderPath, 3, 2, 'dna'),
    ).toBe('Projects / Lab (3) · 2 selected — Database')
    expect(
      databaseWindowTitle({ kind: 'all' }, folderPath, 1, 0, 'primers', 'Importing…'),
    ).toBe('Importing… — Database')
    expect(
      databaseWindowTitle({ kind: 'common' }, folderPath, 5, 0, 'primers'),
    ).toBe('Common primers (5) — Database')
  })
})

describe('export name planning', () => {
  it('strips known extensions for export base names', () => {
    expect(exportBaseName('plasmid.dna')).toBe('plasmid')
    expect(exportBaseName('seq.PROT')).toBe('seq')
    expect(exportBaseName('   ')).toBe('Untitled')
  })

  it('uniquifies file names case-insensitively', () => {
    const files = uniquifyExportFileNames([
      { fileName: 'a.gb', tag: 1 },
      { fileName: 'A.GB', tag: 2 },
      { fileName: 'a.gb', tag: 3 },
    ])
    expect(files.map((file) => file.fileName)).toEqual(['a.gb', 'A (2).GB', 'a (3).gb'])
    expect(files.map((file) => file.tag)).toEqual([1, 2, 3])
  })
})

describe('column width planning', () => {
  it('expands the flex column to fill the viewport', () => {
    type ColumnId = 'name' | 'length'
    const widths: Record<ColumnId, number> = { name: 100, length: 80 }
    const effective = effectiveFlexibleColumnWidths(widths, 500, 'name', {
      flexColumnMinWidth: 120,
      selectionColumnWidth: 40,
    })
    expect(effective.name).toBe(380)
    expect(effective.length).toBe(80)
  })

  it('respects flex minimum when viewport is unset', () => {
    const widths = { sequence: 90, tm: 60 }
    const effective = effectiveFlexibleColumnWidths(widths, 0, 'sequence', {
      flexColumnMinWidth: 100,
      selectionColumnWidth: 40,
    })
    expect(effective.sequence).toBe(100)
  })

  it('shrinks fixed columns to their minimums before allowing horizontal overflow', () => {
    const widths = { name: 220, format: 140, actions: 160 }
    const effective = effectiveFlexibleColumnWidths(widths, 300, 'name', {
      flexColumnMinWidth: 100,
      selectionColumnWidth: 40,
      minWidths: { name: 100, format: 80, actions: 120 },
    })
    expect(effective).toEqual({ name: 100, format: 80, actions: 120 })
  })
})

describe('primer and protein source sort keys', () => {
  it('orders source names case-insensitively and stably', () => {
    const primer = {
      sources: [{ projectName: 'beta' }, { projectName: 'Alpha' }, { projectName: 'alpha' }],
    }
    const key = primerFileNamesSortKey(primer)
    expect(key.split('\0')).toEqual(['Alpha', 'alpha', 'beta'])
    expect(proteinFileNamesSortKey(primer)).toBe(key)
  })
})

describe('folder sync presentation', () => {
  it('labels intents, reasons, choices, and apply-all actions', () => {
    expect(folderSyncIntentLabel('sync-from')).toBe('Sync from source folder')
    expect(folderSyncIntentLabel('sync-to')).toBe('Sync to source folder')
    expect(folderSyncIntentLabel('sync-cleanup')).toBe('Sync and clean up')

    expect(folderSyncConflictReasonLabel('database-path-collision')).toBe('Duplicate path in database')
    expect(folderSyncConflictReasonLabel('custom-reason')).toBe('custom reason')

    expect(folderSyncConflictChoiceLabel('filesystem', true)).toBe('Use folder')
    expect(folderSyncConflictChoiceLabel('filesystem', false)).toBe('Remove')
    expect(folderSyncConflictChoiceLabel('database', false)).toBe('Keep')

    expect(folderSyncApplyAllLabel('filesystem', true, true)).toBe('Use folder / Remove')
    expect(folderSyncApplyAllLabel('database', true, false)).toBe('Keep')
  })
})

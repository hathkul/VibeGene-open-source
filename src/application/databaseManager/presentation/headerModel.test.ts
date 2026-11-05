import { describe, expect, it } from 'vitest'
import {
  buildAppDatabaseManagerHeaderActivity,
  buildAppDatabaseManagerHeaderPresentationSlice,
  databaseManagerHeaderItemCount,
  databaseManagerHeaderSelectedCount,
  databaseManagerHeaderTitle,
} from './headerModel'

describe('database manager header presentation', () => {
  const folderPath = (id: string) => (id === 'f1' ? 'Projects / Lab' : 'Unfiled')

  it('derives titles for construct, library, and default modes', () => {
    expect(databaseManagerHeaderTitle({ multiple: false }, null)).toBe('Choose construct from Database')
    expect(databaseManagerHeaderTitle({ multiple: true }, null)).toBe('Choose constructs from Database')
    expect(databaseManagerHeaderTitle({ title: 'Pick a vector' }, null)).toBe('Pick a vector')
    expect(databaseManagerHeaderTitle(null, { targetRecordId: 'r1', purpose: 'add' })).toBe(
      'Choose members from Database',
    )
    expect(databaseManagerHeaderTitle(null, null)).toBe('Database')
  })

  it('derives item and selection counts by view mode', () => {
    expect(
      databaseManagerHeaderItemCount({
        viewMode: 'primers',
        browse: { kind: 'all' },
        visiblePrimerCount: 4,
        visibleProteinCount: 0,
        visibleBuiltInCount: 0,
        paginationTotal: 99,
      }),
    ).toBe(4)
    expect(
      databaseManagerHeaderItemCount({
        viewMode: 'dna',
        browse: { kind: 'builtin', group: 'gateway' },
        visiblePrimerCount: 0,
        visibleProteinCount: 0,
        visibleBuiltInCount: 12,
        paginationTotal: 99,
      }),
    ).toBe(12)
    expect(
      databaseManagerHeaderSelectedCount({
        viewMode: 'cdses',
        selectedPrimerCount: 0,
        selectedProteinCount: 3,
        selectedProjectCount: 5,
      }),
    ).toBe(3)
  })

  it('derives native window title from headerStatus only', () => {
    const status = buildAppDatabaseManagerHeaderPresentationSlice({
      constructPick: null,
      libraryMemberPick: null,
      browse: { kind: 'all' },
      resolveFolderPathLabel: folderPath,
      viewMode: 'dna',
      itemCount: 12,
      selectedCount: 0,
      busy: false,
      headerStatus: 'Importing…',
    })
    expect(status.nativeWindowTitle).toBe('Importing… — Database')

    const idle = buildAppDatabaseManagerHeaderPresentationSlice({
      constructPick: null,
      libraryMemberPick: null,
      browse: { kind: 'folder', folderId: 'f1' },
      resolveFolderPathLabel: folderPath,
      viewMode: 'dna',
      itemCount: 3,
      selectedCount: 2,
      busy: true,
      headerStatus: null,
    })
    expect(idle.nativeWindowTitle).toBe('Projects / Lab (3) · 2 selected — Database')
  })

  it('derives visible activity for status-only and busy-only cases', () => {
    expect(
      buildAppDatabaseManagerHeaderActivity({ busy: false, headerStatus: 'Saved export' }),
    ).toEqual({
      visible: true,
      label: 'Saved export',
      title: 'Saved export',
      isBusy: false,
    })

    expect(buildAppDatabaseManagerHeaderActivity({ busy: true, headerStatus: null })).toEqual({
      visible: true,
      label: 'Working...',
      title: 'Working...',
      isBusy: true,
    })

    expect(buildAppDatabaseManagerHeaderActivity({ busy: false, headerStatus: null })).toEqual({
      visible: false,
      label: null,
      title: null,
      isBusy: false,
    })
  })
})

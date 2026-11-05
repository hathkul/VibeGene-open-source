import { describe, expect, it } from 'vitest'
import { buildAppDatabaseManagerPickToolbarSlice } from './toolbarPickModel'
import { buildAppDatabaseManagerViewModeToolbarSlice } from './toolbarViewModeModel'
import { buildAppDatabaseManagerFileSelectionToolbarSlice } from './toolbarFileSelectionModel'
import { buildAppDatabaseManagerProteinSelectionToolbarSlice } from './toolbarProteinSelectionModel'

describe('database manager pick toolbar', () => {
  it('labels construct pick for single vs multiple selection', () => {
    const single = buildAppDatabaseManagerPickToolbarSlice({
      libraryMemberPick: null,
      onAddLibraryMembersHandler: false,
      constructPick: { multiple: false, topology: 'circular' },
      onAddConstructHandlers: true,
      onCancelConstructPickHandler: true,
      selectedConstructs: [],
      busy: false,
    })
    expect(single.construct?.title).toBe('Select one circular DNA construct')
  })
})

describe('database manager view-mode toolbar', () => {
  it('disables all modes for default construct pick without molecules', () => {
    expect(
      buildAppDatabaseManagerViewModeToolbarSlice({
        viewMode: 'dna',
        busy: false,
        constructPick: {},
        libraryMemberPick: null,
      }),
    ).toMatchObject({
      dnaDisabled: true,
      primersDisabled: true,
      proteinsDisabled: true,
      cdsesDisabled: true,
    })
  })
})

describe('database manager alignment toolbar visibility', () => {
  it('shows file alignment when alignment pick is active', () => {
    expect(
      buildAppDatabaseManagerFileSelectionToolbarSlice({
        fileView: true,
        selectedProjectCount: 1,
        alignmentPick: { mode: 'dna', targetRecordId: 't' },
        onAddToAlignmentHandler: true,
        libraryMemberPick: null,
        isTauriRuntime: false,
        busy: false,
      }).showAlignment,
    ).toBe(true)
  })

  it('shows protein alignment only for protein mode pick', () => {
    expect(
      buildAppDatabaseManagerProteinSelectionToolbarSlice({
        viewMode: 'cdses',
        selectedProteinCount: 1,
        alignmentPick: { mode: 'protein', targetRecordId: 't' },
        onAddToAlignmentHandler: true,
        busy: false,
      }).showAlignment,
    ).toBe(true)
  })
})

import { describe, expect, it } from 'vitest'
import { createWorkspaceMapModel, selectWorkspaceMapVariant, type WorkspaceMapModelContext } from './workspaceMapViewModel'
import { selectWorkspaceSequenceVariant } from './workspaceSequenceViewModel'

describe('workspace rendering view-model branches', () => {
  it('gates map rendering by tab and molecule branch', () => {
    expect(selectWorkspaceMapVariant({ activeTab: 'Sequence', mapAvailable: true, protein: null, dna: { alignment: null } })).toBe('hidden')
    expect(selectWorkspaceMapVariant({ activeTab: 'Map', mapAvailable: true, protein: {}, dna: null })).toBe('protein')
    expect(selectWorkspaceMapVariant({ activeTab: 'Map', mapAvailable: true, protein: null, dna: { alignment: {} } })).toBe('dna-alignment')
    expect(selectWorkspaceMapVariant({ activeTab: 'Map', mapAvailable: true, protein: null, dna: { alignment: null } })).toBe('dna-library')
    expect(selectWorkspaceMapVariant({ activeTab: 'Map', mapAvailable: false, protein: null, dna: null })).toBe('hidden')
  })

  it('preserves lazy sequence, trace, alignment, and ordinary branches', () => {
    const protein = (alignmentsVisible: boolean) => ({ alignmentsVisible })
    const dna = (comparisonVisible: boolean, trace: unknown | null = null) => ({ trace, comparisonVisible })
    expect(selectWorkspaceSequenceVariant({ mounted: false, activeTab: 'Map', protein: null, dna: dna(false) })).toBe('hidden')
    expect(selectWorkspaceSequenceVariant({ mounted: true, activeTab: 'Map', protein: protein(true), dna: null })).toBe('protein-alignment')
    expect(selectWorkspaceSequenceVariant({ mounted: true, activeTab: 'Sequence', protein: protein(false), dna: null })).toBe('protein-sequence')
    expect(selectWorkspaceSequenceVariant({ mounted: true, activeTab: 'Sequence', protein: null, dna: dna(false, {}) })).toBe('trace')
    expect(selectWorkspaceSequenceVariant({ mounted: true, activeTab: 'Sequence', protein: null, dna: dna(true) })).toBe('dna-comparison')
    expect(selectWorkspaceSequenceVariant({ mounted: true, activeTab: 'Sequence', protein: null, dna: dna(false) })).toBe('dna-sequence')
  })

  it('keeps library-member map selection disabled and retains the enabled zoom wrapper state', () => {
    const selectedRestrictionSites = [{ id: 'selected-site' }]
    const model = createWorkspaceMapModel({
      activeTab: 'Map',
      mapAvailable: true,
      protein: null,
      dna: {
        record: { name: 'Library', sequence: 'ACGT', topology: 'circular' },
        libraryMemberBrowse: true,
        selectedRestrictionSites,
        displaySettings: { mapView: { zoom: true, linear: true }, alignments: { visible: false } },
        actions: {},
      },
    } as unknown as WorkspaceMapModelContext)

    expect(model.dna?.library.linear.selectedRestrictionSites).toEqual([])
    expect(model.dna?.library.circular.selectedRestrictionSites).toEqual([])
    expect(model.dna?.library.zoomed).toBe(true)
  })
})

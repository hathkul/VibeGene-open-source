// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as actionProfiler from '../../domain/actionProfiler'
import type { RestrictionSite } from '../../domain/types'
import { createDnaLibraryFromMembers } from '../../domain/dnaLibrary'
import { labPlasmid } from '../../domain/fixtures'
import { capabilitiesForRecord } from '../../domain/moleculeCapabilities'
import { defaultEnzymePreferences } from '../../domain/enzymePreferences'
import type { DisplaySettings } from '../sequence'
import { traceRecordFromSequence } from '../../domain/sequenceTraceFactory'
import { defaultDisplaySettings } from '../sequence'
import { useWorkspaceViewProjection, type WorkspaceViewProjectionInput } from './useWorkspaceViewProjection'

const mockScanSite = {
  enzyme: {
    name: 'EcoRI',
    notation: 'G^AATTC',
    recognition: 'GAATTC',
    cutTop: 1,
    cutBottom: 5,
    type: 'II' as const,
    overhang: { type: "5'" as const, sequence: 'AATT', length: 4 },
    manufacturers: [],
    notes: [],
  },
  start: 10,
  end: 16,
  match: 'GAATTC',
  cutTop: 11,
  cutBottom: 15,
} satisfies RestrictionSite

vi.mock('../hooks/useRestrictionSiteScan', () => ({
  useRestrictionSiteScan: () => ({
    sites: [mockScanSite],
    stage: 'complete' as const,
    pending: false,
    elapsedMs: 0,
  }),
}))

function mountProjection(overrides: Partial<WorkspaceViewProjectionInput> = {}) {
  const member = traceRecordFromSequence('ATGCATGCATGCATGC', 'member.seq')
  const { record: libraryRecord, members } = createDnaLibraryFromMembers([member], { name: 'Lib' })
  let projection!: ReturnType<typeof useWorkspaceViewProjection>
  const input: WorkspaceViewProjectionInput = {
    record: labPlasmid,
    traceFiles: [],
    displaySettings: structuredClone(defaultDisplaySettings),
    enzymePreferences: structuredClone(defaultEnzymePreferences),
    moleculeCapabilities: capabilitiesForRecord(labPlasmid),
    alignmentsVisible: true,
    activeTab: 'Features',
    selectionFocus: 'feature',
    selectedRange: { start: 0, end: 10 },
    cutStrandSelection: null,
    cutSelectionAnchor: null,
    cutSelectionEnzymes: null,
    selectedFeatureId: labPlasmid.features[0]?.id ?? null,
    selectedFeatureIds: labPlasmid.features[0] ? [labPlasmid.features[0].id] : [],
    selectedAlignmentTraceId: null,
    featureTabSelectionMemberId: null,
    selectedProteinBondId: null,
    enzymeTabSortMode: 'caret-distance',
    enzymeTabSortDirection: 'asc',
    featureTabSortMode: 'name',
    featureTabSortDirection: 'asc',
    primerTabSortMode: 'name',
    primerTabSortDirection: 'asc',
    oligoTabSortMode: 'name',
    oligoTabSortDirection: 'asc',
    sgRnaTabSortMode: 'name',
    sgRnaTabSortDirection: 'asc',
    ...overrides,
  }
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  function Harness() {
    projection = useWorkspaceViewProjection(input)
    return null
  }
  act(() => root.render(<Harness />))
  return {
    projection: () => projection,
    rerender: (next: Partial<WorkspaceViewProjectionInput>) => {
      Object.assign(input, next)
      act(() => root.render(<Harness />))
    },
    unmount: () => {
      act(() => root.unmount())
      host.remove()
    },
    libraryRecord,
    members,
  }
}

describe('useWorkspaceViewProjection', () => {
  afterEach(() => {
    document.body.replaceChildren()
    vi.restoreAllMocks()
  })

  it('builds feature menu selection from tab visibility targets', () => {
    const harness = mountProjection()
    expect(harness.projection().features.menuSelection.length).toBeGreaterThan(0)
    expect(harness.projection().features.visibilityTargetIds).toContain(labPlasmid.features[0]!.id)
    harness.unmount()
  })

  it('routes library map browse to the selected alignment member', () => {
    const member = traceRecordFromSequence('ATGCATGCATGCATGC', 'member.seq')
    const { record: libraryRecord, members } = createDnaLibraryFromMembers([member], { name: 'Lib' })
    const harness = mountProjection({
      record: libraryRecord,
      traceFiles: members,
      alignmentsVisible: false,
      activeTab: 'Map',
      selectedAlignmentTraceId: members[0]!.id,
      moleculeCapabilities: capabilitiesForRecord(libraryRecord),
    })
    expect(harness.projection().map.browseActive).toBe(true)
    expect(harness.projection().map.browseMemberId).toBe(members[0]!.id)
    expect(harness.projection().map.viewRecord.sequence).toBe(members[0]!.sequence)
    harness.unmount()
  })

  it('lists enzyme noncutters from scanned site counts', () => {
    const harness = mountProjection({
      displaySettings: {
        ...structuredClone(defaultDisplaySettings),
        enzymes: { ...defaultDisplaySettings.enzymes, visible: true, set: 'all' },
      } satisfies DisplaySettings,
    })
    expect(Array.isArray(harness.projection().enzymes.menuNoncutters)).toBe(true)
    expect(harness.projection().enzymes.restrictionSites.length).toBeGreaterThan(0)
    harness.unmount()
  })

  it('keeps cached ORF features when ORF display is hidden', () => {
    const hiddenOrfs = {
      ...structuredClone(defaultDisplaySettings),
      orfs: { ...defaultDisplaySettings.orfs, visible: false },
    } satisfies DisplaySettings
    const harness = mountProjection({ displaySettings: hiddenOrfs })
    const { cachedFeatures, visibleFeatures } = harness.projection().orf
    if (capabilitiesForRecord(labPlasmid).orfPrediction) {
      expect(cachedFeatures.length).toBeGreaterThanOrEqual(0)
    }
    expect(visibleFeatures).toEqual([])
    harness.rerender({
      displaySettings: {
        ...hiddenOrfs,
        orfs: { ...hiddenOrfs.orfs, visible: true },
      },
    })
    expect(harness.projection().orf.visibleFeatures).toEqual(harness.projection().orf.cachedFeatures)
    harness.unmount()
  })

  it('gates create-file-from-selection on sticky cuts and non-empty ranges', () => {
    const harness = mountProjection({
      selectedRange: { start: 0, end: 0 },
      cutStrandSelection: null,
      cutSelectionEnzymes: null,
    })
    expect(harness.projection().selection.canCreateFileFromSelection).toBe(false)

    harness.rerender({ selectedRange: { start: 0, end: 10 } })
    expect(harness.projection().selection.canCreateFileFromSelection).toBe(true)

    harness.rerender({
      selectedRange: null,
      cutStrandSelection: {
        forward: { start: 1, end: 20 },
        reverse: { start: 1, end: 20 },
      },
      cutSelectionEnzymes: {
        upstream: mockScanSite,
        downstream: { ...mockScanSite, start: 30 },
      },
    })
    expect(harness.projection().selection.canCreateFileFromSelection).toBe(true)
    harness.unmount()
  })

  it('does not re-profile cached ORFs when only selection changes', () => {
    const spy = vi.spyOn(actionProfiler, 'actionProfileSync')
    const harness = mountProjection()
    const cachedRef = harness.projection().orf.cachedFeatures
    const orfCallsBefore = spy.mock.calls.filter(([name]) => name === 'orfFeatures').length
    harness.rerender({ selectedRange: { start: 2, end: 8 } })
    expect(harness.projection().orf.cachedFeatures).toBe(cachedRef)
    const orfCallsAfter = spy.mock.calls.filter(([name]) => name === 'orfFeatures').length
    expect(orfCallsAfter).toBe(orfCallsBefore)
    harness.unmount()
  })
})

import { themeFixturePalette } from '../../test-support/themeFixturePalette'
import { describe, expect, it, vi } from 'vitest'
import { defaultConstructProperties } from '../../domain/constructProperties'
import type { SequenceRecord } from '../../domain/types'
import { applySessionDraftRestoreInPlace } from './applySessionDraftRestoreInPlace'

function dnaRecord(): SequenceRecord {
  return {
    id: 'rec-1',
    name: 'Test.dna',
    description: '',
    molecule: 'dna',
    topology: 'linear',
    sequence: 'ACGT',
    features: [{ id: 'f1', name: 'feat', type: 'CDS', locations: [{ start: 0, end: 4, strand: 'forward' }], color: themeFixturePalette.slate }],
    primers: [],
    operations: [],
    construct: { ...defaultConstructProperties },
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  }
}

describe('applySessionDraftRestoreInPlace', () => {
  it('restores record, selection, and map tab for a draft with a feature', () => {
    const setActiveTab = vi.fn()
    applySessionDraftRestoreInPlace(dnaRecord(), {
      setRecord: vi.fn(),
      setLibraryFolderId: vi.fn(),
      setWorkspaceDiskPath: vi.fn(),
      applyDefaultMapViewForTopology: vi.fn(),
      setTraceFilesForRecord: vi.fn(),
      setSelectedFeatureId: vi.fn(),
      setSelectedPrimerId: vi.fn(),
      setSelectionFocus: vi.fn(),
      setSelectedRange: vi.fn(),
      setActiveTab,
      markNeverSaved: vi.fn(),
    })
    expect(setActiveTab).toHaveBeenCalledWith('Map')
  })
})

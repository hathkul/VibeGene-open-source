import { themeFixturePalette } from '../../test-support/themeFixturePalette'
// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SequenceRecord } from '../../domain/types'
import type { BinderNumbering } from '../../domain/binderStructure'
import { defaultDisplaySettings } from '../sequence'
import { ProteinSequencePane } from './ProteinSequencePane'

function proteinRecord(): SequenceRecord {
  return {
    id: 'protein', name: 'Protein', description: '', molecule: 'protein', topology: 'linear', sequence: 'MKT',
    features: [{ id: 'feature', name: 'Feature', type: 'misc_feature', color: themeFixturePalette.purpleFixture, locations: [{ start: 0, end: 2, strand: 'forward' }] }],
    primers: [], operations: [], createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
    construct: {
      syntheticDna: false, confirmedExperimentally: false, laboratoryHostOrganism: null, sourceOrganism: null,
      bacterialTransformationStrain: null, hostMethylation: { dam: false, dcm: false, ecoKI: false },
      sequenceClass: '', accessionNumber: '', codeNumber: '', sequenceAuthor: '', comments: '', references: '',
    },
    protein: {
      numberingStart: 1, numberingRegions: [], comparisonSources: [], comparisonAlignmentCache: [], bonds: [],
    },
  }
}

describe('ProteinSequencePane selection/editing boundary', () => {
  let host: HTMLDivElement
  let root: ReturnType<typeof createRoot>

  afterEach(() => {
    act(() => root?.unmount())
    host?.remove()
  })

  it('does not resume inline editing after feature or bond selection is cleared', () => {
    vi.stubGlobal('ResizeObserver', class {
      observe() {}
      disconnect() {}
    })
    const props = {
      record: proteinRecord(), selectedRange: null, motifHits: [], activeHitIndex: -1, searchQuery: '',
      onRangeSelect: vi.fn(), onSequenceEdit: vi.fn(), onStatus: vi.fn(), onUndo: vi.fn(), onRedo: vi.fn(),
      selectedFeatureId: null, selectedBondId: null, onFeatureSelect: vi.fn(), onFeatureEdit: vi.fn(),
      onAnnotateBinder: vi.fn(), onBondSelect: vi.fn(), onBondEdit: vi.fn(), showFeatures: true,
      showColors: false, showFeatureLabels: true, displaySettings: defaultDisplaySettings,
      onDisplaySettingsChange: vi.fn(),
    }
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    act(() => root.render(<ProteinSequencePane {...props} />))
    const residue = host.querySelector<HTMLButtonElement>('.protein-residue')
    expect(residue).not.toBeNull()
    act(() => residue!.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0 })))
    expect(host.querySelector('.protein-sequence-view')?.getAttribute('aria-label')).toBe('Edit protein sequence')

    act(() => root.render(<ProteinSequencePane {...props} selectedFeatureId="feature" />))
    act(() => root.render(<ProteinSequencePane {...props} selectedFeatureId={null} />))
    expect(host.querySelector('.protein-sequence-view')?.getAttribute('aria-label')).toBe('Protein sequence')

    act(() => residue!.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0 })))
    act(() => root.render(<ProteinSequencePane {...props} selectedBondId="bond" />))
    act(() => root.render(<ProteinSequencePane {...props} selectedBondId={null} />))
    expect(host.querySelector('.protein-sequence-view')?.getAttribute('aria-label')).toBe('Protein sequence')
  })

  it('angles dense binder numbering labels when a label exceeds one residue cell', () => {
    vi.stubGlobal('ResizeObserver', class {
      observe() {}
      disconnect() {}
    })
    const props = {
      record: { ...proteinRecord(), sequence: 'MKTW' }, selectedRange: null, motifHits: [], activeHitIndex: -1, searchQuery: '',
      onRangeSelect: vi.fn(), onSequenceEdit: vi.fn(), onStatus: vi.fn(), onUndo: vi.fn(), onRedo: vi.fn(),
      selectedFeatureId: null, selectedBondId: null, onFeatureSelect: vi.fn(), onFeatureEdit: vi.fn(),
      onAnnotateBinder: vi.fn(), onBondSelect: vi.fn(), onBondEdit: vi.fn(), showFeatures: true,
      showColors: false, showFeatureLabels: true, displaySettings: defaultDisplaySettings,
      onDisplaySettingsChange: vi.fn(),
      binderNumbering: {
        kind: 'darpin', schemeId: 'darpin', schemeLabel: 'Module', positions: ['1', '2', '3A12'], data: {},
      } as unknown as BinderNumbering,
    }
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    act(() => root.render(<ProteinSequencePane {...props} />))
    expect(host.querySelector('.protein-sequence-view')?.classList.contains('is-ruler-angled')).toBe(true)
  })
})

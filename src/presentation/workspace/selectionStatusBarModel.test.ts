import { describe, expect, it } from 'vitest'
import type { RestrictionSiteScanState } from '../../domain/restrictionSiteScan'
import {
  buildSelectionStatusBarModel,
  type SelectionStatusBarModelInput,
} from './selectionStatusBarModel'

const IDLE_SCAN: RestrictionSiteScanState = { sites: [], stage: 'idle', pending: false, elapsedMs: 0 }

function makeInput(overrides: Partial<SelectionStatusBarModelInput> = {}): SelectionStatusBarModelInput {
  return {
    isDirty: false,
    mapViewZoomEnabled: false,
    mapZoomRange: null,
    molecule: 'dna',
    sequence: 'ATGC'.repeat(250),
    summary: {
      molecule: 'dna',
      sequenceLength: 1000,
      cutStrandSelection: null,
      selectionFocus: 'dna',
      selectedFeatureIds: [],
      selectedFeature: null,
      selectedPrimerIds: [],
      selectedPrimerId: null,
      primers: [],
      selectedProteinBond: null,
      selectedRange: null,
      selectedAnnotation: null,
    },
    showWorkspaceCounts: false,
    featureCount: 0,
    primerBindingCount: 0,
    visibleEnzymeSiteCount: 0,
    status: 'Loaded fixture.',
    enzymeScan: IDLE_SCAN,
    ...overrides,
  }
}

describe('buildSelectionStatusBarModel', () => {
  it('hides the zoom readout when zoom is disabled or no range is active', () => {
    expect(buildSelectionStatusBarModel(makeInput({ mapViewZoomEnabled: false, mapZoomRange: { start: 10, end: 99 } })).zoom).toBeNull()
    expect(buildSelectionStatusBarModel(makeInput({ mapViewZoomEnabled: true, mapZoomRange: null })).zoom).toBeNull()
  })

  it('builds the zoom readout labels for an active map zoom range', () => {
    const model = buildSelectionStatusBarModel(
      makeInput({ mapViewZoomEnabled: true, mapZoomRange: { start: 99, end: 199 } }),
    )
    expect(model.zoom).toEqual({ zoomedLengthLabel: '100 bp', rangeLabel: '100 .... 199' })
  })

  it('shows the length and GC labels when the zoom readout is hidden', () => {
    const model = buildSelectionStatusBarModel(makeInput())
    expect(model.sequenceLengthLabel).toBe(`${(1000).toLocaleString()} bp`)
    expect(model.gcLabel).toBe('50.0% GC')
  })

  it('hides the length and GC labels while the zoom readout is visible', () => {
    const model = buildSelectionStatusBarModel(
      makeInput({ mapViewZoomEnabled: true, mapZoomRange: { start: 99, end: 199 } }),
    )
    expect(model.sequenceLengthLabel).toBe(`${(1000).toLocaleString()} bp`)
    expect(model.gcLabel).toBe('50.0% GC')
    expect(model.zoom).not.toBeNull()
  })

  it('omits the GC label for non-DNA records', () => {
    const model = buildSelectionStatusBarModel(
      makeInput({ molecule: 'protein', sequence: 'MKT', summary: { ...makeInput().summary, molecule: 'protein', sequenceLength: 3 } }),
    )
    expect(model.gcLabel).toBeNull()
    expect(model.sequenceLengthLabel).toBe('3 aa')
  })

  it('shows workspace counts only when requested', () => {
    const counts = { featureCount: 3, primerBindingCount: 2, visibleEnzymeSiteCount: 5 }
    expect(
      buildSelectionStatusBarModel(makeInput({ ...counts, showWorkspaceCounts: true })).counts,
    ).toEqual({ features: 3, primerBindings: 2, visibleEnzymeSites: 5 })
    expect(
      buildSelectionStatusBarModel(makeInput({ ...counts, showWorkspaceCounts: false })).counts,
    ).toBeNull()
  })

  it('passes the selection summary through the precedence chain', () => {
    const base = makeInput()
    const model = buildSelectionStatusBarModel({
      ...base,
      summary: {
        ...base.summary,
        selectedRange: { start: 9, end: 30 },
      },
    })
    expect(model.summary).toBe('Selected: 10..30 (21 bp)')
  })

  it('echoes the plain status when clean and the scan is idle', () => {
    expect(buildSelectionStatusBarModel(makeInput({ status: 'Saved.' })).statusEcho).toBe('Saved.')
  })

  it('appends unsaved-changes and scan fragments to the echo with the existing separator', () => {
    const model = buildSelectionStatusBarModel(
      makeInput({
        isDirty: true,
        status: 'Saved.',
        enzymeScan: { sites: [], stage: 'preview', pending: true, elapsedMs: 0 },
      }),
    )
    expect(model.statusEcho).toBe('Saved. · Scanning restriction sites… · Unsaved changes')
  })

  it('filters selection-bar echo statuses out of the echo text', () => {
    const model = buildSelectionStatusBarModel(makeInput({ status: 'Selected 10..30 (21 bp)' }))
    expect(model.statusEcho).toBe('')
  })

  it('reports scan errors in the echo', () => {
    const model = buildSelectionStatusBarModel(
      makeInput({ enzymeScan: { sites: [], stage: 'error', pending: false, elapsedMs: 0, error: 'bad enzymes' } }),
    )
    expect(model.statusEcho).toBe('Loaded fixture. · Enzyme scan failed: bad enzymes')
  })

  it('carries the dirty flag through to the model', () => {
    expect(buildSelectionStatusBarModel(makeInput({ isDirty: true })).isDirty).toBe(true)
  })
})

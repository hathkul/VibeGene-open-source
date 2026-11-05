import { themeFixturePalette } from '../../test-support/themeFixturePalette'
import { describe, expect, it } from 'vitest'
import { cloneFixture } from '../../domain/fixtures'
import type { RestrictionSiteScanState } from '../../domain/restrictionSiteScan'
import type { ProteinBond, SequenceFeature } from '../../domain/types'
import {
  buildSelectionBarStatusEcho,
  buildSelectionStatusSummary,
  type SelectionStatusSummaryInput,
} from './selectionStatus'

function makeFeature(name: string): SequenceFeature {
  const fixtureFeature = cloneFixture().features[0]!
  return { ...fixtureFeature, id: 'f1', name }
}

function makeInput(overrides: Partial<SelectionStatusSummaryInput> = {}): SelectionStatusSummaryInput {
  return {
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
    ...overrides,
  }
}

const IDLE_SCAN: RestrictionSiteScanState = { sites: [], stage: 'idle', pending: false, elapsedMs: 0 }

describe('buildSelectionStatusSummary precedence', () => {
  const cases: Array<{ name: string; input: SelectionStatusSummaryInput; expected: string }> = [
    {
      name: 'sticky/cut selection wins over every other signal',
      input: makeInput({
        cutStrandSelection: { forward: { start: 3, end: 10 }, reverse: { start: 20, end: 26 } },
        selectionFocus: 'feature',
        selectedFeatureIds: ['a', 'b'],
        selectedRange: { start: 100, end: 200 },
      }),
      expected: 'Selected: 4..10 (+), 21..26 (-) (7 bp)',
    },
    {
      name: 'multiple features with feature focus beat an existing range',
      input: makeInput({
        selectionFocus: 'feature',
        selectedFeatureIds: ['a', 'b', 'c'],
        selectedRange: { start: 9, end: 30 },
      }),
      expected: 'Selected: 3 features',
    },
    {
      name: 'multiple feature ids without feature focus fall through to the range',
      input: makeInput({
        selectionFocus: 'dna',
        selectedFeatureIds: ['a', 'b'],
        selectedRange: { start: 9, end: 30 },
      }),
      expected: 'Selected: 10..30 (21 bp)',
    },
    {
      name: 'multiple primers with a non-empty range include the PCR range',
      input: makeInput({
        selectionFocus: 'primer',
        selectedPrimerIds: ['p1', 'p2'],
        selectedRange: { start: 9, end: 30 },
      }),
      expected: 'Selected: 2 primers · 10..30 (21 bp)',
    },
    {
      name: 'multiple primers with a caret range omit the PCR range',
      input: makeInput({
        selectionFocus: 'primer',
        selectedPrimerIds: ['p1', 'p2'],
        selectedRange: { start: 9, end: 9 },
      }),
      expected: 'Selected: 2 primers',
    },
    {
      name: 'caret range renders the 1-based caret position',
      input: makeInput({ selectedRange: { start: 9, end: 9 } }),
      expected: 'Caret: 10',
    },
    {
      name: 'ordinary range renders 1-based coordinates with length',
      input: makeInput({ selectedRange: { start: 9, end: 30 } }),
      expected: 'Selected: 10..30 (21 bp)',
    },
    {
      name: 'ordinary range appends the selected annotation name',
      input: makeInput({
        selectedRange: { start: 9, end: 30 },
        selectedAnnotation: makeFeature('AmpR'),
      }),
      expected: 'Selected: 10..30 (21 bp) - AmpR',
    },
    {
      name: 'single feature with feature focus shows the feature name',
      input: makeInput({
        selectionFocus: 'feature',
        selectedFeature: makeFeature('AmpR'),
      }),
      expected: 'Selected: AmpR',
    },
    {
      name: 'protein bond with bond focus shows the bond name',
      input: makeInput({
        selectionFocus: 'bond',
        selectedProteinBond: { name: 'Disulfide 1' } as ProteinBond,
      }),
      expected: 'Selected: Disulfide 1',
    },
    {
      name: 'unnamed protein bond falls back to Bond',
      input: makeInput({
        selectionFocus: 'bond',
        selectedProteinBond: { name: '' } as ProteinBond,
      }),
      expected: 'Selected: Bond',
    },
    {
      name: 'single primer with primer focus resolves the primer name',
      input: makeInput({
        selectionFocus: 'primer',
        selectedPrimerId: 'p1',
        primers: [{ id: 'p1', name: 'T7', sequence: 'ATGC', color: themeFixturePalette.namedRed }],
      }),
      expected: 'Selected: T7',
    },
    {
      name: 'single primer missing from the record falls back to Primer',
      input: makeInput({
        selectionFocus: 'primer',
        selectedPrimerId: 'missing',
        primers: [{ id: 'p1', name: 'T7', sequence: 'ATGC', color: themeFixturePalette.namedRed }],
      }),
      expected: 'Selected: Primer',
    },
    {
      name: 'no selection renders Selected: None even with a feature id list',
      input: makeInput({ selectedFeatureIds: ['a'] }),
      expected: 'Selected: None',
    },
    {
      name: 'protein records use amino-acid units',
      input: makeInput({
        molecule: 'protein',
        sequenceLength: 500,
        selectedRange: { start: 0, end: 9 },
      }),
      expected: 'Selected: 1..9 (9 aa)',
    },
    {
      name: 'wrap-around range on a circular sequence uses the span length',
      input: makeInput({ selectedRange: { start: 990, end: 5 } }),
      expected: 'Selected: 991..5 (15 bp)',
    },
  ]

  it.each(cases)('$name', ({ input, expected }) => {
    expect(buildSelectionStatusSummary(input)).toBe(expected)
  })
})

describe('buildSelectionBarStatusEcho composition', () => {
  const cases: Array<{ name: string; input: Parameters<typeof buildSelectionBarStatusEcho>[0]; expected: string }> = [
    {
      name: 'passes through an ordinary status message',
      input: { status: 'Ready', enzymeScan: IDLE_SCAN, isDirty: false },
      expected: 'Ready',
    },
    {
      name: 'suppresses selection echo statuses',
      input: { status: 'Selected 10..30 (21 bp).', enzymeScan: IDLE_SCAN, isDirty: false },
      expected: '',
    },
    {
      name: 'suppresses caret echo statuses',
      input: { status: 'Caret at position 42', enzymeScan: IDLE_SCAN, isDirty: false },
      expected: '',
    },
    {
      name: 'reports a pending enzyme scan',
      input: { status: 'Ready', enzymeScan: { ...IDLE_SCAN, pending: true, stage: 'preview' }, isDirty: false },
      expected: 'Ready · Scanning restriction sites…',
    },
    {
      name: 'reports an enzyme scan error with its message',
      input: { status: '', enzymeScan: { ...IDLE_SCAN, stage: 'error', error: 'worker failed' }, isDirty: false },
      expected: 'Enzyme scan failed: worker failed',
    },
    {
      name: 'reports an enzyme scan error without a message as unknown',
      input: { status: '', enzymeScan: { ...IDLE_SCAN, stage: 'error' }, isDirty: false },
      expected: 'Enzyme scan failed: unknown error',
    },
    {
      name: 'appends the unsaved-changes flag after the status text',
      input: { status: 'Ready', enzymeScan: IDLE_SCAN, isDirty: true },
      expected: 'Ready · Unsaved changes',
    },
    {
      name: 'joins status, scan progress, and dirty flags in DOM order',
      input: { status: 'Saved.', enzymeScan: { ...IDLE_SCAN, pending: true, stage: 'preview' }, isDirty: true },
      expected: 'Saved. · Scanning restriction sites… · Unsaved changes',
    },
  ]

  it.each(cases)('$name', ({ input, expected }) => {
    expect(buildSelectionBarStatusEcho(input)).toBe(expected)
  })
})

// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, type Mock, vi } from 'vitest'
import { labPlasmid } from '../../domain/fixtures'
import { syncTranslatedFeaturesNotes } from '../../domain/featureQualifiers'
import type { DnaAnnotationPlan } from '../../domain/dnaDatabaseAnnotation'
import type { InterProScanMatch } from '../../domain/proteinInterProAnnotation'
import type { UniProtAnnotationPlan, UniProtSimilarityHit } from '../../domain/proteinUniProtAnnotation'
import type { TranslatedOrfHitPlan } from '../../domain/translatedOrfAnnotation'
import type { SequenceFeature, SequenceRecord } from '../../domain/types'
import { useFeatureAnnotationController, type FeatureAnnotationControllerOptions } from './useFeatureAnnotationController'

const featureColor = labPlasmid.features[0]!.color

const baseProteinRecord: SequenceRecord = {
  id: 'protein',
  name: 'Protein',
  description: '',
  molecule: 'protein',
  topology: 'linear',
  sequence: 'M'.repeat(30),
  features: [],
  primers: [],
  operations: [],
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  construct: {
    syntheticDna: false,
    confirmedExperimentally: false,
    laboratoryHostOrganism: null,
    sourceOrganism: null,
    bacterialTransformationStrain: null,
    hostMethylation: { dam: false, dcm: false, ecoKI: false },
    sequenceClass: '',
    accessionNumber: '',
    codeNumber: '',
    sequenceAuthor: '',
    comments: '',
    references: '',
  },
  protein: { numberingStart: 1, numberingRegions: [], bonds: [] },
}

const baseDnaRecord: SequenceRecord = {
  ...baseProteinRecord,
  id: 'dna',
  name: 'DNA',
  molecule: 'dna',
  sequence: 'ATG'.repeat(100),
  protein: undefined,
}

type RecordKind = 'dna' | 'protein'

type SelectionSpies = {
  setSelectedFeatureId: Mock
  setSelectedFeatureIds: Mock
  setFeatureTabSelectionMemberId: Mock
  setFeatureTabAnchor: Mock
  setSelectionFocus: Mock
  setSelectedRange: Mock
}

type HarnessOptionsPatch = Partial<Pick<FeatureAnnotationControllerOptions,
  'record' | 'tryOpenCommonFeaturesBrowser' | 'openLocalCommonFeaturesBrowser'
>> & {
  updateRecord?: Mock
  setStatus?: Mock
  setSelectedFeatureId?: Mock
  setSelectedFeatureIds?: Mock
  setFeatureTabSelectionMemberId?: Mock
  setFeatureTabAnchor?: Mock
  setSelectionFocus?: Mock
  setSelectedRange?: Mock
}

type WorkflowHarness = {
  get current(): SequenceRecord
  get updateRecord(): Mock
  get setStatus(): Mock
  selection: SelectionSpies
  get options(): FeatureAnnotationControllerOptions
  controller: () => ReturnType<typeof useFeatureAnnotationController>
  rerender: (patch: HarnessOptionsPatch) => void
  dispose: () => void
}

function cloneRecord(record: SequenceRecord): SequenceRecord {
  return structuredClone(record)
}

function feature(id: string, start = 0, end = 3): SequenceFeature {
  return {
    id,
    name: id,
    type: 'misc_feature',
    color: featureColor,
    locations: [{ start, end, strand: 'forward' }],
  }
}

function translatableCds(id: string, start: number, end: number): SequenceFeature {
  return {
    ...feature(id, start, end),
    type: 'CDS',
    translateInSequenceView: true,
    notes: '/translation="stale"',
  }
}

function uniProtHit(accession: string): UniProtSimilarityHit {
  return {
    accession,
    description: 'Test protein',
    subjectLength: 10,
    bitScore: 50,
    eValue: 1e-10,
    identityPercent: 90,
    positivesPercent: 90,
    queryCoveragePercent: 100,
    queryStart: 1,
    queryEnd: 10,
    subjectStart: 1,
    subjectEnd: 10,
    reviewed: true,
    featureCount: 1,
    bondCount: 0,
    entry: {
      primaryAccession: accession,
      sequence: { value: 'MKTCCAAAGG', length: 10 },
      features: [],
    },
  }
}

function uniProtPlan(accession: string): UniProtAnnotationPlan {
  return {
    hit: uniProtHit(accession),
    queryOffset: 0,
    queryLength: 10,
    alignmentIdentityPercent: 90,
    alignmentCoveragePercent: 100,
    annotations: [],
  }
}

function dnaPlan(accession: string): DnaAnnotationPlan {
  return {
    hit: {
      provider: 'ncbi',
      accession,
      title: 'Test hit',
      subjectLength: 100,
      bitScore: 100,
      eValue: 1e-20,
      identityPercent: 99,
      queryCoveragePercent: 100,
      queryStart: 1,
      queryEnd: 100,
      subjectStart: 1,
      subjectEnd: 100,
      queryAligned: 'ATG',
      subjectAligned: 'ATG',
    },
    sourceRecord: baseDnaRecord,
    annotations: [],
  }
}

function translatedOrfPlan(accession: string, orfId: string): TranslatedOrfHitPlan {
  const orfFeature = feature(orfId, 10, 20)
  return {
    orf: { id: orfId, name: orfId, feature: orfFeature, cells: [], proteinSequence: 'M'.repeat(10), aminoAcidLength: 10 },
    hit: uniProtHit(accession),
    annotations: [],
  }
}

function interProMatch(id: string): InterProScanMatch {
  return {
    id,
    analysis: 'Pfam',
    signatureAccession: 'PF00001',
    signatureDescription: 'Test domain',
    start: 0,
    end: 3,
    status: 'T',
    goTerms: [],
    pathways: [],
    interProAccession: 'IPR000001',
  }
}

function createSelectionSpies(): SelectionSpies {
  return {
    setSelectedFeatureId: vi.fn(),
    setSelectedFeatureIds: vi.fn(),
    setFeatureTabSelectionMemberId: vi.fn(),
    setFeatureTabAnchor: vi.fn(),
    setSelectionFocus: vi.fn(),
    setSelectedRange: vi.fn(),
  }
}

function firstCallOrder(mock: Mock) {
  return mock.mock.invocationCallOrder[0]
}

function expectIncreasingCallOrder(mocks: Mock[]) {
  for (let index = 1; index < mocks.length; index += 1) {
    expect(firstCallOrder(mocks[index - 1]!)).toBeLessThan(firstCallOrder(mocks[index]!)!)
  }
}

function expectUpdateBeforeSelectionBeforeStatus(updateRecord: Mock, setStatus: Mock, selectionMocks: Mock[]) {
  const updateOrder = firstCallOrder(updateRecord)
  const statusOrder = firstCallOrder(setStatus)
  expect(updateOrder).toBeDefined()
  expect(statusOrder).toBeDefined()
  for (const selectionMock of selectionMocks) {
    for (const selectionOrder of selectionMock.mock.invocationCallOrder) {
      expect(updateOrder!).toBeLessThan(selectionOrder)
      expect(selectionOrder).toBeLessThan(statusOrder!)
    }
  }
}

function expectConsensusSelectionOrder(selection: SelectionSpies) {
  expectIncreasingCallOrder([
    selection.setSelectedFeatureId,
    selection.setSelectedFeatureIds,
    selection.setFeatureTabSelectionMemberId,
    selection.setFeatureTabAnchor,
    selection.setSelectionFocus,
    selection.setSelectedRange,
  ])
}

function expectOmittedSelectionOrder(selection: SelectionSpies) {
  expectIncreasingCallOrder([
    selection.setSelectedFeatureId,
    selection.setSelectedFeatureIds,
    selection.setSelectionFocus,
    selection.setSelectedRange,
  ])
}

function expectPreserveSelectionOrder(selection: SelectionSpies) {
  expectOmittedSelectionOrder(selection)
}

function expectNoSelectionSetters(selection: SelectionSpies) {
  expect(selection.setSelectedFeatureId).not.toHaveBeenCalled()
  expect(selection.setSelectedFeatureIds).not.toHaveBeenCalled()
  expect(selection.setFeatureTabSelectionMemberId).not.toHaveBeenCalled()
  expect(selection.setFeatureTabAnchor).not.toHaveBeenCalled()
  expect(selection.setSelectionFocus).not.toHaveBeenCalled()
  expect(selection.setSelectedRange).not.toHaveBeenCalled()
}

function createWorkflowHarness(kind: RecordKind): WorkflowHarness {
  let current = cloneRecord(kind === 'dna' ? baseDnaRecord : baseProteinRecord)
  let updateRecord = vi.fn((updater: (record: SequenceRecord) => SequenceRecord) => { current = updater(current) })
  let setStatus = vi.fn()
  const selection = createSelectionSpies()
  let options: FeatureAnnotationControllerOptions = {
    record: current,
    updateRecord,
    setStatus,
    loadCommonFeatures: async () => [],
    addUserCommonFeatures: vi.fn(),
    selectedRange: null,
    selectedFeaturesForMenu: [],
    ...selection,
    tryOpenCommonFeaturesBrowser: vi.fn().mockResolvedValue(false),
    openLocalCommonFeaturesBrowser: vi.fn(),
  }

  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  let controller!: ReturnType<typeof useFeatureAnnotationController>

  function renderHarness() {
    options = { ...options, record: current, updateRecord, setStatus, ...selection }
    function Harness({ harnessOptions }: { harnessOptions: FeatureAnnotationControllerOptions }) {
      controller = useFeatureAnnotationController(harnessOptions)
      return null
    }
    act(() => root.render(<Harness harnessOptions={options} />))
  }

  renderHarness()

  return {
    get current() { return current },
    get updateRecord() { return updateRecord },
    get setStatus() { return setStatus },
    selection,
    get options() { return options },
    controller: () => controller,
    rerender(patch) {
      if (patch.record) current = patch.record
      if (patch.updateRecord) updateRecord = patch.updateRecord
      if (patch.setStatus) setStatus = patch.setStatus
      if (patch.setSelectedFeatureId) selection.setSelectedFeatureId = patch.setSelectedFeatureId
      if (patch.setSelectedFeatureIds) selection.setSelectedFeatureIds = patch.setSelectedFeatureIds
      if (patch.setFeatureTabSelectionMemberId) selection.setFeatureTabSelectionMemberId = patch.setFeatureTabSelectionMemberId
      if (patch.setFeatureTabAnchor) selection.setFeatureTabAnchor = patch.setFeatureTabAnchor
      if (patch.setSelectionFocus) selection.setSelectionFocus = patch.setSelectionFocus
      if (patch.setSelectedRange) selection.setSelectedRange = patch.setSelectedRange
      options = { ...options, ...patch, record: current, updateRecord, setStatus, ...selection }
      renderHarness()
    },
    dispose() {
      act(() => root.unmount())
      host.remove()
    },
  }
}

describe('useFeatureAnnotationController', () => {
  const disposables: Array<() => void> = []

  afterEach(() => {
    for (const dispose of disposables.splice(0)) dispose()
  })

  it('applies DNA database annotations with record operation, consensus selection, status, and call order', () => {
    const harness = createWorkflowHarness('dna')
    disposables.push(harness.dispose)
    const annotations = [feature('dna-first', 1, 5), feature('dna-second', 10, 14)]

    act(() => {
      harness.controller().setDnaDatabaseAnnotationRange({ start: 0, end: 30 })
      harness.controller().applyDnaDatabaseAnnotations(annotations, [dnaPlan('NC_000001')])
    })

    expect(harness.current.features.map((entry) => entry.id)).toEqual(['dna-first', 'dna-second'])
    expect(harness.current.operations.at(-1)).toMatchObject({
      type: 'annotateDnaSimilarity',
      summary: 'Transferred 2 DNA features from NCBI:NC_000001',
    })
    expect(harness.selection.setSelectedFeatureId).toHaveBeenCalledWith('dna-first')
    expect(harness.selection.setSelectedFeatureIds).toHaveBeenCalledWith(['dna-first', 'dna-second'])
    expect(harness.selection.setFeatureTabSelectionMemberId).toHaveBeenCalledWith(null)
    expect(harness.selection.setFeatureTabAnchor).toHaveBeenCalledWith({ featureId: 'dna-first', memberId: null })
    expect(harness.selection.setSelectionFocus).toHaveBeenCalledWith('feature')
    expect(harness.selection.setSelectedRange).toHaveBeenCalledWith({ start: 1, end: 5 })
    expect(harness.setStatus).toHaveBeenCalledWith('Added 2 DNA database annotations from 1 match.')
    expect(harness.controller().dnaDatabaseAnnotationRange).toBeNull()
    expectConsensusSelectionOrder(harness.selection)
    expectUpdateBeforeSelectionBeforeStatus(harness.updateRecord, harness.setStatus, Object.values(harness.selection))
  })

  it('applies translated-ORF annotations with omitted member scope (no member/anchor setters)', () => {
    const harness = createWorkflowHarness('dna')
    disposables.push(harness.dispose)
    const annotations = [feature('orf-first', 2, 6), feature('orf-second', 8, 12)]

    act(() => {
      harness.controller().setTranslatedOrfAnnotationRange({ start: 0, end: 30 })
      harness.controller().applyTranslatedOrfAnnotations(annotations, [translatedOrfPlan('P99999', 'orf-1')])
    })

    expect(harness.current.features.map((entry) => entry.id)).toEqual(['orf-first', 'orf-second'])
    expect(harness.current.operations.at(-1)).toMatchObject({
      type: 'annotateTranslatedOrfs',
      summary: 'Transferred 2 protein features to 1 translated ORFs from UniProtKB:P99999',
    })
    expect(harness.selection.setSelectedFeatureId).toHaveBeenCalledWith('orf-first')
    expect(harness.selection.setSelectedFeatureIds).toHaveBeenCalledWith(['orf-first', 'orf-second'])
    expect(harness.selection.setSelectedRange).toHaveBeenCalledWith({ start: 2, end: 6 })
    expect(harness.selection.setFeatureTabSelectionMemberId).not.toHaveBeenCalled()
    expect(harness.selection.setFeatureTabAnchor).not.toHaveBeenCalled()
    expect(harness.setStatus).toHaveBeenCalledWith('Added 2 translated-ORF annotations from 1 UniProt match.')
    expectOmittedSelectionOrder(harness.selection)
    expectUpdateBeforeSelectionBeforeStatus(harness.updateRecord, harness.setStatus, [
      harness.selection.setSelectedFeatureId,
      harness.selection.setSelectedFeatureIds,
      harness.selection.setSelectionFocus,
      harness.selection.setSelectedRange,
    ])
  })

  it('adds multiple detected common features in order with synced translation notes and consensus selection', () => {
    const harness = createWorkflowHarness('dna')
    disposables.push(harness.dispose)
    const sequence = harness.current.sequence
    const input = [feature('common-plain', 20, 24), translatableCds('common-cds', 0, 9)]
    const expectedSynced = syncTranslatedFeaturesNotes(input, sequence, harness.current.topology)

    act(() => {
      harness.controller().setCommonFeatureDetection({ matches: [], templates: [], minimumIdentityPercent: 100 })
      harness.controller().addDetectedCommonFeatures(input)
    })

    expect(expectedSynced[1]!.notes).not.toBe(input[1]!.notes)
    expect(harness.current.features).toEqual(expectedSynced)
    expect(harness.current.operations).toHaveLength(0)
    expect(harness.controller().commonFeatureDetection).toBeNull()
    expect(harness.selection.setSelectedFeatureId).toHaveBeenCalledWith('common-plain')
    expect(harness.selection.setSelectedFeatureIds).toHaveBeenCalledWith(['common-plain', 'common-cds'])
    expect(harness.selection.setFeatureTabAnchor).toHaveBeenCalledWith({ featureId: 'common-plain', memberId: null })
    expect(harness.selection.setSelectedRange).toHaveBeenCalledWith({ start: 20, end: 24 })
    expect(harness.setStatus).toHaveBeenCalledWith('Added 2 common features.')
    expectConsensusSelectionOrder(harness.selection)
    expectUpdateBeforeSelectionBeforeStatus(harness.updateRecord, harness.setStatus, Object.values(harness.selection))
  })

  it('applies UniProt protein annotations with preserve member scope (no member/anchor setters)', () => {
    const harness = createWorkflowHarness('protein')
    disposables.push(harness.dispose)

    act(() => {
      harness.controller().setProteinUniProtAnnotationRange({ start: 0, end: 30 })
      harness.controller().applyProteinUniProtAnnotations([feature('first'), feature('second', 4, 8)], [], [uniProtPlan('P12345')])
    })

    expect(harness.current.operations.at(-1)).toMatchObject({
      type: 'annotateUniProtSimilarity',
      summary: 'Transferred 2 features and 0 bonds from UniProtKB:P12345',
    })
    expect(harness.selection.setSelectedFeatureIds).toHaveBeenCalledWith(['first'])
    expect(harness.selection.setFeatureTabSelectionMemberId).not.toHaveBeenCalled()
    expect(harness.selection.setFeatureTabAnchor).not.toHaveBeenCalled()
    expect(harness.setStatus).toHaveBeenCalledWith('Added 2 features and 0 bonds from 1 UniProt match (P12345).')
    expectPreserveSelectionOrder(harness.selection)
    expectUpdateBeforeSelectionBeforeStatus(harness.updateRecord, harness.setStatus, [
      harness.selection.setSelectedFeatureId,
      harness.selection.setSelectedFeatureIds,
      harness.selection.setSelectionFocus,
      harness.selection.setSelectedRange,
    ])
  })

  it('applies InterPro annotations with preserve member scope (no member/anchor setters)', () => {
    const harness = createWorkflowHarness('protein')
    disposables.push(harness.dispose)

    act(() => {
      harness.controller().setProteinUniProtAnnotationRange({ start: 0, end: 30 })
      harness.controller().applyProteinInterProAnnotations([feature('domain-first', 1, 4), feature('domain-second', 6, 9)], [interProMatch('match-1')])
    })

    expect(harness.current.features.map((entry) => entry.id)).toEqual(['domain-first', 'domain-second'])
    expect(harness.current.operations.at(-1)).toMatchObject({
      type: 'annotateInterProPfam',
      summary: 'Added 2 predicted protein features from InterPro IPR000001; Pfam PF00001',
    })
    expect(harness.selection.setSelectedFeatureId).toHaveBeenCalledWith('domain-first')
    expect(harness.selection.setSelectedFeatureIds).toHaveBeenCalledWith(['domain-first'])
    expect(harness.selection.setFeatureTabSelectionMemberId).not.toHaveBeenCalled()
    expect(harness.selection.setFeatureTabAnchor).not.toHaveBeenCalled()
    expect(harness.selection.setSelectedRange).toHaveBeenCalledWith({ start: 1, end: 4 })
    expect(harness.setStatus).toHaveBeenCalledWith('Added 2 InterPro/Pfam domain annotations.')
    expectPreserveSelectionOrder(harness.selection)
  })

  type AnnotationController = ReturnType<typeof useFeatureAnnotationController>

  it.each([
    {
      label: 'DNA database',
      kind: 'dna' as const,
      prime: (controller: AnnotationController) => controller.setDnaDatabaseAnnotationRange({ start: 0, end: 30 }),
      apply: (controller: AnnotationController) => controller.applyDnaDatabaseAnnotations([], []),
      operation: { type: 'annotateDnaSimilarity', summary: 'Transferred 0 DNA features from NCBI:' },
      status: 'Added 0 DNA database annotations from 0 matches.',
      cleared: (controller: AnnotationController) => controller.dnaDatabaseAnnotationRange,
    },
    {
      label: 'translated ORF',
      kind: 'dna' as const,
      prime: (controller: AnnotationController) => controller.setTranslatedOrfAnnotationRange({ start: 0, end: 30 }),
      apply: (controller: AnnotationController) => controller.applyTranslatedOrfAnnotations([], []),
      operation: { type: 'annotateTranslatedOrfs', summary: 'Transferred 0 protein features to 0 translated ORFs from UniProtKB:' },
      status: 'Added 0 translated-ORF annotations from 0 UniProt matches.',
      cleared: (controller: AnnotationController) => controller.translatedOrfAnnotationRange,
    },
    {
      label: 'UniProt',
      kind: 'protein' as const,
      prime: (controller: AnnotationController) => controller.setProteinUniProtAnnotationRange({ start: 0, end: 30 }),
      apply: (controller: AnnotationController) => controller.applyProteinUniProtAnnotations([], [], []),
      operation: { type: 'annotateUniProtSimilarity', summary: 'Transferred 0 features and 0 bonds from ' },
      status: 'Added 0 features and 0 bonds from 0 UniProt matches ().',
      cleared: (controller: AnnotationController) => controller.proteinUniProtAnnotationRange,
    },
    {
      label: 'InterPro',
      kind: 'protein' as const,
      prime: (controller: AnnotationController) => controller.setProteinUniProtAnnotationRange({ start: 0, end: 30 }),
      apply: (controller: AnnotationController) => controller.applyProteinInterProAnnotations([], []),
      operation: { type: 'annotateInterProPfam', summary: 'Added 0 predicted protein features from ' },
      status: 'Added 0 InterPro/Pfam domain annotations.',
      cleared: (controller: AnnotationController) => controller.proteinUniProtAnnotationRange,
    },
  ])('empty $label apply records operation, clears range, emits zero status, and skips selection', ({ kind, prime, apply, operation, status, cleared }) => {
    const harness = createWorkflowHarness(kind)
    disposables.push(harness.dispose)

    act(() => {
      prime(harness.controller())
      apply(harness.controller())
    })

    expect(harness.current.operations.at(-1)).toMatchObject(operation)
    expect(cleared(harness.controller())).toBeNull()
    expect(harness.setStatus).toHaveBeenCalledWith(status)
    expectNoSelectionSetters(harness.selection)
    expect(firstCallOrder(harness.updateRecord)).toBeLessThan(firstCallOrder(harness.setStatus)!)
  })

  it('empty common-feature input clears detection without record, status, or selection changes', () => {
    const harness = createWorkflowHarness('dna')
    disposables.push(harness.dispose)

    act(() => {
      harness.controller().setCommonFeatureDetection({ matches: [], templates: [], minimumIdentityPercent: 100 })
      harness.controller().addDetectedCommonFeatures([])
    })

    expect(harness.current.operations).toHaveLength(0)
    expect(harness.controller().commonFeatureDetection).toBeNull()
    expect(harness.updateRecord).not.toHaveBeenCalled()
    expect(harness.setStatus).not.toHaveBeenCalled()
    expectNoSelectionSetters(harness.selection)
  })

  it('uses fresh update, selection, and status ports after options rerender', () => {
    const harness = createWorkflowHarness('dna')
    disposables.push(harness.dispose)
    const staleStatus = harness.setStatus
    const staleSelection = harness.selection.setSelectedFeatureId
    const staleUpdate = harness.updateRecord
    const freshStatus = vi.fn()
    const freshSelection = vi.fn()
    const freshUpdate = vi.fn((updater: (record: SequenceRecord) => SequenceRecord) => {
      harness.rerender({ record: updater(structuredClone(harness.current)) })
    })

    harness.rerender({
      setStatus: freshStatus,
      setSelectedFeatureId: freshSelection,
      updateRecord: freshUpdate,
    })

    act(() => {
      harness.controller().applyDnaDatabaseAnnotations([feature('fresh', 2, 5)], [dnaPlan('NC_000002')])
    })

    expect(staleStatus).not.toHaveBeenCalled()
    expect(staleSelection).not.toHaveBeenCalled()
    expect(staleUpdate).not.toHaveBeenCalled()
    expect(freshUpdate).toHaveBeenCalled()
    expect(freshStatus).toHaveBeenCalledWith('Added 1 DNA database annotation from 1 match.')
    expect(freshSelection).toHaveBeenCalledWith('fresh')
  })

  it('openCommonFeaturesBrowser uses the local fallback only when hybrid open fails', async () => {
    const harness = createWorkflowHarness('protein')
    disposables.push(harness.dispose)
    const tryOpenCommonFeaturesBrowser = vi.fn().mockResolvedValueOnce(true).mockResolvedValueOnce(false)
    const openLocalCommonFeaturesBrowser = vi.fn()
    harness.rerender({ tryOpenCommonFeaturesBrowser, openLocalCommonFeaturesBrowser })

    await act(async () => {
      await harness.controller().openCommonFeaturesBrowser()
      await harness.controller().openCommonFeaturesBrowser()
    })

    expect(tryOpenCommonFeaturesBrowser).toHaveBeenCalledTimes(2)
    expect(openLocalCommonFeaturesBrowser).toHaveBeenCalledOnce()
  })
})

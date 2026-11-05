// @vitest-environment jsdom
import { act, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { normalizeSequenceRecord } from '../src/domain/constructProperties'
import { cloneFixture } from '../src/domain/fixtures'
import { traceRecordFromSequence } from '../src/domain/sequenceTraceFactory'
import type { Primer, SequenceRecord } from '../src/domain/types'
import type { TraceFileRecord } from '../src/domain/traceTypes'
import { useWorkspaceAnnotationSelectionController } from '../src/presentation/hooks/useWorkspaceAnnotationSelectionController'

function primer(id: string): Primer {
  return { id, name: id, sequence: 'ACGTACGT', color: id }
}

function dnaRecord(primers: Primer[], extra: Partial<SequenceRecord> = {}): SequenceRecord {
  return normalizeSequenceRecord({
    ...cloneFixture(),
    id: 'record',
    name: 'record',
    molecule: 'dna',
    topology: 'linear',
    sequence: 'ACGTACGTACGTACGTACGTACGTACGTACGTACGT',
    features: [],
    primers,
    ...extra,
  })
}

function libraryMember(id: string, primers: Primer[]): TraceFileRecord {
  return {
    ...traceRecordFromSequence('ACGTACGTACGTACGTACGTACGTACGTACGTACGT', `${id}.ab1`, { id }),
    primers,
  }
}

describe('useWorkspaceAnnotationSelectionController', () => {
  let cleanup: (() => void) | null = null
  afterEach(() => {
    cleanup?.()
    cleanup = null
  })

  it('selects a consensus primer on the main record', () => {
    const currentRecord = dnaRecord([primer('c1'), primer('c2')])
    const focusPrimerTabSelection = vi.fn()
    const view = {
      selectedPrimerId: null as string | null,
      selectedPrimerIds: [] as string[],
      selectionFocus: 'dna' as string,
      selectedAlignmentTraceId: null as string | null,
      controller: null as ReturnType<typeof useWorkspaceAnnotationSelectionController> | null,
    }

    function Harness() {
      const [selectedPrimerId, setSelectedPrimerId] = useState<string | null>(null)
      const [selectedPrimerIds, setSelectedPrimerIds] = useState<string[]>([])
      const [selectionFocus, setSelectionFocus] = useState<'dna' | 'feature' | 'primer' | 'bond'>('dna')
      const [selectedAlignmentTraceId, setSelectedAlignmentTraceId] = useState<string | null>(null)
      view.selectedPrimerId = selectedPrimerId
      view.selectedPrimerIds = selectedPrimerIds
      view.selectionFocus = selectionFocus
      view.selectedAlignmentTraceId = selectedAlignmentTraceId
      view.controller = useWorkspaceAnnotationSelectionController({
        record: currentRecord,
        traceFiles: [],
        selectableAnnotations: [],
        alignmentsVisible: false,
        selectedAlignmentTraceId,
        selectionFocus,
        selectionAnchor: null,
        selectedFeatureId: null,
        selectedFeatureIds: [],
        selectedPrimerIds,
        selectedRange: null,
        featureTabSelectionMemberId: null,
        primerBindings: [{ primer: primer('c1'), start: 2, end: 10, strand: 'forward' }],
        setSelectedAlignmentTraceId,
        setSelectedProteinBondId: vi.fn(),
        setCutSelectionAnchor: vi.fn(),
        setCutStrandSelection: vi.fn(),
        setCutSelectionEnzymes: vi.fn(),
        setSelectedPrimerId,
        setSelectedPrimerIds,
        setSelectedFeatureId: vi.fn(),
        setSelectedFeatureIds: vi.fn(),
        setFeatureTabSelectionMemberId: vi.fn(),
        setFeatureTabAnchor: vi.fn(),
        setSelectionFocus,
        setSelectedRange: vi.fn(),
        setSelectionAnchor: vi.fn(),
        setSequenceScrollTarget: vi.fn(),
        scrollAlignmentToTemplate: vi.fn(),
        setStatus: vi.fn(),
        extendSelectionToEndpoint: vi.fn(),
        focusPrimerTabSelection,
        resolveMobilePrimerPairExtend: (extend) => extend,
        matchesMobileShellViewport: () => false,
        mobilePrimerAnchorStatus: (name) => name,
        facingPrimerAmpliconRange: () => null,
        selectionLength: (range) => range.end - range.start + 1,
        formatRange: (start, end) => `${start}-${end}`,
      })
      return null
    }

    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)
    cleanup = () => act(() => root.unmount())
    act(() => root.render(<Harness />))

    act(() => view.controller!.selectPrimerById('c1'))

    expect(view.selectedPrimerIds).toEqual(['c1'])
    expect(view.selectedPrimerId).toBe('c1')
    expect(view.selectionFocus).toBe('primer')
    expect(view.selectedAlignmentTraceId).toBeNull()
    expect(focusPrimerTabSelection).not.toHaveBeenCalled()
  })

  it('selects a library member primer through member-aware routing', () => {
    const memberPrimer = primer('pm1')
    const currentRecord = dnaRecord([primer('c1')], { dna: { documentRole: 'library' } })
    const traceFiles = [libraryMember('m1', [memberPrimer])]
    const focusPrimerTabSelection = vi.fn()
    const view = {
      selectedAlignmentTraceId: null as string | null,
      controller: null as ReturnType<typeof useWorkspaceAnnotationSelectionController> | null,
    }

    function Harness() {
      const [selectedAlignmentTraceId, setSelectedAlignmentTraceId] = useState<string | null>(null)
      view.selectedAlignmentTraceId = selectedAlignmentTraceId
      view.controller = useWorkspaceAnnotationSelectionController({
        record: currentRecord,
        traceFiles,
        selectableAnnotations: [],
        alignmentsVisible: false,
        selectedAlignmentTraceId,
        selectionFocus: 'dna',
        selectionAnchor: null,
        selectedFeatureId: null,
        selectedFeatureIds: [],
        selectedPrimerIds: [],
        selectedRange: null,
        featureTabSelectionMemberId: null,
        primerBindings: [],
        setSelectedAlignmentTraceId,
        setSelectedProteinBondId: vi.fn(),
        setCutSelectionAnchor: vi.fn(),
        setCutStrandSelection: vi.fn(),
        setCutSelectionEnzymes: vi.fn(),
        setSelectedPrimerId: vi.fn(),
        setSelectedPrimerIds: vi.fn(),
        setSelectedFeatureId: vi.fn(),
        setSelectedFeatureIds: vi.fn(),
        setFeatureTabSelectionMemberId: vi.fn(),
        setFeatureTabAnchor: vi.fn(),
        setSelectionFocus: vi.fn(),
        setSelectedRange: vi.fn(),
        setSelectionAnchor: vi.fn(),
        setSequenceScrollTarget: vi.fn(),
        scrollAlignmentToTemplate: vi.fn(),
        setStatus: vi.fn(),
        extendSelectionToEndpoint: vi.fn(),
        focusPrimerTabSelection,
        resolveMobilePrimerPairExtend: (extend) => extend,
        matchesMobileShellViewport: () => false,
        mobilePrimerAnchorStatus: (name) => name,
        facingPrimerAmpliconRange: () => null,
        selectionLength: (range) => range.end - range.start + 1,
        formatRange: (start, end) => `${start}-${end}`,
      })
      return null
    }

    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)
    cleanup = () => act(() => root.unmount())
    act(() => root.render(<Harness />))

    act(() => view.controller!.selectPrimerById('pm1', false, { libraryMemberId: 'm1' }))

    expect(focusPrimerTabSelection).toHaveBeenCalledWith('pm1', ['pm1'], 'm1')
    expect(view.selectedAlignmentTraceId).toBeNull()
  })

  it('ignores unknown primer ids without changing alignment member selection', () => {
    const currentRecord = dnaRecord([primer('c1')])
    const setSelectedAlignmentTraceId = vi.fn()
    const setSelectedPrimerIds = vi.fn()
    const view = {
      controller: null as ReturnType<typeof useWorkspaceAnnotationSelectionController> | null,
    }

    function Harness() {
      view.controller = useWorkspaceAnnotationSelectionController({
        record: currentRecord,
        traceFiles: [],
        selectableAnnotations: [],
        alignmentsVisible: false,
        selectedAlignmentTraceId: 'm1',
        selectionFocus: 'dna',
        selectionAnchor: null,
        selectedFeatureId: null,
        selectedFeatureIds: [],
        selectedPrimerIds: [],
        selectedRange: null,
        featureTabSelectionMemberId: null,
        primerBindings: [],
        setSelectedAlignmentTraceId,
        setSelectedProteinBondId: vi.fn(),
        setCutSelectionAnchor: vi.fn(),
        setCutStrandSelection: vi.fn(),
        setCutSelectionEnzymes: vi.fn(),
        setSelectedPrimerId: vi.fn(),
        setSelectedPrimerIds,
        setSelectedFeatureId: vi.fn(),
        setSelectedFeatureIds: vi.fn(),
        setFeatureTabSelectionMemberId: vi.fn(),
        setFeatureTabAnchor: vi.fn(),
        setSelectionFocus: vi.fn(),
        setSelectedRange: vi.fn(),
        setSelectionAnchor: vi.fn(),
        setSequenceScrollTarget: vi.fn(),
        scrollAlignmentToTemplate: vi.fn(),
        setStatus: vi.fn(),
        extendSelectionToEndpoint: vi.fn(),
        focusPrimerTabSelection: vi.fn(),
        resolveMobilePrimerPairExtend: (extend) => extend,
        matchesMobileShellViewport: () => false,
        mobilePrimerAnchorStatus: (name) => name,
        facingPrimerAmpliconRange: () => null,
        selectionLength: (range) => range.end - range.start + 1,
        formatRange: (start, end) => `${start}-${end}`,
      })
      return null
    }

    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)
    cleanup = () => act(() => root.unmount())
    act(() => root.render(<Harness />))

    act(() => view.controller!.selectPrimerById('missing'))

    expect(setSelectedPrimerIds).not.toHaveBeenCalled()
    expect(setSelectedAlignmentTraceId).not.toHaveBeenCalled()
  })

  describe('sequence-pane selection commands', () => {
    function feature(id: string) {
      return {
        id,
        name: id,
        type: 'CDS',
        color: '#336699',
        locations: [{ start: 0, end: 8, strand: 'forward' as const }],
      }
    }

    function mountSequenceSelectionHarness() {
      const setSequenceScrollTarget = vi.fn()
      const focusPrimerTabSelection = vi.fn()
      const setSelectedFeatureId = vi.fn()
      const currentRecord = dnaRecord([primer('c1')], { features: [feature('feature-dna')] })
      const memberPrimer = primer('pm1')
      const traceFiles = [libraryMember('member-1', [memberPrimer])]
      const view = {
        controller: null as ReturnType<typeof useWorkspaceAnnotationSelectionController> | null,
      }

      function Harness() {
        view.controller = useWorkspaceAnnotationSelectionController({
          record: currentRecord,
          traceFiles,
          selectableAnnotations: currentRecord.features,
          alignmentsVisible: false,
          selectedAlignmentTraceId: null,
          selectionFocus: 'dna',
          selectionAnchor: null,
          selectedFeatureId: null,
          selectedFeatureIds: [],
          selectedPrimerIds: [],
          selectedRange: null,
          featureTabSelectionMemberId: null,
          primerBindings: [{ primer: primer('c1'), start: 2, end: 10, strand: 'forward' }],
          setSelectedAlignmentTraceId: vi.fn(),
          setSelectedProteinBondId: vi.fn(),
          setCutSelectionAnchor: vi.fn(),
          setCutStrandSelection: vi.fn(),
          setCutSelectionEnzymes: vi.fn(),
          setSelectedPrimerId: vi.fn(),
          setSelectedPrimerIds: vi.fn(),
          setSelectedFeatureId,
          setSelectedFeatureIds: vi.fn(),
          setFeatureTabSelectionMemberId: vi.fn(),
          setFeatureTabAnchor: vi.fn(),
          setSelectionFocus: vi.fn(),
          setSelectedRange: vi.fn(),
          setSelectionAnchor: vi.fn(),
          setSequenceScrollTarget,
          scrollAlignmentToTemplate: vi.fn(),
          setStatus: vi.fn(),
          extendSelectionToEndpoint: vi.fn(),
          focusPrimerTabSelection,
          resolveMobilePrimerPairExtend: (extend) => extend,
          matchesMobileShellViewport: () => false,
          mobilePrimerAnchorStatus: (name) => name,
          facingPrimerAmpliconRange: () => null,
          selectionLength: (range) => range.end - range.start + 1,
          formatRange: (start, end) => `${start}-${end}`,
        })
        return null
      }

      const host = document.createElement('div')
      document.body.append(host)
      const root = createRoot(host)
      act(() => root.render(<Harness />))
      cleanup = () => act(() => root.unmount())

      return { view, setSequenceScrollTarget, focusPrimerTabSelection, setSelectedFeatureId }
    }

    it('selectProteinSequenceFeature selects with allowToggle and without scrolling', () => {
      const env = mountSequenceSelectionHarness()
      act(() => env.view.controller!.selectProteinSequenceFeature('feature-dna'))
      expect(env.setSelectedFeatureId).toHaveBeenCalledWith('feature-dna')
      expect(env.setSequenceScrollTarget).not.toHaveBeenCalled()
    })

    it('selectProteinSequenceFeature clears sole selection on re-select without scrolling', () => {
      const setSequenceScrollTarget = vi.fn()
      const proteinFeature = {
        id: 'prot-feature',
        name: 'prot-feature',
        type: 'CDS',
        color: '#336699',
        locations: [{ start: 0, end: 8, strand: 'forward' as const }],
      }
      const proteinRecord = normalizeSequenceRecord({
        ...cloneFixture(),
        id: 'protein-record',
        name: 'protein-record',
        molecule: 'protein',
        topology: 'linear',
        sequence: 'ACDEFGHIKLMNPQRSTVWY',
        features: [proteinFeature],
        primers: [],
      })
      const view = {
        selectedFeatureId: null as string | null,
        selectedFeatureIds: [] as string[],
        selectionFocus: 'dna' as 'dna' | 'feature' | 'primer' | 'bond',
        selectedRange: null as { start: number; end: number } | null,
        controller: null as ReturnType<typeof useWorkspaceAnnotationSelectionController> | null,
      }

      function Harness() {
        const [selectedFeatureId, setSelectedFeatureId] = useState<string | null>('prot-feature')
        const [selectedFeatureIds, setSelectedFeatureIds] = useState<string[]>(['prot-feature'])
        const [selectionFocus, setSelectionFocus] = useState<'dna' | 'feature' | 'primer' | 'bond'>('feature')
        const [selectedRange, setSelectedRange] = useState<{ start: number; end: number } | null>({ start: 0, end: 8 })
        view.selectedFeatureId = selectedFeatureId
        view.selectedFeatureIds = selectedFeatureIds
        view.selectionFocus = selectionFocus
        view.selectedRange = selectedRange
        view.controller = useWorkspaceAnnotationSelectionController({
          record: proteinRecord,
          traceFiles: [],
          selectableAnnotations: [proteinFeature],
          alignmentsVisible: false,
          selectedAlignmentTraceId: null,
          selectionFocus,
          selectionAnchor: { kind: 'feature', forward: { start: 0, end: 8 }, reverse: { start: 0, end: 8 } },
          selectedFeatureId,
          selectedFeatureIds,
          selectedPrimerIds: [],
          selectedRange,
          featureTabSelectionMemberId: null,
          primerBindings: [],
          setSelectedAlignmentTraceId: vi.fn(),
          setSelectedProteinBondId: vi.fn(),
          setCutSelectionAnchor: vi.fn(),
          setCutStrandSelection: vi.fn(),
          setCutSelectionEnzymes: vi.fn(),
          setSelectedPrimerId: vi.fn(),
          setSelectedPrimerIds: vi.fn(),
          setSelectedFeatureId,
          setSelectedFeatureIds,
          setFeatureTabSelectionMemberId: vi.fn(),
          setFeatureTabAnchor: vi.fn(),
          setSelectionFocus,
          setSelectedRange,
          setSelectionAnchor: vi.fn(),
          setSequenceScrollTarget,
          scrollAlignmentToTemplate: vi.fn(),
          setStatus: vi.fn(),
          extendSelectionToEndpoint: vi.fn(),
          focusPrimerTabSelection: vi.fn(),
          resolveMobilePrimerPairExtend: (extend) => extend,
          matchesMobileShellViewport: () => false,
          mobilePrimerAnchorStatus: (name) => name,
          facingPrimerAmpliconRange: () => null,
          selectionLength: (range) => range.end - range.start + 1,
          formatRange: (start, end) => `${start}-${end}`,
        })
        return null
      }

      const host = document.createElement('div')
      document.body.append(host)
      const root = createRoot(host)
      act(() => root.render(<Harness />))

      act(() => view.controller!.selectProteinSequenceFeature('prot-feature'))
      expect(view.selectedFeatureId).toBeNull()
      expect(view.selectedFeatureIds).toEqual([])
      expect(view.selectionFocus).toBe('dna')
      expect(view.selectedRange).toBeNull()
      expect(setSequenceScrollTarget).not.toHaveBeenCalled()

      act(() => root.unmount())
    })

    it('selectDnaSequenceFeature omits undefined libraryMemberId and includes explicit null', () => {
      const memberFeature = {
        id: 'member-feature',
        name: 'member-feature',
        type: 'CDS',
        color: '#336699',
        locations: [{ start: 0, end: 8, strand: 'forward' as const }],
      }
      const setSelectedAlignmentTraceId = vi.fn()
      const currentRecord = dnaRecord([primer('c1')], { features: [], dna: { documentRole: 'library' } })
      const traceFiles = [{ ...libraryMember('member-1', [primer('pm1')]), features: [memberFeature] }]
      const view = { controller: null as ReturnType<typeof useWorkspaceAnnotationSelectionController> | null }

      function Harness() {
        view.controller = useWorkspaceAnnotationSelectionController({
          record: currentRecord,
          traceFiles,
          selectableAnnotations: [memberFeature],
          alignmentsVisible: false,
          selectedAlignmentTraceId: 'member-1',
          selectionFocus: 'dna',
          selectionAnchor: null,
          selectedFeatureId: null,
          selectedFeatureIds: [],
          selectedPrimerIds: [],
          selectedRange: null,
          featureTabSelectionMemberId: 'member-1',
          primerBindings: [],
          setSelectedAlignmentTraceId,
          setSelectedProteinBondId: vi.fn(),
          setCutSelectionAnchor: vi.fn(),
          setCutStrandSelection: vi.fn(),
          setCutSelectionEnzymes: vi.fn(),
          setSelectedPrimerId: vi.fn(),
          setSelectedPrimerIds: vi.fn(),
          setSelectedFeatureId: vi.fn(),
          setSelectedFeatureIds: vi.fn(),
          setFeatureTabSelectionMemberId: vi.fn(),
          setFeatureTabAnchor: vi.fn(),
          setSelectionFocus: vi.fn(),
          setSelectedRange: vi.fn(),
          setSelectionAnchor: vi.fn(),
          setSequenceScrollTarget: vi.fn(),
          scrollAlignmentToTemplate: vi.fn(),
          setStatus: vi.fn(),
          extendSelectionToEndpoint: vi.fn(),
          focusPrimerTabSelection: vi.fn(),
          resolveMobilePrimerPairExtend: (extend) => extend,
          matchesMobileShellViewport: () => false,
          mobilePrimerAnchorStatus: (name) => name,
          facingPrimerAmpliconRange: () => null,
          selectionLength: (range) => range.end - range.start + 1,
          formatRange: (start, end) => `${start}-${end}`,
        })
        return null
      }

      const host = document.createElement('div')
      document.body.append(host)
      const root = createRoot(host)
      act(() => root.render(<Harness />))

      act(() => view.controller!.selectDnaSequenceFeature('member-feature', false))
      expect(setSelectedAlignmentTraceId).not.toHaveBeenCalled()

      setSelectedAlignmentTraceId.mockClear()
      act(() => view.controller!.selectDnaSequenceFeature('member-feature', false, null))
      expect(setSelectedAlignmentTraceId).toHaveBeenCalledWith(null)

      act(() => root.unmount())
    })

    it('selectDnaSequencePrimer passes scroll false and always includes libraryMemberId', () => {
      const memberPrimer = primer('pm1')
      const currentRecord = dnaRecord([primer('c1')], { dna: { documentRole: 'library' } })
      const traceFiles = [libraryMember('member-1', [memberPrimer])]
      const focusPrimerTabSelection = vi.fn()
      const setSequenceScrollTarget = vi.fn()
      const view = {
        selectedAlignmentTraceId: null as string | null,
        selectedPrimerIds: [] as string[],
        controller: null as ReturnType<typeof useWorkspaceAnnotationSelectionController> | null,
      }

      function Harness() {
        const [selectedAlignmentTraceId, setSelectedAlignmentTraceId] = useState<string | null>('member-1')
        const [selectedPrimerIds, setSelectedPrimerIds] = useState<string[]>([])
        view.selectedAlignmentTraceId = selectedAlignmentTraceId
        view.selectedPrimerIds = selectedPrimerIds
        view.controller = useWorkspaceAnnotationSelectionController({
          record: currentRecord,
          traceFiles,
          selectableAnnotations: [],
          alignmentsVisible: false,
          selectedAlignmentTraceId,
          selectionFocus: 'dna',
          selectionAnchor: null,
          selectedFeatureId: null,
          selectedFeatureIds: [],
          selectedPrimerIds,
          selectedRange: null,
          featureTabSelectionMemberId: null,
          primerBindings: [{ primer: primer('c1'), start: 2, end: 10, strand: 'forward' }],
          setSelectedAlignmentTraceId,
          setSelectedProteinBondId: vi.fn(),
          setCutSelectionAnchor: vi.fn(),
          setCutStrandSelection: vi.fn(),
          setCutSelectionEnzymes: vi.fn(),
          setSelectedPrimerId: vi.fn(),
          setSelectedPrimerIds,
          setSelectedFeatureId: vi.fn(),
          setSelectedFeatureIds: vi.fn(),
          setFeatureTabSelectionMemberId: vi.fn(),
          setFeatureTabAnchor: vi.fn(),
          setSelectionFocus: vi.fn(),
          setSelectedRange: vi.fn(),
          setSelectionAnchor: vi.fn(),
          setSequenceScrollTarget,
          scrollAlignmentToTemplate: vi.fn(),
          setStatus: vi.fn(),
          extendSelectionToEndpoint: vi.fn(),
          focusPrimerTabSelection,
          resolveMobilePrimerPairExtend: (extend) => extend,
          matchesMobileShellViewport: () => false,
          mobilePrimerAnchorStatus: (name) => name,
          facingPrimerAmpliconRange: () => null,
          selectionLength: (range) => range.end - range.start + 1,
          formatRange: (start, end) => `${start}-${end}`,
        })
        return null
      }

      const host = document.createElement('div')
      document.body.append(host)
      const root = createRoot(host)
      act(() => root.render(<Harness />))

      act(() => view.controller!.selectDnaSequencePrimer('pm1', false))
      expect(focusPrimerTabSelection).not.toHaveBeenCalled()
      expect(view.selectedPrimerIds).toEqual([])
      expect(view.selectedAlignmentTraceId).toBe('member-1')

      act(() => view.controller!.selectDnaSequencePrimer('pm1', true, 'member-1'))
      expect(focusPrimerTabSelection).toHaveBeenCalledWith('pm1', ['pm1'], 'member-1')
      expect(setSequenceScrollTarget).not.toHaveBeenCalled()

      act(() => view.controller!.selectDnaSequencePrimer('c1', false))
      expect(view.selectedAlignmentTraceId).toBeNull()
      expect(view.selectedPrimerIds).toEqual(['c1'])
      expect(setSequenceScrollTarget).not.toHaveBeenCalled()

      act(() => root.unmount())
    })

    it('updates selectDnaSequenceFeature when selectFeatureById identity changes', () => {
      const view = { controller: null as ReturnType<typeof useWorkspaceAnnotationSelectionController> | null }

      function Harness({ recordName }: { recordName: string }) {
        view.controller = useWorkspaceAnnotationSelectionController({
          record: dnaRecord([primer('c1')], { features: [feature('feature-dna')], name: recordName }),
          traceFiles: [],
          selectableAnnotations: [feature('feature-dna')],
          alignmentsVisible: false,
          selectedAlignmentTraceId: null,
          selectionFocus: 'dna',
          selectionAnchor: null,
          selectedFeatureId: null,
          selectedFeatureIds: [],
          selectedPrimerIds: [],
          selectedRange: null,
          featureTabSelectionMemberId: null,
          primerBindings: [],
          setSelectedAlignmentTraceId: vi.fn(),
          setSelectedProteinBondId: vi.fn(),
          setCutSelectionAnchor: vi.fn(),
          setCutStrandSelection: vi.fn(),
          setCutSelectionEnzymes: vi.fn(),
          setSelectedPrimerId: vi.fn(),
          setSelectedPrimerIds: vi.fn(),
          setSelectedFeatureId: vi.fn(),
          setSelectedFeatureIds: vi.fn(),
          setFeatureTabSelectionMemberId: vi.fn(),
          setFeatureTabAnchor: vi.fn(),
          setSelectionFocus: vi.fn(),
          setSelectedRange: vi.fn(),
          setSelectionAnchor: vi.fn(),
          setSequenceScrollTarget: vi.fn(),
          scrollAlignmentToTemplate: vi.fn(),
          setStatus: vi.fn(),
          extendSelectionToEndpoint: vi.fn(),
          focusPrimerTabSelection: vi.fn(),
          resolveMobilePrimerPairExtend: (extend) => extend,
          matchesMobileShellViewport: () => false,
          mobilePrimerAnchorStatus: (name) => name,
          facingPrimerAmpliconRange: () => null,
          selectionLength: (range) => range.end - range.start + 1,
          formatRange: (start, end) => `${start}-${end}`,
        })
        return null
      }

      const host = document.createElement('div')
      document.body.append(host)
      const root = createRoot(host)
      act(() => root.render(<Harness recordName="first" />))
      const firstSelectDnaFeature = view.controller!.selectDnaSequenceFeature
      act(() => root.render(<Harness recordName="second" />))
      expect(view.controller!.selectDnaSequenceFeature).not.toBe(firstSelectDnaFeature)
      act(() => root.unmount())
    })
  })
})

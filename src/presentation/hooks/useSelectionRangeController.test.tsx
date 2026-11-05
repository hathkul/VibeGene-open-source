// @vitest-environment jsdom
import { act, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'vitest'
import type { SelectionAnchor, SelectionFocus, SelectionRange, StrandPairSelection } from '../sequence'
import { labPlasmid } from '../../domain/fixtures'
import { restrictionCutAnchorStrandSelection, restrictionFragmentStrandSelection } from '../../domain/sequence'
import type { RestrictionSite } from '../../domain/types'
import { restrictionEnzyme, restrictionSite } from '../../../tests/support/restrictionSiteFixtures'
import { useSelectionRangeController } from './useSelectionRangeController'

const ecoRi = restrictionEnzyme({ name: 'EcoRI', recognition: 'GAATTC', cutTop: 1, cutBottom: 5 })
const bamHi = restrictionEnzyme({ name: 'BamHI', recognition: 'GGATCC', cutTop: 1, cutBottom: 5 })

describe('useSelectionRangeController', () => {
  let host: HTMLDivElement
  let root: ReturnType<typeof createRoot>

  afterEach(() => {
    act(() => root?.unmount())
    host?.remove()
  })

  it('keeps restriction-cut anchors and sticky extension in one workflow', () => {
    const scrolls: number[] = []
    const statuses: string[] = []
    const firstSite = restrictionSite(ecoRi, 12, { cutTop: 13, cutBottom: 17 })
    const secondSite = restrictionSite(bamHi, 42, { cutTop: 43, cutBottom: 47 })
    let controller: ReturnType<typeof useSelectionRangeController>
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)

    function Harness() {
      const [selectedRange, setSelectedRange] = useState<SelectionRange | null>(null)
      const [selectionAnchor, setSelectionAnchor] = useState<SelectionAnchor | null>(null)
      const [cutSelectionAnchor, setCutSelectionAnchor] = useState<RestrictionSite | null>(null)
      const [, setCutStrandSelection] = useState<StrandPairSelection | null>(null)
      const [, setCutSelectionEnzymes] = useState<{ upstream: RestrictionSite; downstream: RestrictionSite } | null>(null)
      const [selectedAlignmentTraceId, setSelectedAlignmentTraceId] = useState<string | null>(null)
      const [selectionFocus, setSelectionFocus] = useState<SelectionFocus>('dna')
      const [selectedFeatureId, setSelectedFeatureId] = useState<string | null>(null)
      const [selectedFeatureIds, setSelectedFeatureIds] = useState<string[]>([])
      const [selectedPrimerId, setSelectedPrimerId] = useState<string | null>(null)
      const [selectedPrimerIds, setSelectedPrimerIds] = useState<string[]>([])
      controller = useSelectionRangeController({
        record: labPlasmid,
        traceFiles: [],
        alignmentsVisible: false,
        selectedAlignmentTraceId,
        selectedRange,
        selectionFocus,
        selectedFeatureId,
        selectedFeatureIds,
        selectedPrimerId,
        selectedPrimerIds,
        selectionAnchor,
        cutSelectionAnchor,
        setSelectedAlignmentTraceId,
        setCutSelectionAnchor,
        setCutStrandSelection,
        setCutSelectionEnzymes,
        setSelectedFeatureId,
        setSelectedFeatureIds,
        setSelectedProteinBondId: () => undefined,
        setSelectedPrimerId,
        setSelectedPrimerIds,
        setSelectionFocus,
        setSequenceHoverSiteKey: () => undefined,
        setSelectedRange,
        setSelectionAnchor,
        setSequenceScrollTarget: (position) => { if (position !== null) scrolls.push(position) },
        mapZoomCaretPosition: (range) => range.start,
        formatRange: (range) => `${range.start}-${range.end}`,
        formatSequenceLength: (length) => `${length} bp`,
        formatStickySelection: (selection) => `${selection.forward.start}-${selection.forward.end}/${selection.reverse.start}-${selection.reverse.end}`,
        selectionLength: (range) => range.end - range.start,
        setStatus: (message) => statuses.push(message),
        resolveMobileEnzymeCutPairExtend: (requested, anchor, nextKey, anchorKey) => requested || Boolean(anchor && anchorKey && nextKey !== anchorKey),
        siteKey: (site) => `${site.enzyme.name}-${site.start}`,
        restrictionFragmentStrandSelection,
        restrictionCutAnchorStrandSelection,
        formatEnzymeCutAnchorStatus: (site) => `anchor:${site.enzyme.name}`,
      })
      return null
    }

    act(() => root.render(<Harness />))
    act(() => controller!.setSequenceRange({ start: 2, end: 4 }))
    expect(scrolls).toEqual([])
    act(() => controller!.setRange({ start: 5, end: 8 }))
    expect(scrolls).toEqual([5])
    act(() => controller!.selectRestrictionCutFromLabel(firstSite))
    expect(scrolls).toEqual([5, firstSite.start])
    expect(statuses.at(-1)).toBe('anchor:EcoRI')

    act(() => controller!.selectRestrictionCutFromLabel(secondSite, true))
    expect(statuses.at(-1)).toContain('Selected fragment between EcoRI and BamHI cuts:')
    expect(scrolls).toEqual([5, firstSite.start])
  })

  it('honors restriction scroll:false and default scroll on enzyme-cut anchors', () => {
    const scrolls: number[] = []
    const site = restrictionSite(ecoRi, 12, { cutTop: 13, cutBottom: 17 })
    let controller: ReturnType<typeof useSelectionRangeController>
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)

    function Harness() {
      const [selectedRange, setSelectedRange] = useState<SelectionRange | null>(null)
      const [selectionAnchor, setSelectionAnchor] = useState<SelectionAnchor | null>(null)
      const [cutSelectionAnchor, setCutSelectionAnchor] = useState<RestrictionSite | null>(null)
      controller = useSelectionRangeController({
        record: labPlasmid,
        traceFiles: [],
        alignmentsVisible: false,
        selectedAlignmentTraceId: null,
        selectedRange,
        selectionFocus: 'dna',
        selectedFeatureId: null,
        selectedFeatureIds: [],
        selectedPrimerId: null,
        selectedPrimerIds: [],
        selectionAnchor,
        cutSelectionAnchor,
        setSelectedAlignmentTraceId: () => undefined,
        setCutSelectionAnchor,
        setCutStrandSelection: () => undefined,
        setCutSelectionEnzymes: () => undefined,
        setSelectedFeatureId: () => undefined,
        setSelectedFeatureIds: () => undefined,
        setSelectedProteinBondId: () => undefined,
        setSelectedPrimerId: () => undefined,
        setSelectedPrimerIds: () => undefined,
        setSelectionFocus: () => undefined,
        setSequenceHoverSiteKey: () => undefined,
        setSelectedRange,
        setSelectionAnchor,
        setSequenceScrollTarget: (position) => { if (position !== null) scrolls.push(position) },
        mapZoomCaretPosition: (range) => range.start,
        formatRange: (range) => `${range.start}-${range.end}`,
        formatSequenceLength: (length) => `${length} bp`,
        formatStickySelection: () => 'sticky',
        selectionLength: (range) => range.end - range.start,
        setStatus: () => undefined,
        resolveMobileEnzymeCutPairExtend: () => false,
        siteKey: (entry) => `${entry.enzyme.name}-${entry.start}`,
        restrictionFragmentStrandSelection,
        restrictionCutAnchorStrandSelection,
        formatEnzymeCutAnchorStatus: () => 'anchor',
      })
      return null
    }

    act(() => root.render(<Harness />))
    act(() => controller!.selectRestrictionCutFromLabel(site, false, { scroll: false }))
    expect(scrolls).toEqual([])
    act(() => controller!.selectRestrictionCutFromLabel(site, false))
    expect(scrolls).toEqual([site.start])
  })

  it('extends restriction-cut label selection with exact directional strand spans', () => {
    const scrolls: number[] = []
    const statuses: string[] = []
    let cutStrand: StrandPairSelection | null = null
    const site = restrictionSite(ecoRi, 12, { cutTop: 13, cutBottom: 17 })
    let controller: ReturnType<typeof useSelectionRangeController>
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)

    function Harness() {
      const [selectedRange, setSelectedRange] = useState<SelectionRange | null>({ start: 4, end: 9 })
      const [selectionAnchor, setSelectionAnchor] = useState<SelectionAnchor | null>({
        kind: 'base',
        forward: { start: 4, end: 9 },
        reverse: { start: 4, end: 9 },
      })
      const [cutSelectionAnchor, setCutSelectionAnchor] = useState<RestrictionSite | null>(null)
      controller = useSelectionRangeController({
        record: labPlasmid,
        traceFiles: [],
        alignmentsVisible: false,
        selectedAlignmentTraceId: null,
        selectedRange,
        selectionFocus: 'dna',
        selectedFeatureId: null,
        selectedFeatureIds: [],
        selectedPrimerId: null,
        selectedPrimerIds: [],
        selectionAnchor,
        cutSelectionAnchor,
        setSelectedAlignmentTraceId: () => undefined,
        setCutSelectionAnchor,
        setCutStrandSelection: (value) => { cutStrand = value },
        setCutSelectionEnzymes: () => undefined,
        setSelectedFeatureId: () => undefined,
        setSelectedFeatureIds: () => undefined,
        setSelectedProteinBondId: () => undefined,
        setSelectedPrimerId: () => undefined,
        setSelectedPrimerIds: () => undefined,
        setSelectionFocus: () => undefined,
        setSequenceHoverSiteKey: () => undefined,
        setSelectedRange,
        setSelectionAnchor,
        setSequenceScrollTarget: (position) => { if (position !== null) scrolls.push(position) },
        mapZoomCaretPosition: (range) => range.start,
        formatRange: (range) => `${range.start}-${range.end}`,
        formatSequenceLength: (length) => `${length} bp`,
        formatStickySelection: (selection) => `${selection.forward.start}-${selection.forward.end}`,
        selectionLength: (range) => range.end - range.start,
        setStatus: (message) => statuses.push(message),
        resolveMobileEnzymeCutPairExtend: (requested) => requested,
        siteKey: (entry) => `${entry.enzyme.name}-${entry.start}`,
        restrictionFragmentStrandSelection,
        restrictionCutAnchorStrandSelection,
        formatEnzymeCutAnchorStatus: () => 'anchor',
      })
      return null
    }

    act(() => root.render(<Harness />))
    act(() => controller!.selectRestrictionCutFromLabel(site, true))
    expect(statuses.at(-1)).toContain('Extended selection to EcoRI cut')
    expect(scrolls).toEqual([4])
    expect(cutStrand).toEqual({
      forward: { start: 4, end: 13 },
      reverse: { start: 4, end: 17 },
    })
  })

  it('selects circular paired-cut fragments with wrap-around spans and no scroll', () => {
    const scrolls: number[] = []
    const anchorSite = restrictionSite(ecoRi, 1000, { cutTop: 1001, cutBottom: 1005 })
    const upstreamSite = restrictionSite(bamHi, 80, { cutTop: 81, cutBottom: 85 })
    let cutStrand: StrandPairSelection | null = null
    let controller: ReturnType<typeof useSelectionRangeController>
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)

    function Harness() {
      const [selectedRange, setSelectedRange] = useState<SelectionRange | null>(null)
      const [selectionAnchor, setSelectionAnchor] = useState<SelectionAnchor | null>(null)
      const [cutSelectionAnchor, setCutSelectionAnchor] = useState<RestrictionSite | null>(anchorSite)
      controller = useSelectionRangeController({
        record: { ...labPlasmid, topology: 'circular' },
        traceFiles: [],
        alignmentsVisible: false,
        selectedAlignmentTraceId: null,
        selectedRange,
        selectionFocus: 'dna',
        selectedFeatureId: null,
        selectedFeatureIds: [],
        selectedPrimerId: null,
        selectedPrimerIds: [],
        selectionAnchor,
        cutSelectionAnchor,
        setSelectedAlignmentTraceId: () => undefined,
        setCutSelectionAnchor,
        setCutStrandSelection: (value) => { cutStrand = value },
        setCutSelectionEnzymes: () => undefined,
        setSelectedFeatureId: () => undefined,
        setSelectedFeatureIds: () => undefined,
        setSelectedProteinBondId: () => undefined,
        setSelectedPrimerId: () => undefined,
        setSelectedPrimerIds: () => undefined,
        setSelectionFocus: () => undefined,
        setSequenceHoverSiteKey: () => undefined,
        setSelectedRange,
        setSelectionAnchor,
        setSequenceScrollTarget: (position) => { if (position !== null) scrolls.push(position) },
        mapZoomCaretPosition: (range) => range.start,
        formatRange: (range) => `${range.start}-${range.end}`,
        formatSequenceLength: (length) => `${length} bp`,
        formatStickySelection: (selection) => `${selection.forward.start}-${selection.forward.end}/${selection.reverse.start}-${selection.reverse.end}`,
        selectionLength: (range) => range.end - range.start,
        setStatus: () => undefined,
        resolveMobileEnzymeCutPairExtend: (requested, anchor, nextKey, anchorKey) => requested || Boolean(anchor && anchorKey && nextKey !== anchorKey),
        siteKey: (site) => `${site.enzyme.name}-${site.start}`,
        restrictionFragmentStrandSelection,
        restrictionCutAnchorStrandSelection,
        formatEnzymeCutAnchorStatus: () => 'anchor',
      })
      return null
    }

    act(() => root.render(<Harness />))
    act(() => controller!.selectRestrictionCutFromLabel(upstreamSite, true))
    expect(scrolls).toEqual([])
    const expectedFragment = restrictionFragmentStrandSelection(anchorSite, upstreamSite, 'circular')
    expect(expectedFragment.forward.start).toBeGreaterThan(expectedFragment.forward.end)
    expect(expectedFragment.reverse.start).toBeGreaterThan(expectedFragment.reverse.end)
    expect(cutStrand).toEqual(expectedFragment)
  })

  it('navigateDnaSequenceCaret sets a collapsed caret range', () => {
    let controller: ReturnType<typeof useSelectionRangeController>
    let selectedRange: SelectionRange | null = null
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)

    function Harness() {
      const [range, setRange] = useState<SelectionRange | null>(null)
      selectedRange = range
      controller = useSelectionRangeController({
        record: labPlasmid,
        traceFiles: [],
        alignmentsVisible: false,
        selectedAlignmentTraceId: null,
        selectedRange: range,
        selectionFocus: 'dna',
        selectedFeatureId: null,
        selectedFeatureIds: [],
        selectedPrimerId: null,
        selectedPrimerIds: [],
        selectionAnchor: null,
        cutSelectionAnchor: null,
        setSelectedAlignmentTraceId: () => undefined,
        setCutSelectionAnchor: () => undefined,
        setCutStrandSelection: () => undefined,
        setCutSelectionEnzymes: () => undefined,
        setSelectedFeatureId: () => undefined,
        setSelectedFeatureIds: () => undefined,
        setSelectedProteinBondId: () => undefined,
        setSelectedPrimerId: () => undefined,
        setSelectedPrimerIds: () => undefined,
        setSelectionFocus: () => undefined,
        setSequenceHoverSiteKey: () => undefined,
        setSelectedRange: setRange,
        setSelectionAnchor: () => undefined,
        setSequenceScrollTarget: () => undefined,
        mapZoomCaretPosition: (caretRange) => caretRange.start,
        formatRange: (caretRange) => `${caretRange.start}-${caretRange.end}`,
        formatSequenceLength: (length) => `${length} bp`,
        formatStickySelection: () => 'sticky',
        selectionLength: (caretRange) => caretRange.end - caretRange.start,
        setStatus: () => undefined,
        resolveMobileEnzymeCutPairExtend: () => false,
        siteKey: (entry) => `${entry.enzyme.name}-${entry.start}`,
        restrictionFragmentStrandSelection,
        restrictionCutAnchorStrandSelection,
        formatEnzymeCutAnchorStatus: () => 'anchor',
      })
      return null
    }

    act(() => root.render(<Harness />))
    act(() => controller!.navigateDnaSequenceCaret(42))
    expect(selectedRange).toEqual({ start: 42, end: 42 })
  })

  it('selectDnaSequenceRestriction honors scroll false on sequence-pane picks', () => {
    const scrolls: number[] = []
    const statuses: string[] = []
    const site = restrictionSite(ecoRi, 12, { cutTop: 13, cutBottom: 17 })
    let controller: ReturnType<typeof useSelectionRangeController>
    let cutSelectionAnchor: RestrictionSite | null = null
    let selectionAnchor: SelectionAnchor | null = null
    let selectedRange: SelectionRange | null = { start: 2, end: 6 }
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)

    function Harness() {
      const [cutAnchor, setCutAnchor] = useState<RestrictionSite | null>(null)
      const [anchor, setAnchor] = useState<SelectionAnchor | null>(null)
      const [range, setRange] = useState<SelectionRange | null>({ start: 2, end: 6 })
      cutSelectionAnchor = cutAnchor
      selectionAnchor = anchor
      selectedRange = range
      controller = useSelectionRangeController({
        record: labPlasmid,
        traceFiles: [],
        alignmentsVisible: false,
        selectedAlignmentTraceId: null,
        selectedRange: range,
        selectionFocus: 'dna',
        selectedFeatureId: null,
        selectedFeatureIds: [],
        selectedPrimerId: null,
        selectedPrimerIds: [],
        selectionAnchor: anchor,
        cutSelectionAnchor: cutAnchor,
        setSelectedAlignmentTraceId: () => undefined,
        setCutSelectionAnchor: setCutAnchor,
        setCutStrandSelection: () => undefined,
        setCutSelectionEnzymes: () => undefined,
        setSelectedFeatureId: () => undefined,
        setSelectedFeatureIds: () => undefined,
        setSelectedProteinBondId: () => undefined,
        setSelectedPrimerId: () => undefined,
        setSelectedPrimerIds: () => undefined,
        setSelectionFocus: () => undefined,
        setSequenceHoverSiteKey: () => undefined,
        setSelectedRange: setRange,
        setSelectionAnchor: setAnchor,
        setSequenceScrollTarget: (position) => { if (position !== null) scrolls.push(position) },
        mapZoomCaretPosition: (rangeValue) => rangeValue.start,
        formatRange: (rangeValue) => `${rangeValue.start}-${rangeValue.end}`,
        formatSequenceLength: (length) => `${length} bp`,
        formatStickySelection: () => 'sticky',
        selectionLength: (rangeValue) => rangeValue.end - rangeValue.start,
        setStatus: (message) => statuses.push(message),
        resolveMobileEnzymeCutPairExtend: () => false,
        siteKey: (entry) => `${entry.enzyme.name}-${entry.start}`,
        restrictionFragmentStrandSelection,
        restrictionCutAnchorStrandSelection,
        formatEnzymeCutAnchorStatus: (entry) => `anchor:${entry.enzyme.name}`,
      })
      return null
    }

    act(() => root.render(<Harness />))
    act(() => controller!.selectDnaSequenceRestriction(site, true))
    expect(scrolls).toEqual([])
    expect(cutSelectionAnchor).toEqual(site)
    expect(selectedRange).toBeNull()
    expect(selectionAnchor).toEqual({
      kind: 'enzyme',
      forward: { start: site.cutTop, end: site.cutTop },
      reverse: { start: site.cutBottom, end: site.cutBottom },
      site,
    })
    expect(statuses.at(-1)).toBe('anchor:EcoRI')
  })
})

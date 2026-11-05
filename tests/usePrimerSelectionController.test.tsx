// @vitest-environment jsdom
import { act, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'vitest'
import { defaultPrimerHybridizationParams } from '../src/domain/primerHybridization'
import { buildPrimerPaneEntries, type PrimerPanePrimerRow, type PrimerPaneSgRnaRow } from '../src/domain/primerPaneEntries'
import { serializeFeatureQualifiers } from '../src/domain/featureQualifiers'
import { sgRnaOligoDescription } from '../src/domain/sgrnaOligoPrimers'
import type { TraceFileRecord } from '../src/domain/traceTypes'
import type { Primer, SequenceFeature, SequenceRecord } from '../src/domain/types'
import { usePrimerSelectionController } from '../src/presentation/hooks/usePrimerSelectionController'
import type { SelectionRange } from '../src/presentation/sequence'

function primer(id: string, extra?: Partial<Primer>): Primer {
  return { id, name: id, sequence: 'ACGTACGT', color: id, ...extra }
}

function oligo(id: string): Primer {
  return primer(id, { description: sgRnaOligoDescription('sense') })
}

function sgRnaFeatures(tag: string): [SequenceFeature, SequenceFeature] {
  const common = { vibegene_sgrna_id: tag, vibegene_sgrna: '1' }
  const guide: SequenceFeature = {
    id: `guide-${tag}`,
    name: tag,
    type: 'misc_feature',
    color: 'sgrna-green',
    locations: [{ start: 0, end: 20, strand: 'forward' }],
    notes: serializeFeatureQualifiers({ ...common, vibegene_sgrna_part: 'guide' }),
  }
  const pam: SequenceFeature = {
    id: `pam-${tag}`,
    name: `${tag} PAM`,
    type: 'misc_feature',
    color: 'sgrna-green',
    locations: [{ start: 20, end: 23, strand: 'forward' }],
    notes: serializeFeatureQualifiers({ ...common, vibegene_sgrna_part: 'pam' }),
  }
  return [guide, pam]
}

function record(primers: Primer[], library = false, features: SequenceFeature[] = []): SequenceRecord {
  return {
    id: 'record', name: 'record', molecule: 'dna', topology: 'linear',
    sequence: 'ACGTACGTACGTACGTACGTACGTACGTACGTACGT',
    features, primers, history: [],
    ...(library ? { dna: { documentRole: 'library' } } : {}),
  } as unknown as SequenceRecord
}

function member(id: string, primers: Primer[] = []): TraceFileRecord {
  return {
    id, fileName: `${id}.ab1`, sequence: 'ACGTACGTACGTACGTACGTACGTACGTACGTACGT',
    chromatogram: {} as never, enabled: true, expanded: false, showAnnotations: true,
    alignment: null, primers,
  }
}

type VisibilityCall = { ids: readonly string[]; visible: boolean; memberId: string | null }
type SingleVisibilityCall = {
  primerId: string
  visible: boolean
  memberId: string | null
  selectedIds: readonly string[]
  selectedMemberId: string | null
}
type SgRnaVisibilityCall = { ids: string[]; visible: boolean; memberId: string | null }
type PrimerBinding = { primer: Primer; start: number; end: number; strand: 'forward' | 'reverse' }

const NO_KEYS = { shiftKey: false, metaKey: false, ctrlKey: false }

function setup(
  currentRecord: SequenceRecord,
  traceFiles: TraceFileRecord[],
  options: { bindings?: PrimerBinding[] } = {},
) {
  const entries = buildPrimerPaneEntries(currentRecord, traceFiles, {
    hybridization: defaultPrimerHybridizationParams,
    primerSort: { mode: 'name', direction: 'asc' },
    oligoSort: { mode: 'name', direction: 'asc' },
    sgRnaSort: { mode: 'name', direction: 'asc' },
    warningsFor: () => '',
  })
  const primerRows = entries.filter((entry): entry is PrimerPanePrimerRow => entry.kind === 'primer')
  const sgRnaRows = entries.filter((entry): entry is PrimerPaneSgRnaRow => entry.kind === 'sgrna')

  const calls = {
    visibility: [] as VisibilityCall[],
    single: [] as SingleVisibilityCall[],
    sgRna: [] as SgRnaVisibilityCall[],
    status: [] as string[],
  }
  const view = {
    controller: null as unknown as ReturnType<typeof usePrimerSelectionController>,
    selectedPrimerIds: [] as string[],
    selectedPrimerId: null as string | null,
    selectedAlignmentTraceId: null as string | null,
    primerTabAnchorId: null as string | null,
    selectionFocus: 'dna' as string,
    selectedRange: null as SelectionRange | null,
    setSelectedLibraryMember: null as unknown as (next: TraceFileRecord | null) => void,
    setFeatureVisibilityTargetIds: null as unknown as (next: string[]) => void,
  }

  function Harness() {
    const [selectedAlignmentTraceId, setSelectedAlignmentTraceId] = useState<string | null>(null)
    const [selectedPrimerId, setSelectedPrimerId] = useState<string | null>(null)
    const [selectedPrimerIds, setSelectedPrimerIds] = useState<string[]>([])
    const [primerTabAnchorId, setPrimerTabAnchorId] = useState<string | null>(null)
    const [selectionFocus, setSelectionFocus] = useState<'dna' | 'feature' | 'primer' | 'bond'>('dna')
    const [selectedRange, setSelectedRange] = useState<SelectionRange | null>(null)
    const [selectedLibraryMember, setSelectedLibraryMember] = useState<TraceFileRecord | null>(null)
    const [featureVisibilityTargetIds, setFeatureVisibilityTargetIds] = useState<string[]>([])

    view.selectedAlignmentTraceId = selectedAlignmentTraceId
    view.selectedPrimerId = selectedPrimerId
    view.selectedPrimerIds = selectedPrimerIds
    view.primerTabAnchorId = primerTabAnchorId
    view.selectionFocus = selectionFocus
    view.selectedRange = selectedRange
    view.setSelectedLibraryMember = (next) => setSelectedLibraryMember(next)
    view.setFeatureVisibilityTargetIds = (next) => setFeatureVisibilityTargetIds(next)

    view.controller = usePrimerSelectionController({
      record: currentRecord,
      traceFiles,
      selectedLibraryMember,
      selectedAlignmentTraceId,
      selectedPrimerId,
      selectedPrimerIds,
      primerTabAnchorId,
      featureVisibilityTargetIds,
      primerRows,
      sgRnaRows,
      hybridization: defaultPrimerHybridizationParams,
      getPrimerBindings: () => options.bindings ?? [],
      visibilityPrimerCommand: (ids, visible, memberId) => {
        calls.visibility.push({ ids, visible, memberId })
      },
      singleVisibilityPrimerCommand: (primerId, visible, memberId, selectedIds, selectedMemberId) => {
        calls.single.push({ primerId, visible, memberId, selectedIds, selectedMemberId })
      },
      context: () => { throw new Error('not used') },
      apply: () => {},
      setSgRnaVisibility: (annotations, visible, memberId) => {
        calls.sgRna.push({ ids: annotations.map((annotation) => annotation.id), visible, memberId })
      },
      setSelectedAlignmentTraceId,
      setPrimerTabAnchorId,
      setSelectedPrimerId,
      setSelectedPrimerIds,
      setSelectedFeatureId: () => {},
      setSelectedFeatureIds: () => {},
      setSelectionFocus,
      setCutSelectionAnchor: () => {},
      setCutStrandSelection: () => {},
      setCutSelectionEnzymes: () => {},
      setSelectedRange,
      setSelectionAnchor: () => {},
      setStatus: (status) => {
        calls.status.push(status)
      },
    })
    return null
  }

  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  act(() => root.render(<Harness />))

  const click = (primerId: string, memberId: string | null = null, event = NO_KEYS) => {
    const row = primerRows.find((entry) => entry.row.primer.id === primerId && entry.memberId === memberId)
    expect(row, `row for ${primerId} in member ${memberId}`).toBeDefined()
    act(() => view.controller.selectPrimerTabRow(row!, event))
  }

  return {
    view,
    calls,
    primerRows,
    click,
    unmount: () => act(() => root.unmount()),
  }
}

describe('usePrimerSelectionController', () => {
  let cleanup: (() => void) | null = null
  afterEach(() => {
    cleanup?.()
    cleanup = null
  })

  it('selects a single primer row on plain click', () => {
    const env = setup(record([primer('p1'), primer('p2'), primer('p3')]), [])
    cleanup = env.unmount

    env.click('p2')

    expect(env.view.selectedPrimerIds).toEqual(['p2'])
    expect(env.view.selectedPrimerId).toBe('p2')
    expect(env.view.primerTabAnchorId).toBe('p2')
    expect(env.view.selectionFocus).toBe('primer')
    expect(env.view.selectedAlignmentTraceId).toBeNull()
  })

  it('extends a shift range from the anchor in row order', () => {
    const env = setup(record([primer('p1'), primer('p2'), primer('p3')]), [])
    cleanup = env.unmount

    env.click('p1')
    env.click('p3', null, { ...NO_KEYS, shiftKey: true })
    expect(env.view.selectedPrimerIds).toEqual(['p1', 'p2', 'p3'])
    expect(env.view.primerTabAnchorId).toBe('p3')
    expect(env.calls.status).toContain('Selected 3 primers.')

    env.click('p2', null, { ...NO_KEYS, shiftKey: true })
    expect(env.view.selectedPrimerIds).toEqual(['p2', 'p3'])
  })

  it('toggles individual rows with additive clicks', () => {
    const env = setup(record([primer('p1'), primer('p2'), primer('p3')]), [])
    cleanup = env.unmount

    env.click('p1')
    env.click('p3', null, { ...NO_KEYS, metaKey: true })
    expect(env.view.selectedPrimerIds).toEqual(['p1', 'p3'])
    expect(env.view.primerTabAnchorId).toBe('p1')

    env.click('p1', null, { ...NO_KEYS, metaKey: true })
    expect(env.view.selectedPrimerIds).toEqual(['p3'])
    expect(env.view.selectedPrimerId).toBe('p3')
  })

  it('clears selection and returns focus to dna when the sole row is clicked again', () => {
    const env = setup(record([primer('p1'), primer('p2')]), [])
    cleanup = env.unmount

    env.click('p2')
    expect(env.view.selectionFocus).toBe('primer')

    env.click('p2')
    expect(env.view.selectedPrimerIds).toEqual([])
    expect(env.view.selectedPrimerId).toBeNull()
    expect(env.view.primerTabAnchorId).toBeNull()
    expect(env.view.selectionFocus).toBe('dna')
    expect(env.view.selectedRange).toBeNull()
    expect(env.calls.status).toContain('Cleared primer selection.')
  })

  it('scopes selection to the clicked library member', () => {
    const env = setup(record([primer('c1')], true), [member('m1', [primer('pm1'), primer('pm2')])])
    cleanup = env.unmount

    env.click('pm2', 'm1')

    expect(env.view.selectedAlignmentTraceId).toBe('m1')
    expect(env.view.selectedPrimerIds).toEqual(['pm2'])
    expect(env.view.controller.selectedPrimersInPaneMember('m1', false).map((p) => p.id)).toEqual(['pm2'])
    expect(env.view.controller.selectedPrimersInPaneMember(null, false)).toEqual([])
    expect(env.view.controller.hasRegularPrimerPaneSelection()).toBe(true)
  })

  it('shows and hides a mixed visible/hidden selection', () => {
    const env = setup(record([primer('p1', { visible: false }), primer('p2')]), [])
    cleanup = env.unmount

    env.click('p1')
    env.click('p2', null, { ...NO_KEYS, metaKey: true })

    expect(env.view.controller.selectedPrimersForMenu.map((p) => p.id)).toEqual(['p1', 'p2'])
    expect(env.view.controller.hasPrimerSelected).toBe(true)
    expect(env.view.controller.canShowSelectedPrimers).toBe(true)
    expect(env.view.controller.canHideSelectedPrimers).toBe(true)

    act(() => env.view.controller.hideSelectedPrimers())
    expect(env.calls.visibility).toEqual([{ ids: ['p1', 'p2'], visible: false, memberId: null }])

    act(() => env.view.controller.showSelectedPrimers())
    expect(env.calls.visibility).toEqual([
      { ids: ['p1', 'p2'], visible: false, memberId: null },
      { ids: ['p1', 'p2'], visible: true, memberId: null },
    ])

    env.click('p1', null, { ...NO_KEYS, metaKey: true })
    expect(env.view.controller.canShowSelectedPrimers).toBe(false)
    expect(env.view.controller.canHideSelectedPrimers).toBe(true)

    act(() => env.view.controller.setPrimerVisibility('p2', false))
    expect(env.calls.single).toEqual([
      { primerId: 'p2', visible: false, memberId: null, selectedIds: ['p2'], selectedMemberId: null },
    ])
  })

  it('preserves the menu selection when switching to a library member sharing the primer id', () => {
    const shared = primer('shared', { name: 'consensus copy' })
    const memberShared = primer('shared', { name: 'member copy' })
    const env = setup(record([shared], true), [member('m1', [memberShared])])
    cleanup = env.unmount

    env.click('shared')
    expect(env.view.controller.selectedPrimersForMenu.map((p) => p.name)).toEqual(['consensus copy'])

    act(() => env.view.setSelectedLibraryMember(member('m1', [memberShared])))
    expect(env.view.controller.selectedPrimersForMenu.map((p) => p.name)).toEqual(['member copy'])
    expect(env.view.controller.hasPrimerSelected).toBe(true)

    act(() => env.view.setSelectedLibraryMember(member('m2', [primer('other')])))
    expect(env.view.controller.selectedPrimersForMenu).toEqual([])
    expect(env.view.controller.hasPrimerSelected).toBe(false)
  })

  it('targets the whole oligo group when nothing is selected and only the selected oligo otherwise', () => {
    const env = setup(record([primer('p1'), oligo('o1'), oligo('o2')]), [])
    cleanup = env.unmount

    act(() => env.view.controller.setOligoGroupPaneVisibility(null, false))
    expect(env.calls.visibility).toEqual([{ ids: ['o1', 'o2'], visible: false, memberId: null }])

    env.click('o1')
    act(() => env.view.controller.setOligoGroupPaneVisibility(null, true))
    expect(env.calls.visibility).toEqual([
      { ids: ['o1', 'o2'], visible: false, memberId: null },
      { ids: ['o1'], visible: true, memberId: null },
    ])
  })

  it('targets regular primers across the main record and library members, scoped to the selection', () => {
    const env = setup(record([primer('c1'), oligo('co')], true), [member('m1', [primer('pm1')])])
    cleanup = env.unmount

    act(() => env.view.controller.setRegularPrimerGroupPaneVisibility(false))
    expect(env.calls.visibility).toEqual([
      { ids: ['c1'], visible: false, memberId: null },
      { ids: ['pm1'], visible: false, memberId: 'm1' },
    ])

    env.click('pm1', 'm1')
    act(() => env.view.controller.setRegularPrimerGroupPaneVisibility(true))
    expect(env.calls.visibility).toEqual([
      { ids: ['c1'], visible: false, memberId: null },
      { ids: ['pm1'], visible: false, memberId: 'm1' },
      { ids: ['pm1'], visible: true, memberId: 'm1' },
    ])
  })

  it('targets the whole sgRNA group when nothing is targeted and only the targeted annotation otherwise', () => {
    const env = setup(record([], false, [...sgRnaFeatures('g1'), ...sgRnaFeatures('g2')]), [])
    cleanup = env.unmount

    act(() => env.view.controller.setSgRnaGroupPaneVisibility(null, false))
    expect(env.calls.sgRna).toEqual([{ ids: ['g1', 'g2'], visible: false, memberId: null }])

    act(() => env.view.setFeatureVisibilityTargetIds(['guide-g1']))
    act(() => env.view.controller.setSgRnaGroupPaneVisibility(null, true))
    expect(env.calls.sgRna).toEqual([
      { ids: ['g1', 'g2'], visible: false, memberId: null },
      { ids: ['g1'], visible: true, memberId: null },
    ])
  })

  it('resolves the amplicon range for a facing primer pair through the hook', () => {
    const env = setup(record([primer('p1'), primer('p2')]), [], {
      bindings: [
        { primer: primer('p1'), strand: 'forward', start: 4, end: 12 },
        { primer: primer('p2'), strand: 'reverse', start: 20, end: 28 },
      ],
    })
    cleanup = env.unmount

    expect(env.view.controller.facingPrimerAmpliconRange(['p1'])).toBeNull()
    expect(env.view.controller.facingPrimerAmpliconRange(['p1', 'p2'])).toEqual({ start: 4, end: 28 })

    env.click('p1')
    expect(env.view.selectedRange).toEqual({ start: 4, end: 12 })

    env.click('p2', null, { ...NO_KEYS, metaKey: true })
    expect(env.view.selectedPrimerIds).toEqual(['p1', 'p2'])
    expect(env.view.selectedRange).toEqual({ start: 4, end: 28 })
  })
})

// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ProteinBond, SequenceFeature } from '../../domain/types'
import { cloneFixture } from '../../domain/fixtures'
import { FeaturesTabPane, type FeaturesTabPaneProps } from './FeaturesTabPane'
import { buildFeatureTabEntries, type FeatureTabEntry } from './featureTabModel'

function makeFeature(overrides: Partial<SequenceFeature> = {}): SequenceFeature {
  const fixtureColor = cloneFixture().features[0]!.color
  return {
    id: 'f1',
    name: 'Feature 1',
    type: 'gene',
    color: fixtureColor,
    locations: [{ start: 3, end: 9, strand: 'forward' }],
    ...overrides,
  }
}

function makeProps(overrides: Partial<FeaturesTabPaneProps> = {}): FeaturesTabPaneProps {
  const feature = makeFeature()
  const entries: FeatureTabEntry[] = [{ kind: 'feature', key: feature.id, memberId: null, feature, sequenceLength: 100 }]
  return {
    molecule: 'dna',
    proteinBonds: [],
    selectedBondId: null,
    hasFeatureSelected: false,
    selectedFeature: null,
    featureSelectionMemberId: null,
    selectedFeatureId: null,
    selectedFeatureIds: [],
    table: { entries, featureRows: entries.filter((entry) => entry.kind === 'feature') as FeaturesTabPaneProps['table']['featureRows'], sortMode: 'location', sortDirection: 'asc' },
    actions: {
      onAddFeature: vi.fn(),
      onAddBond: vi.fn(),
      onDeleteSelected: vi.fn(),
      onEditProperties: vi.fn(),
      onCheckAllVisibility: vi.fn(),
      onSort: vi.fn(),
      onSelectRow: vi.fn(),
      onFocusSelection: vi.fn(),
      onSetFeatureVisibility: vi.fn(),
      onSetBondVisibility: vi.fn(),
      onSelectBond: vi.fn(),
      onOpenBondEditor: vi.fn(),
      onOpenFeatureEditor: vi.fn(),
    },
    ...overrides,
  }
}

describe('FeaturesTabPane', () => {
  let host: HTMLDivElement
  let root: ReturnType<typeof createRoot>

  afterEach(() => {
    act(() => root?.unmount())
    host?.remove()
  })

  function render(props: FeaturesTabPaneProps) {
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    act(() => root.render(<FeaturesTabPane {...props} />))
    return host
  }

  it('shows the DNA empty state when there are no features', () => {
    const props = makeProps({ table: { entries: [], featureRows: [], sortMode: 'location', sortDirection: 'asc' } })
    const dom = render(props)
    expect(dom.textContent).toContain('No features in this sequence.')
  })

  it('shows the protein empty state when there are no features or bonds', () => {
    const props = makeProps({
      molecule: 'protein',
      table: { entries: [], featureRows: [], sortMode: 'location', sortDirection: 'asc' },
    })
    const dom = render(props)
    expect(dom.textContent).toContain('No protein features yet. Select residues in Sequence view, then add a feature.')
  })

  it('renders feature rows with name, location, and strand columns', () => {
    const dom = render(makeProps())
    expect(dom.textContent).toContain('Feature 1')
    expect(dom.querySelector('.feature-strand-col')).not.toBeNull()
    expect(dom.querySelector('.feature-name-content .color-chip')).not.toBeNull()
    expect(dom.querySelector('.feature-name-content .feature-name-button')).not.toBeNull()
    expect(dom.querySelectorAll('.table-col-resize-handle')).toHaveLength(7)
    expect(dom.querySelector('[aria-label="Resize name column"]')).not.toBeNull()
    const table = dom.querySelector<HTMLTableElement>('table.features-table')!
    expect(table.style.tableLayout).toBe('fixed')
    expect(table.style.width).toBe('100%')
    expect(table.querySelector('col.features-visibility-column')?.getAttribute('style')).toContain('width: 30px')
    expect(table.querySelectorAll('col')[1]?.getAttribute('style')).toContain('width: 180px')
    const visibility = dom.querySelector<HTMLInputElement>('tbody input[type="checkbox"]')
    expect(visibility?.checked).toBe(true)
    expect(dom.querySelector('tbody tr')?.textContent).toContain('6 b.p.')
    expect(dom.querySelector('[aria-label="forward strand"]')?.textContent).toBe('→')
  })

  it('shows a left arrow for reverse features', () => {
    const feature = makeFeature({ locations: [{ start: 3, end: 9, strand: 'reverse' }] })
    const entry: FeatureTabEntry = { kind: 'feature', key: feature.id, memberId: null, feature, sequenceLength: 100 }
    const dom = render(makeProps({ table: { entries: [entry], featureRows: [entry], sortMode: 'location', sortDirection: 'asc' } }))
    expect(dom.querySelector('[aria-label="reverse strand"]')?.textContent).toBe('←')
  })

  it('displays each feature qualifier on its own line', () => {
    const feature = makeFeature({ notes: '/gene="abc" /note="first /example=value" /note="second"' })
    const entry: FeatureTabEntry = { kind: 'feature', key: feature.id, memberId: null, feature, sequenceLength: 100 }
    const dom = render(makeProps({ table: { entries: [entry], featureRows: [entry], sortMode: 'location', sortDirection: 'asc' } }))
    expect([...dom.querySelectorAll('td.feature-notes-col .feature-note-paragraph')].map((element) => element.textContent))
      .toEqual(['gene = abc', 'note = first /example=value', 'note = second'])
    expect([...dom.querySelectorAll('td.feature-notes-col strong')].map((element) => element.textContent))
      .toEqual(['gene', 'note', 'note'])
    expect(feature.notes).toBe('/gene="abc" /note="first /example=value" /note="second"')
  })

  it('formats colon-style fields like slash-style fields and keeps values selectable', () => {
    const feature = makeFeature({ notes: 'gene: bla note: description' })
    const entry: FeatureTabEntry = { kind: 'feature', key: feature.id, memberId: null, feature, sequenceLength: 100 }
    const dom = render(makeProps({ table: { entries: [entry], featureRows: [entry], sortMode: 'location', sortDirection: 'asc' } }))
    expect([...dom.querySelectorAll('.feature-note-paragraph')].map((element) => element.textContent)).toEqual(['gene = bla', 'note = description'])
    expect([...dom.querySelectorAll('.feature-note-paragraph strong')].map((element) => element.textContent)).toEqual(['gene', 'note'])
    expect([...dom.querySelectorAll('.feature-note-value')].map((element) => element.textContent)).toEqual(['bla', 'description'])
    expect(feature.notes).toBe('gene: bla note: description')
  })

  it('renders formatted SnapGene notes safely, including links and subscripts', () => {
    const markup = '<html><body><b>packaging </b><b><a href="https://vibe-gene.com">signal</b></a><b> </b><b><sup>of</b></sup><b> </b><b><u>human</b></u><b> </b><b><sub>immunodeficiency</b></sub><b> </b><b><i>virus type 1</b></i></body></html>'
    const feature = makeFeature({ notes: `note: ${markup}` })
    const entry: FeatureTabEntry = { kind: 'feature', key: feature.id, memberId: null, feature, sequenceLength: 100 }
    const dom = render(makeProps({ table: { entries: [entry], featureRows: [entry], sortMode: 'location', sortDirection: 'asc' } }))
    const value = dom.querySelector('.feature-note-value')!
    expect(value.textContent).toBe('packaging signal of human immunodeficiency virus type 1')
    expect(value.querySelector('a')?.getAttribute('href')).toBe('https://vibe-gene.com')
    expect(value.querySelector('sup')?.textContent).toBe('of')
    expect(value.querySelector('sub')?.textContent).toBe('immunodeficiency')
    expect(value.querySelector('u')?.textContent).toBe('human')
    expect(value.querySelector('i')?.textContent).toBe('virus type 1')
    expect(value.querySelector('b')?.textContent).toContain('packaging')
  })

  it('does not render executable markup or unsafe links from imported notes', () => {
    const feature = makeFeature({ notes: 'note: <html><body><b onclick="alert(1)">safe</b><script>alert(1)</script><a href="javascript:alert(1)">link</a><img src="https://example.org/track"></body></html>' })
    const entry: FeatureTabEntry = { kind: 'feature', key: feature.id, memberId: null, feature, sequenceLength: 100 }
    const dom = render(makeProps({ table: { entries: [entry], featureRows: [entry], sortMode: 'location', sortDirection: 'asc' } }))
    const value = dom.querySelector('.feature-note-value')!
    expect(value.textContent).toBe('safelink')
    expect(value.querySelector('b')?.hasAttribute('onclick')).toBe(false)
    expect(value.querySelector('script, a, img')).toBeNull()
  })

  it('marks long unbroken qualifier values as breakable without altering them', () => {
    const sequence = 'M'.repeat(120)
    const feature = makeFeature({ notes: `/translation="${sequence}"` })
    const entry: FeatureTabEntry = { kind: 'feature', key: feature.id, memberId: null, feature, sequenceLength: 100 }
    const dom = render(makeProps({ table: { entries: [entry], featureRows: [entry], sortMode: 'location', sortDirection: 'asc' } }))
    expect(dom.querySelector('.feature-note-long-token')?.textContent).toBe(sequence)
    expect(dom.querySelector('.feature-note-paragraph strong')?.textContent).toBe('translation')
    expect(dom.querySelector('.feature-note-value')?.textContent).toBe(sequence)
    expect(dom.querySelector('.feature-translation-summary')?.textContent).toMatch(/^120 amino acids = [\d.]+ kDa$/)
  })

  it('allows interacting with field values without selecting the row or opening its editor', () => {
    const feature = makeFeature({ notes: '/gene="example" /note="some value"' })
    const entry: FeatureTabEntry = { kind: 'feature', key: feature.id, memberId: null, feature, sequenceLength: 100 }
    const props = makeProps({ table: { entries: [entry], featureRows: [entry], sortMode: 'location', sortDirection: 'asc' } })
    const dom = render(props)
    const value = dom.querySelector<HTMLElement>('.feature-note-value')!
    const press = new MouseEvent('mousedown', { bubbles: true, cancelable: true, shiftKey: true })
    act(() => {
      value.dispatchEvent(press)
      value.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      value.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))
    })
    expect(press.defaultPrevented).toBe(false)
    expect(props.actions.onSelectRow).not.toHaveBeenCalled()
    expect(props.actions.onOpenFeatureEditor).not.toHaveBeenCalled()
    act(() => dom.querySelector('tbody tr')!.dispatchEvent(new MouseEvent('click', { bubbles: true })))
    expect(props.actions.onSelectRow).toHaveBeenCalledOnce()
  })

  it('omits the strand column for protein documents', () => {
    const props = makeProps({ molecule: 'protein' })
    const dom = render(props)
    expect(dom.querySelector('.feature-strand-col')).toBeNull()
    expect(dom.querySelector('tbody tr')?.textContent).toContain('6 aa')
  })

  it('marks the row selected when the member and feature match the selection', () => {
    const props = makeProps({ selectedFeatureId: 'f1' })
    const dom = render(props)
    expect(dom.querySelector('tr.selected-row')).not.toBeNull()
  })

  it('delegates visibility changes with the feature id and member scope', () => {
    const props = makeProps()
    const dom = render(props)
    const visibility = dom.querySelector<HTMLInputElement>('tbody input[type="checkbox"]')!
    act(() => visibility.click())
    expect(props.actions.onSetFeatureVisibility).toHaveBeenCalledWith('f1', false, null)
  })

  it('renders library member heading rows from the entries', () => {
    const memberFeature = makeFeature({ id: 'f2', name: 'Member feature' })
    const entries: FeatureTabEntry[] = [
      { kind: 'heading', key: 'heading:consensus', label: 'Consensus', memberId: null },
      { kind: 'feature', key: 'c:f1', memberId: null, feature: makeFeature(), sequenceLength: 100 },
      { kind: 'heading', key: 'heading:m1', label: 'member.ab1', memberId: 'm1' },
      { kind: 'feature', key: 'm:f2', memberId: 'm1', feature: memberFeature, sequenceLength: 90 },
    ]
    const props = makeProps({
      table: {
        entries,
        featureRows: entries.filter((entry) => entry.kind === 'feature') as FeaturesTabPaneProps['table']['featureRows'],
        sortMode: 'location',
        sortDirection: 'asc',
      },
    })
    const dom = render(props)
    const headings = dom.querySelectorAll('.feature-section-row')
    expect(headings.length).toBe(2)
    expect(headings[1]?.textContent).toContain('member.ab1')
  })

  it('renders protein bonds with selection and visibility delegation', () => {
    const bond: ProteinBond = {
      id: 'b1',
      name: 'Disulfide',
      type: 'disulfide',
      endpoints: [{ residue: 4 }, { residue: 10 }],
    }
    const props = makeProps({ molecule: 'protein', proteinBonds: [bond], selectedBondId: 'b1' })
    const dom = render(props)
    expect(dom.textContent).toContain('Disulfide')
    expect(dom.querySelector('tr.selected-row')).not.toBeNull()
    const visibility = dom.querySelector<HTMLInputElement>('.protein-bond-feature-row input[type="checkbox"]')!
    act(() => visibility.click())
    expect(props.actions.onSetBondVisibility).toHaveBeenCalledWith('b1', false)
  })

  it('delegates Add feature and keeps Delete disabled without a selection', () => {
    const props = makeProps()
    const dom = render(props)
    const addButton = Array.from(dom.querySelectorAll('button')).find((button) => button.textContent?.includes('Add feature'))!
    act(() => addButton.click())
    expect(props.actions.onAddFeature).toHaveBeenCalled()
    const deleteButton = Array.from(dom.querySelectorAll('button')).find((button) => button.textContent?.includes('Delete'))! as HTMLButtonElement
    expect(deleteButton.disabled).toBe(true)
  })
})

describe('buildFeatureTabEntries', () => {
  function makeRecord(overrides: Partial<import('../../domain/types').SequenceRecord> = {}) {
    const base = cloneFixture()
    return { ...base, ...overrides }
  }

  it('flattens consensus features for non-library records', () => {
    const entries = buildFeatureTabEntries(makeRecord({ features: [makeFeature()] }), [], 'location', 'asc')
    expect(entries).toHaveLength(1)
    expect(entries[0]).toMatchObject({ kind: 'feature', memberId: null, key: 'f1' })
  })

  it('groups library records under a consensus heading followed by member headings', () => {
    const base = cloneFixture()
    const record = { ...base, features: [makeFeature()], dna: { ...base.dna, documentRole: 'library' as const } }
    const member = {
      id: 'm1',
      fileName: 'member.ab1',
      sequence: 'ACGT',
      chromatogram: { aTrace: [], tTrace: [], gTrace: [], cTrace: [], basePos: [], baseCalls: [] },
      enabled: true,
      expanded: false,
      showAnnotations: true,
      alignment: null,
      features: [makeFeature({ id: 'f9', name: 'Member feature' })],
    }
    const entries = buildFeatureTabEntries(record, [member], 'location', 'asc')
    expect(entries.map((entry) => entry.kind)).toEqual(['heading', 'feature', 'heading', 'feature'])
    expect(entries[2]).toMatchObject({ label: 'member.ab1', memberId: 'm1' })
    expect(entries[3]).toMatchObject({ key: 'm:m1:f9', memberId: 'm1' })
  })
})

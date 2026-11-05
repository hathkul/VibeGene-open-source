// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Primer } from '../../domain/types'
import type { PrimerPaneEntry, PrimerPanePrimerRow } from '../../domain/primerPaneEntries'
import { cloneFixture } from '../../domain/fixtures'
import { PrimersTabPane, type PrimersTabPaneProps } from './PrimersTabPane'

function makePrimer(overrides: Partial<Primer> = {}): Primer {
  const fixtureColor = cloneFixture().primers[0]!.color
  return {
    id: 'p1',
    name: 'Primer 1',
    sequence: 'ATGCATGC',
    color: fixtureColor,
    ...overrides,
  }
}

function makePrimerRow(memberId: string | null = null): PrimerPanePrimerRow {
  const primer = makePrimer()
  return {
    kind: 'primer',
    key: `k:${primer.id}`,
    memberId,
    row: {
      primer,
      length: primer.sequence.length,
      bindingLabel: '10…18',
      bindingStart: 10,
      strand: 'forward' as const,
      tmC: 58,
      tmLabel: '58.0 °C',
      gcPercent: 50,
      massDa: 2424.4,
      warnings: 'none',
    },
  }
}

function makeProps(overrides: Partial<PrimersTabPaneProps> = {}): PrimersTabPaneProps {
  const entry = makePrimerRow()
  const entries: PrimerPaneEntry[] = [entry]
  return {
    featureSelectionMemberId: null,
    selectedAlignmentTraceId: null,
    selectedFeatureId: null,
    selectedFeatureIds: [],
    selectedPrimerId: null,
    selectedPrimerIds: [],
    newSgRnaMemberId: null,
    selectedSgRnaRow: undefined,
    openAnnealedOligosAvailable: false,
    hasPrimerSelected: false,
    table: {
      entries,
      minWidthPx: 900,
      columnWidths: { vis: 30, name: 160, description: 180, length: 76, binding: 120, orientation: 90, tm: 76, gc: 60, mass: 76, sequence: 200, warnings: 120 },
      primerSort: { mode: 'name', direction: 'asc' },
      oligoSort: { mode: 'name', direction: 'asc' },
      sgRnaSort: { mode: 'name', direction: 'asc' },
    },
    search: { hitSet: new Set(), activeHitId: null },
    queries: {
      hasRegularSelection: () => false,
      hasOligoSelection: () => false,
      hasSgRnaSelection: () => false,
    },
    actions: {
      onAddPrimer: vi.fn(),
      onNewSgRna: vi.fn(),
      onOpenAnnealedOligos: vi.fn(),
      onDeleteSelected: vi.fn(),
      onCheckRegularVisibility: vi.fn(),
      onCheckOligoVisibility: vi.fn(),
      onCheckSgRnaVisibility: vi.fn(),
      onSortPrimer: vi.fn(),
      onSortOligo: vi.fn(),
      onSortSgRna: vi.fn(),
      onResizeColumn: vi.fn(),
      onSelectSgRnaRow: vi.fn(),
      onSelectPrimerRow: vi.fn(),
      onSetPrimerVisibility: vi.fn(),
      onSetSgRnasVisibility: vi.fn(),
      onFocusFeatureSelection: vi.fn(),
      onFocusPrimerSelection: vi.fn(),
      onOpenFeatureEditor: vi.fn(),
      onOpenPrimerEditor: vi.fn(),
    },
    ...overrides,
  }
}

describe('PrimersTabPane', () => {
  let host: HTMLDivElement
  let root: ReturnType<typeof createRoot>

  afterEach(() => {
    act(() => root?.unmount())
    host?.remove()
  })

  function render(props: PrimersTabPaneProps) {
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    act(() => root.render(<PrimersTabPane {...props} />))
    return host
  }

  it('shows the empty state when there are no primers or sgRNAs', () => {
    const props = makeProps({ table: { ...makeProps().table, entries: [] } })
    const dom = render(props)
    expect(dom.textContent).toContain('No primers or sgRNAs in this file.')
  })

  it('renders primer rows with name, length, and sequence', () => {
    const dom = render(makeProps())
    expect(dom.textContent).toContain('Primer 1')
    expect(dom.textContent).toContain('8-mer')
    expect(dom.textContent).toContain('ATGCATGC')
    const table = dom.querySelector<HTMLTableElement>('table.primer-list-table')!
    expect(table.style.tableLayout).toBe('fixed')
    expect(table.style.width).toBe('100%')
    expect(table.querySelector('col')?.getAttribute('style')).toContain('width: 30px')
    expect(dom.querySelector('.primer-sequence-cell')).not.toBeNull()
    expect(dom.querySelector('.primer-warnings-cell')).not.toBeNull()
  })

  it('shows descriptions with a sortable, resizable column for primers and oligos', () => {
    const regular = makePrimerRow()
    regular.row.primer.description = 'First line\nSecond line'
    const oligo = makePrimerRow()
    oligo.key = 'oligo'
    oligo.row.primer = makePrimer({ id: 'oligo', description: 'sgRNA cloning sense oligo [vibegene:sgrna-oligo:v1:sense]' })
    const entries: PrimerPaneEntry[] = [
      { kind: 'heading', key: 'primers', label: 'Primers', memberId: null, level: 'subgroup', group: 'primer' },
      regular,
      { kind: 'heading', key: 'oligos', label: 'Oligos', memberId: null, level: 'subgroup', group: 'oligo' },
      oligo,
      { kind: 'heading', key: 'guides', label: 'sgRNAs', memberId: null, level: 'subgroup', group: 'sgrna' },
    ]
    const props = makeProps({ table: { ...makeProps().table, entries } })
    const dom = render(props)
    const headers = [...dom.querySelectorAll('button')].filter((button) => button.textContent?.includes('Description'))
    expect(headers).toHaveLength(2)
    act(() => headers[0]!.click())
    act(() => headers[1]!.click())
    expect(props.actions.onSortPrimer).toHaveBeenCalledWith('description')
    expect(props.actions.onSortOligo).toHaveBeenCalledWith('description')
    expect(dom.querySelectorAll('[aria-label="Resize description column"]')).toHaveLength(2)
    const columnCount = dom.querySelectorAll('colgroup col').length
    expect(columnCount).toBe(11)
    for (const header of dom.querySelectorAll('thead tr, .primer-group-header-row')) expect(header.children).toHaveLength(columnCount)
    for (const row of dom.querySelectorAll('tbody tr:not(.primer-group-header-row):not(.primer-subgroup-row)')) expect(row.children).toHaveLength(columnCount)
    const heading = [...dom.querySelectorAll('thead th')].map((cell) => cell.textContent)
    expect(heading.slice(-3).map((value) => value?.replace(/[▲▼▾]/g, '').trim())).toEqual(['Sequence', 'Description', 'Warnings'])
    const cell = [...dom.querySelectorAll('td')].find((item) => item.title === 'First line\nSecond line')
    expect(cell?.textContent).toBe('First line\nSecond line')
    expect(cell?.previousElementSibling?.classList.contains('primer-sequence-cell')).toBe(true)
    expect(cell?.nextElementSibling?.classList.contains('primer-warnings-cell')).toBe(true)
    expect(dom.textContent).toContain('sgRNA cloning sense oligo')
    expect(dom.textContent).not.toContain('[vibegene:sgrna-oligo:')
  })

  it('delegates primer visibility toggles with the member scope', () => {
    const props = makeProps()
    const dom = render(props)
    const visibility = dom.querySelector<HTMLInputElement>('tbody input[type="checkbox"]')!
    expect(visibility.checked).toBe(true)
    act(() => visibility.click())
    expect(props.actions.onSetPrimerVisibility).toHaveBeenCalledWith('p1', false, null)
  })

  it('marks search hits and the active hit', () => {
    const props = makeProps({ search: { hitSet: new Set(['p1']), activeHitId: 'p1' } })
    const dom = render(props)
    expect(dom.querySelector('tr.is-search-hit-active')).not.toBeNull()
  })

  it('keeps Delete disabled without a selection and delegates when enabled', () => {
    const props = makeProps({ hasPrimerSelected: true })
    const dom = render(props)
    const deleteButton = Array.from(dom.querySelectorAll('button')).find((button) => button.textContent?.includes('Delete'))! as HTMLButtonElement
    expect(deleteButton.disabled).toBe(false)
    act(() => deleteButton.click())
    expect(props.actions.onDeleteSelected).toHaveBeenCalled()
  })

  it('delegates New primer and New sgRNA toolbar actions', () => {
    const props = makeProps({ newSgRnaMemberId: 'm1' })
    const dom = render(props)
    const newPrimer = Array.from(dom.querySelectorAll('button')).find((button) => button.textContent?.includes('New primer'))!
    const newSgRna = Array.from(dom.querySelectorAll('button')).find((button) => button.textContent?.includes('New sgRNA'))!
    act(() => newPrimer.click())
    expect(props.actions.onAddPrimer).toHaveBeenCalled()
    act(() => newSgRna.click())
    expect(props.actions.onNewSgRna).toHaveBeenCalledWith('m1')
  })

  it('shows the annealed-oligo action only when available', () => {
    const without = render(makeProps())
    expect(without.textContent).not.toContain('Open as sequence')
    act(() => root.unmount())
    host.remove()
    const props = makeProps({ openAnnealedOligosAvailable: true })
    const withAction = render(props)
    const button = Array.from(withAction.querySelectorAll('button')).find((b) => b.textContent?.includes('Open as sequence'))!
    act(() => button.click())
    expect(props.actions.onOpenAnnealedOligos).toHaveBeenCalled()
  })

  it('routes row clicks through the selection port', () => {
    const props = makeProps()
    const dom = render(props)
    const row = dom.querySelector('tbody tr')!
    act(() => row.dispatchEvent(new MouseEvent('click', { bubbles: true })))
    expect(props.actions.onSelectPrimerRow).toHaveBeenCalledTimes(1)
  })
})

// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { RestrictionEnzyme, RestrictionSite } from '../../domain/types'
import { cloneFixture } from '../../domain/fixtures'
import type { DisplaySettings, EnzymeTabRow } from '../sequence'
import { defaultDisplaySettings } from '../sequence'
import { filterRestrictionSitesForDisplay } from '../sequence/sequenceRenderingHelpers'
import {
  EnzymesTabPane,
  type EnzymesTabPaneProps,
} from './EnzymesTabPane'
import {
  groupRestrictionSitesByEnzyme,
  sortEnzymeTabRows,
} from './enzymeTabModel'

vi.mock('../dnaViewControls', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../dnaViewControls')>()
  return { ...actual, EnzymeTabSetControl: () => null }
})

function makeEnzyme(name: string, overhang: RestrictionEnzyme['overhang'] = { type: 'blunt', sequence: null, length: 0 }): RestrictionEnzyme {
  return {
    name,
    notation: `${name} (G/AATTC)`,
    recognition: 'GAATTC',
    cutTop: 1,
    cutBottom: 5,
    type: 'II',
    overhang,
    manufacturers: [],
    notes: [],
  }
}

function makeSite(enzyme: RestrictionEnzyme, start: number): RestrictionSite {
  return { enzyme, start, end: start + 6, match: 'GAATTC', cutTop: start + 1, cutBottom: start + 5 }
}

function makeProps(overrides: Partial<EnzymesTabPaneProps> = {}): EnzymesTabPaneProps {
  const ecoRi = makeEnzyme('EcoRI')
  const rows: EnzymeTabRow[] = [
    { enzyme: ecoRi, sites: [makeSite(ecoRi, 10), makeSite(ecoRi, 40)] },
  ]
  const fixture = cloneFixture()
  return {
    settings: defaultDisplaySettings as DisplaySettings,
    enzymePreferences: {
      defaultTab: 'numbers',
      italicizeNames: false,
      boldUniqueCutters: false,
      greenBluntCutters: false,
      supplierOrder: [],
      menuSupplierCount: 0,
      parentalSet: 'all',
      savedEnzymeSets: [],
      priorityOrder: [],
    },
    fileEnzymeSets: [],
    restrictionSites: rows.flatMap((row) => row.sites),
    parentalRestrictionSites: [],
    record: { name: fixture.name, sequence: 'A'.repeat(100), topology: 'linear', construct: fixture.construct },
    selectedRange: null,
    searchQuery: '',
    table: { rows, sortMode: 'name', sortDirection: 'asc' },
    mobile: { isMobileShell: false, positionMode: 'numbers', expandedLocations: new Set() },
    actions: {
      updateSection: vi.fn(),
      onEnzymeInfo: vi.fn(),
      onPreferencesChange: vi.fn(),
      onFileEnzymeSetsChange: vi.fn(),
      onSort: vi.fn(),
      onPositionModeChange: vi.fn(),
      onExpandLocations: vi.fn(),
      onNavigateToSite: vi.fn(),
    },
    ...overrides,
  }
}

describe('EnzymesTabPane', () => {
  let host: HTMLDivElement
  let root: ReturnType<typeof createRoot>

  afterEach(() => {
    act(() => root?.unmount())
    host?.remove()
  })

  function render(props: EnzymesTabPaneProps) {
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    act(() => root.render(<EnzymesTabPane {...props} />))
    return host
  }

  it('shows the empty state when no enzyme rows match the set', () => {
    const props = makeProps({ table: { rows: [], sortMode: 'name', sortDirection: 'asc' } })
    const dom = render(props)
    expect(dom.textContent).toContain('No restriction sites match the selected enzyme set.')
  })

  it('renders one row per enzyme with the site count', () => {
    const dom = render(makeProps())
    expect(dom.textContent).toContain('EcoRI')
    expect(dom.querySelector('.enzyme-sites-cell')?.textContent).toBe('2')
  })

  it('supports single, modifier-toggle, and shift-range row selection', () => {
    const ecoRI = makeEnzyme('EcoRI')
    const bamHI = makeEnzyme('BamHI')
    const hindIII = makeEnzyme('HindIII')
    const rows = [ecoRI, bamHI, hindIII].map((enzyme, index) => ({
      enzyme,
      sites: [makeSite(enzyme, 10 + index * 10)],
    }))
    const props = makeProps({ table: { rows, sortMode: 'name', sortDirection: 'asc' } })
    const dom = render(props)
    const rowByName = (name: string) => Array.from(dom.querySelectorAll<HTMLTableRowElement>('.enzymes-table tbody tr'))
      .find((row) => row.textContent?.includes(name))!

    act(() => rowByName('EcoRI').click())
    expect(rowByName('EcoRI').getAttribute('aria-selected')).toBe('true')
    expect(rowByName('BamHI').getAttribute('aria-selected')).toBe('false')

    act(() => rowByName('HindIII').dispatchEvent(new MouseEvent('click', { bubbles: true, ctrlKey: true })))
    expect(rowByName('EcoRI').getAttribute('aria-selected')).toBe('true')
    expect(rowByName('HindIII').getAttribute('aria-selected')).toBe('true')

    act(() => rowByName('BamHI').dispatchEvent(new MouseEvent('click', { bubbles: true, shiftKey: true })))
    expect(rowByName('EcoRI').getAttribute('aria-selected')).toBe('false')
    expect(rowByName('BamHI').getAttribute('aria-selected')).toBe('true')
    expect(rowByName('HindIII').getAttribute('aria-selected')).toBe('true')
  })

  it('toggles map and sequence visibility without changing the enzyme set', () => {
    const props = makeProps()
    const dom = render(props)
    const visibility = dom.querySelector<HTMLButtonElement>('.enzyme-row-visibility')!

    expect(visibility.getAttribute('aria-label')).toBe('Hide EcoRI on map and sequence')
    act(() => visibility.click())

    expect(props.actions.updateSection).toHaveBeenCalledWith('enzymes', { hiddenNames: ['EcoRI'] })
    expect(visibility.getAttribute('aria-pressed')).toBe('true')
  })

  it('renders hidden enzymes greyed out with a show icon state', () => {
    const settings = {
      ...defaultDisplaySettings,
      enzymes: { ...defaultDisplaySettings.enzymes, hiddenNames: ['EcoRI'] },
    } as DisplaySettings
    const dom = render(makeProps({ settings }))
    const row = dom.querySelector<HTMLTableRowElement>('.enzymes-table tbody tr')!
    const visibility = dom.querySelector<HTMLButtonElement>('.enzyme-row-visibility')!

    expect(row.classList.contains('is-enzyme-hidden')).toBe(true)
    expect(visibility.getAttribute('aria-label')).toBe('Show EcoRI on map and sequence')
    expect(visibility.getAttribute('aria-pressed')).toBe('false')
  })

  it('hides an enzyme from map/sequence display without altering set membership', () => {
    const props = makeProps()
    const site = props.restrictionSites[0]!
    const settings = {
      ...props.settings.enzymes,
      hiddenNames: ['EcoRI'],
    }

    expect(filterRestrictionSitesForDisplay([site], settings)).toEqual([])
    expect(props.table.rows[0]?.enzyme.name).toBe('EcoRI')
  })

  it('renders numbered cut positions that navigate to the site', () => {
    const props = makeProps()
    const dom = render(props)
    const links = dom.querySelectorAll('.enzyme-position-link')
    expect(links.length).toBe(2)
    act(() => links[1]?.dispatchEvent(new MouseEvent('click', { bubbles: true })))
    expect(props.actions.onNavigateToSite).toHaveBeenCalledTimes(1)
  })

  it('marks the cut position matching the current selection', () => {
    const props = makeProps({ selectedRange: { start: 10, end: 16 } })
    const dom = render(props)
    expect(dom.querySelector('.enzyme-position-link.is-selected')).not.toBeNull()
  })

  it('collapses multiple cut positions behind an expand button on mobile', () => {
    const props = makeProps({ mobile: { isMobileShell: true, positionMode: 'numbers', expandedLocations: new Set() } })
    const dom = render(props)
    const expand = dom.querySelector<HTMLButtonElement>('.enzyme-positions-expand')
    expect(expand?.textContent).toContain('Expand (2)')
    act(() => expand!.click())
    expect(props.actions.onExpandLocations).toHaveBeenCalledWith('EcoRI')
  })

  it('shows the lines mode toggle only on desktop', () => {
    const desktop = render(makeProps())
    expect(Array.from(desktop.querySelectorAll('.enzyme-position-mode-toggle button')).map((b) => b.textContent)).toEqual(['Numbers', 'Lines'])
    act(() => root.unmount())
    host.remove()
    const mobile = render(makeProps({ mobile: { isMobileShell: true, positionMode: 'numbers', expandedLocations: new Set() } }))
    expect(Array.from(mobile.querySelectorAll('.enzyme-position-mode-toggle button')).map((b) => b.textContent)).toEqual(['Numbers'])
  })

  it('delegates enzyme info to the double-click action', () => {
    const props = makeProps()
    const dom = render(props)
    const cell = dom.querySelector<HTMLTableCellElement>('.enzyme-name-cell')!
    act(() => cell.dispatchEvent(new MouseEvent('dblclick', { bubbles: true })))
    expect(props.actions.onEnzymeInfo).toHaveBeenCalledWith('EcoRI')
  })
})

describe('enzyme tab row helpers', () => {
  const ecoRi = makeEnzyme('EcoRI')
  const bamHi = makeEnzyme('BamHI', { type: "5'", sequence: 'GATC', length: 4 })
  const rows: EnzymeTabRow[] = [
    { enzyme: bamHi, sites: [makeSite(bamHi, 30)] },
    { enzyme: ecoRi, sites: [makeSite(ecoRi, 10), makeSite(ecoRi, 60)] },
  ]

  it('groups sites by enzyme and sorts each group by position', () => {
    const grouped = groupRestrictionSitesByEnzyme([makeSite(ecoRi, 60), makeSite(ecoRi, 10), makeSite(bamHi, 30)])
    expect(grouped.map((row) => row.enzyme.name).sort()).toEqual(['BamHI', 'EcoRI'])
    const ecoRow = grouped.find((row) => row.enzyme.name === 'EcoRI')!
    expect(ecoRow.sites.map((site) => site.start)).toEqual([10, 60])
  })

  it('sorts by site count descending with name tiebreak', () => {
    const sorted = sortEnzymeTabRows(rows, 'site-count', 0, 'desc')
    expect(sorted.map((row) => row.enzyme.name)).toEqual(['EcoRI', 'BamHI'])
  })

  it('sorts by caret distance', () => {
    const sorted = sortEnzymeTabRows(rows, 'caret-distance', 28, 'asc')
    expect(sorted[0]?.enzyme.name).toBe('BamHI')
  })
})

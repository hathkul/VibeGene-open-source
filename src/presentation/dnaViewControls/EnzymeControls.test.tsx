// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { defaultEnzymePreferences } from '../../domain/enzymePreferences'
import { enzymes } from '../../domain/enzymes'
import { cloneFixture } from '../../domain/fixtures'
import type { DisplaySettings } from '../sequence'
import { defaultDisplaySettings } from '../sequence'

const mockScanState = vi.hoisted(() => ({
  sites: [] as Array<{ enzyme: { name: string }; start: number; end: number; cutTop: number; cutBottom: number }>,
  stage: 'complete' as 'idle' | 'preview' | 'complete' | 'error',
  pending: false,
  elapsedMs: 0,
}))

vi.mock('../hooks/useRestrictionSiteScan', () => ({
  useRestrictionSiteScan: () => mockScanState,
}))

import { EnzymeTabSetControl } from './EnzymeControls'

describe('EnzymeTabSetControl add-enzyme dropdown', () => {
  let host: HTMLDivElement
  let root: Root

  afterEach(() => {
    act(() => root?.unmount())
    host?.remove()
    mockScanState.sites = []
  })

  it('filters the catalog and adds a checked enzyme to the current displayed set', () => {
    const ecoRi = enzymes.find((enzyme) => enzyme.name === 'EcoRI')!
    const bamHi = enzymes.find((enzyme) => enzyme.name === 'BamHI')!
    mockScanState.sites = [
      { enzyme: ecoRi, start: 2, end: 8, cutTop: 3, cutBottom: 7 },
      { enzyme: bamHi, start: 12, end: 18, cutTop: 13, cutBottom: 17 },
      { enzyme: bamHi, start: 22, end: 28, cutTop: 23, cutBottom: 27 },
    ]

    const fixture = cloneFixture()
    const updateCalls: Array<{ key: keyof DisplaySettings; patch: Partial<DisplaySettings[keyof DisplaySettings]> }> = []
    const updateSection = <Key extends keyof DisplaySettings>(key: Key, patch: Partial<DisplaySettings[Key]>) => {
      updateCalls.push({ key, patch })
    }
    const displayedSites = [mockScanState.sites[0]!].map((site) => ({
      ...site,
      enzyme: ecoRi,
      match: 'GAATTC',
    }))

    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    act(() => root.render(
      <EnzymeTabSetControl
        settings={defaultDisplaySettings as DisplaySettings}
        enzymePreferences={defaultEnzymePreferences}
        restrictionSites={displayedSites}
        parentalRestrictionSites={[]}
        recordName="Test construct"
        sequence={'A'.repeat(40)}
        topology="linear"
        construct={fixture.construct}
        selectedRange={null}
        enzymeCount={1}
        updateSection={updateSection}
        onEnzymeInfo={vi.fn()}
        onPreferencesChange={vi.fn()}
      />,
    ))

    act(() => host.querySelector<HTMLButtonElement>('.enzyme-add-trigger')!.click())
    const search = host.querySelector<HTMLInputElement>('.enzyme-add-search')!
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
      setter.call(search, 'BamHI')
      search.dispatchEvent(new Event('input', { bubbles: true }))
      search.dispatchEvent(new Event('change', { bubbles: true }))
    })

    const options = host.querySelectorAll('.enzyme-add-option')
    expect(options.length).toBeGreaterThan(1)
    const bamHiOption = Array.from(options).find((option) => option.querySelector('.enzyme-add-name')?.textContent === 'BamHI')!
    expect(bamHiOption.textContent).toContain('(2)')
    const checkbox = bamHiOption.querySelector<HTMLInputElement>('input[type="checkbox"]')!
    expect(checkbox.checked).toBe(false)
    act(() => checkbox.click())
    expect(updateCalls.at(-1)).toEqual({
      key: 'enzymes',
      patch: { set: 'custom', selectedNames: ['BamHI', 'EcoRI'], supplierSetId: null, visible: true },
    })
  })

  it('provides visibility actions for selected enzymes and cut sites in the sequence selection', () => {
    const ecoRi = enzymes.find((enzyme) => enzyme.name === 'EcoRI')!
    const bamHi = enzymes.find((enzyme) => enzyme.name === 'BamHI')!
    const fixture = cloneFixture()
    const updateCalls: Array<{ key: keyof DisplaySettings; patch: Partial<DisplaySettings[keyof DisplaySettings]> }> = []
    const updateSection = <Key extends keyof DisplaySettings>(key: Key, patch: Partial<DisplaySettings[Key]>) => {
      updateCalls.push({ key, patch })
    }
    const sites = [
      { enzyme: ecoRi, start: 7, end: 13, match: 'GAATTC', cutTop: 8, cutBottom: 10 },
      { enzyme: bamHi, start: 20, end: 26, match: 'GGATCC', cutTop: 22, cutBottom: 24 },
    ]
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    act(() => root.render(
      <EnzymeTabSetControl
        settings={{ ...defaultDisplaySettings, enzymes: { ...defaultDisplaySettings.enzymes, hiddenNames: [] } } as DisplaySettings}
        enzymePreferences={defaultEnzymePreferences}
        restrictionSites={sites}
        parentalRestrictionSites={[]}
        recordName="Test construct"
        sequence={'A'.repeat(40)}
        topology="linear"
        construct={fixture.construct}
        selectedRange={{ start: 5, end: 15 }}
        selectedEnzymeNames={['EcoRI']}
        enzymeCount={2}
        updateSection={updateSection}
        onEnzymeInfo={vi.fn()}
        onPreferencesChange={vi.fn()}
      />,
    ))

    act(() => host.querySelector<HTMLButtonElement>('.enzyme-actions-trigger')!.click())
    const item = (label: string) => Array.from(host.querySelectorAll<HTMLButtonElement>('.enzyme-actions-menu [role="menuitem"]'))
      .find((button) => button.textContent?.trim() === label)!
    expect(item('Show All Enzymes').disabled).toBe(true)
    expect(item('Show Selected Enzymes').disabled).toBe(true)
    expect(item('Hide Selected Enzymes').disabled).toBe(false)
    expect(item('Hide Enzymes That Cut Inside the Selection').disabled).toBe(false)
    expect(item('Hide Enzymes That Cut Outside the Selection').disabled).toBe(false)

    act(() => item('Hide Enzymes That Cut Inside the Selection').click())
    expect(updateCalls.at(-1)).toEqual({ key: 'enzymes', patch: { hiddenNames: ['EcoRI'] } })
  })

  it('opens noncutters for the current enzyme set, including hidden noncutters', () => {
    const ecoRi = enzymes.find((enzyme) => enzyme.name === 'EcoRI')!
    const fixture = cloneFixture()
    const onSaveEnzymeSet = vi.fn()
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    act(() => root.render(
      <EnzymeTabSetControl
        settings={{
          ...defaultDisplaySettings,
          enzymes: { ...defaultDisplaySettings.enzymes, set: 'custom', selectedNames: ['EcoRI', 'BamHI'], hiddenNames: ['BamHI'] },
        } as DisplaySettings}
        enzymePreferences={defaultEnzymePreferences}
        restrictionSites={[{ enzyme: ecoRi, start: 2, end: 8, match: 'GAATTC', cutTop: 3, cutBottom: 7 }]}
        parentalRestrictionSites={[]}
        recordName="Test construct"
        sequence={'A'.repeat(40)}
        topology="linear"
        construct={fixture.construct}
        selectedRange={null}
        enzymeCount={1}
        updateSection={vi.fn()}
        onEnzymeInfo={vi.fn()}
        onPreferencesChange={vi.fn()}
        onSaveEnzymeSet={onSaveEnzymeSet}
      />,
    ))

    act(() => host.querySelector<HTMLButtonElement>('.enzyme-noncutters-trigger')!.click())
    const dialog = host.querySelector<HTMLElement>('[role="dialog"][aria-label="Noncutters"]')!
    expect(dialog.textContent).toContain('Noncutters for Test construct')
    expect(Array.from(dialog.querySelectorAll('.noncutters-enzyme'), (button) => button.textContent)).toEqual(['BamHI'])
    act(() => Array.from(dialog.querySelectorAll('button')).find((button) => button.textContent === 'Close')!.click())
    expect(host.querySelector('[role="dialog"][aria-label="Noncutters"]')).toBeNull()
    act(() => host.querySelector<HTMLButtonElement>('.enzyme-tab-set-trigger')!.click())
    const save = Array.from(host.querySelectorAll<HTMLButtonElement>('.enzyme-tab-set-menu button')).find((button) => button.textContent?.includes('Save Enzyme Set'))!
    expect(save.disabled).toBe(false)
    act(() => save.click())
    expect(onSaveEnzymeSet).toHaveBeenCalledOnce()
    expect(host.querySelector('.enzyme-tab-set-menu')).toBeNull()
  })
})

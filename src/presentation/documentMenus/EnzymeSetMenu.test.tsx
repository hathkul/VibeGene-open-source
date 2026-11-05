// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, expect, it, vi } from 'vitest'
import { defaultEnzymePreferences } from '../../domain/enzymePreferences'
import { defaultDisplaySettings } from '../sequence'
import { EnzymeSetMenu } from './EnzymeSetMenu'

describe('EnzymeSetMenu', () => {
  it('offers and selects the built-in Type IIS set', () => {
    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)
    const onSelectSet = vi.fn()
    act(() => root.render(<EnzymeSetMenu className="test-menu" settings={defaultDisplaySettings} preferences={defaultEnzymePreferences}
      parentalRestrictionSites={[]} onSelectSet={onSelectSet} onSelectSupplier={vi.fn()} onSelectSavedSet={vi.fn()}
      onChooseEnzymes={vi.fn()} onShowNoncutters={vi.fn()} onOpenPreferences={vi.fn()} />))
    const button = [...host.querySelectorAll('button')].find((item) => item.textContent?.includes('Type IIS'))!
    expect(button).toBeTruthy()
    act(() => button.click())
    expect(onSelectSet).toHaveBeenCalledWith('type-iis')
    act(() => root.unmount())
    host.remove()
  })
})

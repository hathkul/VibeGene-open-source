// @vitest-environment jsdom

import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'vitest'
import { PreferencesDialog } from '../src/PreferencesDialog'
import {
  DEFAULT_APP_PREFERENCES,
  readAppPreferences,
} from '../src/domain/appPreferences'

const STORAGE_KEY = 'vibegene:app-preferences'

let reactRoot: ReturnType<typeof createRoot> | null = null
let container: HTMLDivElement | null = null

afterEach(() => {
  if (reactRoot) act(() => reactRoot!.unmount())
  container?.remove()
  reactRoot = null
  container = null
  window.localStorage.removeItem(STORAGE_KEY)
})

function renderPreferences() {
  container = document.createElement('div')
  document.body.append(container)
  reactRoot = createRoot(container)
  act(() => {
    reactRoot!.render(
      <PreferencesDialog initial={DEFAULT_APP_PREFERENCES} onClose={() => undefined} />,
    )
  })
}

describe('PreferencesDialog PCR tab', () => {
  it('edits PCR mix defaults and persists them', () => {
    renderPreferences()
    const pcrTab = [...container!.querySelectorAll('[role="tab"]')].find(
      (el) => el.textContent === 'PCR',
    ) as HTMLButtonElement
    expect(pcrTab).toBeTruthy()
    act(() => {
      pcrTab.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    const buffer = container!.querySelector('input[aria-label="Default PCR buffer fold"]') as HTMLInputElement
    const dntp = container!.querySelector('input[aria-label="Default dNTP stock (mM)"]') as HTMLInputElement
    const polymerase = container!.querySelector(
      'input[aria-label="Default polymerase volume (µl per reaction)"]',
    ) as HTMLInputElement
    const template = container!.querySelector(
      'input[aria-label="Default template DNA volume (µl per reaction)"]',
    ) as HTMLInputElement
    expect(buffer.value).toBe('10')
    expect(dntp.value).toBe('10')
    expect(polymerase.value).toBe('0.5')
    expect(template.value).toBe('1')

    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(buffer, '5')
      buffer.dispatchEvent(new Event('input', { bubbles: true }))
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(dntp, '25')
      dntp.dispatchEvent(new Event('input', { bubbles: true }))
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(polymerase, '0.25')
      polymerase.dispatchEvent(new Event('input', { bubbles: true }))
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(template, '2')
      template.dispatchEvent(new Event('input', { bubbles: true }))
    })

    act(() => {
      container!.querySelector('button.primary')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    const saved = readAppPreferences()
    expect(saved.pcr.bufferFold).toBe(5)
    expect(saved.pcr.dntpStockmM).toBe(25)
    expect(saved.pcr.polymeraseUl).toBe(0.25)
    expect(saved.pcr.templateUl).toBe(2)
    expect(saved.pcr.reactionVolumeUl).toBe(20)
  })
})

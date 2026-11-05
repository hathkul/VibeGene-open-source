// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'vitest'
import { EnzymeInfoDialog } from '../src/EnzymeInfoDialog'

let reactRoot: ReturnType<typeof createRoot> | null = null
let container: HTMLDivElement | null = null

afterEach(() => {
  if (reactRoot) act(() => reactRoot!.unmount())
  container?.remove()
  reactRoot = null
  container = null
})

function renderDialog(enzymeName: string) {
  container = document.createElement('div')
  document.body.append(container)
  reactRoot = createRoot(container)
  act(() => {
    reactRoot!.render(<EnzymeInfoDialog initialEnzymeName={enzymeName} onClose={() => undefined} />)
  })
}

function footerActions() {
  return document.querySelector('.enzyme-info-buffer-footer-actions')
}

function inferredButton() {
  return document.querySelector<HTMLButtonElement>('.enzyme-info-inferred-button')
}

function openInferred() {
  const button = inferredButton()
  expect(button).toBeTruthy()
  expect(button!.disabled).toBe(false)
  act(() => {
    button!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
}

describe('EnzymeInfoDialog inferred activity', () => {
  it('keeps Enzyme Website beside Inferred activity and lists measured vs inferred rows for EcoRI', () => {
    renderDialog('EcoRI')
    const actions = footerActions()
    expect(actions).toBeTruthy()
    const website = actions!.querySelector('a')
    expect(website?.textContent).toBe('Enzyme Website')
    expect(website?.getAttribute('href')).toMatch(/^https?:/)
    expect(inferredButton()?.textContent).toBe('Inferred activity')
    expect(getComputedStyle(actions!).display).not.toBe('grid')

    openInferred()
    const caption = document.querySelector('.enzyme-info-inferred-caption')
    expect(caption?.textContent).toMatch(/Inferred activity for EcoRI from/)
    const table = document.querySelector('.enzyme-info-inferred-table')
    expect(table).toBeTruthy()
    expect(table!.querySelectorAll('tbody tr').length).toBeGreaterThan(20)

    const cells = [...table!.querySelectorAll('tbody tr')].map((row) => ({
      manufacturer: row.querySelectorAll('td')[0]?.textContent,
      buffer: row.querySelectorAll('td')[1]?.textContent,
      activity: row.querySelectorAll('td')[2]?.textContent,
      confidence: row.querySelectorAll('td')[3]?.textContent,
      kind: row.className,
    }))
    expect(cells.some((cell) => cell.manufacturer === 'Thermo')).toBe(true)
    expect(cells.some((cell) => cell.confidence === 'Measured' && cell.kind.includes('measured'))).toBe(true)
    expect(cells.some((cell) => cell.kind.includes('inferred') && ['High', 'Medium', 'Low'].includes(cell.confidence ?? ''))).toBe(
      true,
    )
    expect(cells.some((cell) => cell.manufacturer === 'USB' && cell.buffer === 'USB Buffer F' && cell.activity === '—' && cell.confidence === 'Unknown')).toBe(true)

    const activityCells = [...table!.querySelectorAll('td.enzyme-info-inferred-activity')]
    for (const cell of activityCells) {
      const text = cell.textContent ?? ''
      expect(text).not.toMatch(/\*\s*$/)
      expect(text).not.toMatch(/%%/)
      expect(text).not.toMatch(/\d+-\d+$/)
      expect(getComputedStyle(cell).fontWeight).not.toBe('700')
    }
    const measured = table!.querySelector('.enzyme-info-inferred-activity.is-measured')
    const inferred = table!.querySelector('.enzyme-info-inferred-activity.is-inferred')
    expect(measured).toBeTruthy()
    expect(inferred).toBeTruthy()
    expect(getComputedStyle(measured!).fontWeight).toBe(getComputedStyle(inferred!).fontWeight)
  })

  it('infers other vendors for Thermo-only AanI and keeps native Thermo numbers', () => {
    renderDialog('AanI')
    expect(document.querySelector('h2')?.textContent).toBe('AanI')
    openInferred()
    expect(document.querySelector('.enzyme-info-inferred-caption')?.textContent).toBe(
      'Inferred activity for AanI from Thermo chart',
    )
    const rows = [...document.querySelectorAll('.enzyme-info-inferred-table tbody tr')].map((row) => ({
      manufacturer: row.querySelectorAll('td')[0]?.textContent,
      buffer: row.querySelectorAll('td')[1]?.textContent,
      activity: row.querySelectorAll('td')[2]?.textContent,
      confidence: row.querySelectorAll('td')[3]?.textContent,
      kind: row.className,
    }))
    const tango = rows.find((row) => row.manufacturer === 'Thermo' && row.buffer?.includes('Tango'))
    expect(tango?.kind).toContain('measured')
    const neb = rows.find((row) => row.manufacturer === 'NEB' && row.buffer?.includes('r1.1'))
    expect(neb?.kind).toContain('inferred')
    expect(neb?.activity).toMatch(/%/)
    expect(rows.some((row) => row.buffer?.includes('ONE') && row.confidence === 'Double, low' && row.kind.includes('double'))).toBe(
      true,
    )
    expect(rows.some((row) => row.buffer === 'ROSE Buffer' && row.confidence === 'Double, low')).toBe(true)
  })

  it('keeps AatII native NEB CutSmart measured when the Thermo listing is selected', () => {
    renderDialog('AatII')
    const manufacturerSelect = document.querySelector<HTMLSelectElement>('.enzyme-info-manufacturer-row select')
    expect(manufacturerSelect).toBeTruthy()
    act(() => {
      manufacturerSelect!.value = 'thermo'
      manufacturerSelect!.dispatchEvent(new Event('change', { bubbles: true }))
    })
    openInferred()
    expect(document.querySelector('.enzyme-info-inferred-caption')?.textContent).toBe(
      'Inferred activity for AatII from Thermo chart',
    )
    const cutSmart = [...document.querySelectorAll('.enzyme-info-inferred-table tbody tr')].find((row) => {
      const cells = row.querySelectorAll('td')
      return cells[0]?.textContent === 'NEB' && cells[1]?.textContent?.includes('CutSmart')
    })
    expect(cutSmart).toBeTruthy()
    expect(cutSmart!.className).toContain('measured')
    expect(cutSmart!.querySelectorAll('td')[3]?.textContent).toBe('Measured')
  })
})

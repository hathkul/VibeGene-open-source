// @vitest-environment jsdom

import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'vitest'
import { PcrRecipeDialog } from '../src/PcrRecipeDialog'
import { DEFAULT_PCR_MIX_SETTINGS, pcrRecipeContextFromHistory } from '../src/domain/pcrRecipe'
import { reverseComplement } from '../src/domain/sequence'
import type { HistoryNode } from '../src/domain/types'

const annealFwd = 'AAACCCGGGTTTAAACCCGGGTTT'
const annealRev = 'ATGATGATGATGATGATGATGA'

function pcrNode(): HistoryNode {
  const templateSeq = `${annealFwd}${'A'.repeat(200)}${reverseComplement(annealRev)}`
  const parent: HistoryNode = {
    id: 'template',
    name: 'Template.dna',
    seqLen: templateSeq.length,
    circular: true,
    operation: 'invalid',
    resurrectable: true,
    hideHistory: false,
    oligos: [],
    regeneratedSites: [],
    inputSummaries: [],
    features: [],
    sequence: templateSeq,
    children: [],
  }
  return {
    id: 'pcr',
    name: 'Amplicon.dna',
    seqLen: annealFwd.length + 200 + annealRev.length,
    circular: false,
    operation: 'amplifyFragment',
    resurrectable: false,
    hideHistory: false,
    polymerase: 'Creates blunt ends',
    oligos: [
      { name: 'Fwd', sequence: annealFwd },
      { name: 'Rev', sequence: annealRev },
    ],
    regeneratedSites: [],
    inputSummaries: [{ manipulation: 'amplify', name1: 'Fwd', name2: 'Rev', val1: '1', val2: String(templateSeq.length) }],
    features: [],
    sequence: `${annealFwd}${'A'.repeat(200)}${annealRev}`,
    children: [parent],
  }
}

let reactRoot: ReturnType<typeof createRoot> | null = null
let container: HTMLDivElement | null = null

afterEach(() => {
  if (reactRoot) act(() => reactRoot!.unmount())
  container?.remove()
  reactRoot = null
  container = null
})

function renderDialog() {
  const recipe = pcrRecipeContextFromHistory(pcrNode())
  if (!recipe) throw new Error('expected PCR recipe')
  container = document.createElement('div')
  document.body.append(container)
  reactRoot = createRoot(container)
  act(() => {
    reactRoot!.render(
      <PcrRecipeDialog recipe={recipe} mixDefaults={DEFAULT_PCR_MIX_SETTINGS} onClose={() => undefined} />,
    )
  })
}

function mixCell(component: string, column: number) {
  const row = [...container!.querySelectorAll('.pcr-recipe-mix tbody tr')].find((tr) =>
    tr.textContent?.includes(component),
  )
  return row?.querySelectorAll('td')[column]?.textContent
}

function setInput(input: HTMLInputElement, value: string) {
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

describe('PcrRecipeDialog', () => {
  it('shows the suggested program and a 20 µl / 10 µM mix', () => {
    renderDialog()
    expect(container!.querySelector('#pcr-recipe-title')?.textContent).toBe('PCR recipe')
    expect(container!.textContent).toContain('Initial denaturation')
    expect(container!.textContent).toContain('Annealing')
    expect(container!.textContent).toContain('Fwd')
    const volume = container!.querySelector('input[aria-label="PCR volume (µl)"]') as HTMLInputElement
    const reactions = container!.querySelector('input[aria-label="Number of reactions"]') as HTMLInputElement
    const stock = container!.querySelector(
      'input[aria-label="Primer stock concentration (µM)"]',
    ) as HTMLInputElement
    expect(volume.value).toBe('20')
    expect(reactions.value).toBe('1')
    expect(stock.value).toBe('10')
    expect((container!.querySelector('input[aria-label="PCR buffer fold"]') as HTMLInputElement).value).toBe('10')
    expect(
      (container!.querySelector('input[aria-label="dNTP stock concentration (mM)"]') as HTMLInputElement).value,
    ).toBe('10')
    expect(
      (container!.querySelector('input[aria-label="Polymerase volume (µl per reaction)"]') as HTMLInputElement)
        .value,
    ).toBe('0.5')
    expect(
      (container!.querySelector('input[aria-label="Template DNA volume (µl per reaction)"]') as HTMLInputElement)
        .value,
    ).toBe('1')
    expect(container!.textContent).toContain('High-fidelity polymerase')
  })

  it('rescales primer, buffer, and dNTP volumes when mix fields change', () => {
    renderDialog()
    const volume = container!.querySelector('input[aria-label="PCR volume (µl)"]') as HTMLInputElement
    const reactions = container!.querySelector('input[aria-label="Number of reactions"]') as HTMLInputElement
    const stock = container!.querySelector(
      'input[aria-label="Primer stock concentration (µM)"]',
    ) as HTMLInputElement

    expect(container!.textContent).toContain('1')
    setInput(volume, '50')
    expect(container!.textContent).toContain((2.5).toLocaleString())
    setInput(reactions, '4')
    expect(container!.textContent).toContain('10')
    setInput(stock, '20')
    expect(mixCell('Fwd', 2)).toBe((1.25).toLocaleString())
    const buffer = container!.querySelector('input[aria-label="PCR buffer fold"]') as HTMLInputElement
    setInput(buffer, '5')
    expect(mixCell('HF PCR buffer', 2)).toBe('10')
    expect(mixCell('HF PCR buffer', 1)).toBe('5×')
    expect(mixCell('Template DNA', 2)).toBe('1')
    const template = container!.querySelector(
      'input[aria-label="Template DNA volume (µl per reaction)"]',
    ) as HTMLInputElement
    setInput(template, '2')
    expect(mixCell('Template DNA', 2)).toBe('2')
    expect(mixCell('Template DNA', 3)).toBe('8')
  })
})

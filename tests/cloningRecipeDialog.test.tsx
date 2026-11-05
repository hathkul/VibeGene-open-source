// @vitest-environment jsdom

import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'vitest'
import { CloningRecipeDialog } from '../src/CloningRecipeDialog'
import type { CloningRecipePart } from '../src/domain/cloningRecipe'

const parts: CloningRecipePart[] = [
  { id: 'vector:0', role: 'vector', name: 'pUC', lengthBp: 3400 },
  { id: 'insert:1', role: 'insert', name: 'GFP', lengthBp: 800 },
]

let reactRoot: ReturnType<typeof createRoot> | null = null
let container: HTMLDivElement | null = null

afterEach(() => {
  if (reactRoot) act(() => reactRoot!.unmount())
  container?.remove()
  reactRoot = null
  container = null
})

function renderDialog(junctionsBlunt = false) {
  container = document.createElement('div')
  document.body.append(container)
  reactRoot = createRoot(container)
  act(() => {
    reactRoot!.render(
      <CloningRecipeDialog
        productName="Cloned.dna"
        parts={parts}
        junctionsBlunt={junctionsBlunt}
        onClose={() => undefined}
      />,
    )
  })
}

function setInput(input: HTMLInputElement, value: string) {
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

describe('CloningRecipeDialog', () => {
  it('shows fragment sizes, molar ratio, and default 20 ng vector recipe', () => {
    renderDialog()
    expect(container!.textContent).toContain(`${(3400).toLocaleString()} bp`)
    expect(container!.textContent).toContain(`${(800).toLocaleString()} bp`)
    expect(container!.textContent).toContain('1 : 4.25')
    const vectorAmount = container!.querySelector('input[aria-label="Vector amount (ng)"]') as HTMLInputElement
    expect(vectorAmount.value).toBe('20')
    expect(container!.textContent).toContain((14.12).toLocaleString())
  })

  it('recalculates insert mass and volumes from amount, multiplicity, and concentrations', () => {
    renderDialog()
    const vectorAmount = container!.querySelector('input[aria-label="Vector amount (ng)"]') as HTMLInputElement
    const multiplicity = container!.querySelector('input[aria-label="Insert multiplicity"]') as HTMLInputElement
    const vectorConc = container!.querySelector(
      'input[aria-label="Vector concentration (ng/µl)"]',
    ) as HTMLInputElement
    const insertConc = container!.querySelector(
      'input[aria-label="Insert concentration (ng/µl)"]',
    ) as HTMLInputElement

    setInput(vectorAmount, '50')
    expect(container!.textContent).toContain((35.29).toLocaleString())

    setInput(multiplicity, '1')
    expect(container!.textContent).toContain((11.76).toLocaleString())

    setInput(vectorConc, '50')
    setInput(insertConc, '10')
    expect(container!.textContent).toContain('1')
    expect(container!.textContent).toContain((1.18).toLocaleString())
  })

  it('defaults blunt typical inserts to 5:1 multiplicity', () => {
    renderDialog(true)
    const multiplicity = container!.querySelector('input[aria-label="Insert multiplicity"]') as HTMLInputElement
    expect(multiplicity.value).toBe('5')
    expect(container!.textContent).toContain((23.53).toLocaleString())
  })

  it('defaults a short oligo insert to 10:1 multiplicity', () => {
    container = document.createElement('div')
    document.body.append(container)
    reactRoot = createRoot(container)
    act(() => {
      reactRoot!.render(
        <CloningRecipeDialog
          productName="OligoClone.dna"
          parts={[
            { id: 'vector:0', role: 'vector', name: 'pUC', lengthBp: 3400 },
            { id: 'insert:1', role: 'insert', name: 'adapter', lengthBp: 32 },
          ]}
          junctionsBlunt={false}
          onClose={() => undefined}
        />,
      )
    })
    const multiplicity = container!.querySelector('input[aria-label="Insert multiplicity"]') as HTMLInputElement
    expect(multiplicity.value).toBe('10')
    expect(container!.textContent).toContain((1.88).toLocaleString())
  })
})

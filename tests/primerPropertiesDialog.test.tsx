// @vitest-environment jsdom

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { act, type ComponentProps } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'vitest'
import { displayAnnealMaskForOrientation } from '../src/application/primerWorkflow/primerPropertiesPayload'
import { PrimerPropertiesDialog } from '../src/PrimerPropertiesDialog'
import type { PrimerBindingLayout } from '../src/domain/types'

let reactRoot: ReturnType<typeof createRoot> | null = null
let container: HTMLDivElement | null = null

afterEach(() => {
  if (reactRoot) act(() => reactRoot!.unmount())
  container?.remove()
  reactRoot = null
  container = null
})

function renderProperties(
  props: Omit<ComponentProps<typeof PrimerPropertiesDialog>, 'onClose'>,
) {
  container = document.createElement('div')
  document.body.append(container)
  reactRoot = createRoot(container)
  act(() => {
    reactRoot!.render(<PrimerPropertiesDialog {...props} onClose={() => undefined} />)
  })
}

const appCss = readFileSync(resolve(process.cwd(), 'src/App.css'), 'utf8')

describe('PrimerPropertiesDialog sequence highlight', () => {
  it('suppresses native WebKit input glyph paint so highlight spans own base colors', () => {
    expect(appCss).toMatch(
      /:root\[data-color-scheme\] \.primer-properties-dialog \.primer-properties-sequence-field \.primer-properties-sequence \{[\s\S]*?color: transparent;[\s\S]*?-webkit-text-fill-color: transparent;/,
    )
  })

  it('reverses the anneal mask with reverse-complement display', () => {
    expect(displayAnnealMaskForOrientation([true, false, true], true)).toEqual([true, false, true].reverse())
  })

  it('colors annealed and overhang bases separately for forward and reverse display', () => {
    const template = 'ATGCGTACGTAGCCCCGGGG'
    const sequence = 'TTTTTATGCGTACGTAG'
    const bindings: PrimerBindingLayout[] = [
      {
        strand: 'forward',
        templateStart: 0,
        templateEnd: 12,
        components: [
          { primerBases: 'TTTTT' },
          { primerBases: 'ATGCGTACGTAG', templateStart: 0, templateEnd: 12 },
        ],
      },
    ]

    renderProperties({
      primer: { name: 'Test', sequence },
      source: 'construct',
      templateSequence: template,
      preferredStrand: 'forward',
      bindings,
    })

    const forwardClasses = [...container!.querySelectorAll('.primer-editor-sequence-highlight span')].map(
      (span) => span.className,
    )
    expect(forwardClasses.filter((name) => name.includes('is-annealed')).length).toBeGreaterThan(0)
    expect(forwardClasses.filter((name) => name.includes('is-overhang')).length).toBeGreaterThan(0)
    expect(forwardClasses).toHaveLength(sequence.length)

    const rcButton = [...container!.querySelectorAll('button')].find((button) =>
      button.textContent?.includes('Reverse Complement'),
    ) as HTMLButtonElement
    act(() => {
      rcButton.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    const displayed = (container!.querySelector('.primer-properties-sequence') as HTMLInputElement).value
    const rcClasses = [...container!.querySelectorAll('.primer-editor-sequence-highlight span')].map(
      (span) => span.className,
    )
    expect(displayed.length).toBe(sequence.length)
    expect(rcClasses).toHaveLength(displayed.length)
    expect(rcClasses).toEqual([...forwardClasses].reverse())
  })

  it('honors reverse-strand binding layout on the forward display', () => {
    const template = 'ATGCGTACGTAGCCCCGGGG'
    const sequence = 'CTACGTACGCATTTTT'
    const bindings: PrimerBindingLayout[] = [
      {
        strand: 'reverse',
        templateStart: 0,
        templateEnd: 12,
        components: [
          { primerBases: 'TTTTT' },
          { primerBases: 'CTACGTACGCAT', templateStart: 0, templateEnd: 12 },
        ],
      },
    ]
    renderProperties({
      primer: { name: 'Rev', sequence },
      source: 'construct',
      templateSequence: template,
      preferredStrand: 'reverse',
      bindings,
    })
    const classes = [...container!.querySelectorAll('.primer-editor-sequence-highlight span')].map(
      (span) => span.className,
    )
    expect(classes.some((name) => name.includes('is-annealed'))).toBe(true)
    expect(classes.some((name) => name.includes('is-overhang'))).toBe(true)
  })

  it('recomputes anneal classes when a matching base is edited into a mismatch', () => {
    const template = 'ATGCGTACGTAGCCCCGGGG'
    const sequence = 'TTTTTATGCGTACGTAG'
    const bindings: PrimerBindingLayout[] = [
      {
        strand: 'forward',
        templateStart: 0,
        templateEnd: 12,
        components: [
          { primerBases: 'TTTTT' },
          { primerBases: 'ATGCGTACGTAG', templateStart: 0, templateEnd: 12 },
        ],
      },
    ]
    renderProperties({
      primer: { name: 'Edit', sequence },
      source: 'construct',
      templateSequence: template,
      preferredStrand: 'forward',
      bindings,
    })
    const input = container!.querySelector('.primer-properties-sequence') as HTMLInputElement
    expect(input.readOnly).toBe(false)
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!
      setter.call(input, 'TTTTTATGCGTACGTAA')
      input.dispatchEvent(new Event('input', { bubbles: true }))
      input.dispatchEvent(new Event('change', { bubbles: true }))
    })
    const spans = [...container!.querySelectorAll('.primer-editor-sequence-highlight span')]
    expect(spans[spans.length - 1]?.className).toContain('is-overhang')
    expect(spans.slice(5, 15).every((span) => span.className.includes('is-annealed'))).toBe(true)
    expect(spans.slice(0, 5).every((span) => span.className.includes('is-overhang'))).toBe(true)
  })

  it('shows extension, internal mismatch, and annealed bases together for a construct primer', () => {
    const template = 'ATGCGTACGTAGCCCCGGGG'
    const sequence = 'TTTTTATGCGTATGTAG'
    const bindings: PrimerBindingLayout[] = [
      {
        strand: 'forward',
        templateStart: 0,
        templateEnd: 12,
        components: [
          { primerBases: 'TTTTT' },
          { primerBases: 'ATGCGTACGTAG', templateStart: 0, templateEnd: 12 },
        ],
      },
    ]
    renderProperties({
      primer: { name: 'Mismatch', sequence },
      source: 'construct',
      templateSequence: template,
      preferredStrand: 'forward',
      bindings,
    })
    const classes = [...container!.querySelectorAll('.primer-editor-sequence-highlight span')].map((span) => span.className)
    expect(classes.slice(0, 5).every((name) => name.includes('is-overhang'))).toBe(true)
    expect(classes[11]).toContain('is-annealed')
    expect(classes[12]).toContain('is-overhang')
    expect(classes[13]).toContain('is-annealed')
  })

  it('treats library primers without a template as all overhang', () => {
    renderProperties({
      primer: { name: 'Lib', sequence: 'ATCG' },
      source: 'common',
    })
    expect(container!.querySelectorAll('.primer-editor-sequence-highlight .is-annealed')).toHaveLength(0)
    expect(container!.querySelectorAll('.primer-editor-sequence-highlight .is-overhang')).toHaveLength(4)
  })
})

// @vitest-environment jsdom

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cloneFixture } from '../src/domain/fixtures'
import type { Primer3ThalInput } from '../src/domain/primer3/thalProtocol'
import type { PrimerBindingLayout } from '../src/domain/types'
import { PrimerEditorDialog } from '../src/presentation/primers/PrimerEditorDialog'
import { reverseComplement } from '../src/domain/sequence'
import { refreshExactPrimerBindings } from '../src/domain/primerBindingPolicy'

const editorMocks = vi.hoisted(() => ({
  thalState: { status: 'unavailable', reason: 'test unavailable' } as { status: string; reason?: string; result?: unknown },
  previewEnabled: false,
  thalInput: null as unknown,
}))

vi.mock('../src/presentation/cloning/CloningRecordWorkspace', () => ({
  CloningRecordWorkspace: (props: {
    primerFrameDisplayOverrides?: Array<{ glyphs: Array<{ kind: string }> }>
    disablePrimer3PrimerFrameRefinement?: boolean
  }) => (
    <div
      aria-label="Annealing preview fixture"
      data-preview-frame={props.primerFrameDisplayOverrides?.[0]?.glyphs.map((glyph) => glyph.kind).join(',') ?? 'fallback'}
      data-frame-refinement={props.disablePrimer3PrimerFrameRefinement ? 'disabled' : 'enabled'}
    />
  ),
}))

vi.mock('../src/presentation/primers/usePrimer3Thal', () => ({
  usePrimer3Thal: (input: Primer3ThalInput | null) => {
    editorMocks.thalInput = input
    return editorMocks.thalState
  },
}))

vi.mock('../src/presentation/primers/primer3ThalForBinding', async (importOriginal) => {
  const original = await importOriginal<typeof import('../src/presentation/primers/primer3ThalForBinding')>()
  return {
    ...original,
    primerFrameDisplayFromPrimer3Thal: (args: Parameters<typeof original.primerFrameDisplayFromPrimer3Thal>[0]) => {
      if (!editorMocks.previewEnabled) return null
      return {
        layout: args.binding,
        display: {
          ...args.fallbackDisplay,
          glyphs: [{ char: 'A', kind: 'mismatch' as const, row: 0.5, templateIndex: args.binding.templateStart }],
        },
      }
    },
  }
})

let reactRoot: ReturnType<typeof createRoot> | null = null
let container: HTMLDivElement | null = null

afterEach(() => {
  if (reactRoot) act(() => reactRoot!.unmount())
  container?.remove()
  reactRoot = null
  container = null
  editorMocks.thalState = { status: 'unavailable', reason: 'test unavailable' }
  editorMocks.previewEnabled = false
  editorMocks.thalInput = null
})

const appCss = readFileSync(resolve(process.cwd(), 'src/App.css'), 'utf8')

describe('PrimerEditorDialog sequence highlight', () => {
  it('keeps the original annealed region highlighted after adding a 5′ tail', () => {
    let state = 1
    const dna = (length: number) => Array.from({ length }, () => {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0
      return 'ACGT'[(state >>> 24) % 4]!
    }).join('')
    const before = dna(80), segment = dna(28), after = dna(80), tail = dna(12)
    const template = before + segment + after
    const sequence = reverseComplement(segment)
    const primer = refreshExactPrimerBindings([{ id: 'p', name: 'Primer', sequence, color: '#7c3aed' }], template)[0]!
    container = document.createElement('div')
    document.body.append(container)
    reactRoot = createRoot(container)
    act(() => reactRoot!.render(<PrimerEditorDialog
      draft={{ mode: 'edit', primerId: 'p', name: 'Primer', sequence, color: '#7c3aed', description: '', phosphorylated: false, strand: 'reverse', bindings: primer.bindings }}
      record={{ ...cloneFixture(), topology: 'linear', sequence: template, primers: [primer] }}
      onCancel={() => undefined} onSave={() => undefined}
    />))
    expect(container.textContent).toContain('Original alignment: 28 annealed bases')
    const input = container.querySelector<HTMLInputElement>('.primer-editor-sequence')!
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, tail + sequence)
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    const spans = [...container.querySelectorAll('.primer-editor-sequence-highlight span')]
    expect(spans.slice(-28).every((span) => span.classList.contains('is-annealed'))).toBe(true)
    expect(Number(container.textContent?.match(/Original alignment: (\d+) annealed bases/)?.[1])).toBeGreaterThanOrEqual(28)
  })

  it('keeps the editable WebKit input transparent above its per-base highlight layer', () => {
    expect(appCss).toMatch(
      /:root\[data-color-scheme\] \.primer-editor-dialog \.primer-editor-sequence-field \.primer-editor-sequence \{[\s\S]*?color: transparent;[\s\S]*?-webkit-text-fill-color: transparent;[\s\S]*?background-color: transparent;/,
    )
  })

  it('renders stored annealed bases and an internal mismatch as separate span classes', () => {
    const template = 'ATGCGTACGTAGCCCCGGGG'
    const sequence = 'TTTTTATGCGTATGTAG'
    const bindings: PrimerBindingLayout[] = [{
      strand: 'forward',
      templateStart: 0,
      templateEnd: 12,
      components: [
        { primerBases: 'TTTTT' },
        { primerBases: 'ATGCGTACGTAG', templateStart: 0, templateEnd: 12 },
      ],
    }]
    const record = {
      ...cloneFixture(),
      name: 'Mismatch fixture',
      topology: 'linear' as const,
      sequence: template,
      primers: [],
    }

    container = document.createElement('div')
    document.body.append(container)
    reactRoot = createRoot(container)
    act(() => {
      reactRoot!.render(<PrimerEditorDialog
        draft={{
          mode: 'edit',
          primerId: 'mismatch-primer',
          name: 'Mismatch primer',
          sequence,
          color: '#7c3aed',
          description: '',
          phosphorylated: false,
          strand: 'forward',
          bindings,
        }}
        record={record}
        onCancel={() => undefined}
        onSave={() => undefined}
      />)
    })

    const input = container.querySelector('.primer-editor-sequence') as HTMLInputElement
    const spans = [...container.querySelectorAll('.primer-editor-sequence-highlight span')]
    expect(input.value).toBe(sequence)
    expect(input.readOnly).toBe(false)
    expect(spans).toHaveLength(sequence.length)
    expect(spans.slice(0, 5).every((span) => span.classList.contains('is-overhang'))).toBe(true)
    expect(spans[11]?.classList.contains('is-annealed')).toBe(true)
    expect(spans[12]?.classList.contains('is-overhang')).toBe(true)
    expect(spans[13]?.classList.contains('is-annealed')).toBe(true)
    expect(container.querySelector('[data-preview-frame]')?.getAttribute('data-preview-frame')).toBe('fallback')
    expect(container.querySelector('[data-preview-frame]')?.getAttribute('data-frame-refinement')).toBe('disabled')
  })

  it('uses the current Primer3 display in the live workspace preview and editor reaction conditions', () => {
    const sequence = 'AACCGGTA'
    const record = {
      ...cloneFixture(),
      name: 'Thermodynamic preview fixture',
      topology: 'linear' as const,
      sequence,
      primers: [],
    }
    editorMocks.thalState = {
      status: 'estimated',
      result: { tmC: 55, alignEnd1: sequence.length, alignEnd2: sequence.length, structure: 'test', mode: 'end1' },
    }
    editorMocks.previewEnabled = true
    container = document.createElement('div')
    document.body.append(container)
    reactRoot = createRoot(container)

    act(() => reactRoot!.render(<PrimerEditorDialog
      draft={{
        mode: 'edit', primerId: 'thermo-primer', name: 'Thermo primer', sequence,
        color: '#7c3aed', description: '', phosphorylated: false, strand: 'forward',
        bindings: [{ strand: 'forward', templateStart: 0, templateEnd: sequence.length, components: [{ primerBases: sequence, templateStart: 0, templateEnd: sequence.length }] }],
      }}
      record={record}
      onCancel={() => undefined}
      onSave={() => undefined}
    />))

    expect(container.querySelector('[data-preview-frame]')?.getAttribute('data-preview-frame')).toBe('mismatch')
    expect(container.querySelector('[data-preview-frame]')?.getAttribute('data-frame-refinement')).toBe('disabled')
    expect(editorMocks.thalInput).toMatchObject({
      sequence1: sequence,
      mode: 'end1',
      chemistry: { mvMmol: 50, dvMmol: 2, dntpMmol: 0.8, dnaNmol: 250 },
    })
    const saltInput = [...container.querySelectorAll<HTMLInputElement>('input[type="number"]')]
      .find((input) => input.closest('label')?.textContent?.includes('Monovalent salt'))!
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(saltInput, '75')
      saltInput.dispatchEvent(new Event('input', { bubbles: true }))
    })
    expect(editorMocks.thalInput).toMatchObject({ chemistry: { mvMmol: 75 } })
  })

  it('keeps the original preview and disables default-condition refinement when Primer3 cannot map its drawing', () => {
    const sequence = 'AACCGGTA'
    editorMocks.thalState = {
      status: 'estimated',
      result: { tmC: 55, alignEnd1: sequence.length, alignEnd2: sequence.length, structure: 'unmapped', mode: 'end1' },
    }
    container = document.createElement('div')
    document.body.append(container)
    reactRoot = createRoot(container)
    act(() => reactRoot!.render(<PrimerEditorDialog
      draft={{
        mode: 'edit', primerId: 'unmapped-primer', name: 'Unmapped primer', sequence,
        color: '#7c3aed', description: '', phosphorylated: false, strand: 'forward',
        bindings: [{ strand: 'forward', templateStart: 0, templateEnd: sequence.length, components: [{ primerBases: sequence, templateStart: 0, templateEnd: sequence.length }] }],
      }}
      record={{ ...cloneFixture(), topology: 'linear', sequence, primers: [] }}
      onCancel={() => undefined}
      onSave={() => undefined}
    />))

    expect(container.querySelector('[data-preview-frame]')?.getAttribute('data-preview-frame')).toBe('fallback')
    expect(container.querySelector('[data-preview-frame]')?.getAttribute('data-frame-refinement')).toBe('disabled')
  })
})

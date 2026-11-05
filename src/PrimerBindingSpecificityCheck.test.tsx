// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'

const specificity = vi.hoisted(() => ({ check: vi.fn() }))
vi.mock('./domain/primer3/specificity', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./domain/primer3/specificity')>()),
  checkSinglePrimerSpecificity: specificity.check,
}))

import { PrimerBindingSpecificityCheck } from './PrimerBindingSpecificityCheck'

let host: HTMLDivElement
let root: ReturnType<typeof createRoot>
afterEach(() => {
  act(() => root?.unmount())
  host?.remove()
  specificity.check.mockReset()
  localStorage.clear()
})

const result = {
  searchSet: { database: 'refseq_rna' as const, organism: '9606' },
  sequenceLength: 12,
  truncated: false,
  fastSearch: false,
  sites: [{
    accession: 'NM_1.1', title: 'sample transcript', subjectLength: 500,
    low: 21, high: 32, strand: 'minus' as const, mismatches: 1, threePrimeMismatches: 0,
  }],
}

function render(sequence: string, extra: Partial<Parameters<typeof PrimerBindingSpecificityCheck>[0]> = {}) {
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  act(() => root.render(<PrimerBindingSpecificityCheck sequence={sequence} {...extra} />))
}

function clickButton(name: string | RegExp) {
  const button = [...host.querySelectorAll('button')].find((item) => typeof name === 'string' ? item.textContent === name : name.test(item.textContent ?? ''))
  if (!button) throw new Error(`Button not found: ${String(name)}`)
  act(() => button.click())
}

describe('PrimerBindingSpecificityCheck', () => {
  it('searches the current oligo as one query and shows individual hits with the privacy disclosure', async () => {
    specificity.check.mockResolvedValue(result)
    render('ACGTACGTACGT')
    clickButton(/check specificity/i)
    expect(host.textContent).toContain('sent to NCBI BLAST')
    clickButton('Check single primer')
    await act(async () => { await Promise.resolve() })
    expect(specificity.check).toHaveBeenCalledWith('ACGTACGTACGT', expect.any(Object), expect.objectContaining({ fast: expect.any(Boolean), signal: expect.any(AbortSignal) }))
    expect(host.textContent).toContain('NM_1.1')
    expect(host.textContent).toContain('−')
    expect(host.querySelector('table')?.textContent).not.toContain('Product')
  })

  it('uses a known unpaired 5′ tail only when the user selects the annealed region', async () => {
    specificity.check.mockResolvedValue(result)
    const binding = {
      strand: 'forward' as const,
      templateStart: 0,
      templateEnd: 7,
      components: [
        { primerBases: 'AAAA' },
        { primerBases: 'GTACGTAC', templateStart: 0, templateEnd: 8 },
      ],
    }
    render('AAAAGTACGTAC', { templateSequence: 'GTACGTAC', preferredStrand: 'forward', bindings: [binding] })
    clickButton(/check specificity/i)
    const checkbox = host.querySelector<HTMLInputElement>('input[type="checkbox"]')!
    act(() => { checkbox.click() })
    clickButton('Check single primer')
    await act(async () => { await Promise.resolve() })
    expect(specificity.check).toHaveBeenCalledWith('GTACGTAC', expect.any(Object), expect.any(Object))
    expect(host.textContent).toContain('4 leading 5′ overhang bases excluded')
  })

  it('aborts and suppresses stale results when the live sequence changes', async () => {
    let resolve!: (value: typeof result) => void
    specificity.check.mockImplementation((_sequence, _set, options) => new Promise((done) => {
      resolve = done
      options.signal.addEventListener('abort', () => undefined)
    }))
    render('ACGTACGTACGT')
    clickButton(/check specificity/i)
    clickButton('Check single primer')
    const signal = specificity.check.mock.calls[0]![2].signal as AbortSignal
    act(() => root.render(<PrimerBindingSpecificityCheck sequence="TGCATGCATGCA" />))
    expect(signal.aborted).toBe(true)
    await act(async () => { resolve(result); await Promise.resolve() })
    expect(host.textContent).not.toContain('NM_1.1')
  })

  it('clears an old result when search settings change and uses a valid seed for short primers', async () => {
    specificity.check.mockResolvedValue({ ...result, sequenceLength: 8 })
    render('ACGTACGT')
    clickButton(/check specificity/i)
    const fast = host.querySelector<HTMLInputElement>('.primer-binding-specificity-fast input')!
    act(() => { fast.click() })
    expect(host.textContent).toContain('7-base seed used for this short primer')
    clickButton('Check single primer')
    await act(async () => { await Promise.resolve() })
    expect(specificity.check).toHaveBeenCalledWith('ACGTACGT', expect.any(Object), expect.objectContaining({ fast: true }))
  })

  it('keeps saved results visible but identifies changed search settings', async () => {
    specificity.check.mockResolvedValue(result)
    render('ACGTACGTACGT')
    clickButton(/check specificity/i)
    clickButton('Check single primer')
    await act(async () => { await Promise.resolve() })
    expect(host.textContent).toContain('NM_1.1')
    const collection = host.querySelector<HTMLSelectElement>('select[aria-label="Sequence collection"]')!
    act(() => {
      collection.value = 'core_nt'
      collection.dispatchEvent(new Event('change', { bubbles: true }))
    })
    expect(host.textContent).toContain('NM_1.1')
    expect(host.textContent).toContain('different search settings')
  })

  it('loads an older result, warns after a sequence edit, and deletes it', () => {
    const onResultChange = vi.fn()
    const savedResult = { primerSequence: 'ACGTACGTACGT', searchedSequence: 'ACGTACGTACGT', completedAt: '2026-01-01T00:00:00Z', result }
    render('TGCATGCATGCA', { savedResult, onResultChange })
    clickButton(/check specificity/i)
    expect(host.textContent).toContain('primer sequence has changed')
    expect(host.textContent).toContain('NM_1.1')
    clickButton('Delete result')
    expect(host.textContent).not.toContain('NM_1.1')
    expect(onResultChange).toHaveBeenCalledWith(undefined)
  })
})

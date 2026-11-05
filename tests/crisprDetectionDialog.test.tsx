// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CrisprDetectionDialog } from '../src/CrisprDetectionDialog'
import type { CrisprDetectionResult } from '../src/domain/crisprDetection'

function result(withRecipe: boolean, strand: 'forward' | 'reverse' = 'forward'): CrisprDetectionResult {
  return {
    nucleaseFindings: [],
    guideScaffoldFindings: [],
    cassetteFindings: [{
      start: 0,
      end: 3000,
      strand,
      promoterName: 'U6 promoter',
      scaffoldName: 'SpCas9 sgRNA scaffold',
      architecture: 'pre-linearized',
      nearbyTypeIisSites: [],
      likelyGuideLength: 20,
      confidence: 'high',
      evidence: [],
      ...(withRecipe ? {
        oligoTemplate: {
          recipe: 'Guide-it sgRNA1-style' as const,
          recipeId: 'guide-it-sgrna1' as const,
          matchBasis: 'snapgene-recorded' as const,
          sense: '5′-CACC-[20 nt spacer]-3′',
          antisense: '5′-AAAC-[reverse complement of spacer]-3′',
          note: 'Enter a protospacer.',
        },
      } : {}),
    }],
    recommendations: [],
    summary: 'One candidate',
  }
}

afterEach(() => document.body.replaceChildren())

describe('CRISPR detection dialog oligo input', () => {
  it('renders final oligo sequences after valid target input and copies them', async () => {
    const writeText = vi.fn(async () => undefined)
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
    const container = document.createElement('div')
    document.body.append(container)
    const root = createRoot(container)
    act(() => root.render(<CrisprDetectionDialog recordName="test" result={result(true)} onClose={() => undefined} />))
    const input = container.querySelector('input')!
    const setNativeValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
    act(() => {
      setNativeValue.call(input, 'GACCTGATCGTACGTTAGCA')
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    expect(container.textContent).toContain('CACCGACCTGATCGTACGTTAGCA')
    expect(container.textContent).toContain('AAACTGCTAACGTACGATCAGGTC')
    expect(container.querySelectorAll('.crispr-oligo-design-result button')).toHaveLength(2)
    await act(async () => {
      container.querySelector<HTMLButtonElement>('.crispr-oligo-design-result button')!.click()
    })
    expect(writeText).toHaveBeenCalledWith('CACCGACCTGATCGTACGTTAGCA')
    expect(container.textContent).toContain('Sense oligo copied')
    act(() => root.unmount())
  })

  it('labels physical strands correctly for reverse-strand guide cassettes', () => {
    const container = document.createElement('div')
    document.body.append(container)
    const root = createRoot(container)
    act(() => root.render(<CrisprDetectionDialog recordName="reverse" result={result(true, 'reverse')} onClose={() => undefined} />))
    const input = container.querySelector('input')!
    const setNativeValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
    act(() => {
      setNativeValue.call(input, 'GACCTGATCGTACGTTAGCA')
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    expect(container.textContent).toContain('Sense / bottom strand in this file')
    expect(container.textContent).toContain('Antisense / top strand in this file')
    act(() => root.unmount())
  })

  it('clears entered target when the detected recipe changes', () => {
    const container = document.createElement('div')
    document.body.append(container)
    const root = createRoot(container)
    act(() => root.render(<CrisprDetectionDialog recordName="test" result={result(true)} onClose={() => undefined} />))
    const input = container.querySelector('input')!
    const setNativeValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
    act(() => {
      setNativeValue.call(input, 'GACCTGATCGTACGTTAGCA')
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    const changed = result(true)
    changed.cassetteFindings[0]!.oligoTemplate!.recipeId = 'geneart'
    act(() => root.render(<CrisprDetectionDialog recordName="test" result={changed} onClose={() => undefined} />))
    expect(container.querySelector<HTMLInputElement>('input')?.value).toBe('')
    expect(container.querySelector('.crispr-oligo-design-result')).toBeNull()
    act(() => root.unmount())
  })

  it('does not offer final oligos without a validated end recipe', () => {
    const container = document.createElement('div')
    document.body.append(container)
    const root = createRoot(container)
    act(() => root.render(<CrisprDetectionDialog recordName="test" result={result(false)} onClose={() => undefined} />))
    expect(container.querySelector('.crispr-oligo-design')).toBeNull()
    act(() => root.unmount())
  })
})

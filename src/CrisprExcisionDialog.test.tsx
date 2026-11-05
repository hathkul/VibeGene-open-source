// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, expect, it, vi } from 'vitest'
import { cloneFixture } from './domain/fixtures'
import { createSgRNAFeatures, findSgRNATargets, groupSgRNAFeatures, SGRNA_PRESETS } from './domain/sgrna'
import { planCrisprExcision } from './application/selectionEditing/crisprExcision'
import { CrisprExcisionDialog } from './CrisprExcisionDialog'

describe('CrisprExcisionDialog', () => {
  it('shows and submits editable Cas12a end-filling settings', () => {
    const spacers = ['ACGTACGTACGTACGTACGA', 'GCTAGCTAGCTAGCTAGCTA']
    const sequence = `CCCTTTA${spacers[0]}AAAAAACCCCCCCCCCTTTA${spacers[1]}AAAAAACCCCC`
    const features = spacers.flatMap((spacer, index) => createSgRNAFeatures(
      findSgRNATargets(sequence, spacer, 'linear', SGRNA_PRESETS[2]!)[0]!,
      { id: `g${index}`, name: `Guide ${index}`, nuclease: 'Cas12a', pamMotif: 'TTTV', pamSide: '5prime', spacer },
    ))
    const record = { ...cloneFixture(), sequence, topology: 'linear' as const, features, primers: [] }
    const plan = planCrisprExcision(record, groupSgRNAFeatures(features))!
    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)
    const onExcise = vi.fn()
    act(() => root.render(<CrisprExcisionDialog record={record} plan={plan} onCancel={vi.fn()} onExcise={onExcise} />))
    const selects = host.querySelectorAll('select')
    expect(selects).toHaveLength(2)
    expect(selects[0]!.value).toBe('5')
    expect(host.textContent).toContain('Blunt ends after filling')
    const button = [...host.querySelectorAll('button')].find((item) => item.textContent === 'Excise region')!
    act(() => { selects[0]!.value = '0'; selects[0]!.dispatchEvent(new Event('change', { bubbles: true })) })
    expect(button.disabled).toBe(true)
    expect(host.textContent).toContain('Remaining sticky ends are incompatible')
    act(() => { selects[0]!.value = '5'; selects[0]!.dispatchEvent(new Event('change', { bubbles: true })) })
    expect(button.disabled).toBe(false)
    act(() => button.click())
    expect(onExcise).toHaveBeenCalledWith('between', expect.objectContaining({ leftFill: 5, rightFill: 5 }))
    act(() => root.unmount())
    host.remove()
  })
  it('allows choosing the origin-spanning arc on a circular molecule', () => {
    const spacers = ['ACGTACGTACGTACGTACGA', 'GCTAGCTAGCTAGCTAGCTA']
    const sequence = `TTT${spacers[0]}AGG${'T'.repeat(8)}${spacers[1]}TGGAAAA`
    const features = spacers.flatMap((spacer, index) => createSgRNAFeatures(
      findSgRNATargets(sequence, spacer, 'circular', SGRNA_PRESETS[0]!)[0]!,
      { id: `g${index}`, name: `Guide ${index}`, nuclease: 'SpCas9', pamMotif: 'NGG', pamSide: '3prime', spacer },
    ))
    const record = { ...cloneFixture(), sequence, topology: 'circular' as const, features, primers: [] }
    const plan = planCrisprExcision(record, groupSgRNAFeatures(features))!
    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)
    const onExcise = vi.fn()
    act(() => root.render(<CrisprExcisionDialog record={record} plan={plan} onCancel={vi.fn()} onExcise={onExcise} />))
    const options = host.querySelectorAll<HTMLInputElement>('input[type=radio]')
    expect(options[0]?.checked).toBe(true)
    act(() => options[1]!.click())
    const button = [...host.querySelectorAll('button')].find((item) => item.textContent === 'Excise region')!
    act(() => button.click())
    expect(onExcise).toHaveBeenCalledWith('across-origin')
    act(() => root.unmount())
    host.remove()
  })
})

// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, expect, it, vi } from 'vitest'
import {
  defaultPrimerTmConditionValues,
  primerTmConditionErrors,
  primerTmConditionsForCalculation,
  snapGeneSaltConditionValues,
  type PrimerTmConditionValues,
} from './PrimerTmConditionsModel'
import { PrimerTmConditions } from './PrimerTmConditions'

let host: HTMLDivElement
let root: ReturnType<typeof createRoot>
afterEach(() => { act(() => root?.unmount()); host?.remove() })

function render(value: PrimerTmConditionValues, onChange = vi.fn()) {
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  act(() => root.render(<PrimerTmConditions value={value} onChange={onChange} />))
  return { onChange }
}

it('shows the default assumptions and labels every concentration with units', () => {
  render({ ...defaultPrimerTmConditionValues })
  expect(host.querySelector('summary')?.textContent).toContain('Na 50 mM, Mg²⁺ 2 mM, dNTP 0.8 mM, oligo 250 nM')
  expect(host.querySelector('[role="group"][aria-label="Primer Tm reaction assumptions"]')).not.toBeNull()
  expect([...host.querySelectorAll('label')].map((label) => label.textContent)).toEqual([
    'Monovalent salt (Na⁺ equivalent) (mM)',
    'Mg²⁺ (mM)',
    'Total dNTP (mM)',
    'Oligo concentration (nM)',
  ])
  expect(host.textContent).toContain('only while this primer editor is open')
  expect(host.textContent).toContain('does not select or reproduce SnapGene’s calculation algorithm')
})

it('keeps an empty intermediate input empty and marks it invalid accessibly', () => {
  const value = { ...defaultPrimerTmConditionValues }
  const { onChange } = render(value)
  const input = host.querySelector<HTMLInputElement>('input')!
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
  act(() => {
    setter.call(input, '')
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
  expect(onChange).toHaveBeenCalledWith({ ...value, monoMilliMolar: '' })
  const emptyValue = { ...value, monoMilliMolar: '' }
  act(() => root.render(<PrimerTmConditions value={emptyValue} onChange={onChange} />))
  expect(host.querySelector<HTMLInputElement>('input')?.getAttribute('aria-invalid')).toBe('true')
  expect(primerTmConditionErrors(emptyValue).monoMilliMolar).toBe('Enter a number.')
  expect(primerTmConditionsForCalculation(emptyValue)).toBeNull()
})

it('allows zero individual salts but rejects zero effective ionic strength accessibly', () => {
  const zeroMagnesium = { ...defaultPrimerTmConditionValues, magnesiumMilliMolar: '0', dntpMilliMolar: '0' }
  expect(primerTmConditionErrors(zeroMagnesium)).toEqual({})
  expect(primerTmConditionsForCalculation({ ...zeroMagnesium, monoMilliMolar: '0' })).toBeNull()

  render({ ...zeroMagnesium, monoMilliMolar: '0' })
  expect(host.querySelector('[role="alert"]')?.textContent).toContain('monovalent salt or Mg²⁺ above 0 mM')
  const mono = host.querySelector<HTMLInputElement>('input')!
  expect(mono.getAttribute('aria-invalid')).toBe('true')
  expect(mono.getAttribute('aria-describedby')).toContain('ionic-error')

  const lowOligo = { ...defaultPrimerTmConditionValues, oligoNanoMolar: '0' }
  expect(primerTmConditionErrors(lowOligo).oligoNanoMolar).toContain('0.1')
})

it('converts validated values to molar units and emits stable preset copies', () => {
  const values = { ...defaultPrimerTmConditionValues }
  const { onChange } = render(values)
  const conditions = primerTmConditionsForCalculation(values)
  expect(conditions).toEqual({ monoConc: 0.05, mgConc: 0.002, dntpConc: 0.0008, oligoConc: 250e-9 })
  act(() => host.querySelectorAll('button')[1]!.click())
  expect(onChange).toHaveBeenLastCalledWith({ ...snapGeneSaltConditionValues })
  expect(Object.isFrozen(snapGeneSaltConditionValues)).toBe(true)
  act(() => host.querySelectorAll('button')[0]!.click())
  expect(onChange).toHaveBeenLastCalledWith({ ...defaultPrimerTmConditionValues })
})

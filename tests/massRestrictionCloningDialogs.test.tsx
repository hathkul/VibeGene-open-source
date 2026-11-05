// @vitest-environment jsdom
import { act, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  BlockedBatchOpenDialog,
  MassRestrictionNamesDialog,
  MassRestrictionLibraryMembersDialog,
  MassRestrictionLibraryOutputControls,
  MassRestrictionResultsDialog,
  MassRestrictionSourceNavigator,
} from '../src/cloning/MassRestrictionCloningDialogs'
import type { SequenceRecord } from '../src/domain/types'
import { defaultConstructProperties } from '../src/domain/constructProperties'

let root: ReturnType<typeof createRoot> | null = null
let container: HTMLDivElement | null = null

function makeRecord(id: string, name: string): SequenceRecord {
  return {
    id,
    name,
    description: '',
    molecule: 'dna',
    topology: 'linear',
    sequence: 'ATGC',
    features: [],
    primers: [],
    operations: [],
    construct: { ...defaultConstructProperties },
    createdAt: '',
    updatedAt: '',
  }
}

function render(element: ReactNode) {
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  act(() => root!.render(element))
}

afterEach(() => {
  if (root) act(() => root!.unmount())
  container?.remove()
  root = null
  container = null
})

describe('mass restriction cloning dialogs', () => {
  it('keeps browser-blocked products available for individual opening', () => {
    const products = [makeRecord('one', 'Clone one'), makeRecord('two', 'Clone two')]
    const onOpen = vi.fn()
    const onDiscard = vi.fn()
    render(
      <BlockedBatchOpenDialog
        products={products}
        openedCount={1}
        onOpen={onOpen}
        onDiscard={onDiscard}
      />,
    )

    expect(container!.textContent).toContain('1 opened · 2 remaining')
    const openButtons = Array.from(container!.querySelectorAll<HTMLButtonElement>('button.primary'))
    expect(openButtons).toHaveLength(2)
    act(() => openButtons[1]!.click())
    expect(onOpen).toHaveBeenCalledWith(products[1])
    act(() => container!.querySelector<HTMLButtonElement>('button.danger-text')!.click())
    expect(onDiscard).toHaveBeenCalledTimes(1)
  })

  it('controls whether all cloning destinations output a named library', () => {
    const onCheckedChange = vi.fn()
    const onNameChange = vi.fn()
    render(
      <MassRestrictionLibraryOutputControls
        checked
        name="Selected products"
        onCheckedChange={onCheckedChange}
        onNameChange={onNameChange}
      />,
    )

    const checkbox = container!.querySelector<HTMLInputElement>('input[type="checkbox"]')!
    const name = container!.querySelector<HTMLInputElement>('input:not([type])')!
    expect(checkbox.checked).toBe(true)
    expect(name.value).toBe('Selected products')

    act(() => checkbox.click())
    expect(onCheckedChange).toHaveBeenCalledWith(false)

    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(name, 'Library A')
      name.dispatchEvent(new Event('input', { bubbles: true }))
    })
    expect(onNameChange).toHaveBeenCalledWith('Library A')
  })

  it('navigates through selected constructs with bounded previous and next controls', () => {
    const onChange = vi.fn()
    render(
      <MassRestrictionSourceNavigator
        kind="insert"
        choices={[
          { key: 'one', record: makeRecord('one', 'Clone one') },
          { key: 'two', record: makeRecord('two', 'Clone two') },
        ]}
        index={0}
        onChange={onChange}
      />,
    )

    expect(container!.textContent).toContain('1 of 2')
    expect(container!.textContent).toContain('Clone one')
    expect(container!.querySelector<HTMLButtonElement>('button[aria-label="Previous insert"]')?.disabled).toBe(true)
    act(() => container!.querySelector<HTMLButtonElement>('button[aria-label="Next insert"]')?.click())
    expect(onChange).toHaveBeenCalledWith(1)
  })

  it('labels unary restriction-operation batches as constructs', () => {
    render(
      <MassRestrictionSourceNavigator
        kind="construct"
        choices={[
          { key: 'one', record: makeRecord('one', 'Clone one') },
          { key: 'two', record: makeRecord('two', 'Clone two') },
        ]}
        index={0}
        onChange={() => undefined}
      />,
    )

    expect(container!.textContent).toContain('2 constructs selected')
    expect(container!.querySelector('button[aria-label="Previous construct"]')).not.toBeNull()
  })

  it('presents Gibson batch outcomes as assembled and not assembled', () => {
    render(
      <MassRestrictionResultsDialog
        result={{
          action: 'gibson',
          cloned: [{ vectorName: 'Vector', insertName: 'A', productName: 'Vector + A' }],
          notCloned: [{ vectorName: 'Vector', insertName: 'B', reason: 'No overlap' }],
        }}
        onClose={() => undefined}
      />,
    )
    expect(container!.textContent).toContain('Mass Gibson-style assembly results')
    expect(container!.textContent).toContain('Assembled')
    expect(container!.textContent).toContain('Not assembled')
  })

  it('labels AT/GC batch outcomes as cloned and not cloned', () => {
    render(
      <MassRestrictionResultsDialog
        result={{
          action: 'ta-gc',
          cloned: [{ vectorName: 'T vector', insertName: 'Insert A', productName: 'TA A' }],
          notCloned: [{ vectorName: 'T vector', insertName: 'Insert B', reason: 'Blunt ends' }],
        }}
        onClose={() => undefined}
      />,
    )
    expect(container!.textContent).toContain('Mass AT/GC cloning results')
    expect(container!.textContent).toContain('Not cloned')
  })

  it('labels Gateway batch outcomes explicitly', () => {
    render(
      <MassRestrictionResultsDialog
        result={{
          action: 'gateway',
          cloned: [{ vectorName: 'pDONR221', insertName: 'Gene A', productName: 'Entry A' }],
          notCloned: [{ vectorName: 'pDONR221', insertName: 'Gene B', reason: 'Missing attB2' }],
        }}
        onClose={() => undefined}
      />,
    )
    expect(container!.textContent).toContain('Mass Gateway cloning results')
    expect(container!.textContent).toContain('Missing attB2')
  })

  it('allows cloneable library members to be excluded while leaving incompatible members off', () => {
    const onConfirm = vi.fn()
    const choices = [
      {
        key: 'member-one',
        record: makeRecord('one', 'Clone one'),
        librarySource: { key: 'library', name: 'Screen library', memberId: 'one' },
      },
      {
        key: 'member-two',
        record: makeRecord('two', 'Clone two'),
        librarySource: { key: 'library', name: 'Screen library', memberId: 'two' },
      },
    ]
    render(
      <MassRestrictionLibraryMembersDialog
        choices={choices}
        cloneableChoiceKeys={['member-one']}
        excludedChoiceKeys={[]}
        failureReasons={{ 'member-two': 'missing BamHI restriction site' }}
        onCancel={() => undefined}
        onConfirm={onConfirm}
      />,
    )

    const checkboxes = container!.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')
    expect(checkboxes).toHaveLength(2)
    expect(checkboxes[0]!.checked).toBe(true)
    expect(checkboxes[0]!.disabled).toBe(false)
    expect(checkboxes[1]!.checked).toBe(false)
    expect(checkboxes[1]!.disabled).toBe(true)
    expect(container!.textContent).toContain('missing BamHI restriction site')

    act(() => checkboxes[0]!.click())
    act(() => container!.querySelector<HTMLButtonElement>('button.primary')!.click())
    expect(onConfirm).toHaveBeenCalledWith(['member-one'])
  })

  it('lays every vector–insert product out in Vector, Insert, and Product columns', () => {
    const choices = [
      { key: 'a-one', vectorName: 'Vector A', insertName: 'Insert one' },
      { key: 'a-two', vectorName: 'Vector A', insertName: 'Insert two' },
      { key: 'b-one', vectorName: 'Vector B', insertName: 'Insert one' },
      { key: 'b-two', vectorName: 'Vector B', insertName: 'Insert two' },
    ]
    render(
      <MassRestrictionNamesDialog
        choices={choices}
        initialNames={{
          'a-one': 'A one',
          'a-two': 'A two',
          'b-one': 'B one',
          'b-two': 'B two',
        }}
        eligibleChoiceKeys={['a-one', 'a-two', 'b-one']}
        failureReasons={{ 'b-two': 'missing BamHI restriction site' }}
        onCancel={() => undefined}
        onConfirm={() => undefined}
      />,
    )

    expect(
      [...container!.querySelectorAll('thead th')].map((cell) => cell.textContent),
    ).toEqual(['Vector', 'Insert', 'Product'])
    expect(container!.querySelectorAll('tbody tr')).toHaveLength(4)
    expect(container!.querySelectorAll('tbody input')).toHaveLength(3)
    expect(container!.textContent).toContain('Will not be cloned')
    expect(container!.textContent).toContain('missing BamHI restriction site')
  })

  it('uses Construct and Product columns when a batch operation has no inserts', () => {
    render(
      <MassRestrictionNamesDialog
        choices={[
          { key: 'one', vectorName: 'Plasmid one', insertName: '' },
          { key: 'two', vectorName: 'Plasmid two', insertName: '' },
        ]}
        initialNames={{ one: 'Deleted one', two: 'Deleted two' }}
        onCancel={() => undefined}
        onConfirm={() => undefined}
      />,
    )

    expect([...container!.querySelectorAll('thead th')].map((cell) => cell.textContent)).toEqual([
      'Construct',
      'Product',
    ])
    expect(container!.querySelectorAll('tbody tr:first-child td')).toHaveLength(2)
  })

  it('shows cloned and not-cloned constructs in separate result columns', () => {
    render(
      <MassRestrictionResultsDialog
        result={{
          cloned: [{ vectorName: 'Vector A', insertName: 'Insert one', productName: 'Vector-Insert-one' }],
          notCloned: [{ vectorName: 'Vector B', insertName: 'Insert two', reason: 'missing XbaI restriction site' }],
        }}
        onClose={() => undefined}
      />,
    )

    const columns = container!.querySelectorAll('.mass-restriction-results-column')
    expect(columns).toHaveLength(2)
    expect(columns[0]!.textContent).toContain('Insert one')
    expect(columns[0]!.textContent).toContain('Vector-Insert-one')
    expect(columns[1]!.textContent).toContain('Insert two')
    expect(columns[1]!.textContent).toContain('missing XbaI restriction site')
  })

  it('uses operation-specific labels for mass restriction fragment deletion', () => {
    render(
      <MassRestrictionResultsDialog
        result={{
          action: 'delete-fragment',
          cloned: [{ vectorName: 'Vector A', insertName: '', productName: 'Deleted Vector A' }],
          notCloned: [{ vectorName: 'Vector B', insertName: '', reason: 'missing XbaI restriction site' }],
        }}
        onClose={() => undefined}
      />,
    )

    expect(container!.textContent).toContain('Mass restriction fragment deletion results')
    expect(container!.textContent).toContain('Deleted 1')
    expect(container!.textContent).toContain('Not deleted 1')
  })

  it('uses operation-specific labels for mass ligation and PCR', () => {
    const result = {
      cloned: [{ vectorName: 'Template A', insertName: '', productName: 'Product A' }],
      notCloned: [{ vectorName: 'Template B', insertName: '', reason: 'incompatible ends' }],
    }
    render(
      <MassRestrictionResultsDialog
        result={{ ...result, action: 'linear-ligation' }}
        onClose={() => undefined}
      />,
    )
    expect(container!.textContent).toContain('Mass linear ligation results')
    expect(container!.textContent).toContain('Ligated 1')
    expect(container!.textContent).toContain('Not ligated 1')

    act(() =>
      root!.render(
        <MassRestrictionResultsDialog
          result={{ ...result, action: 'pcr' }}
          onClose={() => undefined}
        />,
      ),
    )
    expect(container!.textContent).toContain('Mass PCR results')
    expect(container!.textContent).toContain('Amplified 1')
    expect(container!.textContent).toContain('Not amplified 1')
  })
})

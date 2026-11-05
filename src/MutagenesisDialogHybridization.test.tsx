// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { defaultConstructProperties } from './domain/constructProperties'
import { defaultPrimerHybridizationParams } from './domain/primerHybridization'
import type { CloningWorkspaceRenderArgs } from './cloningWorkspaceTypes'
import type { SequenceRecord } from './domain/types'
import { MutagenesisDialog } from './MutagenesisDialog'

function record(): SequenceRecord {
  return {
    id: 'mut-record', name: 'Mut.dna', description: '', molecule: 'dna', topology: 'linear',
    sequence: 'ACGTACGTACGTACGTACGT', features: [],
    primers: [{ id: 'mut-primer', name: 'Mut primer', sequence: 'ACGTACGTACGTACGTACGT', color: 'primer-color' }],
    operations: [], construct: { ...defaultConstructProperties },
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
  }
}

describe('MutagenesisDialog hybridization setting ownership', () => {
  let host: HTMLDivElement
  let root: ReturnType<typeof createRoot>
  let latestArgs: CloningWorkspaceRenderArgs | undefined

  beforeEach(() => {
    latestArgs = undefined
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
  })

  afterEach(() => {
    act(() => root.unmount())
    host.remove()
  })

  it('follows external changes until the user saves a dialog-local override', () => {
    const currentRecord = record()
    const render = (minMeltingTemperature: number) => root.render(
      <MutagenesisDialog
        currentRecord={currentRecord} currentTabId="tab-1" onCancel={() => undefined} onMutagenize={() => undefined}
        primerHybridization={{ ...defaultPrimerHybridizationParams, minMeltingTemperature }}
        renderWorkspace={(args) => { latestArgs = args; return <div /> }}
      />,
    )

    act(() => render(0))
    expect(latestArgs?.primerHybridization?.minMeltingTemperature).toBe(0)
    act(() => render(15))
    expect(latestArgs?.primerHybridization?.minMeltingTemperature).toBe(15)
    const normalizedExternal = latestArgs?.primerHybridization
    act(() => render(15))
    expect(latestArgs?.primerHybridization).toBe(normalizedExternal)

    act(() => {
      [...host.querySelectorAll('button')].find((button) => button.textContent?.includes('Hybridization Parameters'))?.click()
    })
    const tmInput = host.querySelectorAll<HTMLInputElement>('.hybridization-params-controls input[type="number"]')[1]
    expect(tmInput).toBeTruthy()
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
      setter?.call(tmInput, '25')
      tmInput.dispatchEvent(new Event('input', { bubbles: true }))
      tmInput.dispatchEvent(new Event('change', { bubbles: true }))
      host.querySelector<HTMLButtonElement>('.hybridization-params-dialog button.primary')?.click()
    })
    expect(latestArgs?.primerHybridization?.minMeltingTemperature).toBe(25)

    act(() => render(5))
    expect(latestArgs?.primerHybridization?.minMeltingTemperature).toBe(25)
  })
})

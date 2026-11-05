// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { defaultConstructProperties } from '../../domain/constructProperties'
import { defaultPrimerHybridizationParams } from '../../domain/primerHybridization'
import type { SequenceRecord } from '../../domain/types'
import { PcrRecordWorkspace } from './PcrRecordWorkspace'

function record(): SequenceRecord {
  return {
    id: 'low-tm-pcr-record', name: 'Low Tm PCR.dna', description: '', molecule: 'dna', topology: 'linear',
    sequence: 'ACGTACGA', features: [],
    primers: [{ id: 'low-tm-pcr-primer', name: 'Low Tm primer', sequence: 'ACGTACGA', color: 'primer-color' }],
    operations: [], construct: { ...defaultConstructProperties },
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
  }
}

describe('PcrRecordWorkspace primer hybridization settings', () => {
  let host: HTMLDivElement
  let root: ReturnType<typeof createRoot>

  beforeEach(() => {
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
    })
    Object.defineProperty(globalThis, 'ResizeObserver', {
      configurable: true,
      value: class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    })
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
  })

  afterEach(() => {
    act(() => root.unmount())
    host.remove()
  })

  it('shows a low-Tm primer and updates visibility when retained PCR settings change', () => {
    const sequence = record()
    const render = (minMeltingTemperature: number) => root.render(
      <PcrRecordWorkspace
        record={sequence} selectedRange={null} selectedPrimerIds={[]}
        primerHybridization={{ ...defaultPrimerHybridizationParams, minContinuousMatchLen: 4, minMeltingTemperature }}
      />,
    )

    act(() => render(0))
    const sequenceTab = [...host.querySelectorAll('button')].find((button) => button.textContent?.trim() === 'Sequence')
    expect(sequenceTab).toBeTruthy()
    act(() => sequenceTab?.click())
    expect(host.querySelectorAll('.sequence-primer-frame')).toHaveLength(1)

    act(() => render(40))
    expect(host.querySelectorAll('.sequence-primer-frame')).toHaveLength(0)

    act(() => render(0))
    expect(host.querySelectorAll('.sequence-primer-frame')).toHaveLength(1)
  })
})

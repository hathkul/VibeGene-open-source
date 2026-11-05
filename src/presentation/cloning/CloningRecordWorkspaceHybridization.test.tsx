// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defaultConstructProperties } from '../../domain/constructProperties'
import { defaultPrimerHybridizationParams } from '../../domain/primerHybridization'
import type { SequenceRecord } from '../../domain/types'
import { CloningRecordWorkspace } from './CloningRecordWorkspace'

function record(): SequenceRecord {
  return {
    id: 'low-tm-record', name: 'Low Tm.dna', description: '', molecule: 'dna', topology: 'linear',
    sequence: 'ACGTACGA', features: [],
    primers: [{ id: 'low-tm-primer', name: 'Low Tm primer', sequence: 'ACGTACGA', color: 'primer-color' }],
    operations: [], construct: { ...defaultConstructProperties },
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
  }
}

describe('CloningRecordWorkspace primer hybridization settings', () => {
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

  it('shows a low-Tm primer when popup settings are lowered and responds when retained settings change', () => {
    const sequence = record()
    const onPrimerSelect = vi.fn()
    const render = (minMeltingTemperature: number) => root.render(
      <CloningRecordWorkspace
        record={sequence} selectedRange={null} cutStrandSelection={null} selectedSites={[]}
        allowEnzymeSelect={false} includePrimersTab sequenceOnly disablePrimer3PrimerFrameRefinement
        allowPrimerSelect onPrimerSelect={onPrimerSelect}
        primerHybridization={{ ...defaultPrimerHybridizationParams, minContinuousMatchLen: 4, minMeltingTemperature }}
      />,
    )

    act(() => render(0))
    const frame = host.querySelector<SVGGElement>('.sequence-primer-frame')
    expect(frame).toBeTruthy()
    act(() => frame?.dispatchEvent(new MouseEvent('click', { bubbles: true })))
    expect(onPrimerSelect).toHaveBeenCalledWith('low-tm-primer', false)

    act(() => render(40))
    expect(host.querySelectorAll('.sequence-primer-frame')).toHaveLength(0)

    act(() => render(0))
    expect(host.querySelectorAll('.sequence-primer-frame')).toHaveLength(1)
  })
})

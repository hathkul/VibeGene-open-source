// @vitest-environment jsdom
import { act, useMemo } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { defaultConstructProperties } from '../../domain/constructProperties'
import type { Primer3ThalInput, Primer3ThalResult } from '../../domain/primer3/thalProtocol'
import type { PrimerFrameDisplay } from '../../domain/primerSequenceLayout'
import type { SequenceRecord } from '../../domain/types'
import { mergePrimerFrameDisplayOverrides, usePrimer3PrimerFrameDisplays } from './usePrimer3PrimerFrameDisplays'

const calls: Array<{ input: Primer3ThalInput; signal?: AbortSignal }> = []
const resolvers: Array<{ resolve: (result: Primer3ThalResult) => void; reject: (error: Error) => void }> = []
const runPrimer3Thal = vi.fn((input: Primer3ThalInput, options?: { signal?: AbortSignal }) => {
  calls.push({ input, signal: options?.signal })
  return new Promise<Primer3ThalResult>((resolve, reject) => resolvers.push({ resolve, reject }))
})
vi.mock('../../primer3/thalClient', () => ({ runPrimer3Thal: (...args: Parameters<typeof runPrimer3Thal>) => runPrimer3Thal(...args) }))

let root: ReturnType<typeof createRoot> | null = null
let container: HTMLDivElement | null = null

afterEach(() => {
  if (root) act(() => root!.unmount())
  container?.remove()
  root = null
  container = null
  runPrimer3Thal.mockClear()
  calls.length = 0
  resolvers.length = 0
})

const record: SequenceRecord = {
  id: 'record', name: 'record', description: '', molecule: 'dna', topology: 'linear',
  sequence: 'AACCGGTATTGGCCAT', features: [], primers: [
    { id: 'failed', name: 'failed site', sequence: 'AACCGGTA', color: 'primer-color', bindings: [
      { strand: 'forward', templateStart: 0, templateEnd: 8, components: [{ primerBases: 'AACCGGTA', templateStart: 0, templateEnd: 8 }] },
    ] },
    { id: 'success', name: 'success site', sequence: 'TTGGCCAT', color: 'primer-color-alt', bindings: [
      { strand: 'forward', templateStart: 8, templateEnd: 16, components: [{ primerBases: 'TTGGCCAT', templateStart: 8, templateEnd: 16 }] },
    ] },
  ], operations: [], construct: defaultConstructProperties,
  createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
}

function display(primerId: string, sequence: string, start: number): PrimerFrameDisplay {
  return {
    primerId, name: primerId, sequence, color: 'primer-color', strand: 'forward',
    glyphs: [{ char: sequence[0]!, kind: 'overhang', row: 0.5 }],
    templateSpanStart: start, templateSpanEnd: start + sequence.length,
    selectRange: { start, end: start + sequence.length },
  }
}

function Harness({ record: currentRecord }: { record: SequenceRecord }) {
  const baseDisplays = useMemo(
    () => currentRecord.primers.map((primer, index) => display(primer.id, primer.sequence, index * 8)),
    [currentRecord.primers],
  )
  const displays = usePrimer3PrimerFrameDisplays(currentRecord, baseDisplays, true)
  return <output>{displays.map((item) => `${item.primerId}:${item.glyphs[0]?.kind}`).join('|')}</output>
}

describe('usePrimer3PrimerFrameDisplays', () => {
  it('keeps all fallback frames while overriding only trace-eligible displays', () => {
    const fallbacks = [display('failed', 'AACCGGTA', 0), display('success', 'TTGGCCAT', 8)]
    const eligible = {
      ...fallbacks[1]!,
      glyphs: [{ char: 'T', kind: 'annealed' as const, row: 0, templateIndex: 8 }],
      templateSpanStart: 8,
      templateSpanEnd: 16,
    }
    const merged = mergePrimerFrameDisplayOverrides(fallbacks, [eligible])
    expect(merged).toHaveLength(2)
    expect(merged[0]).toEqual(fallbacks[0])
    expect(merged[1]?.glyphs).toEqual(eligible.glyphs)
  })

  it('keeps fallbacks for failed sites and ignores late results after a site input changes', async () => {
    container = document.createElement('div')
    document.body.append(container)
    root = createRoot(container)
    act(() => root!.render(<Harness record={record} />))
    expect(runPrimer3Thal).toHaveBeenCalledTimes(2)
    expect(container.textContent).toContain('failed:overhang')

    const changedRecord = { ...record, id: 'record-2' }
    act(() => root!.render(<Harness record={changedRecord} />))
    expect(calls[0]?.signal?.aborted).toBe(true)
    expect(runPrimer3Thal).toHaveBeenCalledTimes(4)

    const validResult: Primer3ThalResult = {
      tmC: 22, alignEnd1: 8, alignEnd2: 8,
      structure: "Tm: 22&deg;C\\n5' TTGGCCAT 3'\\n   ||||||||\\n3' AACCGGTA 5'\\n", mode: 'end1',
    }
    await act(async () => {
      resolvers[0]!.resolve(validResult)
      resolvers[1]!.resolve(validResult)
      resolvers[2]!.reject(new Error('one site failed'))
      resolvers[3]!.resolve(validResult)
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(container.textContent).toContain('failed:overhang')
    expect(container.textContent).toContain('success:annealed')
  })

  it('keeps the fallback synthetic layout for ordinary short primers without a saved binding', () => {
    container = document.createElement('div')
    document.body.append(container)
    root = createRoot(container)
    const withoutLayouts = { ...record, primers: record.primers.map((primer) => ({ ...primer, bindings: undefined })) }
    act(() => root!.render(<Harness record={withoutLayouts} />))
    expect(runPrimer3Thal).toHaveBeenCalledTimes(2)
    expect(container.textContent).toContain('failed:overhang')
  })

  it('does not infer a removable tail for a both-long site without a saved layout', () => {
    container = document.createElement('div')
    document.body.append(container)
    root = createRoot(container)
    const longRecord: SequenceRecord = {
      ...record,
      id: 'long-record',
      sequence: 'ACGT'.repeat(30),
      primers: [{ id: 'long', name: 'long', sequence: 'A'.repeat(70), color: 'primer-color', bindings: undefined }],
    }
    act(() => root!.render(<Harness record={longRecord} />))
    expect(runPrimer3Thal).not.toHaveBeenCalled()
  })
})

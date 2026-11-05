// @vitest-environment jsdom

import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Primer3ThalInput, Primer3ThalResult } from '../../domain/primer3/thalProtocol'
import { usePrimer3Thal } from './usePrimer3Thal'

const calls: Array<{ input: Primer3ThalInput; signal?: AbortSignal }> = []
const runPrimer3Thal = vi.fn((input: Primer3ThalInput, options?: { signal?: AbortSignal }) => {
  calls.push({ input, signal: options?.signal })
  return new Promise<Primer3ThalResult>((resolve, reject) => {
    options?.signal?.addEventListener('abort', () => reject(new DOMException('cancelled', 'AbortError')), { once: true })
    ;(runPrimer3Thal as typeof runPrimer3Thal & { resolvers?: Array<(result: Primer3ThalResult) => void> }).resolvers ??= []
    ;(runPrimer3Thal as typeof runPrimer3Thal & { resolvers: Array<(result: Primer3ThalResult) => void> }).resolvers.push(resolve)
  })
})
vi.mock('../../primer3/thalClient', () => ({ runPrimer3Thal: (...args: Parameters<typeof runPrimer3Thal>) => runPrimer3Thal(...args) }))

let root: ReturnType<typeof createRoot> | null = null
let container: HTMLDivElement | null = null

afterEach(() => {
  if (root) act(() => root!.unmount())
  container?.remove()
  root = null
  container = null
  calls.length = 0
  ;(runPrimer3Thal as typeof runPrimer3Thal & { resolvers?: Array<(result: Primer3ThalResult) => void> }).resolvers = []
  vi.unstubAllGlobals()
})

function Harness({ input }: { input: Primer3ThalInput }) {
  const result = usePrimer3Thal(input)
  return <output>{result.status === 'estimated' ? result.result.tmC : result.status}</output>
}

describe('usePrimer3Thal', () => {
  it('aborts stale calculations and ignores stale replies when the primer/site input changes', async () => {
    vi.stubGlobal('Worker', class {})
    container = document.createElement('div')
    document.body.append(container)
    root = createRoot(container)
    const first: Primer3ThalInput = { sequence1: 'ACGT', sequence2: 'ACGT', mode: 'end1' }
    const second: Primer3ThalInput = { sequence1: 'TGCA', sequence2: 'TGCA', mode: 'end1' }

    act(() => root!.render(<Harness input={first} />))
    expect(calls[0]?.input).toEqual(first)

    act(() => root!.render(<Harness input={second} />))
    expect(calls[0]?.signal?.aborted).toBe(true)
    expect(calls[1]?.input).toEqual(second)

    const resolvers = (runPrimer3Thal as typeof runPrimer3Thal & { resolvers: Array<(result: Primer3ThalResult) => void> }).resolvers
    await act(async () => resolvers[0]?.({ tmC: 99, alignEnd1: 4, alignEnd2: 4, structure: 'stale', mode: 'end1' }))
    expect(container.textContent).toBe('loading')

    await act(async () => resolvers[1]?.({ tmC: 61.2, alignEnd1: 4, alignEnd2: 4, structure: 'fresh', mode: 'end1' }))
    expect(container.textContent).toBe('61.2')
  })
})

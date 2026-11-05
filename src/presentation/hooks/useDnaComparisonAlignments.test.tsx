// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { expect, it, vi } from 'vitest'
import type { DnaComparisonStream } from '../../application/ports/workerStreams'
import { DnaComparisonContext } from './workerStreamContexts'
import { useDnaComparisonAlignments } from './useDnaComparisonAlignments'

it('preserves partial results and ignores stale responses after cancellation', async () => {
  const jobs: Array<Parameters<DnaComparisonStream>> = []
  const stops: Array<ReturnType<typeof vi.fn>> = []
  const start: DnaComparisonStream = (...args) => { jobs.push(args); const stop = vi.fn(); stops.push(stop); return stop }
  const persist = vi.fn()
  const sources = [{ id: 'comparison-lifecycle', name: 'sample', sequence: 'ACGTAC', enabled: true }]
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  let state: ReturnType<typeof useDnaComparisonAlignments>
  function Harness({ reference }: { reference: string }) {
    state = useDnaComparisonAlignments(reference, sources, 'linear', [], persist)
    return null
  }
  const render = (reference: string) => root.render(<DnaComparisonContext.Provider value={start}><Harness reference={reference} /></DnaComparisonContext.Provider>)
  await act(async () => render('ACGTAC'))
  await act(async () => jobs[0]![1]({ id: jobs[0]![0].id, stage: 'source', result: { sourceId: sources[0]!.id, alignment: null } }))
  expect(state!.entries[0]!.pending).toBe(false)
  expect(state!.pending).toBe(true)
  expect(persist).toHaveBeenCalledOnce()
  await act(async () => render('TACGTA'))
  expect(stops[0]).toHaveBeenCalled()
  await act(async () => jobs[0]![1]({ id: jobs[0]![0].id, stage: 'complete', elapsedMs: 1 }))
  expect(state!.pending).toBe(true)
  await act(async () => jobs[1]![2](new Error('failed')))
  expect(state!.entries[0]!.error).toBe('failed')
  await act(async () => root.unmount())
  expect(stops[1]).toHaveBeenCalled()
  host.remove()
})

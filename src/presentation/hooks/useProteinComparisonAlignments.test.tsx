// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { expect, it, vi } from 'vitest'
import type { ProteinComparisonStream } from '../../application/ports/workerStreams'
import { ProteinComparisonContext } from './workerStreamContexts'
import { useProteinComparisonAlignments } from './useProteinComparisonAlignments'

it('preserves partial results and ignores stale responses after cancellation', async () => {
  const jobs: Array<Parameters<ProteinComparisonStream>> = []
  const stops: Array<ReturnType<typeof vi.fn>> = []
  const start: ProteinComparisonStream = (...args) => { jobs.push(args); const stop = vi.fn(); stops.push(stop); return stop }
  const persist = vi.fn()
  const sources = [{ id: 'comparison-lifecycle', name: 'sample', kind: 'protein' as const, sequence: 'MKTLL', enabled: true }]
  const regions: [] = []
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  let state: ReturnType<typeof useProteinComparisonAlignments>
  function Harness({ reference }: { reference: string }) {
    state = useProteinComparisonAlignments(reference, sources, regions, 'Standard', [], persist)
    return null
  }
  const render = (reference: string) => root.render(<ProteinComparisonContext.Provider value={start}><Harness reference={reference} /></ProteinComparisonContext.Provider>)
  await act(async () => render('MKTLL'))
  await act(async () => jobs[0]![1]({ id: jobs[0]![0].id, stage: 'source', result: { sourceId: sources[0]!.id, alignment: null } }))
  expect(state!.entries[0]!.pending).toBe(false)
  expect(state!.pending).toBe(true)
  expect(persist).toHaveBeenCalledOnce()
  await act(async () => render('MKALL'))
  expect(stops[0]).toHaveBeenCalled()
  await act(async () => jobs[0]![1]({ id: jobs[0]![0].id, stage: 'complete', elapsedMs: 1 }))
  expect(state!.pending).toBe(true)
  await act(async () => jobs[1]![2](new Error('failed')))
  expect(state!.entries[0]!.error).toBe('failed')
  await act(async () => root.unmount())
  expect(stops[1]).toHaveBeenCalled()
  host.remove()
})

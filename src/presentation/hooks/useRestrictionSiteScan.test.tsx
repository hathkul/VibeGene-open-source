// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { expect, it, vi } from 'vitest'
import { labPlasmid } from '../../domain/fixtures'
import type { RestrictionScanStream } from '../../application/ports/workerStreams'
import { RestrictionScanContext } from './workerStreamContexts'
import { useRestrictionSiteScan } from './useRestrictionSiteScan'

it('ignores stale scan responses, keeps previews, and cancels on replacement and unmount', async () => {
  const jobs: Array<Parameters<RestrictionScanStream>> = []
  const stops: Array<ReturnType<typeof vi.fn>> = []
  const start: RestrictionScanStream = (...args) => { jobs.push(args); const stop = vi.fn(); stops.push(stop); return stop }
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  let state: ReturnType<typeof useRestrictionSiteScan>
  const names = ['EcoRI']
  function Harness({ sequence }: { sequence: string }) {
    state = useRestrictionSiteScan({ enabled: true, sequence, topology: 'linear', construct: labPlasmid.construct, enzymeNames: names })
    return null
  }
  const render = (sequence: string) => root.render(<RestrictionScanContext.Provider value={start}><Harness sequence={sequence} /></RestrictionScanContext.Provider>)
  await act(async () => render('GAATTC'))
  const empty = { enzymeNames: [], enzymeIndexes: new Uint16Array(), starts: new Int32Array(), ends: new Int32Array(), cutTops: new Int32Array(), cutBottoms: new Int32Array(), methylation: new Uint8Array() }
  await act(async () => jobs[0]![1]({ id: jobs[0]![0].id, stage: 'preview', payload: empty, elapsedMs: 1 }))
  expect(state!.stage).toBe('preview')
  await act(async () => render('TGAATTC'))
  expect(stops[0]).toHaveBeenCalledOnce()
  await act(async () => jobs[0]![1]({ id: jobs[0]![0].id, stage: 'complete', payload: empty, elapsedMs: 2 }))
  expect(state!.stage).not.toBe('complete')
  await act(async () => jobs[1]![2](new Error('scan failed')))
  expect(state!.error).toBe('scan failed')
  await act(async () => root.unmount())
  expect(stops[1]).toHaveBeenCalled()
  host.remove()
})

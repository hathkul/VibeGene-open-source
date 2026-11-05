import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  responses: [] as string[],
  requester: vi.fn(),
}))

import { configureNcbiBlastRequester, waitForNcbiBlast } from '../src/domain/ncbiBlast'

const waitingPage = (phase: string) =>
  `QBlastInfoBegin\n\tStatus=WAITING\nQBlastInfoEnd\n<tr class="odd"><td>Status</td><td>${phase}</td></tr>`

describe('waitForNcbiBlast', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(1_000_000)
    mocks.responses = []
    mocks.requester.mockImplementation(async () => mocks.responses.shift() ?? '')
    configureNcbiBlastRequester(mocks.requester)
  })

  afterEach(() => {
    vi.useRealTimers()
    configureNcbiBlastRequester(null)
    mocks.requester.mockReset()
  })

  it('reports the next status check time and NCBI job phase, polling once a minute after the RTOE wait', async () => {
    mocks.responses.push(waitingPage('Queued'), waitingPage('Searching'), 'Status=READY\nThereAreHits=yes')
    const statuses: string[] = []
    const done = waitForNcbiBlast('RID1', 20, (status) => statuses.push(status))

    await vi.advanceTimersByTimeAsync(20_000)
    await vi.advanceTimersByTimeAsync(60_000)
    await vi.advanceTimersByTimeAsync(60_000)

    await expect(done).resolves.toBe(true)
    expect(mocks.requester).toHaveBeenCalledTimes(3)
    expect(statuses).toEqual([
      `WAITING:20:${1_000_000 + 20_000}:0:`,
      `WAITING:20:${1_000_000 + 80_000}:1:Queued`,
      `WAITING:20:${1_000_000 + 140_000}:2:Searching`,
      'READY',
    ])
  })

  it('stops with the caller message once the wait limit passes', async () => {
    mocks.responses.push(...Array.from({ length: 5 }, () => waitingPage('Searching')))
    const done = waitForNcbiBlast('RID1', 30, undefined, undefined, { maxWaitMs: 150_000, timeoutMessage: 'Too slow.' })
    const settled = expect(done).rejects.toThrow('Too slow.')

    await vi.advanceTimersByTimeAsync(150_000)

    await settled
    expect(mocks.requester).toHaveBeenCalledTimes(3)
  })
})

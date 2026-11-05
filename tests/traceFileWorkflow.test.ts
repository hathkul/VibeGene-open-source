import { alignTracesWithWorkers } from '../src/workerAdapters/traceAlignment'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  alignmentViewportTemplateIndex,
  enabledAlignmentCoverageSpans,
  leftmostAlignedTrace,
  realignTraceFileRecords,
  realignTraceFileRecordsAsync,
} from '../src/domain/traceFileWorkflow'
import type { TraceAlignmentWorkerRequest, TraceAlignmentWorkerResponse } from '../src/domain/traceAlignmentWorkerProtocol'
import type { TraceFileRecord, TraceTemplateAlignment } from '../src/domain/traceTypes'

function makeAlignment(overrides: Partial<TraceTemplateAlignment> = {}): TraceTemplateAlignment {
  return {
    templateStart: 100,
    templateEnd: 200,
    traceStart: 0,
    traceEnd: 100,
    mismatchCount: 0,
    gapCount: 0,
    orientation: 'forward',
    alignmentScore: 1,
    columns: [],
    ...overrides,
  }
}

function makeTrace(id: string, alignment: TraceTemplateAlignment | null): TraceFileRecord {
  return {
    id,
    fileName: `${id}.ab1`,
    sequence: 'ATGC',
    chromatogram: { aTrace: [], tTrace: [], gTrace: [], cTrace: [], basePos: [], baseCalls: [] },
    enabled: true,
    expanded: false,
    showAnnotations: false,
    alignment,
  }
}

describe('alignTraceRecord', () => {
  it('marks traces with no alignment match as parse errors', () => {
    const trace = realignTraceFileRecords(
      [
        {
          id: 't1',
          fileName: 'unrelated.seq',
          sequence: 'GGGGGGGGGGGGGGGG',
          chromatogram: { aTrace: [], tTrace: [], gTrace: [], cTrace: [], basePos: [], baseCalls: 'GGGGGGGGGGGGGGGG'.split('') },
          enabled: true,
          expanded: true,
          showAnnotations: false,
          alignment: null,
        },
      ],
      'AAAAAAAAAA',
    )[0]!
    expect(trace.alignment).toBeNull()
    expect(trace.parseError).toBe('No alignment to reference found')
  })
})

describe('batch trace alignment', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('keeps imported alignments and sends only missing members to concurrent workers', async () => {
    const requests: TraceAlignmentWorkerRequest[] = []
    let active = 0
    let peakActive = 0
    let terminated = 0
    class FakeWorker {
      onmessage: ((event: MessageEvent<TraceAlignmentWorkerResponse>) => void) | null = null
      onerror: (() => void) | null = null
      onmessageerror: (() => void) | null = null
      postMessage(request: TraceAlignmentWorkerRequest) {
        requests.push(request)
        active += 1
        peakActive = Math.max(peakActive, active)
        setTimeout(() => {
          active -= 1
          this.onmessage?.({ data: { index: request.index, alignment: makeAlignment() } } as MessageEvent<TraceAlignmentWorkerResponse>)
        }, 5)
      }
      terminate() { terminated += 1 }
    }
    vi.stubGlobal('Worker', FakeWorker)
    vi.stubGlobal('navigator', { hardwareConcurrency: 4 })
    const cached = makeTrace('cached', makeAlignment({ templateStart: 3 }))
    const members = [cached, makeTrace('new-1', null), makeTrace('new-2', null), makeTrace('new-3', null)]
    const updates: Array<[number, number]> = []
    const result = await realignTraceFileRecordsAsync(members, 'ATGC', {
      alignPending: alignTracesWithWorkers,
      onProgress: (completed, total) => updates.push([completed, total]),
    })
    expect(result[0]).toBe(cached)
    expect(requests).toHaveLength(3)
    expect(requests.map((request) => request.traceSequence)).toEqual(['ATGC', 'ATGC', 'ATGC'])
    expect(peakActive).toBeGreaterThan(1)
    expect(terminated).toBe(3)
    expect(result.slice(1).every((trace) => trace.alignment)).toBe(true)
    expect(updates).toEqual([[1, 3], [2, 3], [3, 3]])
  })

  it('terminates a partially constructed pool and falls back to local alignment', async () => {
    let created = 0
    let terminated = 0
    class FailingWorker {
      constructor() {
        created += 1
        if (created === 2) throw new Error('unavailable')
      }
      terminate() { terminated += 1 }
    }
    vi.stubGlobal('Worker', FailingWorker)
    vi.stubGlobal('navigator', { hardwareConcurrency: 4 })
    const updates: number[] = []
    const result = await realignTraceFileRecordsAsync([makeTrace('a', null), makeTrace('b', null)], 'ATGC', {
      alignPending: alignTracesWithWorkers,
      onProgress: (completed) => updates.push(completed),
    })
    expect(terminated).toBe(1)
    expect(result).toHaveLength(2)
    expect(updates).toEqual([1, 2])
  })

  it('terminates in-flight workers when alignment is cancelled', async () => {
    let terminated = 0
    class FakeWorker {
      onmessage = null
      onerror = null
      onmessageerror = null
      postMessage() { /* A busy worker has not answered yet. */ }
      terminate() { terminated += 1 }
    }
    vi.stubGlobal('Worker', FakeWorker)
    vi.stubGlobal('navigator', { hardwareConcurrency: 4 })
    const controller = new AbortController()
    const work = realignTraceFileRecordsAsync([makeTrace('a', null), makeTrace('b', null)], 'ATGC', {
      signal: controller.signal,
      alignPending: alignTracesWithWorkers,
    })
    controller.abort()
    await expect(work).rejects.toMatchObject({ name: 'AbortError' })
    expect(terminated).toBe(2)
  })
})

describe('traceFileWorkflow scroll helpers', () => {
  it('uses template start for forward alignments and end for reverse', () => {
    expect(alignmentViewportTemplateIndex(makeAlignment({ templateStart: 50, templateEnd: 120, orientation: 'forward' }))).toBe(50)
    expect(alignmentViewportTemplateIndex(makeAlignment({ templateStart: 50, templateEnd: 120, orientation: 'reverse' }))).toBe(119)
  })

  it('picks the leftmost aligned trace by template start', () => {
    const traces = [
      makeTrace('late', makeAlignment({ templateStart: 500, templateEnd: 600 })),
      makeTrace('early', makeAlignment({ templateStart: 20, templateEnd: 80, orientation: 'reverse' })),
      makeTrace('middle', makeAlignment({ templateStart: 200, templateEnd: 260 })),
    ]
    expect(leftmostAlignedTrace(traces)?.id).toBe('early')
    expect(alignmentViewportTemplateIndex(leftmostAlignedTrace(traces)!.alignment!)).toBe(79)
  })

  it('merges enabled alignment coverage spans for the minimap strip', () => {
    const traces = [
      makeTrace('a', makeAlignment({ templateStart: 10, templateEnd: 50 })),
      makeTrace('b', makeAlignment({ templateStart: 40, templateEnd: 80 })),
      makeTrace('c', makeAlignment({ templateStart: 200, templateEnd: 240 })),
      { ...makeTrace('disabled', makeAlignment({ templateStart: 0, templateEnd: 10 })), enabled: false },
      { ...makeTrace('unaligned', null), enabled: true },
    ]
    expect(enabledAlignmentCoverageSpans(traces, 1000)).toEqual([
      { start: 10, end: 80 },
      { start: 200, end: 240 },
    ])
  })
})

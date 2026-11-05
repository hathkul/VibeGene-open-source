// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'vitest'
import type { TraceFileRecord } from '../../domain/traceTypes'
import { useTraceInspector } from './useTraceInspector'

function trace(id: string, overrides: Partial<TraceFileRecord> = {}): TraceFileRecord {
  return {
    id,
    fileName: `${id}.ab1`,
    sequence: 'ATGC',
    chromatogram: { aTrace: [], tTrace: [], gTrace: [], cTrace: [], basePos: [], baseCalls: [] },
    enabled: true,
    expanded: false,
    showAnnotations: false,
    alignment: null,
    ...overrides,
  }
}

describe('useTraceInspector', () => {
  let host: HTMLDivElement | undefined
  let root: ReturnType<typeof createRoot> | undefined

  afterEach(() => {
    act(() => root?.unmount())
    host?.remove()
  })

  function renderHarness(input: Parameters<typeof useTraceInspector>[0]) {
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    let api: ReturnType<typeof useTraceInspector> | null = null
    function Harness() {
      api = useTraceInspector(input)
      return null
    }
    act(() => { root!.render(<Harness />) })
    return () => api!
  }

  it('carries the template selection into the opened trace while alignments are shown', () => {
    const getApi = renderHarness({
      traceFiles: [trace('read-a')],
      selectedRange: { start: 4, end: 9 },
      alignmentsVisible: true,
      recordIsDnaLibrary: true,
      focusedTraceId: 'read-a',
    })
    act(() => getApi().openTraceInspector('read-a'))
    const target = getApi().target
    expect(target?.trace.id).toBe('read-a')
    expect(target?.templateRange).toEqual({ start: 4, end: 9 })
  })

  it('passes no span in member-native library browse, where the range is not template coordinates', () => {
    const getApi = renderHarness({
      traceFiles: [trace('read-a')],
      selectedRange: { start: 4, end: 9 },
      alignmentsVisible: false,
      recordIsDnaLibrary: true,
      focusedTraceId: 'read-a',
    })
    act(() => getApi().openTraceInspector('read-a'))
    expect(getApi().target?.templateRange).toBeNull()
  })

  it('ignores unparsed or empty traces and can close the overlay', () => {
    const getApi = renderHarness({
      traceFiles: [trace('broken', { sequence: '', parseError: 'No base calls found' }), trace('read-a')],
      selectedRange: null,
      alignmentsVisible: true,
      recordIsDnaLibrary: false,
      focusedTraceId: null,
    })
    act(() => getApi().openTraceInspector('broken'))
    expect(getApi().target).toBeNull()
    act(() => getApi().openTraceInspector('read-a'))
    expect(getApi().target?.trace.id).toBe('read-a')
    act(() => getApi().closeTraceInspector())
    expect(getApi().target).toBeNull()
  })
})

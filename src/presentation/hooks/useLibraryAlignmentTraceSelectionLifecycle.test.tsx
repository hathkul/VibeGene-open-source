// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cloneFixture } from '../../domain/fixtures'
import type { TraceFileRecord } from '../../domain/traceTypes'
import type { SequenceRecord } from '../../domain/types'
import { useLibraryAlignmentTraceSelectionLifecycle } from './useLibraryAlignmentTraceSelectionLifecycle'

function trace(id: string, overrides: Partial<TraceFileRecord> = {}): TraceFileRecord {
  return {
    id,
    fileName: `${id}.ab1`,
    sequence: 'AT',
    chromatogram: { aTrace: [], tTrace: [], gTrace: [], cTrace: [], basePos: [], baseCalls: [] },
    enabled: true,
    expanded: false,
    showAnnotations: false,
    alignment: null,
    ...overrides,
  }
}

describe('useLibraryAlignmentTraceSelectionLifecycle', () => {
  let host: HTMLDivElement | undefined
  let root: ReturnType<typeof createRoot> | undefined

  afterEach(() => {
    act(() => root?.unmount())
    host?.remove()
  })

  function renderHarness(input: {
    record: SequenceRecord
    traceFiles: TraceFileRecord[]
    selectedAlignmentTraceId: string | null
    setSelectedAlignmentTraceId: (value: string | null) => void
  }) {
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    function Harness() {
      useLibraryAlignmentTraceSelectionLifecycle(input)
      return null
    }
    act(() => { root!.render(<Harness />) })
  }

  it('clears a selected trace id that is no longer present', () => {
    const setSelectedAlignmentTraceId = vi.fn()
    renderHarness({
      record: cloneFixture(),
      traceFiles: [trace('a')],
      selectedAlignmentTraceId: 'missing',
      setSelectedAlignmentTraceId,
    })
    expect(setSelectedAlignmentTraceId).toHaveBeenCalledWith(null)
  })

  it('defaults to the first eligible library member when none is selected', () => {
    const setSelectedAlignmentTraceId = vi.fn()
    const library = {
      ...cloneFixture(),
      dna: { ...cloneFixture().dna!, documentRole: 'library' as const, libraryConsensusEnabled: false },
    }
    renderHarness({
      record: library,
      traceFiles: [trace('member-a'), trace('member-b')],
      selectedAlignmentTraceId: null,
      setSelectedAlignmentTraceId,
    })
    expect(setSelectedAlignmentTraceId).toHaveBeenCalledWith('member-a')
  })

  it('does not override an existing valid selection when traceFiles updates', () => {
    const setSelectedAlignmentTraceId = vi.fn()
    const library = {
      ...cloneFixture(),
      dna: { ...cloneFixture().dna!, documentRole: 'library' as const, libraryConsensusEnabled: false },
    }
    const traceFiles = [trace('member-a'), trace('member-b')]
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    let files = traceFiles
    function Harness() {
      useLibraryAlignmentTraceSelectionLifecycle({
        record: library,
        traceFiles: files,
        selectedAlignmentTraceId: 'member-b',
        setSelectedAlignmentTraceId,
      })
      return null
    }
    act(() => { root!.render(<Harness />) })
    setSelectedAlignmentTraceId.mockClear()
    files = [...traceFiles, trace('member-c')]
    act(() => { root!.render(<Harness />) })
    expect(setSelectedAlignmentTraceId).not.toHaveBeenCalled()
  })
})

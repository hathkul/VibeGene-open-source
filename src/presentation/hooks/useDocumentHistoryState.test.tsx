// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cloneFixture } from '../../domain/fixtures'
import { serializeProjectSnapshot } from '../../domain/projectSnapshot'
import type { TraceFileRecord } from '../../domain/traceTypes'
import { useDocumentHistoryState, type DocumentHistoryStatePorts } from './useDocumentHistoryState'
import type { DocumentHistorySnapshot } from './useSelectionEditingController'

function traceStub(id: string): TraceFileRecord {
  return {
    id,
    fileName: `${id}.ab1`,
    enabled: true,
    expanded: false,
    showAnnotations: false,
    sequence: 'ATGC',
    chromatogram: { aTrace: [], tTrace: [], gTrace: [], cTrace: [], basePos: [], baseCalls: ['A', 'T', 'G', 'C'] },
    alignment: null,
  }
}

function historyPorts(overrides: Partial<DocumentHistoryStatePorts> = {}): DocumentHistoryStatePorts {
  return {
    maxHistoryEntries: 100,
    setUndoStack: vi.fn(),
    setRedoStack: vi.fn(),
    actionProfileSync: (_name, _category, run) => run(),
    onHistorySnapshotRestored: vi.fn(),
    clearSessionDraftForRecord: async () => {},
    refreshSessionDraftsRef: { current: async () => {} },
    ...overrides,
  }
}

function trackingHistoryStacks() {
  const undoStack: DocumentHistorySnapshot[] = []
  const redoStack: DocumentHistorySnapshot[] = []
  const setUndoStack = vi.fn((
    value: DocumentHistorySnapshot[] | ((stack: DocumentHistorySnapshot[]) => DocumentHistorySnapshot[]),
  ) => {
    undoStack.splice(0, undoStack.length, ...(typeof value === 'function' ? value(undoStack) : value))
  })
  const setRedoStack = vi.fn((
    value: DocumentHistorySnapshot[] | ((stack: DocumentHistorySnapshot[]) => DocumentHistorySnapshot[]),
  ) => {
    redoStack.splice(0, redoStack.length, ...(typeof value === 'function' ? value(redoStack) : value))
  })
  return { undoStack, redoStack, setUndoStack, setRedoStack }
}

describe('useDocumentHistoryState', () => {
  let host: HTMLDivElement | undefined
  let root: ReturnType<typeof createRoot> | undefined

  afterEach(() => {
    act(() => root?.unmount())
    host?.remove()
  })

  it('pushes undo snapshots, restores trace clones, and clears redo on mutation', () => {
    const initial = cloneFixture()
    const traces = [traceStub('trace-1')]
    const undoStack: DocumentHistorySnapshot[] = []
    const redoStack: DocumentHistorySnapshot[] = []
    const setUndoStack = vi.fn((value: DocumentHistorySnapshot[] | ((stack: DocumentHistorySnapshot[]) => DocumentHistorySnapshot[])) => {
      undoStack.splice(0, undoStack.length, ...(typeof value === 'function' ? value(undoStack) : value))
    })
    const setRedoStack = vi.fn((value: DocumentHistorySnapshot[] | ((stack: DocumentHistorySnapshot[]) => DocumentHistorySnapshot[])) => {
      redoStack.splice(0, redoStack.length, ...(typeof value === 'function' ? value(redoStack) : value))
    })
    const onHistorySnapshotRestored = vi.fn()
    let history: ReturnType<typeof useDocumentHistoryState> | undefined
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)

    function Harness() {
      history = useDocumentHistoryState(
        { initialRecord: initial, initialTraceFiles: traces, initiallyUnsaved: false },
        null,
        historyPorts({ setUndoStack, setRedoStack, onHistorySnapshotRestored }),
      )
      return null
    }

    act(() => root!.render(<Harness />))
    expect(history!.isDirty).toBe(false)

    act(() => {
      history!.updateRecord((current) => ({ ...current, name: `${current.name}-edited` }))
    })
    expect(undoStack).toHaveLength(1)
    expect(undoStack[0]?.record.name).toBe(initial.name)
    expect(undoStack[0]?.traceFiles[0]?.chromatogram.baseCalls).toEqual(['A', 'T', 'G', 'C'])
    expect(redoStack).toHaveLength(0)
    expect(history!.record.name).toBe(`${initial.name}-edited`)
    expect(history!.isDirty).toBe(true)

    const captured = history!.captureDocumentHistorySnapshot()
    captured.traceFiles[0]!.chromatogram.baseCalls = [...captured.traceFiles[0]!.chromatogram.baseCalls, 'X']
    expect(history!.traceFiles[0]!.chromatogram.baseCalls).toEqual(['A', 'T', 'G', 'C'])

    act(() => {
      history!.restoreDocumentHistorySnapshot({
        record: { ...initial, name: 'restored' },
        traceFiles: [traceStub('trace-2')],
      })
    })
    expect(onHistorySnapshotRestored).toHaveBeenCalledOnce()
    expect(history!.record.name).toBe('restored')
    expect(history!.traceFiles[0]?.id).toBe('trace-2')
  })

  it('marks clean after save and never-saved baselines', async () => {
    const first = cloneFixture()
    const clearSessionDraftForRecord = vi.fn().mockResolvedValue(undefined)
    const refreshSessionDrafts = vi.fn()
    let history: ReturnType<typeof useDocumentHistoryState> | undefined
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)

    function Harness() {
      history = useDocumentHistoryState(
        { initialRecord: first, initialTraceFiles: [], initiallyUnsaved: true },
        null,
        historyPorts({
          clearSessionDraftForRecord,
          refreshSessionDraftsRef: { current: refreshSessionDrafts },
        }),
      )
      return null
    }

    act(() => root!.render(<Harness />))
    expect(history!.isDirty).toBe(true)

    act(() => history!.markNeverSaved())
    expect(history!.isDirty).toBe(true)

    act(() => history!.markClean(first, []))
    await act(async () => { await Promise.resolve() })
    expect(clearSessionDraftForRecord).toHaveBeenCalledWith(first.id)
    expect(refreshSessionDrafts).toHaveBeenCalled()
    expect(history!.isDirty).toBe(false)
  })

  it('clears undo and redo stacks when record id changes through the hook', () => {
    const initial = cloneFixture()
    const { undoStack, redoStack, setUndoStack, setRedoStack } = trackingHistoryStacks()
    let history: ReturnType<typeof useDocumentHistoryState> | undefined
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)

    function Harness() {
      history = useDocumentHistoryState(
        { initialRecord: initial, initialTraceFiles: [], initiallyUnsaved: false },
        null,
        historyPorts({ setUndoStack, setRedoStack }),
      )
      return null
    }

    act(() => root!.render(<Harness />))
    act(() => {
      history!.updateRecord((record) => ({ ...record, description: 'edited' }))
    })
    expect(undoStack).toHaveLength(1)

    act(() => {
      setRedoStack([{ record: initial, traceFiles: [] }])
    })
    expect(redoStack).toHaveLength(1)

    setUndoStack.mockClear()
    setRedoStack.mockClear()
    act(() => {
      history!.setRecord({ ...initial, id: `${initial.id}-switched`, description: 'new document' })
    })

    expect(setUndoStack).toHaveBeenCalledWith([])
    expect(setRedoStack).toHaveBeenCalledWith([])
    expect(undoStack).toEqual([])
    expect(redoStack).toEqual([])
    expect(history!.record.id).toBe(`${initial.id}-switched`)
  })

  it('clears undo and redo stacks when updateRecord changes record id', () => {
    const initial = cloneFixture()
    const { undoStack, redoStack, setUndoStack, setRedoStack } = trackingHistoryStacks()
    let history: ReturnType<typeof useDocumentHistoryState> | undefined
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)

    function Harness() {
      history = useDocumentHistoryState(
        { initialRecord: initial, initialTraceFiles: [], initiallyUnsaved: false },
        null,
        historyPorts({ setUndoStack, setRedoStack }),
      )
      return null
    }

    act(() => root!.render(<Harness />))
    act(() => {
      history!.updateRecord((record) => ({ ...record, description: 'before switch' }))
    })
    act(() => {
      setRedoStack([{ record: initial, traceFiles: [] }])
    })
    expect(undoStack.length).toBeGreaterThan(0)
    expect(redoStack).toHaveLength(1)

    setUndoStack.mockClear()
    setRedoStack.mockClear()
    act(() => {
      history!.updateRecord((record) => ({ ...record, id: `${record.id}-via-update` }))
    })

    expect(setUndoStack).toHaveBeenCalledWith([])
    expect(setRedoStack).toHaveBeenCalledWith([])
    expect(undoStack).toEqual([])
    expect(redoStack).toEqual([])
    expect(history!.record.id).toBe(`${initial.id}-via-update`)
  })

  it('caps pushed undo snapshots at maxHistoryEntries', () => {
    const initial = cloneFixture()
    const { undoStack, setUndoStack, setRedoStack } = trackingHistoryStacks()
    let history: ReturnType<typeof useDocumentHistoryState> | undefined
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)

    function Harness() {
      history = useDocumentHistoryState(
        { initialRecord: initial, initialTraceFiles: [], initiallyUnsaved: false },
        null,
        historyPorts({ maxHistoryEntries: 2, setUndoStack, setRedoStack }),
      )
      return null
    }

    act(() => root!.render(<Harness />))
    for (let step = 0; step < 5; step += 1) {
      act(() => {
        history!.updateRecord((record) => ({ ...record, description: `step-${step}` }))
      })
    }

    expect(undoStack).toHaveLength(2)
    expect(undoStack[0]?.record.description).toBe('step-2')
    expect(undoStack[1]?.record.description).toBe('step-3')
  })

  it('skips history push and redo clear when updateRecord opts out of history', () => {
    const initial = cloneFixture()
    const { undoStack, redoStack, setUndoStack, setRedoStack } = trackingHistoryStacks()
    let history: ReturnType<typeof useDocumentHistoryState> | undefined
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)

    function Harness() {
      history = useDocumentHistoryState(
        { initialRecord: initial, initialTraceFiles: [], initiallyUnsaved: false },
        null,
        historyPorts({ setUndoStack, setRedoStack }),
      )
      return null
    }

    act(() => root!.render(<Harness />))
    act(() => {
      history!.updateRecord((record) => ({ ...record, description: 'tracked' }))
    })
    act(() => {
      setRedoStack([{ record: { ...initial, description: 'redo-target' }, traceFiles: [] }])
    })
    expect(undoStack).toHaveLength(1)
    expect(redoStack).toHaveLength(1)

    setUndoStack.mockClear()
    setRedoStack.mockClear()
    act(() => {
      history!.updateRecord(
        (record) => ({ ...record, description: 'silent edit' }),
        { recordHistory: false },
      )
    })

    expect(setUndoStack).not.toHaveBeenCalled()
    expect(setRedoStack).not.toHaveBeenCalled()
    expect(undoStack).toHaveLength(1)
    expect(redoStack).toHaveLength(1)
    expect(history!.record.description).toBe('silent edit')
  })

  it('updates saved baseline without clearing session drafts', () => {
    const initial = cloneFixture()
    const clearSessionDraftForRecord = vi.fn()
    let history: ReturnType<typeof useDocumentHistoryState> | undefined
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)

    function Harness() {
      history = useDocumentHistoryState(
        { initialRecord: initial, initialTraceFiles: [], initiallyUnsaved: true },
        null,
        historyPorts({ clearSessionDraftForRecord }),
      )
      return null
    }

    act(() => root!.render(<Harness />))
    act(() => history!.applySavedBaseline(initial, []))
    expect(clearSessionDraftForRecord).not.toHaveBeenCalled()
    expect(history!.isDirty).toBe(false)
  })

  it('treats trace-only documents as clean regardless of record edits', () => {
    const initial = cloneFixture()
    let history: ReturnType<typeof useDocumentHistoryState> | undefined
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)

    function Harness({ traceDocument }: { traceDocument: boolean }) {
      history = useDocumentHistoryState(
        { initialRecord: initial, initialTraceFiles: [], initiallyUnsaved: false },
        traceDocument ? { trace: traceStub('trace-doc'), fileName: 'trace.ab1', path: null } : null,
        historyPorts(),
      )
      return null
    }

    act(() => root!.render(<Harness traceDocument={false} />))
    act(() => {
      history!.updateRecord((record) => ({ ...record, description: 'dirty-me' }))
    })
    expect(history!.isDirty).toBe(true)

    act(() => root!.render(<Harness traceDocument={true} />))
    expect(history!.isDirty).toBe(false)
    expect(serializeProjectSnapshot(history!.record, history!.traceFiles)).not.toBe('__vibegene:never-saved__')
  })

  it('routes snapshot restore side effects through injected ports', () => {
    const initial = cloneFixture()
    const onHistorySnapshotRestored = vi.fn()
    let history: ReturnType<typeof useDocumentHistoryState> | undefined
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)

    function Harness() {
      history = useDocumentHistoryState(
        { initialRecord: initial, initialTraceFiles: [], initiallyUnsaved: false },
        null,
        historyPorts({ onHistorySnapshotRestored }),
      )
      return null
    }

    act(() => root!.render(<Harness />))
    const snapshot = { record: { ...initial, name: 'from-history' }, traceFiles: [traceStub('member')] }
    act(() => history!.restoreDocumentHistorySnapshot(snapshot))
    expect(onHistorySnapshotRestored).toHaveBeenCalledWith(snapshot)
  })
})

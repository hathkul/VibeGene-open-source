// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createDnaLibraryFromMembers } from '../../domain/dnaLibrary'
import { labPlasmid } from '../../domain/fixtures'
import { alignTraceToTemplate } from '../../domain/traceAlignment'
import { traceRecordFromSequence } from '../../domain/sequenceTraceFactory'
import type { DnaSequenceEditPorts } from '../../application/ports/sequenceEditPorts'
import type { SequenceRecord } from '../../domain/types'
import type { TraceFileRecord } from '../../domain/traceTypes'
import { useDnaSequenceEditController } from './useDnaSequenceEditController'

function mountController(input: {
  record: SequenceRecord
  traceFiles: TraceFileRecord[]
  selectedAlignmentTraceId?: string | null
  alignmentsVisible?: boolean
  ports?: Partial<DnaSequenceEditPorts>
}) {
  let controller!: ReturnType<typeof useDnaSequenceEditController>
  const callOrder: string[] = []
  let record = input.record
  const updateRecord = vi.fn((updater: (current: SequenceRecord) => SequenceRecord, options?: { recordHistory?: boolean }) => {
    if (options?.recordHistory !== false) callOrder.push('history:push-via-update')
    callOrder.push('updateRecord')
    record = updater(record)
  })
  const pushDocumentHistorySnapshot = vi.fn(() => callOrder.push('history:push-direct'))
  const setSequenceRange = vi.fn(() => callOrder.push('selection'))
  const markSequenceEditStart = vi.fn(() => callOrder.push('profiler:start'))
  const actionProfileSync = vi.fn((_label, _category, run: () => void) => {
    callOrder.push('profiler:sync-before')
    run()
    callOrder.push('profiler:sync-after')
  })
  const onTraceFilesChange = vi.fn(() => callOrder.push('traces'))
  const setStatus = vi.fn(() => callOrder.push('status'))

  const ports: DnaSequenceEditPorts = {
    history: { updateRecord, pushDocumentHistorySnapshot, ...input.ports?.history },
    selection: { setSequenceRange, ...input.ports?.selection },
    profiler: { markSequenceEditStart, actionProfileSync, ...input.ports?.profiler },
    traces: { onTraceFilesChange, ...input.ports?.traces },
    status: { setStatus, ...input.ports?.status },
  }

  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)

  function Harness() {
    controller = useDnaSequenceEditController({
      record: input.record,
      traceFiles: input.traceFiles,
      selectedAlignmentTraceId: input.selectedAlignmentTraceId ?? null,
      alignmentsVisible: input.alignmentsVisible ?? false,
      ports,
    })
    return null
  }

  return {
    render: async () => act(async () => root.render(<Harness />)),
    unmount: () => {
      act(() => root.unmount())
      host.remove()
    },
    controller: () => controller,
    record: () => record,
    callOrder,
    updateRecord,
    pushDocumentHistorySnapshot,
    setSequenceRange,
    markSequenceEditStart,
    actionProfileSync,
    onTraceFilesChange,
    setStatus,
  }
}

describe('useDnaSequenceEditController', () => {
  afterEach(() => {
    document.body.replaceChildren()
  })

  it('commits main-record edits through profiler, history update, and collapsed selection', async () => {
    const harness = mountController({ record: labPlasmid, traceFiles: [] })
    await harness.render()
    act(() => {
      harness.controller().applySequenceEdit(
        'A' + labPlasmid.sequence.slice(1),
        { start: 1, end: 1 },
        { start: 0, end: 0, insertedLength: 1 },
      )
    })
    expect(harness.markSequenceEditStart).toHaveBeenCalledWith(
      'A' + labPlasmid.sequence.slice(1),
      '+1 bp @ 0',
    )
    expect(harness.actionProfileSync).toHaveBeenCalledOnce()
    expect(harness.updateRecord).toHaveBeenCalledOnce()
    expect(harness.pushDocumentHistorySnapshot).not.toHaveBeenCalled()
    expect(harness.setSequenceRange).toHaveBeenCalledWith({ start: 1, end: 1 }, { collapsed: true })
    expect(harness.callOrder).toEqual([
      'profiler:start',
      'profiler:sync-before',
      'history:push-via-update',
      'updateRecord',
      'profiler:sync-after',
      'selection',
    ])
    harness.unmount()
  })

  it('skips undo snapshot push when recordHistory is false', async () => {
    const harness = mountController({ record: labPlasmid, traceFiles: [] })
    await harness.render()
    act(() => {
      harness.controller().applySequenceEdit(
        'GGGG',
        { start: 0, end: 0 },
        { start: 0, end: labPlasmid.sequence.length, insertedLength: 4 },
        null,
        { recordHistory: false },
      )
    })
    expect(harness.callOrder.filter((entry) => entry.startsWith('history'))).toEqual([])
    harness.unmount()
  })

  it('pushes history before trace update and passes member sequence length to selection port', async () => {
    const consensus = 'ATGCATGC'
    const member = {
      ...traceRecordFromSequence(consensus, 'read.ab1'),
      alignment: alignTraceToTemplate(consensus, consensus),
    }
    const { record: library } = createDnaLibraryFromMembers([member], { name: 'Library' })
    const harness = mountController({
      record: library,
      traceFiles: [member],
      selectedAlignmentTraceId: member.id,
      alignmentsVisible: true,
    })
    await harness.render()
    act(() => {
      const applied = harness.controller().applyMemberSequenceEdit(
        { start: 4, end: 4 },
        { start: 2, end: 4, insertedLength: 2 },
        'AA',
      )
      expect(applied).toBe(true)
    })
    expect(harness.callOrder.slice(0, 3)).toEqual(['history:push-direct', 'traces', 'selection'])
    expect(harness.setSequenceRange).toHaveBeenCalledWith(
      { start: 4, end: 4 },
      { collapsed: true, sequenceLength: 'ATAAATGC'.length },
    )
    expect(harness.setStatus).toHaveBeenCalledWith('Edited read.ab1 (+2 bp).')
    harness.unmount()
  })

  it('applies trace reference replacement through main-record edit and status echo', async () => {
    const harness = mountController({ record: labPlasmid, traceFiles: [] })
    await harness.render()
    act(() => {
      harness.controller().applyReferenceReplacementFromTrace(1, 3, 'CC')
    })
    expect(harness.updateRecord).toHaveBeenCalledOnce()
    expect(harness.setStatus).toHaveBeenCalledWith('Replaced 2 bp with trace sequence (2 bp).')
    harness.unmount()
  })
})

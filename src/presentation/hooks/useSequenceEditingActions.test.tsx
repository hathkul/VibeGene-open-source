// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { labPlasmid } from '../../domain/fixtures'
import type { RichClipboardFragment } from '../../domain/richClipboard'
import { traceRecordFromSequence } from '../../domain/sequenceTraceFactory'
import { useSequenceEditingActions } from './useSequenceEditingActions'

const richFragment: RichClipboardFragment = {
  id: 'clip-1',
  fromTabId: 'tab-1',
  fromRecordId: 'record-1',
  fromRecordName: 'Source',
  sequence: 'T',
  rangeStart: 0,
  rangeEnd: 1,
  features: [],
  primers: [],
  copiedAt: '2026-01-01T00:00:00.000Z',
}

describe('useSequenceEditingActions', () => {
  let host: HTMLDivElement
  let root: ReturnType<typeof createRoot>

  afterEach(() => {
    act(() => root?.unmount())
    host?.remove()
  })

  it('edits the record and retains rich annotations outside library-member routes', () => {
    const applySequenceEdit = vi.fn()
    const applyMemberSequenceEdit = vi.fn()
    let insert: ReturnType<typeof useSequenceEditingActions>['insertSequenceBases']
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)

    function Harness() {
      ({ insertSequenceBases: insert } = useSequenceEditingActions({
        record: { ...labPlasmid, sequence: 'ACGT' },
        traceFiles: [],
        selectedRange: { start: 1, end: 3 },
        selectionFocus: 'dna',
        cutStrandSelection: null,
        selectedAlignmentTraceId: null,
        alignmentsVisible: false,
        applyMemberSequenceEdit,
        applySequenceEdit,
        setStatus: vi.fn(),
      }))
      return null
    }

    act(() => root.render(<Harness />))
    act(() => expect(insert!('T', richFragment)).toBe(true))
    expect(applyMemberSequenceEdit).not.toHaveBeenCalled()
    expect(applySequenceEdit).toHaveBeenCalledWith(
      'ATT',
      { start: 2, end: 2 },
      { start: 1, end: 3, insertedLength: 1 },
      richFragment,
    )
  })

  it('uses the focused library member native length and sequence-only edit port', () => {
    const applySequenceEdit = vi.fn()
    const applyMemberSequenceEdit = vi.fn().mockReturnValue(true)
    const member = traceRecordFromSequence('ACGT', 'member', { id: 'member-1' })
    let insert: ReturnType<typeof useSequenceEditingActions>['insertSequenceBases']
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)

    function Harness() {
      ({ insertSequenceBases: insert } = useSequenceEditingActions({
        record: { ...labPlasmid, sequence: 'ACGTAC', dna: { ...labPlasmid.dna, documentRole: 'library' } },
        traceFiles: [member],
        selectedRange: null,
        selectionFocus: 'dna',
        cutStrandSelection: null,
        selectedAlignmentTraceId: member.id,
        alignmentsVisible: false,
        applyMemberSequenceEdit,
        applySequenceEdit,
        setStatus: vi.fn(),
      }))
      return null
    }

    act(() => root.render(<Harness />))
    act(() => expect(insert!('T', richFragment)).toBe(true))
    expect(applySequenceEdit).not.toHaveBeenCalled()
    expect(applyMemberSequenceEdit).toHaveBeenCalledWith(
      { start: 5, end: 5 },
      { start: 4, end: 4, insertedLength: 1 },
      'T',
    )
  })
})

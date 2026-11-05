import { useCallback, useMemo } from 'react'
import type { ToolsMwSelection } from '../../ToolsDialogs'
import { isDnaLibraryRecord } from '../../domain/dnaLibrary'
import { sequenceRecordFromLibraryMember } from '../../domain/libraryMemberRecord'
import { formatSequenceLength } from '../../domain/moleculeCapabilities'
import { buildRichClipboardFragment, type RichClipboardFragment } from '../../domain/richClipboard'
import { extractRangePreserveCase, formatRange } from '../../domain/sequence'
import type { TraceFileRecord } from '../../domain/traceTypes'
import type { PrimerHybridizationParams } from '../../domain/primerHybridization'
import type { RestrictionSite, SequenceRecord } from '../../domain/types'
import { selectionLength, type SelectionRange, type StrandPairSelection } from '../sequence'

function directionalSpan(range: SelectionRange, sequenceLength: number) {
  return range.end >= range.start ? range.end - range.start : sequenceLength - range.start + range.end
}

function hasStickyFragmentSelection(
  cutStrandSelection: StrandPairSelection | null,
  sequenceLength: number,
): boolean {
  if (!cutStrandSelection) return false
  return directionalSpan(cutStrandSelection.forward, sequenceLength) > 1
    || directionalSpan(cutStrandSelection.reverse, sequenceLength) > 1
}

export type SequenceClipboardControllerOptions = {
  record: SequenceRecord
  selectedRange: SelectionRange | null
  cutStrandSelection: StrandPairSelection | null
  cutSelectionEnzymes: { upstream: RestrictionSite; downstream: RestrictionSite } | null
  alignmentsVisible: boolean
  selectedAlignmentTraceId: string | null
  traceFiles: TraceFileRecord[]
  primerHybridization: PrimerHybridizationParams
  tabId: string
  getRichClipboardForPaste: () => Promise<RichClipboardFragment | null>
  readClipboardText: () => Promise<string>
  richClipboardMatchesPasteText: (rich: RichClipboardFragment, text: string) => boolean
  insertSequenceBases: (sequence: string, richFragment?: RichClipboardFragment | null) => boolean
  writeClipboardText: (text: string) => Promise<void>
  setCopyEventText: (event: ClipboardEvent, text: string) => void
  storeRichClipboard: (
    input: Omit<RichClipboardFragment, 'id' | 'copiedAt'>,
  ) => Promise<RichClipboardFragment>
  setStatus: (message: string) => void
}

/** Coordinates sequence copy/paste while clipboard and rich-fragment I/O stay at the composition boundary. */
export function useSequenceClipboardController({
  record,
  selectedRange,
  cutStrandSelection,
  cutSelectionEnzymes,
  alignmentsVisible,
  selectedAlignmentTraceId,
  traceFiles,
  primerHybridization,
  tabId,
  getRichClipboardForPaste,
  readClipboardText,
  richClipboardMatchesPasteText,
  insertSequenceBases,
  writeClipboardText,
  setCopyEventText,
  storeRichClipboard,
  setStatus,
}: SequenceClipboardControllerOptions) {
  const sequenceLength = record.sequence.length

  const hasSequenceSelection = Boolean(
    selectedRange && !cutStrandSelection && selectedRange.start !== selectedRange.end,
  )

  const stickyFragmentSelected = useMemo(
    () => hasStickyFragmentSelection(cutStrandSelection, sequenceLength),
    [cutStrandSelection, sequenceLength],
  )

  const canCopySelection = hasSequenceSelection || stickyFragmentSelected

  const toolsMwSelection = useMemo((): ToolsMwSelection | null => {
    if (cutStrandSelection && stickyFragmentSelected) {
      const lengthBp = Math.max(
        directionalSpan(cutStrandSelection.forward, sequenceLength),
        directionalSpan(cutStrandSelection.reverse, sequenceLength),
      )
      if (cutSelectionEnzymes) {
        const up = cutSelectionEnzymes.upstream
        const down = cutSelectionEnzymes.downstream
        const upPos = Math.min(up.cutTop, up.cutBottom) + 1
        const downPos = Math.min(down.cutTop, down.cutBottom) + 1
        return {
          kind: 'sticky',
          forward: cutStrandSelection.forward,
          reverse: cutStrandSelection.reverse,
          lengthBp,
          label: `${up.enzyme.name} (${upPos}) .. ${down.enzyme.name} (${downPos}) = ${lengthBp.toLocaleString()} bp`,
        }
      }
      return {
        kind: 'sticky',
        forward: cutStrandSelection.forward,
        reverse: cutStrandSelection.reverse,
        lengthBp,
        label: `${formatRange(cutStrandSelection.forward.start, cutStrandSelection.forward.end)} = ${lengthBp.toLocaleString()} bp`,
      }
    }
    if (hasSequenceSelection && selectedRange) {
      const lengthBp = selectionLength(selectedRange, sequenceLength)
      return {
        kind: 'range',
        start: selectedRange.start,
        end: selectedRange.end,
        label: `${formatRange(selectedRange.start, selectedRange.end)} = ${lengthBp.toLocaleString()} bp`,
      }
    }
    return null
  }, [
    cutSelectionEnzymes,
    cutStrandSelection,
    hasSequenceSelection,
    selectedRange,
    sequenceLength,
    stickyFragmentSelected,
  ])

  const copySequenceSelection = useCallback(async (syncCopyEvent?: globalThis.ClipboardEvent) => {
    if (!selectedRange || cutStrandSelection || selectedRange.start === selectedRange.end) return false
    const browseMember =
      !alignmentsVisible && selectedAlignmentTraceId && isDnaLibraryRecord(record)
        ? traceFiles.find((trace) => trace.id === selectedAlignmentTraceId)
        : null
    const sourceRecord = browseMember
      ? sequenceRecordFromLibraryMember(browseMember)
      : record
    const text = sourceRecord.molecule === 'protein'
      ? (
          selectedRange.start <= selectedRange.end
            ? sourceRecord.sequence.slice(selectedRange.start, selectedRange.end)
            : sourceRecord.sequence.slice(selectedRange.start) + sourceRecord.sequence.slice(0, selectedRange.end)
        )
      : extractRangePreserveCase(sourceRecord.sequence, selectedRange.start, selectedRange.end)
    if (syncCopyEvent) setCopyEventText(syncCopyEvent, text)
    let payload = null as ReturnType<typeof buildRichClipboardFragment>
    try {
      await writeClipboardText(text)
    } catch {
      setStatus('Could not copy to clipboard.')
      return false
    }
    if (sourceRecord.molecule === 'dna') {
      payload = buildRichClipboardFragment(
        sourceRecord,
        selectedRange.start,
        selectedRange.end,
        primerHybridization,
      )
      if (payload) {
        try {
          await storeRichClipboard({
            ...payload,
            fromTabId: tabId,
            fromRecordId: record.id,
            fromRecordName: browseMember?.fileName ?? record.name,
          })
        } catch {
          // Rich annotations are optional; plain sequence is already on the clipboard.
        }
      }
    }
    const annotationParts = [
      payload?.features.length ? `${payload.features.length} feature${payload.features.length === 1 ? '' : 's'}` : '',
      payload?.primers.length ? `${payload.primers.length} primer${payload.primers.length === 1 ? '' : 's'}` : '',
    ].filter(Boolean)
    const annotationNote = annotationParts.length ? ` (${annotationParts.join(', ')})` : ''
    setStatus(`Copied ${formatSequenceLength(text.length, record.molecule)} to clipboard${annotationNote}.`)
    return true
  }, [
    alignmentsVisible,
    cutStrandSelection,
    primerHybridization,
    record,
    selectedAlignmentTraceId,
    selectedRange,
    setCopyEventText,
    setStatus,
    storeRichClipboard,
    tabId,
    traceFiles,
    writeClipboardText,
  ])

  const pasteSequenceFromClipboard = useCallback(async () => {
    const rich = await getRichClipboardForPaste()
    let clipboardText: string
    try {
      clipboardText = await readClipboardText()
    } catch {
      if (rich && insertSequenceBases(rich.sequence, rich)) return
      setStatus('Could not read clipboard.')
      return
    }
    if (rich && (!clipboardText.trim() || richClipboardMatchesPasteText(rich, clipboardText))) {
      if (insertSequenceBases(rich.sequence, rich)) return
    }
    if (!insertSequenceBases(clipboardText)) setStatus('Clipboard does not contain a valid DNA sequence.')
  }, [getRichClipboardForPaste, insertSequenceBases, readClipboardText, richClipboardMatchesPasteText, setStatus])

  return {
    copySequenceSelection,
    pasteSequenceFromClipboard,
    hasSequenceSelection,
    hasStickyFragmentSelection: stickyFragmentSelected,
    canCopySelection,
    toolsMwSelection,
  }
}

import {
  applyMemberSequenceEditAtNativeRange,
  applyMemberSequenceEditAtTemplateRange,
} from '../../domain/dnaLibrary'
import { sanitizeDna } from '../../domain/sequence'
import { replaceSequenceRange } from './selectionEditing'
import type { TraceFileRecord } from '../../domain/traceTypes'
import type { SequenceRecord } from '../../domain/types'
import type { SelectionRange } from './selectionEditing'
import type { SequenceEditReplacement } from './sequenceEditTransition'

export function planSequenceEditProfilerDetail(replacement: SequenceEditReplacement): string {
  return replacement.insertedLength > 0
    ? `+${replacement.insertedLength} bp @ ${replacement.start}`
    : `-${replacement.end - replacement.start} bp @ ${replacement.start}`
}

export function planMemberSequenceEditStatus(fileName: string, replacement: SequenceEditReplacement): string {
  const editDetail = replacement.insertedLength > 0
    ? `+${replacement.insertedLength} bp`
    : `-${replacement.end - replacement.start} bp`
  return `Edited ${fileName} (${editDetail}).`
}

export type ReferenceReplacementPlan =
  | { kind: 'noop' }
  | {
      kind: 'apply'
      nextSequence: string
      nextRange: SelectionRange
      replacement: SequenceEditReplacement
      status: string
    }

export function planReferenceReplacementFromTrace(input: {
  consensusSequence: string
  templateStart: number
  templateEnd: number
  replacement: string
}): ReferenceReplacementPlan {
  const sanitized = sanitizeDna(input.replacement)
  if (!sanitized) return { kind: 'noop' }
  const nextSequence = replaceSequenceRange(
    input.consensusSequence,
    input.templateStart,
    input.templateEnd,
    sanitized,
  )
  const nextCaret = input.templateStart + sanitized.length
  return {
    kind: 'apply',
    nextSequence,
    nextRange: { start: nextCaret, end: nextCaret },
    replacement: {
      start: input.templateStart,
      end: input.templateEnd,
      insertedLength: sanitized.length,
    },
    status: `Replaced ${input.templateEnd - input.templateStart} bp with trace sequence (${sanitized.length} bp).`,
  }
}

export type MemberSequenceEditContext =
  | { kind: 'unavailable' }
  | {
      kind: 'ready'
      member: TraceFileRecord
      mode: 'native' | 'template'
    }

export function resolveMemberSequenceEditContext(options: {
  selectedAlignmentTraceId: string | null
  traceFiles: TraceFileRecord[]
  alignmentsVisible: boolean
  recordIsDnaLibrary: boolean
}): MemberSequenceEditContext {
  const memberId = options.selectedAlignmentTraceId
  if (!memberId) return { kind: 'unavailable' }
  const member = options.traceFiles.find((trace) => trace.id === memberId)
  if (!member) return { kind: 'unavailable' }
  const browseNative = !options.alignmentsVisible && options.recordIsDnaLibrary
  if (!browseNative && !options.alignmentsVisible) return { kind: 'unavailable' }
  return { kind: 'ready', member, mode: browseNative ? 'native' : 'template' }
}

export function computeMemberSequenceEdit(
  context: Extract<MemberSequenceEditContext, { kind: 'ready' }>,
  replacement: SequenceEditReplacement,
  insert: string,
  consensus: Pick<SequenceRecord, 'sequence' | 'topology'>,
): TraceFileRecord {
  if (context.mode === 'native') {
    return applyMemberSequenceEditAtNativeRange(
      context.member,
      replacement.start,
      replacement.end,
      insert,
      { consensusSequence: consensus.sequence, consensusTopology: consensus.topology },
    )
  }
  return applyMemberSequenceEditAtTemplateRange(
    context.member,
    replacement.start,
    replacement.end,
    insert,
    consensus.topology,
    consensus.sequence,
  )
}

export function memberSequenceEditErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Could not edit member sequence.'
}

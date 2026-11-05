import { alignTraceToTemplate } from './traceAlignment'
import type {
  DnaComparisonAlignment,
  DnaComparisonLayoutSlot,
  DnaComparisonSource,
} from './dnaComparisonTypes'
import type { TraceTemplateAlignment } from './traceTypes'

export function alignDnaComparisonSource(
  reference: string,
  source: DnaComparisonSource,
  topology: 'linear' | 'circular' = 'linear',
): DnaComparisonAlignment | null {
  const alignment = alignTraceToTemplate(source.sequence, reference, { topology })
  if (!alignment) return null
  const identityCount = alignment.columns.filter(
    (column) => column.kind === 'match' && column.match,
  ).length
  return { ...alignment, sourceId: source.id, identityCount }
}

/** Reuse an existing library-member trace alignment as a comparative alignment. */
export function dnaComparisonAlignmentFromTraceAlignment(
  sourceId: string,
  alignment: TraceTemplateAlignment,
): DnaComparisonAlignment {
  const identityCount = alignment.columns.filter(
    (column) => column.kind === 'match' && column.match,
  ).length
  return { ...alignment, sourceId, identityCount }
}

function insertionCountsByBoundary(alignment: DnaComparisonAlignment, referenceLength: number) {
  const counts = new Map<number, number>()
  let boundary = Math.max(0, Math.min(referenceLength, alignment.templateStart))
  for (const column of alignment.columns) {
    if (column.kind === 'traceInsert') {
      counts.set(boundary, (counts.get(boundary) ?? 0) + 1)
      continue
    }
    boundary = Math.max(0, Math.min(referenceLength, column.templateIndex + 1))
  }
  return counts
}

export function buildDnaComparisonLayout(
  referenceLength: number,
  alignments: readonly DnaComparisonAlignment[],
): DnaComparisonLayoutSlot[] {
  const maximumInsertions = new Map<number, number>()
  for (const alignment of alignments) {
    for (const [boundary, count] of insertionCountsByBoundary(alignment, referenceLength)) {
      maximumInsertions.set(boundary, Math.max(maximumInsertions.get(boundary) ?? 0, count))
    }
  }

  const slots: DnaComparisonLayoutSlot[] = []
  for (let boundary = 0; boundary <= referenceLength; boundary += 1) {
    for (let insertionIndex = 0; insertionIndex < (maximumInsertions.get(boundary) ?? 0); insertionIndex += 1) {
      slots.push({ kind: 'insertion', referenceBoundary: boundary, insertionIndex })
    }
    if (boundary < referenceLength) slots.push({ kind: 'reference', referenceIndex: boundary })
  }
  return slots
}

export function dnaComparisonIdentityPercent(alignment: DnaComparisonAlignment) {
  const compared = alignment.identityCount + alignment.mismatchCount
  return compared ? alignment.identityCount / compared * 100 : 0
}

export function dnaComparisonCoveragePercent(alignment: DnaComparisonAlignment, referenceLength: number) {
  if (!referenceLength) return 0
  const covered = new Set<number>()
  for (const column of alignment.columns) {
    if (column.kind === 'match' || column.kind === 'templateGap') covered.add(column.templateIndex)
  }
  return covered.size / referenceLength * 100
}

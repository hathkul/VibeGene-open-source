import type { ProteinGuidedAlignment, ProteinSimilarity } from './proteinAlignmentTypes'

export type ProteinAlignmentMapSegment = {
  start: number
  end: number
  similarity: ProteinSimilarity
}

export type ProteinAlignmentMapInsertion = {
  boundary: number
  count: number
}

export type ProteinAlignmentMapLayout = {
  start: number
  end: number
  segments: ProteinAlignmentMapSegment[]
  insertions: ProteinAlignmentMapInsertion[]
}

export function buildProteinAlignmentMapLayout(
  alignment: ProteinGuidedAlignment,
): ProteinAlignmentMapLayout {
  const segments: ProteinAlignmentMapSegment[] = []
  const insertionCounts = new Map<number, number>()

  for (const column of alignment.columns) {
    if (column.referenceIndex === null) {
      insertionCounts.set(column.referenceBoundary, (insertionCounts.get(column.referenceBoundary) ?? 0) + 1)
      continue
    }
    const start = column.referenceIndex
    const similarity: ProteinSimilarity = column.event === 'frameshift'
      ? 'frameshift'
      : column.similarity
    const previous = segments.at(-1)
    if (previous && previous.similarity === similarity && previous.end === start) {
      previous.end = start + 1
    } else {
      segments.push({ start, end: start + 1, similarity })
    }
  }

  return {
    start: alignment.referenceStart,
    end: alignment.referenceEnd,
    segments,
    insertions: [...insertionCounts.entries()]
      .map(([boundary, count]) => ({ boundary, count }))
      .sort((left, right) => left.boundary - right.boundary),
  }
}

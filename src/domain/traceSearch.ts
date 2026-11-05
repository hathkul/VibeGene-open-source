import { normalizeDna } from './sequence'

/**
 * Search over the *displayed* trace sequence.
 *
 * Ordinals are positions in the oriented called sequence the viewer renders
 * (forward scan order, or reverse-complement order), never in the backing
 * construct. Search must therefore live beside the trace geometry rather than
 * reuse workspace search, which indexes the construct.
 */
export function normalizeTraceSearchQuery(query: string): string {
  return normalizeDna(query)
}

export function findTraceSearchHits(sequence: string, query: string): number[] {
  const normalizedQuery = normalizeTraceSearchQuery(query)
  if (!normalizedQuery) return []
  const normalized = normalizeDna(sequence)
  const hits: number[] = []
  let index = normalized.indexOf(normalizedQuery)
  while (index !== -1) {
    hits.push(index)
    index = normalized.indexOf(normalizedQuery, index + 1)
  }
  return hits
}

/** Inclusive ordinal span of one hit, clamped to the displayed sequence. */
export function traceSearchHitRange(
  hitStart: number,
  query: string,
  sequenceLength: number,
): { start: number; end: number } | null {
  if (!Number.isFinite(hitStart) || sequenceLength <= 0) return null
  const queryLength = normalizeTraceSearchQuery(query).length
  if (queryLength === 0) return null
  const start = Math.max(0, Math.min(sequenceLength - 1, hitStart))
  const end = Math.max(start, Math.min(sequenceLength - 1, start + queryLength - 1))
  return { start, end }
}

/** Next/previous hit ordinal with wrap-around; mirrors workspace search cycling. */
export function nextTraceSearchHitIndex(current: number, direction: -1 | 1, count: number): number | null {
  if (count <= 0) return null
  return (current + direction + count) % count
}

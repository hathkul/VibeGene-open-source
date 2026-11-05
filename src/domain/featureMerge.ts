import { createId } from './sequence'
import type { SequenceFeature } from './types'

function featureIdentityKey(feature: SequenceFeature) {
  const strand = feature.locations[0]?.strand ?? 'forward'
  return `${feature.sourceFeatureId ?? ''}\0${feature.name}\0${feature.type}\0${feature.color}\0${strand}`
}

function intervalsOverlapOrAbut(
  a: { start: number; end: number },
  b: { start: number; end: number },
): boolean {
  return a.start <= b.end && b.start <= a.end
}

function intervalsTouchAcrossOrigin(
  a: { start: number; end: number },
  b: { start: number; end: number },
  length: number,
): boolean {
  if (length <= 0) return false
  const aEnds = a.end >= length
  const bEnds = b.end >= length
  const aStarts = a.start <= 0
  const bStarts = b.start <= 0
  return (aEnds && bStarts) || (bEnds && aStarts)
}

function locationsTouch(
  left: SequenceFeature['locations'],
  right: SequenceFeature['locations'],
  circularLength: number | null,
): boolean {
  for (const a of left) {
    for (const b of right) {
      if (a.strand !== b.strand) continue
      if (intervalsOverlapOrAbut(a, b)) return true
      if (circularLength !== null && intervalsTouchAcrossOrigin(a, b, circularLength)) return true
    }
  }
  return false
}

function mergeIntervalList(
  locations: SequenceFeature['locations'],
  circularLength: number | null,
): SequenceFeature['locations'] {
  if (!locations.length) return []
  const sorted = [...locations].sort(
    (left, right) => left.start - right.start || left.end - right.end,
  )
  const merged: SequenceFeature['locations'] = [{ ...sorted[0]! }]
  for (let index = 1; index < sorted.length; index += 1) {
    const next = sorted[index]!
    const current = merged[merged.length - 1]!
    if (current.strand === next.strand && intervalsOverlapOrAbut(current, next)) {
      current.end = Math.max(current.end, next.end)
      continue
    }
    merged.push({ ...next })
  }

  if (circularLength === null || merged.length < 2) return merged

  // Mark wrap-around abutting halves (end of molecule + start) so connectors stay correct.
  for (let index = 0; index < merged.length; index += 1) {
    const left = merged[index]!
    for (let other = index + 1; other < merged.length; other += 1) {
      const right = merged[other]!
      if (left.strand !== right.strand) continue
      if (!intervalsTouchAcrossOrigin(left, right, circularLength)) continue
      left.originWrapSplit = true
      right.originWrapSplit = true
    }
  }
  return merged
}

/**
 * Join annotations that represent the same feature and sit inside / next to each other
 * after assembly (Gibson homology, insert cloned into a split parental feature, etc.).
 * Ruler / temporary part-span features are left untouched.
 */
export function mergeAbuttingAssemblyFeatures(
  features: SequenceFeature[],
  options?: { circular?: boolean; sequenceLength?: number },
): SequenceFeature[] {
  const circularLength =
    options?.circular && options.sequenceLength && options.sequenceLength > 0
      ? options.sequenceLength
      : null

  const permanent: SequenceFeature[] = []
  const ruler: SequenceFeature[] = []
  for (const feature of features) {
    if (feature.mapTrack === 'ruler') ruler.push(feature)
    else permanent.push(feature)
  }

  const groups = new Map<string, SequenceFeature[]>()
  for (const feature of permanent) {
    const key = featureIdentityKey(feature)
    const group = groups.get(key)
    if (group) group.push(feature)
    else groups.set(key, [feature])
  }

  const merged: SequenceFeature[] = []
  for (const group of groups.values()) {
    if (group.length === 1) {
      const only = group[0]!
      merged.push({
        ...only,
        locations: mergeIntervalList(only.locations, circularLength),
      })
      continue
    }

    const remaining = [...group]
    while (remaining.length) {
      const seed = remaining.shift()!
      const cluster = [seed]
      let grew = true
      while (grew) {
        grew = false
        for (let index = remaining.length - 1; index >= 0; index -= 1) {
          const candidate = remaining[index]!
          const touches = cluster.some((member) =>
            locationsTouch(member.locations, candidate.locations, circularLength),
          )
          if (!touches) continue
          cluster.push(candidate)
          remaining.splice(index, 1)
          grew = true
        }
      }

      if (cluster.length === 1) {
        const only = cluster[0]!
        merged.push({
          ...only,
          locations: mergeIntervalList(only.locations, circularLength),
        })
        continue
      }

      const base = cluster[0]!
      const locations = mergeIntervalList(
        cluster.flatMap((entry) => entry.locations),
        circularLength,
      )
      const cleavageArrows = Array.from(
        new Set(
          cluster
            .flatMap((entry) => entry.cleavageArrows ?? [])
            .filter((position) =>
              locations.some((location) => {
                if (location.end >= location.start) {
                  return position >= location.start && position < location.end
                }
                return position >= location.start || position < location.end
              }),
            ),
        ),
      ).sort((left, right) => left - right)

      merged.push({
        ...base,
        id: base.id || createId('feat'),
        locations,
        cleavageArrows: cleavageArrows.length ? cleavageArrows : base.cleavageArrows,
      })
    }
  }

  return [...merged, ...ruler]
}

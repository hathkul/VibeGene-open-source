import type { ProteinComparisonVariableRegion } from './proteinAlignmentTypes'

export type ProteinReferenceSelection = {
  start: number
  end: number
}

function clampIndex(value: number, referenceLength: number) {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.min(referenceLength, Math.trunc(value)))
}

export function normalizeProteinComparisonVariableRegions(
  regions: readonly ProteinComparisonVariableRegion[],
  referenceLength: number,
): ProteinComparisonVariableRegion[] {
  const sorted = regions
    .flatMap((region) => {
      if (!region || typeof region.id !== 'string' || !region.id.trim()) return []
      const start = clampIndex(region.start, referenceLength)
      const end = clampIndex(region.end, referenceLength)
      return end > start ? [{ id: region.id, start, end }] : []
    })
    .sort((left, right) => left.start - right.start || left.end - right.end)

  return sorted.reduce<ProteinComparisonVariableRegion[]>((merged, region) => {
    const previous = merged.at(-1)
    if (!previous || region.start > previous.end) {
      merged.push(region)
    } else {
      previous.end = Math.max(previous.end, region.end)
    }
    return merged
  }, [])
}

export function residueIsInVariableRegion(
  referenceIndex: number,
  regions: readonly ProteinComparisonVariableRegion[],
) {
  return regions.some((region) => referenceIndex >= region.start && referenceIndex < region.end)
}

export function selectionOverlapsVariableRegion(
  selection: ProteinReferenceSelection,
  regions: readonly ProteinComparisonVariableRegion[],
) {
  return regions.some((region) => region.start < selection.end && region.end > selection.start)
}

export function addProteinComparisonVariableRegion(
  regions: readonly ProteinComparisonVariableRegion[],
  selection: ProteinReferenceSelection,
  id: string,
  referenceLength: number,
) {
  return normalizeProteinComparisonVariableRegions([
    ...regions,
    { id, start: selection.start, end: selection.end },
  ], referenceLength)
}

export function subtractProteinComparisonVariableRegion(
  regions: readonly ProteinComparisonVariableRegion[],
  selection: ProteinReferenceSelection,
  createRegionId: () => string,
  referenceLength: number,
) {
  return normalizeProteinComparisonVariableRegions(regions.flatMap((region) => {
    if (region.end <= selection.start || region.start >= selection.end) return [region]
    const fragments: ProteinComparisonVariableRegion[] = []
    if (region.start < selection.start) {
      fragments.push({ ...region, end: selection.start })
    }
    if (region.end > selection.end) {
      fragments.push({
        id: fragments.length ? createRegionId() : region.id,
        start: selection.end,
        end: region.end,
      })
    }
    return fragments
  }), referenceLength)
}

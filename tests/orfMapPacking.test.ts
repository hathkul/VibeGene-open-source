import { describe, expect, it } from 'vitest'

/**
 * Mirrors App.tsx featurePlacementPriority + half-slot assignFeatureLevels for focused
 * packing tests without importing the full React app module.
 */
const featurePlacementPriority: Record<string, number> = {
  CDS: 0,
  ORF: 1,
  promoter: 2,
  misc_feature: 30,
}

function featurePriority(type: string) {
  return featurePlacementPriority[type] ?? 20
}

function isOrfFeature(feature: { id: string }) {
  return feature.id.startsWith('orf:')
}

type Feature = {
  id: string
  type: string
  name: string
  color: string
  locations: Array<{ start: number; end: number; strand: 'forward' | 'reverse' }>
  prioritizeDisplay?: boolean
}

type RenderInfo = {
  feature: Feature
  start: number
  end: number
  level: number
}

function rangesOverlap(a: { start: number; end: number }, b: { start: number; end: number }) {
  return a.start < b.end && b.start < a.end
}

function assignFeatureLevels(features: Feature[]): RenderInfo[] {
  const sorted = features
    .flatMap((feature) =>
      feature.locations.map((location) => ({
        feature,
        start: location.start,
        end: location.end,
      })),
    )
    .sort((a, b) => {
      const priorityDelta = Number(Boolean(b.feature.prioritizeDisplay)) - Number(Boolean(a.feature.prioritizeDisplay))
      if (priorityDelta !== 0) return priorityDelta
      return featurePriority(a.feature.type) - featurePriority(b.feature.type) || a.start - b.start || b.end - a.end
    })

  const slotOccupancy: Array<Array<{ start: number; end: number }>> = []

  function slotIsFree(slot: number, start: number, end: number) {
    return !(slotOccupancy[slot] ?? []).some((range) => rangesOverlap(range, { start, end }))
  }

  function occupySlot(slot: number, start: number, end: number) {
    const occupied = slotOccupancy[slot] ?? []
    occupied.push({ start, end })
    slotOccupancy[slot] = occupied
  }

  function nextOrfSlot(start: number, end: number) {
    for (let slot = 0; ; slot += 1) {
      if (slotIsFree(slot, start, end)) return slot
    }
  }

  function nextRegularSlot(start: number, end: number) {
    for (let layer = 0; ; layer += 1) {
      const slot = layer * 2
      if (slotIsFree(slot, start, end) && slotIsFree(slot + 1, start, end)) return slot
    }
  }

  return sorted.map((item) => {
    if (isOrfFeature(item.feature)) {
      const slot = nextOrfSlot(item.start, item.end)
      occupySlot(slot, item.start, item.end)
      return { ...item, level: slot / 2 }
    }
    const slot = nextRegularSlot(item.start, item.end)
    occupySlot(slot, item.start, item.end)
    occupySlot(slot + 1, item.start, item.end)
    return { ...item, level: slot / 2 }
  })
}

function feature(id: string, type: string, start: number, end: number): Feature {
  return {
    id,
    type,
    name: id,
    color: '#000',
    locations: [{ start, end, strand: 'forward' }],
  }
}

describe('map ORF feature packing', () => {
  it('places overlapping ORFs below CDS instead of sharing level 0', () => {
    const levels = assignFeatureLevels([
      feature('cds', 'CDS', 10, 100),
      feature('orf:1', 'ORF', 20, 80),
    ])
    const cds = levels.find((entry) => entry.feature.id === 'cds')
    const orf = levels.find((entry) => entry.feature.id === 'orf:1')
    expect(cds?.level).toBe(0)
    expect(orf?.level).toBe(1)
  })

  it('places ORFs above overlapping misc features', () => {
    const levels = assignFeatureLevels([
      feature('orf:1', 'ORF', 10, 100),
      feature('misc', 'misc_feature', 20, 80),
    ])
    const orf = levels.find((entry) => entry.feature.id === 'orf:1')
    const misc = levels.find((entry) => entry.feature.id === 'misc')
    expect(orf?.level).toBe(0)
    expect(misc?.level).toBe(1)
  })

  it('keeps non-overlapping ORFs on the same level as CDS', () => {
    const levels = assignFeatureLevels([
      feature('cds', 'CDS', 0, 40),
      feature('orf:1', 'ORF', 50, 90),
    ])
    expect(levels.every((entry) => entry.level === 0)).toBe(true)
  })

  it('packs two overlapping ORFs into one layer at levels 0 and 0.5', () => {
    const levels = assignFeatureLevels([
      feature('orf:1', 'ORF', 10, 80),
      feature('orf:2', 'ORF', 20, 90),
    ])
    const orfLevels = levels.map((entry) => entry.level).toSorted((a, b) => a - b)
    expect(orfLevels).toEqual([0, 0.5])
  })

  it('opens a new layer for a third overlapping ORF', () => {
    const levels = assignFeatureLevels([
      feature('orf:1', 'ORF', 10, 80),
      feature('orf:2', 'ORF', 20, 90),
      feature('orf:3', 'ORF', 30, 70),
    ])
    const orfLevels = levels.map((entry) => entry.level).toSorted((a, b) => a - b)
    expect(orfLevels).toEqual([0, 0.5, 1])
  })
})

import {
  codonMapForGeneticCode,
  translateCodon,
  type FeatureTranslationCell,
  type FeatureTranslationOptions,
} from './geneticCode'
import { complementDnaBase } from './sequence'
import {
  buildTraceSlotLookup,
  resolveTraceColumnAtMergedSlotFromLookup,
  traceBaseForColumn,
  visibleMergedLayoutEntries,
  type MergedInsertionLayout,
  type MergedLayoutColumn,
} from './traceDisplay'
import type { FeatureSegment, SequenceFeature } from './types'
import type { TraceTemplateAlignment } from './traceTypes'

const layoutBaseStepPx = 10

function traceLayoutSlotVisible(slot: MergedLayoutColumn, alignment: TraceTemplateAlignment) {
  const { templateStart, templateEnd } = alignment
  if (slot.kind === 'template') {
    return slot.templateIndex >= templateStart && slot.templateIndex < templateEnd
  }
  if (slot.anchorTemplateIndex < 0) return templateStart === 0
  return slot.anchorTemplateIndex >= templateStart - 1 && slot.anchorTemplateIndex < templateEnd
}

export type TraceLayoutSlot = {
  layoutIndex: number
  leftPx: number
  slot: MergedLayoutColumn
  templateIndex: number
  base: string
}

function aminoAcidForCodon(codon: string, codonIndex: number, options: FeatureTranslationOptions, map: Record<string, string>) {
  if (codonIndex === 0 && options.firstCodonAsMet) return 'M'
  return translateCodon(codon, map)
}

function complementSlot(slot: TraceLayoutSlot): TraceLayoutSlot {
  return { ...slot, base: complementDnaBase(slot.base).toUpperCase() }
}

function activeTranscriptionSegments(locations: FeatureSegment[], options: FeatureTranslationOptions) {
  const strand = locations[0]?.strand ?? 'forward'
  const indexedSegments = locations.map((location, index) => ({ location, index }))
  const ordered =
    strand === 'reverse'
      ? [...indexedSegments].sort((a, b) => b.location.start - a.location.start)
      : [...indexedSegments].sort((a, b) => a.location.start - b.location.start)
  return ordered.filter(({ index }) => !options.segmentNumbering[index]?.skip)
}

function applyReadingFrame(reading: TraceLayoutSlot[], options: FeatureTranslationOptions): TraceLayoutSlot[] {
  const frameOffset = Math.abs(options.readingFrame) - 1
  return frameOffset > 0 ? reading.slice(frameOffset) : reading
}

function lastCompleteCodonAminoAcid(reading: TraceLayoutSlot[], options: FeatureTranslationOptions): string | null {
  const framed = applyReadingFrame(reading, options)
  if (framed.length < 3) return null
  const codonIndex = Math.floor(framed.length / 3) - 1
  const start = codonIndex * 3
  const codon = `${framed[start].base}${framed[start + 1].base}${framed[start + 2].base}`
  const map = codonMapForGeneticCode(options.geneticCode)
  return aminoAcidForCodon(codon, codonIndex, options, map)
}

function slotsAtTemplateIndex(
  templateIndex: number,
  strand: FeatureSegment['strand'],
  templateSlotAt: Map<number, TraceLayoutSlot>,
  insertionsAfter: Map<number, TraceLayoutSlot[]>,
): TraceLayoutSlot[] {
  const slots: TraceLayoutSlot[] = []
  const templateSlot = templateSlotAt.get(templateIndex)
  if (templateSlot) slots.push(strand === 'reverse' ? complementSlot(templateSlot) : templateSlot)
  const insertionAnchor = strand === 'reverse' ? templateIndex - 1 : templateIndex
  const insertions = insertionsAfter.get(insertionAnchor) ?? []
  insertions.forEach((slot) => {
    slots.push(strand === 'reverse' ? complementSlot(slot) : slot)
  })
  return slots
}

function orderedFeatureLayoutReading(
  feature: Pick<SequenceFeature, 'locations'>,
  templateSlotAt: Map<number, TraceLayoutSlot>,
  insertionsAfter: Map<number, TraceLayoutSlot[]>,
  options: FeatureTranslationOptions,
): TraceLayoutSlot[] {
  const locations = feature.locations
  if (!locations.length) return []
  const strand = locations[0]?.strand ?? 'forward'
  const reading: TraceLayoutSlot[] = []

  for (const { location, index } of activeTranscriptionSegments(locations, options)) {
    if (options.segmentNumbering[index]?.skip) continue
    if (strand === 'reverse') {
      for (let templateIndex = location.end - 1; templateIndex >= location.start; templateIndex -= 1) {
        reading.push(...slotsAtTemplateIndex(templateIndex, strand, templateSlotAt, insertionsAfter))
      }
    } else {
      for (let templateIndex = location.start; templateIndex < location.end; templateIndex += 1) {
        reading.push(...slotsAtTemplateIndex(templateIndex, strand, templateSlotAt, insertionsAfter))
      }
    }
  }

  return reading
}

function extendLayoutReadingUntilStop(
  reading: TraceLayoutSlot[],
  feature: Pick<SequenceFeature, 'locations'>,
  templateSlotAt: Map<number, TraceLayoutSlot>,
  insertionsAfter: Map<number, TraceLayoutSlot[]>,
  options: FeatureTranslationOptions,
  alignment: TraceTemplateAlignment,
) {
  if (!reading.length) return
  if (lastCompleteCodonAminoAcid(reading, options) === '*') return

  const strand = feature.locations[0]?.strand ?? 'forward'
  const segments = activeTranscriptionSegments(feature.locations, options)
  if (!segments.length) return
  const lastSegment = segments[segments.length - 1].location
  let templateIndex = strand === 'reverse' ? lastSegment.start - 1 : lastSegment.end
  const minTemplate = alignment.templateStart
  const maxTemplate = alignment.templateEnd
  let steps = 0
  const maxSteps = maxTemplate - minTemplate + 8

  while (steps < maxSteps) {
    if (strand === 'reverse') {
      templateIndex -= 1
      if (templateIndex < minTemplate) break
      reading.push(...slotsAtTemplateIndex(templateIndex, strand, templateSlotAt, insertionsAfter))
    } else {
      if (templateIndex >= maxTemplate) break
      reading.push(...slotsAtTemplateIndex(templateIndex, strand, templateSlotAt, insertionsAfter))
      templateIndex += 1
    }
    steps += 1

    const framedLength = applyReadingFrame(reading, options).length
    if (framedLength >= 3 && framedLength % 3 === 0 && lastCompleteCodonAminoAcid(reading, options) === '*') {
      break
    }
  }
}

function buildTranslationCellsFromLayoutReading(
  reading: TraceLayoutSlot[],
  options: FeatureTranslationOptions,
): FeatureTranslationCell[] {
  const framed = applyReadingFrame(reading, options)
  const map = codonMapForGeneticCode(options.geneticCode)
  const startNumber = options.segmentNumbering[0]?.startAt ?? 1
  const cells: FeatureTranslationCell[] = []

  for (let codonIndex = 0; codonIndex * 3 + 2 < framed.length; codonIndex += 1) {
    const first = framed[codonIndex * 3]
    const second = framed[codonIndex * 3 + 1]
    const third = framed[codonIndex * 3 + 2]
    const codon = `${first.base}${second.base}${third.base}`
    const leftPx = first.leftPx
    const widthPx = third.leftPx + layoutBaseStepPx - leftPx
    cells.push({
      aa: aminoAcidForCodon(codon, codonIndex, options, map),
      number: startNumber + codonIndex,
      positions: [first.templateIndex, second.templateIndex, third.templateIndex],
      layoutSpan: { leftPx, widthPx },
    })
  }

  return cells
}

export function buildTraceLayoutSlots(
  mergedLayout: MergedInsertionLayout,
  alignment: TraceTemplateAlignment,
  baseCalls: string[],
): TraceLayoutSlot[] {
  const lookup = buildTraceSlotLookup(alignment)
  const orientation = alignment.orientation
  const entries = visibleMergedLayoutEntries(mergedLayout, alignment.templateStart, alignment.templateEnd)
  const slots: TraceLayoutSlot[] = []

  entries.forEach((entry, layoutIndex) => {
    if (!traceLayoutSlotVisible(entry.slot, alignment)) return

    if (entry.slot.kind === 'insertion-gap') {
      const column = resolveTraceColumnAtMergedSlotFromLookup(lookup, entry.slot)
      if (!column) return
      const base = traceBaseForColumn(column, baseCalls, orientation)
      if (!base || base === '-') return
      slots.push({
        layoutIndex,
        leftPx: entry.leftPx,
        slot: entry.slot,
        templateIndex: entry.slot.anchorTemplateIndex < 0 ? 0 : entry.slot.anchorTemplateIndex,
        base: base.toUpperCase(),
      })
      return
    }

    const column = lookup.templateColumns.get(entry.slot.templateIndex)
    if (column?.kind === 'deletion') return
    if (!column) return
    const base = traceBaseForColumn(column, baseCalls, orientation)
    if (!base || base === '-') return
    slots.push({
      layoutIndex,
      leftPx: entry.leftPx,
      slot: entry.slot,
      templateIndex: entry.slot.templateIndex,
      base: base.toUpperCase(),
    })
  })

  return slots
}

export function computeTraceLayoutFeatureTranslationCells(
  feature: SequenceFeature,
  layoutSlots: TraceLayoutSlot[],
  alignment: TraceTemplateAlignment,
  options: FeatureTranslationOptions,
): FeatureTranslationCell[] {
  const templateSlotAt = new Map<number, TraceLayoutSlot>()
  const insertionsAfter = new Map<number, TraceLayoutSlot[]>()

  layoutSlots.forEach((slot) => {
    if (slot.slot.kind === 'template') {
      templateSlotAt.set(slot.templateIndex, slot)
      return
    }
    const anchor = slot.slot.anchorTemplateIndex
    const list = insertionsAfter.get(anchor) ?? []
    list.push(slot)
    insertionsAfter.set(anchor, list)
  })

  const reading = orderedFeatureLayoutReading(feature, templateSlotAt, insertionsAfter, options)
  extendLayoutReadingUntilStop(reading, feature, templateSlotAt, insertionsAfter, options, alignment)
  return buildTranslationCellsFromLayoutReading(reading, options)
}

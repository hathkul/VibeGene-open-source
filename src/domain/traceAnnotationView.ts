import { annotateRestrictionSiteMethylation } from './methylation'
import { findRestrictionSites } from './enzymes'
import type { FeatureTranslationCell } from './geneticCode'
import { linearCutPosition } from './mapLayout'
import { resolvePrimerFrameDisplays } from './primerSequenceLayout'
import type { PrimerFrameDisplay } from './primerSequenceLayout'
import {
  buildTraceLayoutSlots,
  computeTraceLayoutFeatureTranslationCells,
} from './traceLayoutTranslation'
import {
  buildTraceSlotLookup,
  resolveTraceColumnAtMergedSlotFromLookup,
  traceBaseForColumn,
  type MergedInsertionLayout,
  type MergedLayoutColumn,
} from './traceDisplay'
import type { Primer, RestrictionEnzyme, RestrictionSite, SequenceFeature, SequenceRecord } from './types'
import type { TraceFileRecord, TraceTemplateAlignment } from './traceTypes'

type LayoutSequenceChar = {
  base: string
  templateIndex: number
}

export function mapTemplateSpanToTraceSpan(
  alignment: TraceTemplateAlignment,
  templateStart: number,
  templateEnd: number,
): { start: number; end: number } | null {
  if (templateStart >= templateEnd) return null
  let minTrace = Number.POSITIVE_INFINITY
  let maxTrace = Number.NEGATIVE_INFINITY
  for (const column of alignment.columns) {
    if (column.kind !== 'match') continue
    if (column.templateIndex < templateStart || column.templateIndex >= templateEnd) continue
    minTrace = Math.min(minTrace, column.traceIndex)
    maxTrace = Math.max(maxTrace, column.traceIndex)
  }
  if (!Number.isFinite(minTrace)) return null
  return { start: minTrace, end: maxTrace + 1 }
}

/**
 * Map a codon-aligned template span onto the trace one codon at a time.
 * Only keeps complete 3-base codons (all three template bases matched to three
 * contiguous trace bases). Indels that would create partial codons are skipped
 * instead of expanding min/max across the whole feature.
 */
export function mapCodonAlignedTemplateSpanToTraceLocations(
  alignment: TraceTemplateAlignment,
  templateStart: number,
  templateEnd: number,
): Array<{ start: number; end: number }> {
  if (templateStart >= templateEnd) return []
  const traceByTemplate = new Map<number, number>()
  for (const column of alignment.columns) {
    if (column.kind !== 'match') continue
    traceByTemplate.set(column.templateIndex, column.traceIndex)
  }

  const completeEnd = templateStart + Math.floor((templateEnd - templateStart) / 3) * 3
  const locations: Array<{ start: number; end: number }> = []
  for (let templateIndex = templateStart; templateIndex < completeEnd; templateIndex += 3) {
    const a = traceByTemplate.get(templateIndex)
    const b = traceByTemplate.get(templateIndex + 1)
    const c = traceByTemplate.get(templateIndex + 2)
    if (a === undefined || b === undefined || c === undefined) continue
    const start = Math.min(a, b, c)
    const end = Math.max(a, b, c) + 1
    if (end - start !== 3) continue
    const bases = new Set([a, b, c])
    if (bases.size !== 3 || !bases.has(start) || !bases.has(start + 1) || !bases.has(start + 2)) continue
    const previous = locations.at(-1)
    if (previous && previous.end === start) previous.end = end
    else locations.push({ start, end })
  }
  return locations
}

export function mapTraceSpanToTemplateSpan(
  alignment: TraceTemplateAlignment,
  traceStart: number,
  traceEnd: number,
): { start: number; end: number } | null {
  if (traceStart >= traceEnd) return null
  let minTemplate = Number.POSITIVE_INFINITY
  let maxTemplate = Number.NEGATIVE_INFINITY
  for (const column of alignment.columns) {
    if (column.kind !== 'match') continue
    if (column.traceIndex < traceStart || column.traceIndex >= traceEnd) continue
    minTemplate = Math.min(minTemplate, column.templateIndex)
    maxTemplate = Math.max(maxTemplate, column.templateIndex)
  }
  if (!Number.isFinite(minTemplate)) return null
  return { start: minTemplate, end: maxTemplate + 1 }
}

export function remapFeaturesToTrace(
  features: SequenceFeature[],
  alignment: TraceTemplateAlignment,
  options?: { preserveCodons?: boolean },
): SequenceFeature[] {
  const flipStrand = alignment.orientation === 'reverse'
  const preserveCodons = options?.preserveCodons === true
  return features.flatMap((feature) => {
    const locations = feature.locations.flatMap((location) => {
      const length = location.end - location.start
      const useCodons = preserveCodons && length >= 3 && length % 3 === 0
      if (useCodons) {
        return mapCodonAlignedTemplateSpanToTraceLocations(
          alignment,
          location.start,
          location.end,
        ).map((mapped) => ({
          ...location,
          start: mapped.start,
          end: mapped.end,
          strand: flipStrand
            ? (location.strand === 'forward' ? 'reverse' : 'forward')
            : location.strand,
        }))
      }
      const mapped = mapTemplateSpanToTraceSpan(alignment, location.start, location.end)
      if (!mapped || mapped.end <= mapped.start) return []
      return [{
        ...location,
        start: mapped.start,
        end: mapped.end,
        strand: flipStrand
          ? (location.strand === 'forward' ? 'reverse' : 'forward')
          : location.strand,
      }]
    })
    if (!locations.length) return []
    return [{ ...feature, locations }]
  })
}

/** Lift member-native features onto the consensus/template coordinate system. */
export function remapFeaturesToTemplate(
  features: SequenceFeature[],
  alignment: TraceTemplateAlignment,
): SequenceFeature[] {
  const flipStrand = alignment.orientation === 'reverse'
  return features.flatMap((feature) => {
    const locations = feature.locations.flatMap((location) => {
      const mapped = mapTraceSpanToTemplateSpan(alignment, location.start, location.end)
      if (!mapped || mapped.end <= mapped.start) return []
      return [{
        ...location,
        start: mapped.start,
        end: mapped.end,
        strand: flipStrand
          ? (location.strand === 'forward' ? 'reverse' : 'forward')
          : location.strand,
      }]
    })
    if (!locations.length) return []
    return [{ ...feature, locations }]
  })
}

export function remapRestrictionSitesToTrace(
  sites: RestrictionSite[],
  alignment: TraceTemplateAlignment,
): RestrictionSite[] {
  return sites.flatMap((site) => {
    const mapped = mapTemplateSpanToTraceSpan(alignment, site.start, site.end)
    if (!mapped || mapped.end <= mapped.start) return []
    return [{ ...site, start: mapped.start, end: mapped.end }]
  })
}

export function remapPrimersToTrace(primers: Primer[], alignment: TraceTemplateAlignment): Primer[] {
  return primers.flatMap((primer) => {
    const bindings = primer.bindings?.flatMap((binding) => {
      const mapped = mapTemplateSpanToTraceSpan(alignment, binding.templateStart, binding.templateEnd)
      if (!mapped || mapped.end <= mapped.start) return []
      const components = binding.components.flatMap((component) => {
        if (component.templateStart === undefined) {
          return [component]
        }
        const componentEnd = component.templateEnd ?? component.templateStart + component.primerBases.length
        const componentMapped = mapTemplateSpanToTraceSpan(alignment, component.templateStart, componentEnd)
        if (!componentMapped || componentMapped.end <= componentMapped.start) return []
        return [
          {
            ...component,
            templateStart: componentMapped.start,
            templateEnd: componentMapped.end,
          },
        ]
      })
      if (!components.length) return []
      return [
        {
          ...binding,
          templateStart: mapped.start,
          templateEnd: mapped.end,
          components,
        },
      ]
    })
    if (!bindings?.length) return []
    return [{ ...primer, bindings }]
  })
}

/** Template-length sequence with trace calls at aligned positions (N at deletions, reference elsewhere). */
export function buildTraceDerivedTemplateSequence(
  templateSequence: string,
  alignment: TraceTemplateAlignment,
  baseCalls: string[],
): string {
  const lookup = buildTraceSlotLookup(alignment)
  const orientation = alignment.orientation
  return [...templateSequence]
    .map((referenceBase, templateIndex) => {
      const column = lookup.templateColumns.get(templateIndex)
      if (column?.kind === 'match') {
        const base = traceBaseForColumn(column, baseCalls, orientation)
        return base && base !== '-' ? base : 'N'
      }
      if (column?.kind === 'deletion') return 'N'
      return referenceBase.toUpperCase()
    })
    .join('')
}

export function traceAnnotationSlotVisible(slot: MergedLayoutColumn, alignment: TraceTemplateAlignment) {
  const { templateStart, templateEnd } = alignment
  if (slot.kind === 'template') {
    return slot.templateIndex >= templateStart && slot.templateIndex < templateEnd
  }
  if (slot.anchorTemplateIndex < 0) return templateStart === 0
  return slot.anchorTemplateIndex >= templateStart - 1 && slot.anchorTemplateIndex < templateEnd
}

export function filterRestrictionSitesToAlignmentSpan(
  sites: RestrictionSite[],
  alignment: TraceTemplateAlignment,
): RestrictionSite[] {
  return sites.filter((site) => {
    const cut = linearCutPosition(site)
    return cut >= alignment.templateStart && cut < alignment.templateEnd
  })
}

function pushTraceLayoutChars(
  chars: LayoutSequenceChar[],
  lookup: ReturnType<typeof buildTraceSlotLookup>,
  alignment: TraceTemplateAlignment,
  baseCalls: string[],
  anchorTemplateIndex: number,
  gapCount: number,
) {
  const orientation = alignment.orientation
  for (let slotIndex = 0; slotIndex < gapCount; slotIndex += 1) {
    const slot = { kind: 'insertion-gap' as const, anchorTemplateIndex, slotIndex }
    const column = resolveTraceColumnAtMergedSlotFromLookup(lookup, slot)
    if (!column) continue
    const base = traceBaseForColumn(column, baseCalls, orientation)
    if (!base || base === '-') continue
    const templateIndex = anchorTemplateIndex < 0 ? 0 : anchorTemplateIndex
    chars.push({ base, templateIndex })
  }
}

/** Left-to-right layout sequence including trace insertions for variant-aware site search. */
export function buildTraceLayoutSequenceChars(
  _templateSequence: string,
  mergedLayout: MergedInsertionLayout,
  alignment: TraceTemplateAlignment,
  baseCalls: string[],
): LayoutSequenceChar[] {
  const lookup = buildTraceSlotLookup(alignment)
  const orientation = alignment.orientation
  const chars: LayoutSequenceChar[] = []
  const { templateStart, templateEnd } = alignment

  if (templateStart === 0) {
    pushTraceLayoutChars(
      chars,
      lookup,
      alignment,
      baseCalls,
      -1,
      mergedLayout.anchorInsertionCounts.get(-1) ?? 0,
    )
  }

  for (let templateIndex = templateStart; templateIndex < templateEnd; templateIndex += 1) {
    const column = lookup.templateColumns.get(templateIndex)
    let base: string | null = null
    if (column?.kind === 'match') {
      base = traceBaseForColumn(column, baseCalls, orientation)
    } else if (column?.kind === 'deletion') {
      base = null
    }
    if (base && base !== '-') {
      chars.push({ base, templateIndex })
    }

    pushTraceLayoutChars(
      chars,
      lookup,
      alignment,
      baseCalls,
      templateIndex,
      mergedLayout.anchorInsertionCounts.get(templateIndex) ?? 0,
    )
  }

  return chars
}

function mapLayoutSiteToTemplateCoordinates(site: RestrictionSite, chars: LayoutSequenceChar[]): RestrictionSite {
  const mapIndex = (effIndex: number) => {
    const safeIndex = Math.max(0, Math.min(chars.length - 1, effIndex))
    return chars[safeIndex]?.templateIndex ?? 0
  }
  const start = mapIndex(site.start)
  const endAnchor = mapIndex(site.end > site.start ? site.end - 1 : site.end)
  const end = Math.max(start + 1, endAnchor + 1)
  return {
    ...site,
    start,
    end,
    cutTop: mapIndex(site.cutTop),
    cutBottom: mapIndex(site.cutBottom),
  }
}

export function buildTraceDerivedRestrictionSites(
  reference: SequenceRecord,
  alignment: TraceTemplateAlignment,
  baseCalls: string[],
  mergedLayout: MergedInsertionLayout,
  enzymePool: RestrictionEnzyme[],
): RestrictionSite[] {
  const layoutChars = buildTraceLayoutSequenceChars(reference.sequence, mergedLayout, alignment, baseCalls)
  const layoutSequence = layoutChars.map((entry) => entry.base).join('')
  const derivedTemplateSequence = buildTraceDerivedTemplateSequence(reference.sequence, alignment, baseCalls)
  const sites = findRestrictionSites(layoutSequence, enzymePool, {
    construct: reference.construct,
    topology: reference.topology,
  }).map((site) => mapLayoutSiteToTemplateCoordinates(site, layoutChars))
  return annotateRestrictionSiteMethylation(
    sites,
    derivedTemplateSequence,
    reference.construct,
    reference.topology,
  )
}

export function buildTraceDerivedPrimerFrameDisplays(
  reference: SequenceRecord,
  alignment: TraceTemplateAlignment,
  baseCalls: string[],
  hybridization?: Parameters<typeof resolvePrimerFrameDisplays>[1],
): PrimerFrameDisplay[] {
  const derivedTemplateSequence = buildTraceDerivedTemplateSequence(reference.sequence, alignment, baseCalls)
  return resolvePrimerFrameDisplays({ ...reference, sequence: derivedTemplateSequence }, hybridization)
}

export type TraceAnnotationRenderContext = {
  templateSequence: string
  restrictionSites: RestrictionSite[]
  primerFrameDisplays: PrimerFrameDisplay[]
  translationByFeatureId: Map<string, FeatureTranslationCell[]>
}

export function buildTraceDerivedTranslationByFeatureId(
  features: SequenceFeature[],
  mergedLayout: MergedInsertionLayout,
  alignment: TraceTemplateAlignment,
  baseCalls: string[],
): Map<string, FeatureTranslationCell[]> {
  const layoutSlots = buildTraceLayoutSlots(mergedLayout, alignment, baseCalls)
  const map = new Map<string, FeatureTranslationCell[]>()
  features.forEach((feature) => {
    if (!feature.translateInSequenceView || !feature.translation) return
    const cells = computeTraceLayoutFeatureTranslationCells(feature, layoutSlots, alignment, feature.translation)
    if (cells.length) map.set(feature.id, cells)
  })
  return map
}

export function buildTraceAnnotationRenderContext(
  reference: SequenceRecord,
  trace: TraceFileRecord,
  mergedLayout: MergedInsertionLayout,
  enzymePool: RestrictionEnzyme[],
  annotationFeatures: SequenceFeature[],
  hybridization?: Parameters<typeof resolvePrimerFrameDisplays>[1],
): TraceAnnotationRenderContext | null {
  const alignment = trace.alignment
  if (!alignment) return null
  const baseCalls = trace.chromatogram.baseCalls
  const templateSequence = buildTraceDerivedTemplateSequence(reference.sequence, alignment, baseCalls)
  const restrictionSites = filterRestrictionSitesToAlignmentSpan(
    buildTraceDerivedRestrictionSites(reference, alignment, baseCalls, mergedLayout, enzymePool),
    alignment,
  )
  return {
    templateSequence,
    restrictionSites,
    primerFrameDisplays: buildTraceDerivedPrimerFrameDisplays(reference, alignment, baseCalls, hybridization).filter(
      (display) => display.templateSpanEnd > alignment.templateStart && display.templateSpanStart < alignment.templateEnd,
    ),
    translationByFeatureId: buildTraceDerivedTranslationByFeatureId(
      annotationFeatures,
      mergedLayout,
      alignment,
      baseCalls,
    ),
  }
}

/** Synthetic sequence record for rendering a trace read with reference annotations mapped onto trace coordinates. */
export function buildTraceAnnotationRecord(
  reference: SequenceRecord,
  trace: TraceFileRecord,
): SequenceRecord | null {
  const alignment = trace.alignment
  if (!alignment) return null
  return {
    ...reference,
    id: `${reference.id}-trace-${trace.id}`,
    name: trace.fileName,
    description: trace.fileName,
    sequence: trace.sequence,
    topology: 'linear',
    features: remapFeaturesToTrace(reference.features, alignment),
    primers: remapPrimersToTrace(reference.primers, alignment),
  }
}

import { defaultPrimerHybridizationParams, type PrimerHybridizationParams } from './primerHybridization'
import { resolveDisplayableLayoutsForPrimer } from './primerSequenceLayout'
import { createId, featureBounds, normalizeDna, sanitizeDna } from './sequence'
import type { Primer, PrimerBindingLayout, SequenceFeature, SequenceRecord } from './types'

export type RichClipboardFeature = SequenceFeature & {
  /** Original feature id in the source record (used to avoid duplicating on in-feature paste). */
  sourceFeatureId: string
}

export type RichClipboardFragment = {
  id: string
  fromTabId: string
  fromRecordId: string
  fromRecordName: string
  sequence: string
  rangeStart: number
  rangeEnd: number
  features: RichClipboardFeature[]
  primers: Primer[]
  copiedAt: string
}

export function layoutOverlapsRange(layout: PrimerBindingLayout, start: number, end: number) {
  return Math.max(layout.templateStart, start) < Math.min(layout.templateEnd, end)
}

export function clipFeaturesForRange(features: SequenceFeature[], start: number, end: number): SequenceFeature[] {
  return clipFeaturesForRichClipboard(features, start, end).map(stripRichClipboardFeatureMeta)
}

function clipFeatureToRange(
  feature: SequenceFeature,
  start: number,
  end: number,
): RichClipboardFeature | null {
  const clipped = {
    ...feature,
    id: createId('feat'),
    cleavageArrows: feature.cleavageArrows
      ?.map((position) => position - start)
      .filter((position) => position >= 0 && position < end - start),
    locations: feature.locations
      .map((location) => {
        const locStart = Math.max(location.start, start)
        const locEnd = Math.min(location.end, end)
        if (locEnd <= locStart) return null
        return {
          ...location,
          start: locStart - start,
          end: locEnd - start,
        }
      })
      .filter((location): location is NonNullable<typeof location> => Boolean(location)),
  }
  if (!clipped.locations.length) return null
  return { ...clipped, sourceFeatureId: feature.id }
}

export function clipFeaturesForRichClipboard(
  features: SequenceFeature[],
  start: number,
  end: number,
): RichClipboardFeature[] {
  return features.flatMap((feature) => {
    const clipped = clipFeatureToRange(feature, start, end)
    return clipped ? [clipped] : []
  })
}

function stripRichClipboardFeatureMeta(feature: RichClipboardFeature): SequenceFeature {
  const { sourceFeatureId: _sourceFeatureId, ...recordFeature } = feature
  void _sourceFeatureId
  return recordFeature
}

function featureRangeFullyContained(innerStart: number, innerEnd: number, container: SequenceFeature) {
  const containerBounds = featureBounds(container)
  return innerStart >= containerBounds.start && innerEnd <= containerBounds.end
}

function pastedFeatureRedundantWithExisting(record: SequenceRecord, pastedFeature: RichClipboardFeature) {
  const pastedBounds = featureBounds(pastedFeature)
  const sourceFeature = record.features.find((feature) => feature.id === pastedFeature.sourceFeatureId)
  if (sourceFeature && featureRangeFullyContained(pastedBounds.start, pastedBounds.end, sourceFeature)) {
    return true
  }
  return record.features.some(
    (existing) =>
      existing.name === pastedFeature.name &&
      existing.type === pastedFeature.type &&
      featureRangeFullyContained(pastedBounds.start, pastedBounds.end, existing),
  )
}

export function clipBindingLayoutToRange(
  layout: PrimerBindingLayout,
  clipStart: number,
  clipEnd: number,
): PrimerBindingLayout | null {
  const start = Math.max(layout.templateStart, clipStart)
  const end = Math.min(layout.templateEnd, clipEnd)
  if (end <= start) return null

  const shift = -clipStart
  const components = layout.components.flatMap((component) => {
    if (component.templateStart === undefined) {
      return [component]
    }
    const componentStart = component.templateStart
    const componentEnd = component.templateEnd ?? componentStart + component.primerBases.length
    const intersectStart = Math.max(componentStart, clipStart)
    const intersectEnd = Math.min(componentEnd, clipEnd)
    if (intersectEnd <= intersectStart) return []
    const trimLeft = intersectStart - componentStart
    const trimRight = componentEnd - intersectEnd
    const primerBases = component.primerBases.slice(trimLeft, component.primerBases.length - trimRight)
    if (!primerBases) return []
    return [{
      primerBases,
      templateStart: intersectStart + shift,
      templateEnd: intersectEnd + shift,
    }]
  })
  if (!components.some((component) => component.templateStart !== undefined)) return null
  return {
    ...layout,
    templateStart: start + shift,
    templateEnd: end + shift,
    components,
  }
}

export function clipPrimersForRange(
  template: string,
  primers: Primer[],
  start: number,
  end: number,
  hybridization: PrimerHybridizationParams = defaultPrimerHybridizationParams,
): Primer[] {
  const clipped: Primer[] = []
  for (const primer of primers) {
    const bindings = resolveDisplayableLayoutsForPrimer(template, primer, hybridization)
      .filter((layout) => layoutOverlapsRange(layout, start, end))
      .flatMap((layout) => {
        const next = clipBindingLayoutToRange(layout, start, end)
        return next ? [next] : []
      })
    if (!bindings.length) continue
    clipped.push({
      ...primer,
      id: createId('primer'),
      bindings,
    })
  }
  return clipped
}

export function buildRichClipboardFragment(
  record: SequenceRecord,
  rangeStart: number,
  rangeEnd: number,
  hybridization: PrimerHybridizationParams = defaultPrimerHybridizationParams,
): Omit<RichClipboardFragment, 'id' | 'fromTabId' | 'fromRecordId' | 'fromRecordName' | 'copiedAt'> | null {
  if (rangeEnd <= rangeStart || record.molecule !== 'dna') return null
  const sequence = sanitizeDna(record.sequence.slice(rangeStart, rangeEnd))
  if (!sequence) return null
  return {
    sequence,
    rangeStart,
    rangeEnd,
    features: clipFeaturesForRichClipboard(record.features, rangeStart, rangeEnd),
    primers: clipPrimersForRange(record.sequence, record.primers, rangeStart, rangeEnd, hybridization),
  }
}

export function shiftFeatureToOffset(feature: RichClipboardFeature, offset: number): RichClipboardFeature {
  return {
    ...feature,
    id: createId('feat'),
    cleavageArrows: feature.cleavageArrows?.map((position) => position + offset),
    locations: feature.locations.map((location) => ({
      ...location,
      start: location.start + offset,
      end: location.end + offset,
    })),
  }
}

export function shiftPrimerToOffset(primer: Primer, offset: number): Primer {
  if (!primer.bindings?.length) {
    return { ...primer, id: createId('primer') }
  }
  return {
    ...primer,
    id: createId('primer'),
    bindings: primer.bindings.map((layout) => ({
      ...layout,
      templateStart: layout.templateStart + offset,
      templateEnd: layout.templateEnd + offset,
      components: layout.components.map((component) =>
        component.templateStart === undefined
          ? component
          : {
              ...component,
              templateStart: component.templateStart + offset,
              templateEnd: component.templateEnd === undefined ? undefined : component.templateEnd + offset,
            },
      ),
    })),
  }
}

export function mergeRichClipboardAnnotations(
  record: SequenceRecord,
  fragment: RichClipboardFragment,
  insertAt: number,
): Pick<SequenceRecord, 'features' | 'primers'> {
  const pastedFeatures = fragment.features
    .map((feature) => shiftFeatureToOffset(feature, insertAt))
    .filter((feature) => !pastedFeatureRedundantWithExisting(record, feature))
    .map(stripRichClipboardFeatureMeta)
  const existingSequences = new Set(record.primers.map((primer) => normalizeDna(primer.sequence)).filter(Boolean))
  const pastedPrimers = fragment.primers
    .map((primer) => shiftPrimerToOffset(primer, insertAt))
    .filter((primer) => {
      const sequence = normalizeDna(primer.sequence)
      return sequence && !existingSequences.has(sequence)
    })
  return {
    features: [...record.features, ...pastedFeatures],
    primers: [...record.primers, ...pastedPrimers],
  }
}

export function richClipboardMatchesPasteText(fragment: RichClipboardFragment, pasteText: string) {
  return normalizeDna(fragment.sequence) === normalizeDna(sanitizeDna(pasteText))
}

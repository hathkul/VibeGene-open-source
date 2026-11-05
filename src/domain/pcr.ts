import { calculateAnnealTemperature } from './primerThermodynamics'
import { defaultPrimerHybridizationParams } from './primerHybridization'
import {
  refreshExactPrimerBindings,
  resolveDisplayableLayoutsForPrimer,
} from './primerSequenceLayout'
import { snapshotParentalHistoryNode } from './snapgeneHistoryExport'
import { firstTranslatedCodonPosition, readingFrameFromTranslationAnchor, readingFramePreservingAminoAcids } from './cdsTranslationFrame'
import { addOperation, createId, extractRange, normalizeDna, nowIso, reverseComplement } from './sequence'
import type {
  DnaEnds,
  HistoryFeature,
  HistoryNode,
  Primer,
  PrimerBindingLayout,
  SequenceFeature,
  SequenceRecord,
} from './types'

export type PcrPolymeraseMode = 'blunt' | 'a-overhang' | 'g-overhang'

/**
 * Above this size conventional PCR is unusual enough that creating a product
 * from a broad selection is frequently an accidental full-plasmid amplicon.
 * Long-range PCR remains supported after the caller explicitly acknowledges it.
 */
export const PCR_PRODUCT_ACKNOWLEDGEMENT_BP = 20_000

export function requiresPcrProductAcknowledgement(productSize: number): boolean {
  return Number.isFinite(productSize) && productSize > PCR_PRODUCT_ACKNOWLEDGEMENT_BP
}

export function pcrProductAcknowledgementMessage(productSizes: readonly number[]): string | null {
  const longProducts = productSizes.filter(requiresPcrProductAcknowledgement)
  if (!longProducts.length) return null
  const largest = Math.max(...longProducts)
  const label = longProducts.length === 1 ? 'This PCR product is' : `${longProducts.length} PCR products are`
  return `${label} unusually large (up to ${largest.toLocaleString()} bp). Confirm that this is intentional long-range PCR before continuing.`
}

export type PcrPrimerInput = {
  name: string
  sequence: string
  phosphorylated: boolean
  /** When set (e.g. primer picked from the template), preserved on the PCR product. */
  color?: string
}

export type PcrAmplicon = {
  id: string
  regionStart: number
  regionEnd: number
  productSize: number
  sequence: string
  forwardAnnealStart: number
  forwardAnnealEnd: number
  reverseAnnealStart: number
  reverseAnnealEnd: number
}

function annealedBounds(layout: PrimerBindingLayout) {
  const annealed = layout.components.filter(
    (component): component is Required<Pick<typeof component, 'templateStart' | 'templateEnd'>> & {
      primerBases: string
    } => component.templateStart !== undefined && component.templateEnd !== undefined,
  )
  if (!annealed.length) {
    return { start: layout.templateStart, end: layout.templateEnd }
  }
  return {
    start: Math.min(...annealed.map((component) => component.templateStart)),
    end: Math.max(...annealed.map((component) => component.templateEnd)),
  }
}

function resolvePcrPrimerColor(
  input: PcrPrimerInput,
  template: SequenceRecord | undefined,
  fallback: string,
) {
  if (input.color) return input.color
  const sequence = normalizeDna(input.sequence)
  const source = template?.primers.find(
    (primer) =>
      primer.name === input.name || (sequence.length > 0 && normalizeDna(primer.sequence) === sequence),
  )
  return source?.color || fallback
}

function primerForLayout(input: PcrPrimerInput, template?: SequenceRecord): Primer {
  const sequence = normalizeDna(input.sequence)
  const source = template?.primers.find((primer) => normalizeDna(primer.sequence) === sequence)
  return {
    id: createId('primer'),
    name: input.name,
    sequence,
    color: resolvePcrPrimerColor(input, template, '#2563eb'),
    bindings: source?.bindings,
  }
}

function compareAmplicons(left: PcrAmplicon, right: PcrAmplicon) {
  return (
    left.regionStart - right.regionStart ||
    left.regionEnd - right.regionEnd ||
    left.productSize - right.productSize ||
    left.sequence.localeCompare(right.sequence)
  )
}

export function listPcrAmplicons(
  template: SequenceRecord,
  forwardInput: PcrPrimerInput,
  reverseInput: PcrPrimerInput,
): PcrAmplicon[] {
  const forwardSequence = normalizeDna(forwardInput.sequence)
  const reverseSequence = normalizeDna(reverseInput.sequence)
  if (!forwardSequence || !reverseSequence) return []

  const templateSequence = normalizeDna(template.sequence)
  const forwardPrimer = primerForLayout(forwardInput, template)
  const reversePrimer = primerForLayout(reverseInput, template)
  const forwardLayouts = resolveDisplayableLayoutsForPrimer(
    templateSequence,
    forwardPrimer,
    defaultPrimerHybridizationParams,
  ).filter((layout) => layout.strand === 'forward')
  const reverseLayouts = resolveDisplayableLayoutsForPrimer(
    templateSequence,
    reversePrimer,
    defaultPrimerHybridizationParams,
  ).filter((layout) => layout.strand === 'reverse')

  const amplicons: PcrAmplicon[] = []
  const seen = new Set<string>()

  for (const forward of forwardLayouts) {
    const forwardBounds = annealedBounds(forward)
    for (const reverse of reverseLayouts) {
      const reverseBounds = annealedBounds(reverse)
      if (template.topology === 'linear' && forwardBounds.end > reverseBounds.start) continue
      const middle = extractRange(templateSequence, forwardBounds.end, reverseBounds.start)
      const productSequence = forwardSequence + middle + reverseComplement(reverseSequence)
      const regionStart = forwardBounds.start
      const regionEnd = reverseBounds.end
      const key = `${regionStart}:${regionEnd}:${productSequence}`
      if (seen.has(key)) continue
      seen.add(key)
      amplicons.push({
        id: `amp:${regionStart}:${regionEnd}:${productSequence.length}:${forwardBounds.start}:${forwardBounds.end}:${reverseBounds.start}:${reverseBounds.end}`,
        regionStart,
        regionEnd,
        productSize: productSequence.length,
        sequence: productSequence,
        forwardAnnealStart: forwardBounds.start,
        forwardAnnealEnd: forwardBounds.end,
        reverseAnnealStart: reverseBounds.start,
        reverseAnnealEnd: reverseBounds.end,
      })
    }
  }

  return amplicons.sort(compareAmplicons)
}

export type FacingPrimerBindingHint = {
  primerId: string
  strand: 'forward' | 'reverse'
  start: number
  end: number
}

/**
 * When exactly two primers are multi-selected and they form a PCR pair
 * (one forward anneal followed by one reverse anneal), return the template
 * range that would be amplified — inclusive of both anneal regions.
 * On circular templates, `end < start` encodes a wrap through the origin.
 */
export function ampliconRangeForFacingPrimerSelection(
  topology: SequenceRecord['topology'],
  sequenceLength: number,
  selectedPrimerIds: string[],
  bindings: FacingPrimerBindingHint[],
): { start: number; end: number } | null {
  if (selectedPrimerIds.length !== 2 || sequenceLength <= 0) return null
  const [idA, idB] = selectedPrimerIds
  const sitesA = bindings.filter((binding) => binding.primerId === idA)
  const sitesB = bindings.filter((binding) => binding.primerId === idB)
  if (!sitesA.length || !sitesB.length) return null

  let best: { start: number; end: number; length: number } | null = null
  for (const a of sitesA) {
    for (const b of sitesB) {
      if (a.strand === b.strand) continue
      const forward = a.strand === 'forward' ? a : b
      const reverse = a.strand === 'forward' ? b : a
      if (topology === 'linear' && forward.end > reverse.start) continue
      const start = forward.start
      const end = reverse.end
      if (start === end) continue
      const length = start <= end ? end - start : sequenceLength - start + end
      if (length <= 0 || length > sequenceLength) continue
      if (!best || length < best.length) best = { start, end, length }
    }
  }
  return best ? { start: best.start, end: best.end } : null
}

/**
 * Build a PCR amplicon for primers designed against a known amplify window
 * (e.g. Gibson insert primers with long 5′ homology). Soft hybridization can
 * miss the intended pair when homology resembles the template, so match the
 * 3′ of each oligo to the amplify ends and synthesize the product directly.
 */
export function directedPcrAmpliconForRange(
  template: SequenceRecord,
  range: { start: number; end: number },
  forwardInput: PcrPrimerInput,
  reverseInput: PcrPrimerInput,
): PcrAmplicon | null {
  const forwardSequence = normalizeDna(forwardInput.sequence)
  const reverseSequence = normalizeDna(reverseInput.sequence)
  const templateSequence = normalizeDna(template.sequence)
  if (!forwardSequence || !reverseSequence || !templateSequence) return null

  const start = Math.max(0, Math.min(templateSequence.length - 1, Math.floor(range.start)))
  const end = Math.max(start + 1, Math.min(templateSequence.length, Math.floor(range.end)))
  const region = extractRange(templateSequence, start, end)
  if (region.length < 18) return null

  const forwardAnnealLen = longestMatchingPrimerSuffix(forwardSequence, region)
  const reverseAnnealLen = longestMatchingPrimerSuffix(
    reverseSequence,
    reverseComplement(region),
  )
  if (forwardAnnealLen < 15 || reverseAnnealLen < 15) return null

  const forwardAnnealStart = start
  const forwardAnnealEnd = start + forwardAnnealLen
  const reverseAnnealEnd = end
  const reverseAnnealStart = end - reverseAnnealLen
  // Never wrap the long way around a circular plasmid for a directed (non-wrapping) range.
  if (forwardAnnealEnd > reverseAnnealStart) return null

  const middle = extractRange(templateSequence, forwardAnnealEnd, reverseAnnealStart)
  const productSequence = forwardSequence + middle + reverseComplement(reverseSequence)
  return {
    id: `amp:directed:${forwardAnnealStart}:${reverseAnnealEnd}:${productSequence.length}`,
    regionStart: forwardAnnealStart,
    regionEnd: reverseAnnealEnd,
    productSize: productSequence.length,
    sequence: productSequence,
    forwardAnnealStart,
    forwardAnnealEnd,
    reverseAnnealStart,
    reverseAnnealEnd,
  }
}

/** Prefer an amplicon whose annealed window matches a user-selected amplify range. */
export function pickAmpliconForAmplifyRange(
  amplicons: PcrAmplicon[],
  range: { start: number; end: number } | null | undefined,
  toleranceBp = 12,
): PcrAmplicon | null {
  if (!range || amplicons.length === 0) return amplicons[0] ?? null
  const expectedLen = Math.max(0, range.end - range.start)
  const scored = amplicons
    .map((amplicon) => {
      const startDelta = Math.abs(amplicon.regionStart - range.start)
      const endDelta = Math.abs(amplicon.regionEnd - range.end)
      const lengthDelta = Math.abs(amplicon.regionEnd - amplicon.regionStart - expectedLen)
      return { amplicon, score: startDelta + endDelta + lengthDelta }
    })
    .sort((left, right) => left.score - right.score)
  const best = scored[0]
  if (!best) return null
  if (best.score <= toleranceBp * 2) return best.amplicon
  return null
}

/** Longest 3′ primer suffix that exactly matches the 5′ of a template slice. */
function longestMatchingPrimerSuffix(primer: string, templateFromBindSite: string): number {
  const max = Math.min(primer.length, templateFromBindSite.length)
  for (let length = max; length >= 15; length -= 1) {
    if (primer.slice(-length) === templateFromBindSite.slice(0, length)) return length
  }
  return 0
}

function pcrProductEnds(
  mode: PcrPolymeraseMode,
  forwardPhosphorylated: boolean,
  reversePhosphorylated: boolean,
): DnaEnds {
  const stickiness = mode === 'blunt' ? 0 : -1
  return {
    upstream: {
      modification: forwardPhosphorylated ? 'fivePrimePhosphorylated' : 'unmodified',
      stickiness,
    },
    downstream: {
      modification: reversePhosphorylated ? 'fivePrimePhosphorylated' : 'unmodified',
      stickiness,
    },
  }
}

function circularOffset(from: number, to: number, length: number) {
  if (length <= 0) return 0
  return ((to - from) % length + length) % length
}

function circularDistance(start: number, end: number, length: number) {
  if (length <= 0) return 0
  if (start === end) return 0
  return circularOffset(start, end, length)
}

/** Half-open arc [start, end) on a circular (or linear) template. */
function indexOnArc(index: number, start: number, end: number, length: number) {
  if (length <= 0) return false
  if (start === end) return false
  if (start < end) return index >= start && index < end
  return index >= start || index < end
}

function polymeraseLabel(mode: PcrPolymeraseMode) {
  if (mode === 'blunt') return 'Creates blunt ends'
  if (mode === 'g-overhang') return "Creates 3' G overhangs"
  return "Creates 3' A overhangs"
}

function historyFileName(name: string) {
  return name.toLowerCase().endsWith('.dna') ? name : `${name}.dna`
}

/**
 * Map a template coordinate into the PCR product.
 * Product layout: [5′ fwd overhang][template regionStart→regionEnd][3′ rev overhang].
 */
export function mapTemplateIndexToPcrProduct(
  templateIndex: number,
  amplicon: PcrAmplicon,
  forwardPrimerLength: number,
  _reversePrimerLength: number,
  templateLength: number,
): number | null {
  const regionStart = amplicon.regionStart
  const regionEnd = amplicon.regionEnd
  if (!indexOnArc(templateIndex, regionStart, regionEnd, templateLength)) return null

  const fwdAnnealLen = circularDistance(
    amplicon.forwardAnnealStart,
    amplicon.forwardAnnealEnd,
    templateLength,
  )
  const fwdOverhang = Math.max(0, forwardPrimerLength - fwdAnnealLen)
  return fwdOverhang + circularOffset(regionStart, templateIndex, templateLength)
}

function clipIntervalToAmplicon(
  start: number,
  end: number,
  amplicon: PcrAmplicon,
  forwardPrimerLength: number,
  reversePrimerLength: number,
  templateLength: number,
): { start: number; end: number }[] {
  if (end <= start || templateLength <= 0) return []
  const spans: { start: number; end: number }[] = []
  // Sample the feature interval in template coordinates; coalesce contiguous product hits.
  let spanStart: number | null = null
  let spanEnd: number | null = null
  const flush = () => {
    if (spanStart === null || spanEnd === null) return
    spans.push({ start: spanStart, end: spanEnd })
    spanStart = null
    spanEnd = null
  }
  for (let index = start; index < end; index += 1) {
    const mapped = mapTemplateIndexToPcrProduct(
      index,
      amplicon,
      forwardPrimerLength,
      reversePrimerLength,
      templateLength,
    )
    if (mapped === null) {
      flush()
      continue
    }
    if (spanStart === null) {
      spanStart = mapped
      spanEnd = mapped + 1
      continue
    }
    if (mapped === spanEnd) {
      spanEnd = mapped + 1
      continue
    }
    flush()
    spanStart = mapped
    spanEnd = mapped + 1
  }
  flush()
  return spans
}

function clipFeaturesToAmplicon(
  features: SequenceFeature[],
  amplicon: PcrAmplicon,
  forwardPrimerLength: number,
  reversePrimerLength: number,
  templateLength: number,
): SequenceFeature[] {
  const result: SequenceFeature[] = []
  for (const feature of features) {
    if (feature.visible === false) continue
    const locations = feature.locations.flatMap((location) => {
      if (location.end <= location.start) return []
      return clipIntervalToAmplicon(
        location.start,
        location.end,
        amplicon,
        forwardPrimerLength,
        reversePrimerLength,
        templateLength,
      ).map((span) => ({ ...span, strand: location.strand }))
    })
    if (!locations.length) continue
    const nextFeature: SequenceFeature = {
      ...feature,
      id: createId('feat'),
      sourceFeatureId: feature.sourceFeatureId ?? feature.id,
      locations,
    }
    const translatedFeature = feature.translation ? { locations: feature.locations, translation: feature.translation } : null
    if (translatedFeature && nextFeature.translation) {
      const sourceAnchor = feature.sourceTranslationAnchor ?? firstTranslatedCodonPosition(translatedFeature)
      const anchor = mapTemplateIndexToPcrProduct(
        sourceAnchor,
        amplicon,
        forwardPrimerLength,
        reversePrimerLength,
        templateLength,
      )
      if (anchor !== null) nextFeature.sourceTranslationAnchor = anchor
      nextFeature.translation = {
        ...nextFeature.translation,
        readingFrame:
          anchor === null
            ? readingFramePreservingAminoAcids(translatedFeature, locations)
            : readingFrameFromTranslationAnchor(anchor, locations[0]!.strand, locations),
      }
    }
    result.push(nextFeature)
  }
  return result
}

function shiftBinding(binding: PrimerBindingLayout, mapIndex: (index: number) => number | null): PrimerBindingLayout | null {
  const lo = Math.min(binding.templateStart, binding.templateEnd)
  const hi = Math.max(binding.templateStart, binding.templateEnd)
  if (hi <= lo) return null

  const mapped: number[] = []
  for (let index = lo; index < hi; index += 1) {
    const next = mapIndex(index)
    if (next !== null) mapped.push(next)
  }
  if (!mapped.length) return null

  const templateStart = Math.min(...mapped)
  const templateEnd = Math.max(...mapped) + 1
  const components = binding.components.map((component) => {
    if (component.templateStart === undefined || component.templateEnd === undefined) {
      return { ...component }
    }
    const cLo = Math.min(component.templateStart, component.templateEnd)
    const cHi = Math.max(component.templateStart, component.templateEnd)
    const cMapped: number[] = []
    for (let index = cLo; index < cHi; index += 1) {
      const next = mapIndex(index)
      if (next !== null) cMapped.push(next)
    }
    if (!cMapped.length) return { primerBases: component.primerBases }
    return {
      ...component,
      templateStart: Math.min(...cMapped),
      templateEnd: Math.max(...cMapped) + 1,
    }
  })
  return {
    ...binding,
    templateStart,
    templateEnd,
    components,
  }
}

function clipPrimersToAmplicon(
  primers: Primer[],
  amplicon: PcrAmplicon,
  forwardPrimerLength: number,
  reversePrimerLength: number,
  templateLength: number,
): Primer[] {
  const mapIndex = (index: number) =>
    mapTemplateIndexToPcrProduct(index, amplicon, forwardPrimerLength, reversePrimerLength, templateLength)
  const result: Primer[] = []
  for (const primer of primers) {
    if (primer.visible === false) continue
    const bindings = (primer.bindings ?? [])
      .map((binding) => shiftBinding(binding, mapIndex))
      .filter((binding): binding is PrimerBindingLayout => Boolean(binding))
    if (!bindings.length && primer.bindings && primer.bindings.length > 0) continue
    result.push({
      ...primer,
      id: createId('primer'),
      bindings: bindings.length ? bindings : primer.bindings?.length ? [] : undefined,
    })
  }
  return result
}

function historyFeaturesFromProduct(features: SequenceFeature[]): HistoryFeature[] {
  return features.map((feature) => ({
    name: feature.name,
    type: feature.type,
    color: feature.color,
    strand: feature.locations[0]?.strand ?? 'forward',
    segments: feature.locations.map((location) => ({ start: location.start, end: location.end })),
  }))
}

function parentalHistoryNode(record: SequenceRecord): HistoryNode {
  return snapshotParentalHistoryNode(record)
}

function buildPcrHistory(args: {
  productName: string
  productSequence: string
  template: SequenceRecord
  forwardPrimer: PcrPrimerInput
  reversePrimer: PcrPrimerInput
  polymerase: PcrPolymeraseMode
  features: SequenceFeature[]
  primers: Primer[]
  amplicon: PcrAmplicon
}): HistoryNode {
  const {
    productName,
    productSequence,
    template,
    forwardPrimer,
    reversePrimer,
    polymerase,
    features,
    primers,
    amplicon,
  } = args
  return {
    id: createId('history'),
    name: historyFileName(productName),
    seqLen: productSequence.length,
    circular: false,
    operation: 'amplifyFragment',
    resurrectable: false,
    hideHistory: false,
    polymerase: polymeraseLabel(polymerase),
    oligos: [
      {
        name: forwardPrimer.name || 'Primer 1',
        sequence: normalizeDna(forwardPrimer.sequence),
      },
      {
        name: reversePrimer.name || 'Primer 2',
        sequence: normalizeDna(reversePrimer.sequence),
      },
    ],
    regeneratedSites: [],
    inputSummaries: [
      {
        manipulation: 'amplify',
        name1: forwardPrimer.name || 'Primer 1',
        name2: reversePrimer.name || 'Primer 2',
        val1: String(amplicon.regionStart + 1),
        val2: String(amplicon.regionEnd),
      },
    ],
    features: historyFeaturesFromProduct(features),
    sequence: productSequence,
    primers,
    children: [parentalHistoryNode(template)],
  }
}

export function createPcrProductRecord(args: {
  template: SequenceRecord
  amplicon: PcrAmplicon
  name: string
  forwardPrimer: PcrPrimerInput
  reversePrimer: PcrPrimerInput
  polymerase: PcrPolymeraseMode
}): SequenceRecord {
  const { template, amplicon, name, forwardPrimer, reversePrimer, polymerase } = args
  const timestamp = nowIso()
  const normalizedName = name.trim().replace(/\.dna$/i, '') || 'Amplified'
  const forwardSequence = normalizeDna(forwardPrimer.sequence)
  const reverseSequence = normalizeDna(reversePrimer.sequence)
  const templateLength = normalizeDna(template.sequence).length

  const inheritedFeatures = clipFeaturesToAmplicon(
    template.features,
    amplicon,
    forwardSequence.length,
    reverseSequence.length,
    templateLength,
  )
  const inheritedPrimers = clipPrimersToAmplicon(
    template.primers,
    amplicon,
    forwardSequence.length,
    reverseSequence.length,
    templateLength,
  )

  const fwdAnnealLen = circularDistance(
    amplicon.forwardAnnealStart,
    amplicon.forwardAnnealEnd,
    templateLength,
  )
  const fwdOverhang = Math.max(0, forwardSequence.length - fwdAnnealLen)
  const pcrPrimers: Primer[] = [
    {
      id: createId('primer'),
      name: forwardPrimer.name || 'Primer 1',
      sequence: forwardSequence,
      color: resolvePcrPrimerColor(forwardPrimer, template, '#2563eb'),
      bindings: [
        {
          strand: 'forward',
          templateStart: fwdOverhang,
          templateEnd: forwardSequence.length,
          components: [
            {
              primerBases: forwardSequence.slice(fwdOverhang),
              templateStart: fwdOverhang,
              templateEnd: forwardSequence.length,
            },
          ],
        },
      ],
    },
    {
      id: createId('primer'),
      name: reversePrimer.name || 'Primer 2',
      sequence: reverseSequence,
      color: resolvePcrPrimerColor(reversePrimer, template, '#db2777'),
      bindings: [
        {
          strand: 'reverse',
          templateStart: amplicon.productSize - reverseSequence.length,
          templateEnd: amplicon.productSize,
          components: [
            {
              primerBases: reverseSequence,
              templateStart: amplicon.productSize - reverseSequence.length,
              templateEnd: amplicon.productSize,
            },
          ],
        },
      ],
    },
  ]

  // Prefer PCR primers; keep parental primers that are not the same sequence/name pair.
  // Refresh inherited complex layouts when the amplicon already encodes their mutations.
  const unclippedInheritedPrimerById = new Map(
    inheritedPrimers.map((primer) => [primer.id, primer] as const),
  )
  const primers = refreshExactPrimerBindings(
    [
      ...pcrPrimers,
      ...inheritedPrimers.filter(
        (primer) =>
          !pcrPrimers.some(
            (pcrPrimer) =>
              pcrPrimer.name === primer.name ||
              normalizeDna(pcrPrimer.sequence) === normalizeDna(primer.sequence),
        ),
      ),
    ],
    amplicon.sequence,
  ).map((primer) => {
    const inherited = unclippedInheritedPrimerById.get(primer.id)
    if (!inherited?.bindings?.length || (primer.bindings?.length ?? 0) > 0) return primer
    return { ...primer, bindings: inherited.bindings }
  })

  const history = buildPcrHistory({
    productName: normalizedName,
    productSequence: amplicon.sequence,
    template,
    forwardPrimer,
    reversePrimer,
    polymerase,
    features: inheritedFeatures,
    primers,
    amplicon,
  })

  const summary = `PCR amplified ${template.name} using ${forwardPrimer.name || 'Primer 1'} and ${reversePrimer.name || 'Primer 2'} (${amplicon.productSize} bp).`
  return addOperation(
    {
      id: createId('seq'),
      name: normalizedName,
      description: `PCR product from ${template.name}`,
      molecule: 'dna',
      topology: 'linear',
      sequence: amplicon.sequence,
      primers,
      features: inheritedFeatures,
      operations: [],
      history,
      dnaEnds: pcrProductEnds(polymerase, forwardPrimer.phosphorylated, reversePrimer.phosphorylated),
      construct: { ...template.construct, syntheticDna: true },
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    'pcr',
    summary,
  )
}

function bestPrimerLength(sequence: string, desiredTm: number) {
  const normalized = normalizeDna(sequence)
  let best = normalized.slice(0, Math.min(25, normalized.length))
  for (let length = 18; length <= Math.min(40, normalized.length); length += 1) {
    const candidate = normalized.slice(0, length)
    const tm = calculateAnnealTemperature(candidate)
    best = candidate
    if (tm.tmMinC !== null && tm.tmMinC >= desiredTm) return candidate
  }
  return best
}

export function designPcrPrimerPair(
  template: SequenceRecord,
  start: number,
  end: number,
  desiredTm: number,
): { forward: PcrPrimerInput; reverse: PcrPrimerInput } {
  const sequence = normalizeDna(template.sequence)
  const amplicon = extractRange(sequence, start, end)
  const forwardSequence = bestPrimerLength(amplicon, desiredTm)
  // First bases of RC(amplicon) are already the reverse primer written 5′→3′.
  const reverseSequence = bestPrimerLength(reverseComplement(amplicon), desiredTm)
  return {
    forward: {
      name: `${template.name}_PCR_F`,
      sequence: forwardSequence,
      phosphorylated: false,
    },
    reverse: {
      name: `${template.name}_PCR_R`,
      sequence: reverseSequence,
      phosphorylated: false,
    },
  }
}

/** Best annealing oligo (18–40 bp) reaching desired Tm from the 5′ end of a template slice. */
export function designAnnealingOligo(templateSlice: string, desiredTm: number): string {
  return bestPrimerLength(normalizeDna(templateSlice), desiredTm)
}

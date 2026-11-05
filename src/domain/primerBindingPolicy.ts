import { findPrimerBindings, normalizeDna, reverseComplement } from './sequence'
import { alignPrimerToTemplate, resolvePrimerBindingLayouts } from './primerAnnealAlignment'
import {
  defaultPrimerHybridizationParams,
  normalizePrimerHybridizationParams,
  type PrimerHybridizationParams,
} from './primerHybridization'
import {
  annealMaskFromBindingLayout,
  basesMatch,
  buildGlyphsFromLayout,
  componentTemplateEnd,
  hasDisplayablePrimerAnneal,
  primerConstructAnnealSequence,
  templateBasePairedWithPrimer,
  terminalContinuousMatchLength,
} from './primerBindingAnalysis'
import type {
  Primer,
  PrimerBinding,
  PrimerBindingLayout,
  PrimerLayoutComponent,
  SequenceRecord,
  Strand,
} from './types'
import { PRIMER_FALLBACK_COLOR, type PrimerEditorAnnealPreview, type PrimerFrameDisplay, type PrimerGlyph } from './primerLayoutTypes'

/** Displayable binding layouts for a primer under hybridization rules. */
export function resolveDisplayableLayoutsForPrimer(
  template: string,
  primer: Primer,
  hybridization: PrimerHybridizationParams = defaultPrimerHybridizationParams,
): PrimerBindingLayout[] {
  const params = normalizePrimerHybridizationParams(hybridization)
  return layoutsForPrimer(normalizeDna(template), primer, params).filter((layout) =>
    hasDisplayablePrimerAnneal(template, layout, params),
  )
}

/** Potential sites that meet the 3′ match rule but fail the display Tm threshold. */
export function resolveCandidateLayoutsForPrimer(
  template: string,
  primer: Primer,
  hybridization: PrimerHybridizationParams = defaultPrimerHybridizationParams,
): PrimerBindingLayout[] {
  const normalized = normalizeDna(template)
  const params = normalizePrimerHybridizationParams(hybridization)
  const stored = (primer.bindings ?? []).filter((binding) => bindingLayoutMatchesPrimerSequence(binding, primer.sequence))
  const exact = findPrimerBindings(normalized, [primer]).map((binding) =>
    bindingLayoutFromMatch(primer.sequence, binding.start, binding.end, binding.strand),
  )
  const eligible = [...exact, ...stored, ...resolvePrimerBindingLayouts(normalized, primer.sequence)]
    .filter((layout) => terminalContinuousMatchLength(normalized, layout, params.allowMismatch) >= params.minContinuousMatchLen)
  return dedupePrimerBindingLayouts(normalized, eligible)
}

function pickPreferredOrBestLayout(
  template: string,
  layouts: PrimerBindingLayout[],
  preferredStrand?: Strand,
) {
  if (!layouts.length) return undefined
  const pool =
    preferredStrand && layouts.some((layout) => layout.strand === preferredStrand)
      ? layouts.filter((layout) => layout.strand === preferredStrand)
      : layouts
  return pool.reduce((best, layout) =>
    layoutAnnealScore(template, layout) > layoutAnnealScore(template, best) ? layout : best,
  )
}

function softLayoutForEditorPreview(
  template: string,
  primerSequence: string,
  preferredStrand?: Strand,
) {
  const strands: Strand[] = preferredStrand
    ? [preferredStrand, preferredStrand === 'forward' ? 'reverse' : 'forward']
    : ['forward', 'reverse']
  let best: ReturnType<typeof alignPrimerToTemplate> = null
  for (const strand of strands) {
    const result = alignPrimerToTemplate(template, primerSequence, strand)
    if (!result) continue
    if (!best || result.score > best.score) best = result
  }
  return best?.layout
}

/**
 * Annealed/unpaired preview for the primer editor. Uses the same displayable layout as
 * the sequence pane when one exists, instead of aligning only `preferredStrand`.
 */
function storedBindingLayout(
  bindings: PrimerBindingLayout[],
  preferredStrand?: Strand,
): PrimerBindingLayout | undefined {
  if (!bindings.length) return undefined
  return bindings.find((binding) => binding.strand === preferredStrand) ?? bindings[0]
}

/**
 * Primer Properties: pair the live oligo against the stored template interval.
 * Does not realign or drop bindings when the written sequence diverges from stored component bases.
 */
export function primerPropertiesAnnealPreview(
  template: string,
  primerSequence: string,
  options?: { preferredStrand?: Strand; bindings?: PrimerBindingLayout[] },
): PrimerEditorAnnealPreview {
  const sequence = normalizeDna(primerSequence)
  const normalized = normalizeDna(template)
  const empty: PrimerEditorAnnealPreview = {
    mask: Array.from({ length: sequence.length }, () => false),
    annealedCount: 0,
    terminalSequence: '',
  }
  if (!sequence || !normalized) return empty
  const layout = options?.bindings?.length ? storedBindingLayout(options.bindings, options.preferredStrand) : undefined
  if (!layout) {
    return { ...empty, mask: sequence.split('').map(() => false) }
  }
  const mask = annealMaskFromBindingLayout(normalized, sequence, layout)
  return {
    mask,
    annealedCount: mask.filter(Boolean).length,
    terminalSequence: primerConstructAnnealSequence(normalized, layout),
    bindings: [layout],
    strand: layout.strand,
  }
}

export function primerEditorAnnealPreview(
  template: string,
  primerSequence: string,
  options?: { preferredStrand?: Strand; bindings?: PrimerBindingLayout[] },
): PrimerEditorAnnealPreview {
  const sequence = normalizeDna(primerSequence)
  const normalized = normalizeDna(template)
  const empty: PrimerEditorAnnealPreview = {
    mask: Array.from({ length: sequence.length }, () => false),
    annealedCount: 0,
    terminalSequence: '',
  }
  if (!sequence || !normalized) return empty

  const matchingBindings = options?.bindings?.filter((binding) => bindingLayoutMatchesPrimerSequence(binding, sequence))
  const primer: Primer = {
    id: 'editor-preview',
    name: 'editor-preview',
    sequence,
    color: PRIMER_FALLBACK_COLOR,
    bindings: matchingBindings?.length ? matchingBindings : undefined,
  }
  const layout =
    pickPreferredOrBestLayout(
      normalized,
      resolveDisplayableLayoutsForPrimer(normalized, primer),
      options?.preferredStrand,
    ) ?? softLayoutForEditorPreview(normalized, sequence, options?.preferredStrand)
  if (!layout) return empty

  const mask = annealMaskFromBindingLayout(normalized, sequence, layout)
  return {
    mask,
    annealedCount: mask.filter(Boolean).length,
    terminalSequence: primerConstructAnnealSequence(normalized, layout),
    bindings: [layout],
    strand: layout.strand,
  }
}

function bindingLayoutFromMatch(
  primerSequence: string,
  start: number,
  end: number,
  strand: Strand,
): PrimerBindingLayout {
  const needle = strand === 'forward' ? primerSequence : reverseComplement(primerSequence)
  const components: PrimerLayoutComponent[] = [{ primerBases: needle, templateStart: start, templateEnd: end }]
  return { strand, templateStart: start, templateEnd: end, components }
}

function templateSpanFromGlyphs(glyphs: PrimerGlyph[]) {
  const indices = glyphs.flatMap((glyph) => (glyph.templateIndex === undefined ? [] : [glyph.templateIndex]))
  if (!indices.length) return { start: 0, end: 0 }
  return { start: Math.min(...indices), end: Math.max(...indices) + 1 }
}

function makeDisplay(
  primer: Primer,
  strand: Strand,
  sequence: string,
  glyphs: PrimerGlyph[],
  selectRange: { start: number; end: number },
): PrimerFrameDisplay {
  const span = templateSpanFromGlyphs(glyphs)
  return {
    primerId: primer.id,
    name: primer.name,
    color: primer.color || '#7c3aed',
    strand,
    sequence,
    glyphs,
    templateSpanStart: span.start,
    templateSpanEnd: span.end,
    selectRange,
  }
}

export function buildPrimerFrameDisplay(
  primer: Primer,
  template: string,
  layout: PrimerBindingLayout,
): PrimerFrameDisplay {
  const refined = refineBindingLayoutInserts(template, layout)
  const glyphs = buildGlyphsFromLayout(template, refined)
  return makeDisplay(primer, refined.strand, primer.sequence, glyphs, {
    start: refined.templateStart,
    end: refined.templateEnd,
  })
}

export function hasComplexPrimerBindings(bindings: PrimerBindingLayout[]) {
  return bindings.some(
    (binding) =>
      binding.components.length > 1 ||
      binding.components.some((component) => component.templateStart === undefined),
  )
}

/** True when layout component bases still describe the written primer oligo (any strand encoding). */
export function bindingLayoutMatchesPrimerSequence(layout: PrimerBindingLayout, primerSequence: string) {
  const parts = layout.components.map((component) => normalizeDna(component.primerBases))
  if (!parts.length || parts.some((part) => !part)) return false
  const forwardJoin = parts.join('')
  const reverseJoin = [...parts].reverse().join('')
  const sequence = normalizeDna(primerSequence)
  if (!sequence) return false
  const rc = reverseComplement(sequence)
  return (
    forwardJoin === sequence ||
    forwardJoin === rc ||
    reverseJoin === sequence ||
    reverseJoin === rc
  )
}

function bindingComponentAnnealMatchesTemplate(
  template: string,
  strand: Strand,
  component: PrimerLayoutComponent & { templateStart: number; templateEnd?: number },
) {
  const templateStart = component.templateStart
  const templateEnd = component.templateEnd ?? templateStart + component.primerBases.length
  const primerBases = component.primerBases
  if (templateEnd - templateStart !== primerBases.length) return false

  for (let index = 0; index < primerBases.length; index += 1) {
    const pairedBase = templateBasePairedWithPrimer(
      strand,
      primerBases,
      template,
      templateStart,
      templateEnd,
      index,
    )
    if (!basesMatch(primerBases[index] ?? 'N', pairedBase)) return false
  }

  return true
}

/**
 * Longest exact DNA prefix match between `needle` and `text` (IUPAC-aware via basesMatch).
 */
function longestExactPrefix(needle: string, text: string) {
  const limit = Math.min(needle.length, text.length)
  let length = 0
  for (; length < limit; length += 1) {
    if (!basesMatch(needle[length] ?? 'N', text[length] ?? 'N')) break
  }
  return length
}

function longestExactSuffix(needle: string, text: string) {
  const limit = Math.min(needle.length, text.length)
  let length = 0
  for (; length < limit; length += 1) {
    if (!basesMatch(needle[needle.length - 1 - length] ?? 'N', text[text.length - 1 - length] ?? 'N')) {
      break
    }
  }
  return length
}

/**
 * Prefer a BamHI-preserving annealed|insert|annealed split for continuous template
 * windows. SnapGene/soft-SW often greedily anneal into a restriction site
 * (`GAGCGAC|TGAG|GATCC` over `GAGCGACGGATCC`). Lock the longest exact 5′-proximal
 * (suffix) anneal first so BamHI stays `GGATCC`, then take the ORF flank — preferring
 * a one-base template notch so the stop codon stays entirely in the insert
 * (`GAGCGA|CTGA|GGATCC` → display `GACT` / `CCTAGG`).
 */
function bestInsertPartition(needle: string, text: string): { left: number; right: number } | null {
  if (!needle || !text) return null
  const right = longestExactSuffix(needle, text)
  if (right <= 0 || right >= needle.length || right >= text.length) return null
  const remNeedle = needle.slice(0, needle.length - right)
  const remText = text.slice(0, text.length - right)
  if (!remNeedle || !remText) return null

  const surplus = remNeedle.length - remText.length
  // Prefer a one-base notch (cloning scar) before collapsing to a gapless greedysplit.
  for (const gap of [1, 0, 2, 3, 4]) {
    if (surplus < 0 && gap === 0) continue
    const left = remText.length - gap
    if (left <= 0 || left > remNeedle.length) continue
    if (longestExactPrefix(remNeedle.slice(0, left), remText.slice(0, left)) !== left) continue
    const insertLen = remNeedle.length - left
    if (insertLen <= 0) continue
    if (surplus >= 0 && insertLen < surplus) continue
    return { left, right }
  }
  return null
}

/**
 * Re-slice internal insert triads so flanking annealed blocks length-match the template
 * without a leftover notch base swallowed into the wrong component.
 */
export function refineBindingLayoutInserts(template: string, layout: PrimerBindingLayout): PrimerBindingLayout {
  const normalizedTemplate = normalizeDna(template)
  const components = [...layout.components]
  let changed = false

  for (let index = 1; index < components.length - 1; index += 1) {
    const previous = components[index - 1]
    const insert = components[index]
    const next = components[index + 1]
    if (!previous || !insert || !next) continue
    if (previous.templateStart === undefined || next.templateStart === undefined) continue
    if (insert.templateStart !== undefined) continue

    const leftStart = previous.templateStart
    const leftEnd = componentTemplateEnd(previous)
    const rightStart = next.templateStart
    const rightEnd = componentTemplateEnd(next)
    const prevLenOk = leftEnd - leftStart === previous.primerBases.length
    const nextLenOk = rightEnd - rightStart === next.primerBases.length
    // Only repair length-mismatched SnapGene/soft flanks (e.g. gatcc over GGATCC).
    // Length-matched duplexes may intentionally contain mismatches under a raised insert.
    if (prevLenOk && nextLenOk) continue

    const spanStart = Math.min(leftStart, rightStart)
    const spanEnd = Math.max(leftEnd, rightEnd)
    if (spanEnd <= spanStart) continue

    const needle = normalizeDna(previous.primerBases + insert.primerBases + next.primerBases)
    const text = normalizedTemplate.slice(spanStart, spanEnd)
    if (!needle || !text) continue

    const partition = bestInsertPartition(needle, text)
    if (!partition) continue

    const leftBases = needle.slice(0, partition.left)
    const insertBases = needle.slice(partition.left, needle.length - partition.right)
    const rightBases = needle.slice(needle.length - partition.right)
    if (!leftBases || !insertBases || !rightBases) continue

    const nextLeftEnd = spanStart + partition.left
    const nextRightStart = spanEnd - partition.right
    // Reject partitions that would reverse or overlap the annealed flanks.
    if (nextRightStart < nextLeftEnd) continue
    if (
      leftBases === normalizeDna(previous.primerBases) &&
      insertBases === normalizeDna(insert.primerBases) &&
      rightBases === normalizeDna(next.primerBases) &&
      leftEnd === nextLeftEnd &&
      rightStart === nextRightStart &&
      rightEnd === spanEnd
    ) {
      continue
    }

    components[index - 1] = {
      primerBases: leftBases,
      templateStart: spanStart,
      templateEnd: nextLeftEnd,
    }
    components[index] = { primerBases: insertBases }
    components[index + 1] = {
      primerBases: rightBases,
      templateStart: nextRightStart,
      templateEnd: spanEnd,
    }
    changed = true
  }

  if (!changed) return layout
  return { ...layout, components }
}

/** SnapGene Component hybridizedRange values are often shifted; fall back to BindingSite location. */
export function reconcileImportedBindingLayout(template: string, layout: PrimerBindingLayout): PrimerBindingLayout {
  const normalizedTemplate = normalizeDna(template)
  const refined = refineBindingLayoutInserts(normalizedTemplate, layout)
  const annealedComponents = refined.components.filter(
    (component): component is PrimerLayoutComponent & { templateStart: number; templateEnd?: number } =>
      component.templateStart !== undefined,
  )
  if (!annealedComponents.length) return refined

  const allMatch = annealedComponents.every((component) =>
    bindingComponentAnnealMatchesTemplate(normalizedTemplate, refined.strand, component),
  )
  if (allMatch) return refined

  if (annealedComponents.length === 1) {
    const annealed = annealedComponents[0]!
    return {
      ...refined,
      components: refined.components.map((component) =>
        component === annealed
          ? {
              ...component,
              templateStart: refined.templateStart,
              templateEnd: refined.templateEnd,
            }
          : component,
      ),
    }
  }

  return refined
}

function layoutsForPrimer(
  template: string,
  primer: Primer,
  params: PrimerHybridizationParams,
): PrimerBindingLayout[] {
  // Exact duplexes win over stored complex layouts. After PCR / mutagenesis / assembly the
  // product sequence already incorporates primer-encoded changes, but parental SnapGene-style
  // bindings still describe mismatches/indels against the old template — prefer a perfect match
  // when one exists so the product map does not keep painting false mismatches.
  const exactLayouts = findPrimerBindings(template, [primer]).map((binding) =>
    bindingLayoutFromMatch(primer.sequence, binding.start, binding.end, binding.strand),
  )
  if (exactLayouts.length) return exactLayouts

  const softLayouts = dedupePrimerBindingLayouts(
    template,
    resolvePrimerBindingLayouts(template, primer.sequence).filter((layout) =>
      hasDisplayablePrimerAnneal(template, layout, params),
    ),
  )

  if (primer.bindings?.length && hasComplexPrimerBindings(primer.bindings)) {
    const complexLayouts = primer.bindings.filter(
      (binding) =>
        bindingLayoutMatchesPrimerSequence(binding, primer.sequence) &&
        hasDisplayablePrimerAnneal(template, binding, params),
    )
    if (complexLayouts.length) {
      if (!softLayouts.length) return complexLayouts
      // Union stored SnapGene geometry with soft alignments, keeping the better layout per
      // locus. A long stored duplex still wins over a short 3′ stub at the same site, but
      // additional soft-found sites (e.g. after pasting a duplicate binding region) are kept.
      return dedupePrimerBindingLayouts(template, [...complexLayouts, ...softLayouts])
    }
  }

  if (softLayouts.length) return softLayouts
  return []
}

function layoutAnnealScore(template: string, layout: PrimerBindingLayout) {
  const glyphs = buildGlyphsFromLayout(template, refineBindingLayoutInserts(template, layout))
  const annealed = glyphs.filter((glyph) => glyph.kind === 'annealed').length
  const defects = glyphs.filter(
    (glyph) =>
      glyph.kind === 'mismatch' || glyph.kind === 'template-gap',
  ).length
  const displayable = hasDisplayablePrimerAnneal(template, layout) ? 1_000 : 0
  return displayable + annealed * 10 - defects * 100
}

function layoutSpanLength(layout: PrimerBindingLayout) {
  return Math.max(0, layout.templateEnd - layout.templateStart)
}

/** Half-open template span for a stored binding layout (`templateStart`/`templateEnd`). */
export function primerBindingLayoutRange(layout: PrimerBindingLayout): { start: number; end: number } {
  return {
    start: Math.min(layout.templateStart, layout.templateEnd),
    end: Math.max(layout.templateStart, layout.templateEnd),
  }
}

function layoutsOverlapStrongly(a: PrimerBindingLayout, b: PrimerBindingLayout) {
  if (a.strand !== b.strand) return false
  const start = Math.max(a.templateStart, b.templateStart)
  const end = Math.min(a.templateEnd, b.templateEnd)
  const overlap = end - start
  if (overlap <= 0) return false
  const shorter = Math.min(layoutSpanLength(a), layoutSpanLength(b))
  return shorter > 0 && overlap / shorter >= 0.5
}

/** Keep one layout per locus; soft aligners often emit near-duplicate offsets. */
export function dedupePrimerBindingLayouts(
  template: string,
  layouts: PrimerBindingLayout[],
): PrimerBindingLayout[] {
  const normalized = normalizeDna(template)
  const kept: PrimerBindingLayout[] = []
  for (const layout of layouts) {
    const rivalIndex = kept.findIndex((candidate) => layoutsOverlapStrongly(candidate, layout))
    if (rivalIndex < 0) {
      kept.push(layout)
      continue
    }
    const rival = kept[rivalIndex]!
    if (layoutAnnealScore(normalized, layout) > layoutAnnealScore(normalized, rival)) {
      kept[rivalIndex] = layout
    }
  }
  return kept
}

function primerAnnealScore(template: string, primer: Primer) {
  const layouts = primer.bindings ?? []
  if (!layouts.length) return Number.NEGATIVE_INFINITY
  return Math.max(...layouts.map((layout) => layoutAnnealScore(template, layout)))
}

/**
 * After assembly, the same oligo is often inherited from several parts. Keep one copy per
 * sequence and prefer the better-annealed binding set.
 */
export function dedupePrimersBySequence(primers: Primer[], template: string): Primer[] {
  const normalized = normalizeDna(template)
  const bestBySequence = new Map<string, Primer>()
  const order: string[] = []
  for (const primer of primers) {
    const key = normalizeDna(primer.sequence)
    if (!key) continue
    const existing = bestBySequence.get(key)
    if (!existing) {
      bestBySequence.set(key, primer)
      order.push(key)
      continue
    }
    if (primerAnnealScore(normalized, primer) > primerAnnealScore(normalized, existing)) {
      bestBySequence.set(key, primer)
    }
  }
  return order.map((key) => bestBySequence.get(key)!)
}

/**
 * Re-resolve primer bindings against the current template and persist the displayable
 * layouts. Clears stale complex mutagenic geometry for every oligo that still binds —
 * not only those with a full exact duplex (overhang primers included).
 */
export function refreshExactPrimerBindings(primers: Primer[], template: string): Primer[] {
  const normalized = normalizeDna(template)
  if (!normalized || primers.length === 0) return primers
  const params = defaultPrimerHybridizationParams
  const refreshed = primers.map((primer) => {
    const probe: Primer = { ...primer, bindings: undefined }

    // Exact duplexes are real sites — persist them even when construct Tm is below the
    // display threshold (short / AT-rich oligos still belong on the product).
    const exactLayouts = dedupePrimerBindingLayouts(
      normalized,
      findPrimerBindings(normalized, [probe]).map((binding) =>
        bindingLayoutFromMatch(primer.sequence, binding.start, binding.end, binding.strand),
      ),
    )
    if (exactLayouts.length) return { ...primer, bindings: exactLayouts }

    const softDisplayable = dedupePrimerBindingLayouts(
      normalized,
      resolvePrimerBindingLayouts(normalized, primer.sequence).filter((layout) =>
        hasDisplayablePrimerAnneal(normalized, layout, params),
      ),
    )
    if (softDisplayable.length) return { ...primer, bindings: softDisplayable }

    // Keep a soft layout without the Tm gate when the oligo still has a matching 3′
    // terminus (AT-rich primers can fall under the display Tm cutoff). Do not persist
    // sites whose 3′ base mismatches — those are not valid extending duplexes.
    const softAny = dedupePrimerBindingLayouts(
      normalized,
      resolvePrimerBindingLayouts(normalized, primer.sequence).filter(
        (layout) => terminalContinuousMatchLength(normalized, layout, params.allowMismatch) > 0,
      ),
    )
    if (softAny.length) return { ...primer, bindings: softAny }

    const withStored = dedupePrimerBindingLayouts(
      normalized,
      layoutsForPrimer(normalized, primer, params),
    )
    if (withStored.length) return { ...primer, bindings: withStored }

    if (primer.bindings?.length) return { ...primer, bindings: [] }
    return primer
  })

  return dedupePrimersBySequence(refreshed, normalized)
}

/** Whether a primer sequence has at least one binding site under the given hybridization rules. */
export function primerHasDisplayableBinding(
  template: string,
  primerSequence: string,
  hybridization: PrimerHybridizationParams = defaultPrimerHybridizationParams,
): boolean {
  const sequence = normalizeDna(primerSequence)
  if (!sequence) return false
  const params = normalizePrimerHybridizationParams(hybridization)
  const primer: Primer = {
    id: 'import-probe',
    name: 'import-probe',
    sequence,
    color: PRIMER_FALLBACK_COLOR,
  }
  return layoutsForPrimer(normalizeDna(template), primer, params).some((layout) =>
    hasDisplayablePrimerAnneal(template, layout, params),
  )
}

export function resolvePrimerFrameDisplays(
  record: SequenceRecord,
  hybridization: PrimerHybridizationParams = defaultPrimerHybridizationParams,
): PrimerFrameDisplay[] {
  const template = normalizeDna(record.sequence)
  const params = normalizePrimerHybridizationParams(hybridization)
  const displays: PrimerFrameDisplay[] = []

  for (const primer of record.primers) {
    if (primer.visible === false) continue
    for (const layout of layoutsForPrimer(template, primer, params)) {
      if (!hasDisplayablePrimerAnneal(template, layout, params)) continue
      displays.push(buildPrimerFrameDisplay(primer, template, layout))
    }
  }

  return displays
}

export function primerBindingFromFrameDisplay(
  record: SequenceRecord,
  display: PrimerFrameDisplay,
): PrimerBinding | null {
  const primer = record.primers.find((candidate) => candidate.id === display.primerId)
  if (!primer) return null
  return {
    primer,
    start: display.selectRange.start,
    end: display.selectRange.end,
    strand: display.strand,
    mismatches: display.glyphs.filter((glyph) => glyph.kind === 'mismatch').length,
  }
}

export function resolveDisplayablePrimerSites(
  record: SequenceRecord,
  hybridization: PrimerHybridizationParams = defaultPrimerHybridizationParams,
): {
  displays: PrimerFrameDisplay[]
  bindings: PrimerBinding[]
} {
  const displays = resolvePrimerFrameDisplays(record, hybridization)
  const bindings = displays.flatMap((display) => {
    const binding = primerBindingFromFrameDisplay(record, display)
    return binding ? [binding] : []
  })
  return { displays, bindings }
}

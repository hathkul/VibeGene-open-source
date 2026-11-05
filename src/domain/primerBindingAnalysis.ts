import { normalizeDna, reverseComplement } from './sequence'
import {
  defaultPrimerHybridizationParams,
  normalizePrimerHybridizationParams,
  type PrimerHybridizationParams,
} from './primerHybridization'
import { calculateAnnealTemperature } from './primerThermodynamics'
import {
  PRIMER_ROW_HALF_SHIFT,
  PRIMER_ROW_INSERT_SHIFT,
  type PrimerGlyph,
  type PrimerGlyphKind,
} from './primerLayoutTypes'
import type { PrimerBindingLayout, PrimerLayoutComponent, Strand } from './types'

const iupacMatches: Record<string, string> = {
  A: 'A',
  C: 'C',
  G: 'G',
  T: 'T',
  R: 'AG',
  Y: 'CT',
  S: 'GC',
  W: 'AT',
  K: 'GT',
  M: 'AC',
  B: 'CGT',
  D: 'AGT',
  H: 'ACT',
  V: 'ACG',
  N: 'ACGT',
}

const complementMap: Record<string, string> = {
  A: 'T',
  C: 'G',
  G: 'C',
  T: 'A',
  R: 'Y',
  Y: 'R',
  S: 'S',
  W: 'W',
  K: 'M',
  M: 'K',
  B: 'V',
  D: 'H',
  H: 'D',
  V: 'B',
  N: 'N',
}

/** Map layout bases to sequence-view glyph characters. */
function displayBaseForStrand(strand: Strand, layoutBase: string, useTopStrandProjection: boolean) {
  if (strand === 'forward') return layoutBase
  return useTopStrandProjection ? complementBase(layoutBase) : layoutBase
}

function displayBasesForStrand(strand: Strand, layoutBases: string, useTopStrandProjection: boolean) {
  return [...layoutBases].map((base) => displayBaseForStrand(strand, base, useTopStrandProjection)).join('')
}

function reverseLayoutUsesTopStrandProjection(layout: PrimerBindingLayout, template: string) {
  return reverseLayoutProjection(layout, template) === 'top'
}

function complementBase(base: string) {
  return complementMap[base.toUpperCase()] ?? 'N'
}

/**
 * How a reverse duplex relates to the template slice it anneals to.
 *
 * - `top`: the stored bases are the top-strand projection (≈ the template slice), so the
 *   drawn letter is the complement and the positions ascend with the template.
 * - `oligo`: the stored bases are the written oligo 5′→3′ sequence, so the drawn
 *   letter is the base itself and the positions descend with the template.
 *
 * The letter rule and the position rule must use the same reading: when they disagree the
 * body renders as the top strand and appears shifted off its anneal site.
 */
type ReverseProjection = 'top' | 'oligo'

/** A duplex that reads either way (e.g. the revcomp palindrome `GATC`). */
type ComponentProjection = ReverseProjection | 'ambiguous'

/**
 * Reverse layouts may store either:
 * - top-strand projection (exact-match finder / anneal aligner): bases ≈ template slice
 * - oligo 5′→3′ sequence (SnapGene): bases pair with the reverse strand
 *
 * Prefer a majority match so mutagenesis primers with internal mismatches still classify
 * as top-strand projection instead of being scored as oligo sequence. An exact tie is
 * reported as `ambiguous` so the surrounding layout can settle it.
 */
function projectionForBases(
  primerBases: string,
  template: string,
  templateStart: number,
  templateEnd: number,
): ComponentProjection {
  const bases = normalizeDna(primerBases)
  const slice = normalizeDna(template.slice(templateStart, templateEnd))
  const length = Math.min(bases.length, slice.length)
  if (!length) return 'ambiguous'

  let topStrandMatches = 0
  let oligoMatches = 0
  for (let index = 0; index < length; index += 1) {
    if (bases[index] === slice[index]) topStrandMatches += 1
    const topBase = slice[length - 1 - index] ?? 'N'
    if (bases[index] === complementBase(topBase)) oligoMatches += 1
  }
  if (topStrandMatches > oligoMatches) return 'top'
  if (oligoMatches > topStrandMatches) return 'oligo'
  return 'ambiguous'
}

/** Historical per-component reading: an ambiguous duplex still counts as top-strand. */
function reverseAnnealUsesTopStrandProjection(
  primerBases: string,
  template: string,
  templateStart: number,
  templateEnd: number,
) {
  return projectionForBases(primerBases, template, templateStart, templateEnd) !== 'oligo'
}

function componentTemplateRange(component: PrimerLayoutComponent) {
  const templateStart = component.templateStart!
  return {
    templateStart,
    templateEnd: component.templateEnd ?? templateStart + component.primerBases.length,
  }
}

/**
 * The layout's dominant reading, decided by how many bases each reading accounts for.
 *
 * A single ambiguous duplex must not decide the whole layout: a palindromic restriction
 * site inside a reverse primer would otherwise turn the entire body into a top-strand
 * projection while the individual duplexes keep their own reading.
 */
function reverseLayoutProjection(layout: PrimerBindingLayout, template: string): ReverseProjection {
  let topBases = 0
  let oligoBases = 0
  let anyReadsTopStrand = false
  for (const component of layout.components) {
    if (component.templateStart === undefined) continue
    const { templateStart, templateEnd } = componentTemplateRange(component)
    const projection = projectionForBases(component.primerBases, template, templateStart, templateEnd)
    if (projection !== 'oligo') anyReadsTopStrand = true
    if (projection === 'ambiguous') continue
    const length = normalizeDna(component.primerBases).length
    if (projection === 'top') topBases += length
    else oligoBases += length
  }
  if (topBases !== oligoBases) return topBases > oligoBases ? 'top' : 'oligo'
  // No unambiguous duplex in the layout: keep the historical reading.
  return anyReadsTopStrand ? 'top' : 'oligo'
}

/**
 * Resolve one reading per component. Ambiguous duplexes adopt the layout's dominant
 * reading, and overhangs (which carry no template span) follow their neighbouring duplex.
 */
function resolveReverseProjections(
  layout: PrimerBindingLayout,
  template: string,
): ReverseProjection[] {
  const components = layout.components
  const dominant = reverseLayoutProjection(layout, template)
  const projections: ReverseProjection[] = components.map((component) => {
    if (component.templateStart === undefined) return dominant
    const { templateStart, templateEnd } = componentTemplateRange(component)
    const projection = projectionForBases(component.primerBases, template, templateStart, templateEnd)
    return projection === 'ambiguous' ? dominant : projection
  })

  components.forEach((component, index) => {
    if (component.templateStart !== undefined) return
    let neighbour = -1
    for (let i = index - 1; i >= 0 && neighbour < 0; i -= 1) {
      if (components[i]!.templateStart !== undefined) neighbour = i
    }
    for (let i = index + 1; i < components.length && neighbour < 0; i += 1) {
      if (components[i]!.templateStart !== undefined) neighbour = i
    }
    if (neighbour >= 0) projections[index] = projections[neighbour]!
  })

  return projections
}

function annealTemplateIndex(
  projection: ReverseProjection,
  templateStart: number,
  primerLength: number,
  primerIndex: number,
) {
  if (projection === 'top') return templateStart + primerIndex
  return templateStart + (primerLength - 1 - primerIndex)
}

export function templateBasePairedWithPrimer(
  strand: Strand,
  primerBases: string,
  template: string,
  templateStart: number,
  templateEnd: number,
  primerIndex: number,
  projection?: ReverseProjection,
) {
  const resolved: ReverseProjection =
    projection ??
    (strand === 'forward'
      ? 'top'
      : reverseAnnealUsesTopStrandProjection(primerBases, template, templateStart, templateEnd)
        ? 'top'
        : 'oligo')
  const templateIndex = annealTemplateIndex(resolved, templateStart, primerBases.length, primerIndex)
  const topBase = template[templateIndex] ?? 'N'
  if (strand === 'forward') return topBase
  if (resolved === 'top') return topBase
  return complementBase(topBase)
}

export function basesMatch(primerBase: string, templateBase: string) {
  const primer = primerBase.toUpperCase()
  const template = templateBase.toUpperCase()
  // Template N means unknown sequence, not evidence of a compatible duplex.
  if (template === 'N') return false
  const primerAllowed = iupacMatches[primer] ?? primer
  const templateAllowed = iupacMatches[template] ?? template
  return [...primerAllowed].some((base) => templateAllowed.includes(base))
}

function glyphRowForKind(kind: PrimerGlyphKind, row = PRIMER_ROW_HALF_SHIFT) {
  if (kind === 'annealed') return 0
  return row
}

export function componentTemplateEnd(component: PrimerLayoutComponent) {
  return component.templateEnd ?? (component.templateStart ?? 0) + component.primerBases.length
}

/**
 * Whether any of the `reach` bases nearest the insertion point on the given side of an annealed
 * component are mismatches. The oversize cap overhangs the gap by roughly half its surplus width
 * on each side, so a mismatch within that reach would sit under the cap and collide with it.
 */
function flankHasMismatch(
  component: PrimerLayoutComponent,
  template: string,
  strand: Strand,
  side: 'last' | 'first',
  reach: number,
) {
  if (component.templateStart === undefined) return false
  const templateEnd = component.templateEnd ?? component.templateStart + component.primerBases.length
  const length = component.primerBases.length
  const count = Math.min(reach, length)
  for (let k = 0; k < count; k += 1) {
    const offset = side === 'last' ? length - 1 - k : k
    const primerBase = component.primerBases[offset] ?? 'N'
    const pairedBase = templateBasePairedWithPrimer(
      strand,
      component.primerBases,
      template,
      component.templateStart,
      templateEnd,
      offset,
    )
    if (!basesMatch(primerBase, pairedBase)) return true
  }
  return false
}

function nextAnnealedComponent(components: PrimerLayoutComponent[], fromIndex: number) {
  for (let index = fromIndex + 1; index < components.length; index += 1) {
    const candidate = components[index]
    if (candidate.templateStart !== undefined) return candidate
  }
  return undefined
}

/**
 * Template bases between two annealed flanks, regardless of whether components are listed in
 * ascending template order (annealer) or reverse-oligo 5′→3′ order (SnapGene: descending).
 */
function annealedTemplateGap(
  leftStart: number,
  leftEnd: number,
  rightStart: number,
  rightEnd: number,
) {
  return Math.max(0, Math.max(leftStart, rightStart) - Math.min(leftEnd, rightEnd))
}

function internalInsertRow(
  component: PrimerLayoutComponent,
  previous: PrimerLayoutComponent | undefined,
  next: PrimerLayoutComponent | undefined,
  template: string,
  strand: Strand,
) {
  if (component.templateStart !== undefined || previous === undefined || next?.templateStart === undefined) {
    return PRIMER_ROW_HALF_SHIFT
  }
  if (previous.templateStart === undefined) return PRIMER_ROW_HALF_SHIFT

  const templateDistance = annealedTemplateGap(
    previous.templateStart,
    componentTemplateEnd(previous),
    next.templateStart,
    componentTemplateEnd(next),
  )

  // Small internal overhangs/inserts that fit within the template gap stay at half-shift.
  if (component.primerBases.length <= templateDistance) {
    return PRIMER_ROW_HALF_SHIFT
  }

  // Oversize inserts lift one letter height; lift a further half only when the cap would
  // overlap raised flanking bases (still at half-shift themselves).
  const bridgeWidthBases = Math.max(component.primerBases.length, templateDistance)
  const reach = Math.max(4, Math.ceil(bridgeWidthBases / 2) + 2)
  const flankingMismatch =
    flankHasMismatch(previous, template, strand, 'last', reach) ||
    flankHasMismatch(next, template, strand, 'first', reach)
  return flankingMismatch ? PRIMER_ROW_INSERT_SHIFT + PRIMER_ROW_HALF_SHIFT : PRIMER_ROW_INSERT_SHIFT
}

function pushAnnealedGlyphs(
  glyphs: PrimerGlyph[],
  primerBases: string,
  template: string,
  templateStart: number,
  templateEnd: number,
  strand: Strand,
  projection: ReverseProjection,
) {
  const displayBases = displayBasesForStrand(strand, primerBases, projection === 'top')
  for (let index = 0; index < primerBases.length; index += 1) {
    const templateIndex = annealTemplateIndex(projection, templateStart, primerBases.length, index)
    const primerBase = primerBases[index] ?? 'N'
    const pairedBase = templateBasePairedWithPrimer(
      strand,
      primerBases,
      template,
      templateStart,
      templateEnd,
      index,
      projection,
    )
    const kind: PrimerGlyphKind = basesMatch(primerBase, pairedBase) ? 'annealed' : 'mismatch'
    glyphs.push({
      char: displayBases[index] ?? 'N',
      kind,
      row: glyphRowForKind(kind),
      templateIndex,
    })
  }
}

function pushTemplateGapGlyphs(glyphs: PrimerGlyph[], templateStart: number, templateEnd: number) {
  for (let templateIndex = templateStart; templateIndex < templateEnd; templateIndex += 1) {
    glyphs.push({
      char: '',
      kind: 'template-gap',
      row: PRIMER_ROW_HALF_SHIFT,
      templateIndex,
    })
  }
}

export function buildGlyphsFromLayout(template: string, layout: PrimerBindingLayout): PrimerGlyph[] {
  const glyphs: PrimerGlyph[] = []
  const components = layout.components
  const projections: ReverseProjection[] =
    layout.strand === 'reverse'
      ? resolveReverseProjections(layout, template)
      : components.map(() => 'top' as ReverseProjection)

  for (let componentIndex = 0; componentIndex < components.length; componentIndex += 1) {
    const component = components[componentIndex]
    const next = components[componentIndex + 1]
    const projection = projections[componentIndex]!

    if (component.templateStart === undefined) {
      const row = internalInsertRow(component, components[componentIndex - 1], next, template, layout.strand)
      for (const char of displayBasesForStrand(layout.strand, component.primerBases, projection === 'top')) {
        glyphs.push({ char, kind: 'overhang', row: glyphRowForKind('overhang', row) })
      }
      continue
    }

    const templateStart = component.templateStart
    const templateEnd = component.templateEnd ?? templateStart + component.primerBases.length
    pushAnnealedGlyphs(
      glyphs,
      component.primerBases,
      template,
      templateStart,
      templateEnd,
      layout.strand,
      projection,
    )

    const nextAnnealed = nextAnnealedComponent(components, componentIndex)
    if (nextAnnealed?.templateStart !== undefined) {
      const nextStart = nextAnnealed.templateStart
      const nextEnd = nextAnnealed.templateEnd ?? nextStart + nextAnnealed.primerBases.length
      // Annealer lists ascending template coords; SnapGene reverse oligos list 5′→3′ (descending).
      if (nextStart > templateEnd) {
        pushTemplateGapGlyphs(glyphs, templateEnd, nextStart)
      } else if (nextEnd < templateStart) {
        pushTemplateGapGlyphs(glyphs, nextEnd, templateStart)
      }
    }
  }

  return glyphs
}

/**
 * Annealed block that contains the primer 3′ terminus.
 * Forward / SnapGene reverse (oligo order): last component.
 * Reverse top-strand projection: lowest template coordinate (3′ sits on the left).
 */
function threePrimeAnnealedComponent(layout: PrimerBindingLayout, template: string) {
  const annealed = layout.components.filter(
    (
      component,
    ): component is PrimerLayoutComponent & { templateStart: number; templateEnd?: number } =>
      component.templateStart !== undefined,
  )
  if (!annealed.length) return null
  if (layout.strand === 'forward') return annealed[annealed.length - 1]!
  if (reverseLayoutUsesTopStrandProjection(layout, template)) {
    return annealed.reduce((best, component) =>
      component.templateStart < best.templateStart ? component : best,
    )
  }
  return annealed[annealed.length - 1]!
}

/**
 * Whether the 3′ terminus of a component sits at its low template end.
 *
 * Forward primers always read 3′→5′ right-to-left, so the terminus is the last base.
 * Reverse primers read it at the low end only when the duplex is a top-strand projection;
 * an oligo-ordered reverse primer pairs 3′→5′ left-to-right like a forward primer.
 */
function componentThreePrimeAtLowEnd(
  layout: PrimerBindingLayout,
  template: string,
  component: PrimerLayoutComponent,
): boolean {
  if (layout.strand === 'forward') return false
  if (component.templateStart === undefined) return false
  const { templateStart, templateEnd } = componentTemplateRange(component)
  const projection = projectionForBases(component.primerBases, template, templateStart, templateEnd)
  if (projection !== 'ambiguous') return projection === 'top'
  const projections = resolveReverseProjections(layout, template)
  const index = layout.components.indexOf(component)
  return (projections[index] ?? reverseLayoutProjection(layout, template)) === 'top'
}

/**
 * The oligo's written 3′ component — including a trailing/leading overhang.
 * Display rules must look at this, not only the last annealed block: a 3′ tail that
 * does not pair is not an extending duplex even if an internal seed matches.
 */
function oligoThreePrimeComponent(layout: PrimerBindingLayout, template: string) {
  if (!layout.components.length) return null
  if (layout.strand === 'reverse' && reverseLayoutUsesTopStrandProjection(layout, template)) {
    return layout.components[0]!
  }
  return layout.components[layout.components.length - 1]!
}

function oligoThreePrimeTerminusMatches(template: string, layout: PrimerBindingLayout) {
  const component = oligoThreePrimeComponent(layout, template)
  if (!component || component.templateStart === undefined || !component.primerBases.length) {
    return false
  }
  const templateStart = component.templateStart
  const templateEnd = component.templateEnd ?? templateStart + component.primerBases.length
  const topStrandReverse = componentThreePrimeAtLowEnd(layout, template, component)
  const baseIndex = topStrandReverse ? 0 : component.primerBases.length - 1
  const primerBase = component.primerBases[baseIndex] ?? 'N'
  const pairedBase = templateBasePairedWithPrimer(
    layout.strand,
    component.primerBases,
    template,
    templateStart,
    templateEnd,
    baseIndex,
  )
  return basesMatch(primerBase, pairedBase)
}

function walkFromPrimerThreePrime(
  layout: PrimerBindingLayout,
  template: string,
  onBase: (primerBase: string, pairedBase: string, index: number) => 'continue' | 'stop',
) {
  const component = threePrimeAnnealedComponent(layout, template)
  if (!component) return
  const templateStart = component.templateStart
  const templateEnd = component.templateEnd ?? templateStart + component.primerBases.length
  const bases = component.primerBases
  const topStrandReverse = componentThreePrimeAtLowEnd(layout, template, component)

  if (topStrandReverse) {
    for (let index = 0; index < bases.length; index += 1) {
      const primerBase = bases[index] ?? 'N'
      const pairedBase = templateBasePairedWithPrimer(
        layout.strand,
        bases,
        template,
        templateStart,
        templateEnd,
        index,
      )
      if (onBase(primerBase, pairedBase, index) === 'stop') return
    }
    return
  }

  for (let index = bases.length - 1; index >= 0; index -= 1) {
    const primerBase = bases[index] ?? 'N'
    const pairedBase = templateBasePairedWithPrimer(
      layout.strand,
      bases,
      template,
      templateStart,
      templateEnd,
      index,
    )
    if (onBase(primerBase, pairedBase, index) === 'stop') return
  }
}

function terminalAnnealedSequence(template: string, layout: PrimerBindingLayout) {
  let terminal = ''
  const topStrandReverse =
    layout.strand === 'reverse' && reverseLayoutUsesTopStrandProjection(layout, template)
  walkFromPrimerThreePrime(layout, template, (primerBase, pairedBase) => {
    // Construct Tm uses the perfect duplex from the 3′ terminus. A 3′ mismatch means the
    // primer does not form an extending duplex — do not skip past it.
    if (!basesMatch(primerBase, pairedBase)) return 'stop'
    // Top-strand reverse walks 3′→5′ left-to-right; oligo/forward walks 3′→5′ right-to-left.
    terminal = topStrandReverse ? terminal + primerBase : primerBase + terminal
    return 'continue'
  })
  return terminal
}

function annealTmValue(sequence: string) {
  const result = calculateAnnealTemperature(sequence)
  return Math.max(
    ...[result.tmC, result.tmMinC, result.tmMaxC].filter((value): value is number => Number.isFinite(value)),
    Number.NEGATIVE_INFINITY,
  )
}

/**
 * Count matching bases walking from the primer 3′ end of the terminal annealed block.
 * The stretch must begin at the 3′ terminus (a 3′ mismatch yields length 0).
 * When `allowMismatch` is true, a single isolated *internal* mismatch does not terminate
 * the region (and does not count toward the match length).
 */
export function terminalContinuousMatchLength(
  template: string,
  layout: PrimerBindingLayout,
  allowMismatch: boolean,
): number {
  let matchCount = 0
  let usedMismatch = false
  let started = false
  let stopped = false

  if (!oligoThreePrimeTerminusMatches(template, layout)) return 0

  walkFromPrimerThreePrime(layout, template, (primerBase, pairedBase) => {
    if (stopped) return 'stop'
    const match = basesMatch(primerBase, pairedBase)
    if (match) {
      matchCount += 1
      started = true
      return 'continue'
    }
    // Do not skip a non-matching 3′ base — continuous match is measured from the terminus.
    if (!started) {
      stopped = true
      return 'stop'
    }
    if (allowMismatch && !usedMismatch) {
      usedMismatch = true
      return 'continue'
    }
    stopped = true
    return 'stop'
  })

  return matchCount
}

export function hasDisplayablePrimerAnneal(
  template: string,
  layout: PrimerBindingLayout,
  params: PrimerHybridizationParams = defaultPrimerHybridizationParams,
) {
  const thresholds = normalizePrimerHybridizationParams(params)
  const matchLength = terminalContinuousMatchLength(template, layout, thresholds.allowMismatch)
  if (matchLength < thresholds.minContinuousMatchLen) return false
  const terminalSequence = terminalAnnealedSequence(template, layout)
  if (!terminalSequence) return false
  return annealTmValue(terminalSequence) >= thresholds.minMeltingTemperature
}

/** Terminal 3′ duplex sequence used for construct Tm (may be shorter than the full primer). */
export function primerConstructAnnealSequence(template: string, layout: PrimerBindingLayout) {
  return terminalAnnealedSequence(template, layout)
}

function componentPairedMask(
  template: string,
  layout: PrimerBindingLayout,
  component: PrimerLayoutComponent,
  primerSequenceSlice: string,
): boolean[] {
  const bases = normalizeDna(primerSequenceSlice)
  if (component.templateStart === undefined) return Array.from({ length: bases.length }, () => false)
  const templateStart = component.templateStart
  const templateEnd = component.templateEnd ?? templateStart + normalizeDna(component.primerBases).length
  return [...bases].map((base, index) =>
    basesMatch(
      base,
      templateBasePairedWithPrimer(layout.strand, component.primerBases, template, templateStart, templateEnd, index),
    ),
  )
}

/**
 * Per written oligo base (5′→3′): true when that base is paired in `layout`.
 * Handles SnapGene reverse (top-strand / RC) component encoding.
 */
export function annealMaskFromBindingLayout(
  template: string,
  primerSequence: string,
  layout: PrimerBindingLayout,
): boolean[] {
  const sequence = normalizeDna(primerSequence)
  const mask = Array.from({ length: sequence.length }, () => false)
  const parts = layout.components.map((component) => normalizeDna(component.primerBases))
  if (!sequence || !parts.length || parts.some((part) => !part)) return mask

  const forwardJoin = parts.join('')
  const reverseJoin = [...parts].reverse().join('')
  const rc = reverseComplement(sequence)
  let components = layout.components
  let reverseEach = false
  let useStoredComponentBases = false
  if (forwardJoin === sequence) {
    reverseEach = false
    useStoredComponentBases = true
  } else if (reverseJoin === sequence) {
    components = [...layout.components].reverse()
    useStoredComponentBases = true
  } else if (forwardJoin === rc) {
    components = [...layout.components].reverse()
    reverseEach = true
    useStoredComponentBases = true
  } else if (reverseJoin === rc) {
    reverseEach = true
    useStoredComponentBases = true
  } else {
    // Live oligo may differ from stored component bases; keep stored component intervals.
    const forwardDistance = Math.abs(forwardJoin.length - sequence.length)
    const reverseDistance = Math.abs(reverseJoin.length - sequence.length)
    const extensionComponent = layout.components.find((component) => component.templateStart === undefined)
    const annealingComponent = layout.components.find((component) => component.templateStart !== undefined)
    const extensionFirst = extensionComponent ? normalizeDna(extensionComponent.primerBases) : ''
    const annealingFirst = annealingComponent ? normalizeDna(annealingComponent.primerBases) : ''
    if (annealingFirst && sequence.startsWith(annealingFirst)) {
      components = [...layout.components].reverse()
    } else if (extensionFirst && sequence.startsWith(extensionFirst)) {
      components = layout.components
    } else if (reverseDistance < forwardDistance) {
      components = [...layout.components].reverse()
    } else {
      components = layout.components
    }
    reverseEach = false
  }

  const normalized = normalizeDna(template)
  let offset = 0
  for (const component of components) {
    const componentLength = normalizeDna(component.primerBases).length
    if (offset >= sequence.length) break
    const sliceLength = Math.min(componentLength, sequence.length - offset)
    const sequenceSlice = sequence.slice(offset, offset + sliceLength)
    const pairingSlice = useStoredComponentBases
      ? normalizeDna(component.primerBases).slice(0, sliceLength)
      : sequenceSlice
    const paired = componentPairedMask(normalized, layout, component, pairingSlice)
    const n = paired.length
    for (let index = 0; index < n; index += 1) {
      mask[offset + index] = paired[reverseEach ? n - 1 - index : index] ?? false
    }
    offset += componentLength
  }
  return mask
}

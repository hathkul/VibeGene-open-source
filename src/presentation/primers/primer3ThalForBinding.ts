import { complementDnaBase, reverseComplement } from '../../domain/sequence'
import type { Primer3ThalInput, Primer3ThalResult } from '../../domain/primer3/thalProtocol'
import type { PrimerDuplexTmConditions } from '../../domain/primerDuplexThermodynamics'
import type { PrimerBindingLayout, Topology } from '../../domain/types'
import type { PrimerFrameDisplay, PrimerGlyph } from '../../domain/primerSequenceLayout'

export type Primer3ThalRequestResult =
  | {
    status: 'ready'
    input: Primer3ThalInput
    approximation?: {
      excludedPrimer5PrimeBases: string
      excludedPrimer5PrimeBaseCount: number
      retainedPrimer5PrimeBaseCount: number
      fullPrimerLength: number
      modeledPrimerLength: number
    }
  }
  | { status: 'unavailable'; reason: string }

export type Primer3ThalDisplayResult =
  | { status: 'estimated'; result: Primer3ThalResult }
  | { status: 'unavailable'; reason: string }

/**
 * Restrict target sequence to the currently selected site so the optimizer cannot
 * move to a nearby binding locus and present that result as this site's Tm.
 * Primer3 receives the primer as sequence1 in either strand case; `end1` then
 * anchors the primer's written 3′ terminus. Target sequence2 is the opposing
 * physical strand written 5′→3′ (THAL reverses it internally for the drawing).
 */
export function buildPrimer3ThalRequest(args: {
  primer: string
  template: string
  topology: Topology
  binding?: PrimerBindingLayout
  conditions: PrimerDuplexTmConditions | null
}): Primer3ThalRequestResult {
  const primer = args.primer.toUpperCase()
  const template = args.template.toUpperCase()
  if (!args.binding) return { status: 'unavailable', reason: 'No selected binding site' }
  const conditions = args.conditions
  if (!conditions || ![conditions.monoConc, conditions.mgConc, conditions.dntpConc, conditions.oligoConc].every((value) => typeof value === 'number' && Number.isFinite(value)) ||
      conditions.monoConc! < 0 || conditions.mgConc! < 0 || conditions.dntpConc! < 0 || conditions.oligoConc! <= 0 ||
      conditions.monoConc! > 1 || conditions.mgConc! > 0.1 || conditions.dntpConc! > 0.1 || conditions.oligoConc! > 0.001) {
    return { status: 'unavailable', reason: 'Enter valid Tm reaction conditions first' }
  }
  if (conditions.monoConc === 0 && conditions.mgConc === 0) {
    return { status: 'unavailable', reason: 'Set monovalent salt or Mg²⁺ above 0 mM to calculate Tm' }
  }
  if (!/^[ACGT]+$/.test(primer)) {
    return { status: 'unavailable', reason: 'Primer3 thermodynamic alignment supports only unambiguous A, C, G, and T bases' }
  }
  if (primer.length > 10_000) {
    return { status: 'unavailable', reason: 'Primer3 thermodynamic alignment supports sequences up to 10,000 nt' }
  }

  const { templateStart, templateEnd, strand } = args.binding
  if (!Number.isInteger(templateStart) || !Number.isInteger(templateEnd)) {
    return { status: 'unavailable', reason: 'Selected binding site has invalid coordinates' }
  }
  let siteWindow: string
  if (args.topology === 'circular') {
    if (!template.length) return { status: 'unavailable', reason: 'Circular template is empty' }
    const rawSpan = templateEnd - templateStart
    const span = rawSpan > 0 ? rawSpan : ((rawSpan % template.length) + template.length) % template.length
    if (span <= 0 || span > template.length) {
      return { status: 'unavailable', reason: 'Selected circular binding site has invalid or repeated coordinates' }
    }
    const startOnCircle = ((templateStart % template.length) + template.length) % template.length
    const firstLength = Math.min(span, template.length - startOnCircle)
    siteWindow = template.slice(startOnCircle, startOnCircle + firstLength) +
      template.slice(0, span - firstLength)
  } else {
    if (templateStart < 0 || templateEnd <= templateStart || templateEnd > template.length) {
      return { status: 'unavailable', reason: 'Selected binding site crosses the linear sequence boundary' }
    }
    siteWindow = template.slice(templateStart, templateEnd)
  }
  if (!siteWindow) return { status: 'unavailable', reason: 'Selected binding site has no template sequence' }
  if (!/^[ACGT]+$/.test(siteWindow)) {
    return { status: 'unavailable', reason: 'Selected template window contains ambiguous or unsupported bases' }
  }
  if (siteWindow.length > 10_000) {
    return { status: 'unavailable', reason: 'Primer3 thermodynamic alignment supports sequences up to 10,000 nt' }
  }

  let primerForThal = primer
  let approximation: Extract<Primer3ThalRequestResult, { status: 'ready' }>['approximation']
  if (primer.length > 60 && siteWindow.length > 60) {
    const components = args.binding.components
    if (!components?.length || components.map((component) => component.primerBases.toUpperCase()).join('') !== primer) {
      return { status: 'unavailable', reason: 'Both selected sequences exceed Primer3’s 60 nt paired-length limit, and the selected layout cannot prove a removable 5′ tail' }
    }
    let leadingTailLength = 0
    let pairedRegionStarted = false
    for (const component of components) {
      if (component.templateStart === undefined) {
        if (pairedRegionStarted) {
          return { status: 'unavailable', reason: 'Both selected sequences exceed Primer3’s 60 nt paired-length limit, and the layout has internal unpaired bases' }
        }
        leadingTailLength += component.primerBases.length
      } else {
        pairedRegionStarted = true
      }
    }
    const pairedPrimerLength = primer.length - leadingTailLength
    if (!leadingTailLength || !pairedRegionStarted || pairedPrimerLength > 60) {
      return { status: 'unavailable', reason: 'Both selected sequences exceed Primer3’s 60 nt paired-length limit, and the annealed primer region cannot fit after safe 5′ trimming' }
    }
    const retainedTailLength = Math.min(leadingTailLength, 60 - pairedPrimerLength)
    const excludedTailLength = leadingTailLength - retainedTailLength
    const excludedPrimer5PrimeBases = primer.slice(0, excludedTailLength)
    primerForThal = primer.slice(excludedTailLength)
    approximation = {
      excludedPrimer5PrimeBases,
      excludedPrimer5PrimeBaseCount: excludedTailLength,
      retainedPrimer5PrimeBaseCount: retainedTailLength,
      fullPrimerLength: primer.length,
      modeledPrimerLength: primerForThal.length,
    }
  }

  const opposingStrand5to3 = strand === 'forward' ? reverseComplement(siteWindow) : siteWindow
  return {
    status: 'ready',
    input: {
      sequence1: primerForThal,
      sequence2: opposingStrand5to3,
      mode: 'end1',
      chemistry: {
        mvMmol: conditions.monoConc! * 1000,
        dvMmol: conditions.mgConc! * 1000,
        dntpMmol: conditions.dntpConc! * 1000,
        dnaNmol: conditions.oligoConc! * 1_000_000_000,
      },
    },
    ...(approximation ? { approximation } : {}),
  }
}

export function displayPrimer3ThalResult(result: Primer3ThalResult): Primer3ThalDisplayResult {
  if (!Number.isFinite(result.tmC)) {
    return { status: 'unavailable', reason: 'Primer3 returned a non-finite thermodynamic result' }
  }
  if (!result.structure || result.alignEnd1 < 1 || result.alignEnd2 < 1) {
    return { status: 'unavailable', reason: 'No stable modeled duplex was found at this site' }
  }
  if (result.tmC <= -273.15) {
    return { status: 'unavailable', reason: 'No stable modeled duplex was found at this site' }
  }
  return { status: 'estimated', result }
}

/** Render Primer3's literal escaped line delimiters as plain-text rows. */
export function formatPrimer3ThalStructure(structure: string): string {
  return structure.replaceAll('\\n', '\n').replaceAll('&deg;', '°')
}

type ParsedStructureRow = { offset: number; bases: string }

function parseStructureRow(line: string, prefix: string, suffix: string): ParsedStructureRow | null {
  const escapedPrefix = prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const escapedSuffix = suffix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = new RegExp(`^(\\s*)${escapedPrefix} ([ACGT-]+) ${escapedSuffix}\\s*$`).exec(line)
  if (!match) return null
  const bases = match[2]!
  return { offset: match[1]!.length + prefix.length + 1, bases }
}

function sequenceRowColumns(row: ParsedStructureRow): Map<number, string> {
  return new Map([...row.bases].map((base, index) => [row.offset + index, base]))
}

/**
 * Convert an end1 THAL drawing into the sequence-workspace's base glyphs.
 * Row coordinates are accepted only when the complete primer and complete selected
 * target window round-trip through the native drawing. Pairing is checked from the
 * actual bases at shared drawing columns; THAL's `|` marker is not treated as proof.
 * Unsupported / malformed structures return null so callers keep their existing site.
 */
export type Primer3ThalPrimerFrame = { display: PrimerFrameDisplay; layout: PrimerBindingLayout }

export function primerFrameDisplayFromPrimer3Thal(args: {
  primer: { id: string; name: string; color: string; sequence: string }
  template: string
  topology: Topology
  binding: PrimerBindingLayout
  input: Primer3ThalInput
  result: Primer3ThalResult
  fallbackDisplay: PrimerFrameDisplay
  excludedPrimer5PrimeBases?: string
}): Primer3ThalPrimerFrame | null {
  const { primer, binding, result, input, fallbackDisplay } = args
  const excludedPrimer5PrimeBases = (args.excludedPrimer5PrimeBases ?? '').toUpperCase()
  if (!/^[ACGT]*$/.test(excludedPrimer5PrimeBases) ||
      !primer.sequence.toUpperCase().startsWith(excludedPrimer5PrimeBases) ||
      input.sequence1.toUpperCase() !== primer.sequence.slice(excludedPrimer5PrimeBases.length).toUpperCase()) return null
  if (input.mode !== 'end1' || result.mode !== 'end1' || result.alignEnd1 !== input.sequence1.length ||
      !Number.isInteger(result.alignEnd2) || result.alignEnd2 < 1 || result.alignEnd2 > input.sequence2.length) return null
  if (!/^[ACGT]+$/i.test(primer.sequence)) return null
  const sequence2Shown = [...input.sequence2].reverse().join('')
  const structure = formatPrimer3ThalStructure(result.structure)
  const lines = structure.split('\n')
  const topRows = lines.flatMap((line, index) => {
    const row = parseStructureRow(line, "5'", '3\'')
    return row ? [{ index, row }] : []
  })
  const bottomRows = lines.flatMap((line, index) => {
    const row = parseStructureRow(line, "3'", '5\'')
    return row ? [{ index, row }] : []
  })
  if (topRows.length !== 1 || bottomRows.length !== 1 || topRows[0]!.index >= bottomRows[0]!.index) return null
  const top = topRows[0]!.row
  const bottom = bottomRows[0]!.row
  if (top.bases.replaceAll('-', '') !== input.sequence1.toUpperCase() || bottom.bases.replaceAll('-', '') !== sequence2Shown.toUpperCase()) return null

  const template = args.template.toUpperCase()
  if (!template.length) return null
  const { templateStart, templateEnd, strand } = binding
  const span = args.topology === 'circular'
    ? (templateEnd > templateStart ? templateEnd - templateStart : ((templateEnd - templateStart) % template.length + template.length) % template.length)
    : templateEnd - templateStart
  if (!Number.isInteger(span) || span <= 0 || span > template.length) return null
  const start = args.topology === 'circular' ? ((templateStart % template.length) + template.length) % template.length : templateStart
  if (args.topology === 'linear' && (start < 0 || start + span > template.length)) return null
  const site = Array.from({ length: span }, (_, index) => template[(start + index) % template.length] ?? '')
  if (site.some((base) => !/^[ACGT]$/.test(base))) return null
  const expectedBottom = strand === 'forward'
    ? [...site].map(complementDnaBase).join('')
    : [...site].reverse().join('')
  if (sequence2Shown.toUpperCase() !== expectedBottom) return null

  const topColumns = sequenceRowColumns(top)
  const bottomColumns = sequenceRowColumns(bottom)
  const columns = [...new Set([...topColumns.keys(), ...bottomColumns.keys()])].sort((a, b) => a - b)
  if (!columns.length) return null
  const overlapColumns = columns.filter((column) => topColumns.has(column) && bottomColumns.has(column))
  if (!overlapColumns.length) return null
  const firstAlignedColumn = overlapColumns[0]!
  const lastAlignedColumn = overlapColumns[overlapColumns.length - 1]!
  const glyphs: PrimerGlyph[] = [...excludedPrimer5PrimeBases].map((char) => ({ char, kind: 'overhang', row: 0.5 }))
  const components: PrimerBindingLayout['components'] = excludedPrimer5PrimeBases
    ? [{ primerBases: excludedPrimer5PrimeBases }]
    : []
  let primerIndex = excludedPrimer5PrimeBases.length
  let targetIndex = 0
  let currentAnnealed: { bases: string; targetIndices: number[] } | null = null
  let currentOverhang = ''
  const flushAnnealed = () => {
    if (!currentAnnealed?.bases) return
    const coordinates = currentAnnealed.targetIndices.map((offset) => {
      const siteIndex = strand === 'forward' ? offset : span - 1 - offset
      return (start + siteIndex) % template.length
    })
    let blockStart = 0
    for (let index = 1; index <= coordinates.length; index += 1) {
      const previous = coordinates[index - 1]!
      const next = coordinates[index]
      const contiguous = next !== undefined && (strand === 'forward' ? next === previous + 1 : next === previous - 1)
      if (contiguous) continue
      const blockCoordinates = coordinates.slice(blockStart, index)
      const blockBases = currentAnnealed.bases.slice(blockStart, index)
      components.push({
        primerBases: blockBases,
        templateStart: Math.min(...blockCoordinates),
        templateEnd: Math.max(...blockCoordinates) + 1,
      })
      blockStart = index
    }
    currentAnnealed = null
  }
  const flushOverhang = () => {
    if (!currentOverhang) return
    components.push({ primerBases: currentOverhang })
    currentOverhang = ''
  }

  for (const column of columns) {
    const primerBase = topColumns.get(column)
    const targetBase = bottomColumns.get(column)
    const inside = column >= firstAlignedColumn && column <= lastAlignedColumn
    if (!inside) {
      if (primerBase && primerBase !== '-') {
        if (targetBase) return null
        flushAnnealed()
        currentOverhang += primerBase
        glyphs.push({ char: primerBase, kind: 'overhang', row: 0.5 })
        primerIndex += 1
      } else if (targetBase && targetBase !== '-') {
        return null
      }
      continue
    }

    if (primerBase === undefined || targetBase === undefined) return null
    if (primerBase === '-' && targetBase === '-') return null
    if (primerBase === '-') {
      flushOverhang()
      flushAnnealed()
      const siteIndex = strand === 'forward' ? targetIndex : span - 1 - targetIndex
      const templateIndex = (start + siteIndex) % template.length
      glyphs.push({ char: '', kind: 'template-gap', row: 0.5, templateIndex })
      targetIndex += 1
      continue
    }
    if (targetBase === '-') {
      flushAnnealed()
      currentOverhang += primerBase
      const previousPrimer = topColumns.get(column - 1)
      const previousTarget = bottomColumns.get(column - 1)
      const nextPrimer = topColumns.get(column + 1)
      const nextTarget = bottomColumns.get(column + 1)
      const flankedByMismatch = [
        [previousPrimer, previousTarget],
        [nextPrimer, nextTarget],
      ].some(([left, right]) => left !== undefined && right !== undefined && left !== '-' && right !== '-' && left !== complementDnaBase(right))
      glyphs.push({ char: primerBase, kind: 'overhang', row: flankedByMismatch ? 1.5 : 1 })
      primerIndex += 1
      continue
    }

    flushOverhang()
    const siteIndex = strand === 'forward' ? targetIndex : span - 1 - targetIndex
    const templateIndex = (start + siteIndex) % template.length
    const templateBase = template[templateIndex]!
    const isMatch = strand === 'forward'
      ? primerBase === templateBase
      : primerBase === complementDnaBase(templateBase)
    currentAnnealed ??= { bases: '', targetIndices: [] }
    currentAnnealed.bases += primerBase
    currentAnnealed.targetIndices.push(targetIndex)
    glyphs.push({ char: primerBase, kind: isMatch ? 'annealed' : 'mismatch', row: isMatch ? 0 : 0.5, templateIndex })
    primerIndex += 1
    targetIndex += 1
  }
  flushAnnealed()
  flushOverhang()
  if (primerIndex !== primer.sequence.length || targetIndex !== span || !components.length) return null

  const terminalGlyph = [...glyphs].reverse().find((glyph) => glyph.kind !== 'template-gap')
  if (!terminalGlyph || terminalGlyph.kind !== 'annealed' || terminalGlyph.templateIndex === undefined) return null

  const layout: PrimerBindingLayout = {
    strand,
    templateStart: binding.templateStart,
    templateEnd: binding.templateEnd,
    components,
  }
  const mappedIndices = glyphs.flatMap((glyph) => glyph.templateIndex === undefined ? [] : [glyph.templateIndex])
  return {
    layout,
    display: {
      ...fallbackDisplay,
      sequence: primer.sequence,
      glyphs,
      templateSpanStart: mappedIndices.length ? Math.min(...mappedIndices) : fallbackDisplay.templateSpanStart,
      templateSpanEnd: mappedIndices.length ? Math.max(...mappedIndices) + 1 : fallbackDisplay.templateSpanEnd,
      selectRange: fallbackDisplay.selectRange,
    },
  }
}

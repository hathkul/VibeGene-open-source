import type { Strand, StrandColorRange, StrandColors, Topology } from './types'

/** SnapGene user strand-color palette (block 20 / painting UI). */
export const SNAPGENE_USER_STRAND_COLORS = [
  { name: 'black', css: '#111111', label: 'Black' },
  { name: 'red', css: '#dc2626', label: 'Red' },
  { name: 'orange', css: '#ea580c', label: 'Orange' },
  { name: 'green', css: '#16a34a', label: 'Green' },
  { name: 'blue', css: '#2563eb', label: 'Blue' },
  { name: 'cyan', css: '#0891b2', label: 'Light blue' },
  { name: 'purple', css: '#7c3aed', label: 'Purple' },
  { name: 'magenta', css: '#c026d3', label: 'Magenta' },
  { name: 'brown', css: '#92400e', label: 'Brown' },
  { name: 'gray', css: '#6b7280', label: 'Gray' },
] as const

const SNAPGENE_NAMED_COLORS: Record<string, string> = {
  black: '#111111',
  red: '#dc2626',
  magenta: '#c026d3',
  blue: '#2563eb',
  green: '#16a34a',
  orange: '#ea580c',
  purple: '#7c3aed',
  gray: '#6b7280',
  grey: '#6b7280',
  cyan: '#0891b2',
  yellow: '#ca8a04',
  brown: '#92400e',
  pink: '#db2777',
}

export function snapGeneColorToCss(color: string): string {
  const trimmed = color.trim()
  if (/^#[0-9a-f]{6}$/i.test(trimmed)) return trimmed
  return SNAPGENE_NAMED_COLORS[trimmed.toLowerCase()] ?? trimmed
}

function extractTagInner(xml: string, tag: string): string {
  const match = xml.match(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`, 'i'))
  return match?.[1] ?? ''
}

function parseSnapGeneColorRangeText(range: string, sequenceLength: number, color: string): StrandColorRange[] {
  const hyphen = range.trim().match(/^(\d+)\s*-\s*(\d+)$/)
  if (hyphen) {
    const start = Number(hyphen[1]) - 1
    const end = Number(hyphen[2])
    if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end <= start) return []
    return [{ start, end, color }]
  }

  const dot = range.trim().match(/^(\d+)\.\.(\d+)$/)
  if (!dot) return []
  const startOneBased = Number(dot[1])
  const endOneBased = Number(dot[2])
  if (!Number.isFinite(startOneBased) || !Number.isFinite(endOneBased) || startOneBased < 1) return []
  const start = startOneBased - 1
  if (endOneBased >= startOneBased) {
    return [{ start, end: endOneBased, color }]
  }
  if (sequenceLength <= 0) {
    return [{ start, end: endOneBased, color }]
  }
  return [
    { start, end: sequenceLength, color },
    { start: 0, end: endOneBased, color },
  ]
}

function parseColorRangeTags(fragment: string, sequenceLength: number): StrandColorRange[] {
  const ranges: StrandColorRange[] = []
  const regex = /<ColorRange\b([^>]*)\/>/gi
  let match: RegExpExecArray | null
  while ((match = regex.exec(fragment)) !== null) {
    const attrs = match[1] ?? ''
    const range = attrs.match(/\brange="([^"]+)"/)?.[1]
    const color = attrs.match(/\bcolors="([^"]+)"/)?.[1] ?? attrs.match(/\bcolor="([^"]+)"/)?.[1] ?? 'black'
    if (!range) continue
    ranges.push(...parseSnapGeneColorRangeText(range, sequenceLength, color))
  }
  return ranges
}

function parseStrandColorsFromXml(xml: string, sequenceLength: number): StrandColors | undefined {
  const strandColorsMatch = xml.match(/<StrandColors\b([^>]*)>([\s\S]*?)<\/StrandColors>/i)
  if (!strandColorsMatch) return undefined
  const attrs = strandColorsMatch[1] ?? ''
  const body = strandColorsMatch[2] ?? ''
  const typeAttr = attrs.match(/\btype="([^"]+)"/)?.[1]
  const type = typeAttr === 'Product' || typeAttr === 'Input' ? typeAttr : undefined
  const parsed: StrandColors = {
    type,
    topStrand: parseColorRangeTags(extractTagInner(body, 'TopStrand'), sequenceLength),
    bottomStrand: parseColorRangeTags(extractTagInner(body, 'BottomStrand'), sequenceLength),
  }
  if (!parsed.topStrand.length && !parsed.bottomStrand.length && !parsed.type) return undefined
  return parsed
}

export function parseSnapGeneStrandColorsXml(xml: string, sequenceLength = Number.MAX_SAFE_INTEGER): StrandColors | undefined {
  const trimmed = xml.trim()
  if (!trimmed) return undefined
  return parseStrandColorsFromXml(trimmed, sequenceLength)
}

export function parseSnapGeneHistoryColorsElement(
  element: Element | null | undefined,
  sequenceLength: number,
): StrandColors | undefined {
  if (!element) return undefined
  return parseStrandColorsFromXml(element.innerHTML, sequenceLength) ?? parseStrandColorsFromXml(element.outerHTML, sequenceLength)
}

function formatSnapGeneColorRange(range: StrandColorRange): string {
  if (range.end < range.start) {
    return `${range.start + 1}..${range.end}`
  }
  return `${range.start + 1}..${range.end}`
}

function serializeColorRanges(ranges: StrandColorRange[]): string {
  if (!ranges.length) return ''
  return ranges
    .map(
      (range) =>
        `<ColorRange range="${formatSnapGeneColorRange(range)}" colors="${range.color.replaceAll('"', '&quot;')}"/>`,
    )
    .join('')
}

export function exportSnapGeneStrandColorsXml(colors: StrandColors): string {
  const typeAttr = colors.type ? ` type="${colors.type}"` : ''
  const top = colors.topStrand.length ? `<TopStrand>${serializeColorRanges(colors.topStrand)}</TopStrand>` : ''
  const bottom = colors.bottomStrand.length
    ? `<BottomStrand>${serializeColorRanges(colors.bottomStrand)}</BottomStrand>`
    : ''
  return `<StrandColors${typeAttr}>${top}${bottom}</StrandColors>`
}

export function exportSnapGeneHistoryColorsXml(colors: StrandColors): string {
  return `<HistoryColors>${exportSnapGeneStrandColorsXml(colors)}</HistoryColors>`
}

export function positionInStrandColorRange(
  position: number,
  range: StrandColorRange,
  sequenceLength: number,
  topology: Topology,
): boolean {
  if (range.start < range.end) {
    return position >= range.start && position < range.end
  }
  if (topology !== 'circular' || sequenceLength <= 0) {
    return position >= range.start || position < range.end
  }
  return position >= range.start || position < range.end
}

function expandWrappedStrandColorRange(range: StrandColorRange, sequenceLength: number): StrandColorRange[] {
  if (range.start < range.end) return [range]
  if (sequenceLength <= 0) return [range]
  return [
    { start: range.start, end: sequenceLength, color: range.color },
    { start: 0, end: range.end, color: range.color },
  ]
}

function trimStrandColorRangeAgainstCut(
  range: StrandColorRange,
  cutStart: number,
  cutEnd: number,
  sequenceLength: number,
): StrandColorRange[] {
  return expandWrappedStrandColorRange(range, sequenceLength).flatMap((piece) => {
    if (cutEnd <= piece.start || cutStart >= piece.end) return [piece]
    const trimmed: StrandColorRange[] = []
    if (piece.start < cutStart) trimmed.push({ start: piece.start, end: cutStart, color: piece.color })
    if (cutEnd < piece.end) trimmed.push({ start: cutEnd, end: piece.end, color: piece.color })
    return trimmed
  })
}

function paintSpanOnStrandRanges(
  ranges: StrandColorRange[],
  start: number,
  end: number,
  color: string,
  sequenceLength: number,
): StrandColorRange[] {
  if (end <= start) return ranges
  const trimmed = ranges.flatMap((range) => trimStrandColorRangeAgainstCut(range, start, end, sequenceLength))
  return [...trimmed, { start, end, color }]
}

function selectionPaintSpans(
  selection: { start: number; end: number },
  sequenceLength: number,
): Array<{ start: number; end: number }> {
  if (selection.end === selection.start) {
    const end = selection.start + 1
    return end <= sequenceLength ? [{ start: selection.start, end }] : []
  }
  if (selection.end > selection.start) {
    return [{ start: selection.start, end: selection.end }]
  }
  if (sequenceLength <= 0) return []
  return [
    { start: selection.start, end: sequenceLength },
    { start: 0, end: selection.end },
  ]
}

export function paintStrandColorForSelection(
  colors: StrandColors | undefined,
  strand: Strand,
  selection: { start: number; end: number },
  color: string,
  sequenceLength: number,
): StrandColors {
  const strandKey = strand === 'forward' ? 'topStrand' : 'bottomStrand'
  let painted = [...(colors?.[strandKey] ?? [])]
  for (const span of selectionPaintSpans(selection, sequenceLength)) {
    painted = paintSpanOnStrandRanges(painted, span.start, span.end, color, sequenceLength)
  }
  return {
    type: colors?.type,
    topStrand: strand === 'forward' ? painted : colors?.topStrand ?? [],
    bottomStrand: strand === 'reverse' ? painted : colors?.bottomStrand ?? [],
  }
}

export function clearStrandColorForSelection(
  colors: StrandColors | undefined,
  strand: Strand,
  selection: { start: number; end: number },
  sequenceLength: number,
): StrandColors {
  const strandKey = strand === 'forward' ? 'topStrand' : 'bottomStrand'
  let cleared = [...(colors?.[strandKey] ?? [])]
  for (const span of selectionPaintSpans(selection, sequenceLength)) {
    cleared = cleared.flatMap((range) => trimStrandColorRangeAgainstCut(range, span.start, span.end, sequenceLength))
  }
  return {
    type: colors?.type,
    topStrand: strand === 'forward' ? cleared : colors?.topStrand ?? [],
    bottomStrand: strand === 'reverse' ? cleared : colors?.bottomStrand ?? [],
  }
}

export function strandColorAtPosition(
  colors: StrandColors | undefined,
  position: number,
  strand: Strand,
  sequenceLength: number,
  topology: Topology,
): string | undefined {
  if (!colors) return undefined
  const ranges = strand === 'forward' ? colors.topStrand : colors.bottomStrand
  for (const range of ranges) {
    if (positionInStrandColorRange(position, range, sequenceLength, topology)) {
      return snapGeneColorToCss(range.color)
    }
  }
  return undefined
}

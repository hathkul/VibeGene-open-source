import type { EnzymeOverhang, RestrictionEnzyme } from './types'

export function splitSlashOutsideParens(notation: string) {
  let depth = 0
  for (let index = 0; index < notation.length; index += 1) {
    const ch = notation[index]
    if (ch === '(') depth += 1
    if (ch === ')') depth = Math.max(0, depth - 1)
    if (ch === '/' && depth === 0) return index
  }
  return -1
}

export function computeOverhang(recognition: string, cutTop: number, cutBottom: number): EnzymeOverhang {
  if (cutTop === cutBottom) {
    return { type: 'blunt', sequence: null, length: 0 }
  }

  const length = Math.abs(cutBottom - cutTop)
  const type = cutTop < cutBottom ? "5'" : "3'"

  if (
    cutTop >= 0 &&
    cutBottom >= 0 &&
    cutTop <= recognition.length &&
    cutBottom <= recognition.length
  ) {
    const sequence =
      cutTop < cutBottom
        ? recognition.slice(cutTop, cutBottom)
        : recognition.slice(cutBottom, cutTop)
    return { type, sequence, length }
  }

  return { type, sequence: 'N'.repeat(length), length }
}

/** Parse cut offsets such as `7`, `-7`, or ranged Thermo values like `12-13` (uses the first endpoint). */
export function parseCutOffset(value: string | undefined): number | null {
  if (value == null || value === '') return null
  const rangeMatch = value.match(/^(-?\d+)-(-?\d+)$/)
  if (rangeMatch) return Number(rangeMatch[1])
  if (/^-?\d+$/.test(value)) return Number(value)
  return null
}

/** Expand Thermo/NEB `(N)6` spacer runs into literal `NNNNNN` before letter extraction. */
export function expandNebSpacerNotation(notation: string) {
  return notation.replace(/\(N\)\s*(\d+)/gi, (_, count) => 'N'.repeat(Number(count)))
}

/**
 * Return recognition-pattern offsets that contact specific motif bases. Long internal
 * N-runs represent a spacer between recognition arms; the spacer length is constrained,
 * but its bases are not part of the enzyme's sequence-specific recognition.
 */
export function enzymeRecognizedBaseOffsets(recognition: string): number[] {
  const recognized = Array.from({ length: recognition.length }, (_, index) => index)
  let index = 0
  while (index < recognition.length) {
    if (recognition[index] !== 'N') {
      index += 1
      continue
    }
    const runStart = index
    while (index < recognition.length && recognition[index] === 'N') index += 1
    const runLength = index - runStart
    if (runLength >= 3 && runStart > 0 && index < recognition.length) {
      for (let offset = runStart; offset < index; offset += 1) recognized[offset] = -1
    }
  }
  return recognized.filter((offset) => offset >= 0)
}

type ParsedNebRecognition = Pick<
  RestrictionEnzyme,
  | 'notation'
  | 'recognition'
  | 'cutTop'
  | 'cutBottom'
  | 'upstreamCutTop'
  | 'upstreamCutBottom'
  | 'type'
  | 'overhang'
>

export function parseNebRecognition(notation: string): ParsedNebRecognition {
  const raw = expandNebSpacerNotation(notation.trim().toUpperCase())
  const slashIndex = splitSlashOutsideParens(raw)
  if (slashIndex !== -1) {
    const recognition = raw.replace('/', '').replace(/[^A-Z]/g, '')
    const cutTop = slashIndex
    const cutBottom = recognition.length - cutTop
    return {
      notation: raw,
      recognition,
      cutTop,
      cutBottom,
      type: 'II',
      overhang: computeOverhang(recognition, cutTop, cutBottom),
    }
  }

  const match = raw.match(/^(?:\(([-\d]+)\/([-\d]+)\))?([A-Z]+)(?:\(([-\d]+)\/([-\d]+)\))?$/)
  if (match) {
    const leftA = parseCutOffset(match[1])
    const leftB = parseCutOffset(match[2])
    const recognition = (match[3] ?? '').replace(/[^A-Z]/g, '')
    const rightA = parseCutOffset(match[4])
    const rightB = parseCutOffset(match[5])
    const hasLeft = leftA != null && leftB != null
    const hasRight = rightA != null && rightB != null

    // Prefer the distal (right) pair for the primary cut used by site finding;
    // keep the proximal (left) pair when both sides are present (AloI, BaeI, …).
    const a = rightA ?? leftA
    const b = rightB ?? leftB
    const cutTop = a == null ? 1 : a < 0 ? a : recognition.length + a
    const cutBottom = b == null ? Math.max(0, recognition.length - 1) : b < 0 ? b : recognition.length + b

    const parsed: ParsedNebRecognition = {
      notation: raw,
      recognition,
      cutTop,
      cutBottom,
      type: a == null && b == null ? 'II' : 'IIS',
      overhang: computeOverhang(recognition, cutTop, cutBottom),
    }

    if (hasLeft && hasRight) {
      parsed.upstreamCutTop = leftA! < 0 ? leftA! : -leftA!
      parsed.upstreamCutBottom = leftB! < 0 ? leftB! : -leftB!
    }

    return parsed
  }

  const recognition = raw.replace(/[^A-Z]/g, '')
  const cutTop = 1
  const cutBottom = Math.max(0, recognition.length - 1)
  return {
    notation: raw,
    recognition,
    cutTop,
    cutBottom,
    type: 'II',
    overhang: computeOverhang(recognition, cutTop, cutBottom),
  }
}

function lettersOnly(value: string) {
  return value.replace(/[^A-Z]/g, '')
}

export function parseThermoRecognition(raw: string): Pick<
  RestrictionEnzyme,
  'notation' | 'recognition' | 'cutTop' | 'cutBottom' | 'type' | 'overhang'
> | null {
  let text = raw.trim().toUpperCase()
  text = text.replace(/\(N\)\s*(\d+)/g, (_, count) => 'N'.repeat(Number(count)))
  text = text.replace(/\?/g, '^')
  text = text.replace(/\s+/g, '')
  text = text.replace(/M[56]/g, '')
  if (text.startsWith('^') && text.endsWith('^')) {
    text = text.slice(1, -1)
  }

  if (text.endsWith('^') && /\([\d-]+\/[\d-]+\)$/.test(text.slice(0, -1))) {
    return parseNebRecognition(text.slice(0, -1))
  }

  if (text.startsWith('^') && text.indexOf('^', 1) === -1) {
    return parseNebRecognition(`/${text.slice(1)}`)
  }

  const caretCount = (text.match(/\^/g) ?? []).length
  if (caretCount === 1) {
    return parseNebRecognition(text.replace('^', '/'))
  }

  if (text.endsWith('^') && text.includes('(')) {
    return parseNebRecognition(text.slice(0, -1))
  }

  const nebParsed = parseNebRecognition(text)
  if (nebParsed.recognition) return nebParsed

  return null
}

export function parseSibRecognition(raw: string): ParsedNebRecognition | null {
  const text = raw.replace(/\s+/g, ' ').trim().toUpperCase()

  // Dual cutters (PsrI/ArsI/FalI/BarI): cuts on both sides of an interrupted motif.
  // ↑ (N) leftTop SEQ (N) rightTop ↑ ↓ (N) leftBottom RC (N) rightBottom ↓
  const dualSpacerMatch = text.match(
    /^↑\s*\(N\)\s*(\d+)\s*([ACGTNRYKMSWBDHV]+)\s*\(N\)\s*(\d+)\s*↑\s*↓\s*\(N\)\s*(\d+)\s*([ACGTNRYKMSWBDHV]+)\s*\(N\)\s*(\d+)\s*↓$/,
  )
  if (dualSpacerMatch) {
    const [, leftTop, recognition, rightTop, leftBottom, , rightBottom] = dualSpacerMatch
    return parseNebRecognition(
      `(${leftTop}/${leftBottom})${recognition}(${rightTop}/${rightBottom})`,
    )
  }

  const iisMatch = text.match(/^([ACGTNRYKMSWBDHV]+)\(N\)\s*(\d+)\s*↑\s*([ACGTNRYKMSWBDHV]+)\(N\)\s*(\d+)\s*↓/)
  if (iisMatch) {
    const [, left, cutA, , cutB] = iisMatch
    return parseNebRecognition(`${left}(${cutA}/${cutB})`)
  }

  const match = text.match(/^(.*?)↑\s*(.*?)\s+(.*?)\s*↓\s*(.*)$/)
  if (!match) return null

  const topBefore = lettersOnly(match[1] ?? '')
  const topAfter = lettersOnly(match[2] ?? '')
  const bottomBefore = lettersOnly(match[3] ?? '')

  if (!topBefore && topAfter) {
    if (topAfter.length === 4) {
      return parseNebRecognition(`/${topAfter}`)
    }
    if (topAfter.length >= 5) {
      return parseNebRecognition(`${topAfter[0]}/${topAfter.slice(1)}`)
    }
  }

  const recognition = topBefore + topAfter
  if (!recognition) return null

  const cutTop = topBefore.length
  const cutBottom = bottomBefore.length
  const notation = `${topBefore}/${topAfter}`

  return {
    notation,
    recognition,
    cutTop,
    cutBottom,
    type: 'II',
    overhang: computeOverhang(recognition, cutTop, cutBottom),
  }
}

export function parseVivantisRecognition(raw: string): Pick<
  RestrictionEnzyme,
  'notation' | 'recognition' | 'cutTop' | 'cutBottom' | 'type' | 'overhang'
> | null {
  // Vivantis product pages render cut sites as:
  //   5'…<TOP_BEFORE>↓<TOP_AFTER>…3'
  //   3'…<BOTTOM_BEFORE>↑<BOTTOM_AFTER>…5'
  // where ↑/↓ mark the cut position.
  const text = raw
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .toUpperCase()

  const letters = '[ACGTURYKMSWBDHVN]+'
  const topMatch = new RegExp(`5['’][\\s\\S]*?(${letters})\\s*↓\\s*(${letters})[\\s\\S]*?3['’]`, 'i').exec(text)
  if (!topMatch) return null

  const bottomMatch = new RegExp(`3['’][\\s\\S]*?(${letters})\\s*↑\\s*(${letters})[\\s\\S]*?5['’]`, 'i').exec(text)
  if (!bottomMatch) return null

  const topBefore = topMatch[1]!
  const topAfter = topMatch[2]!
  const bottomBefore = bottomMatch[1]!

  const recognition = topBefore + topAfter
  if (!recognition) return null

  const cutTop = topBefore.length
  const cutBottom = bottomBefore.length

  const type: RestrictionEnzyme['type'] =
    cutTop < 0 || cutBottom < 0 || cutTop > recognition.length || cutBottom > recognition.length ? 'IIS' : 'II'

  return {
    notation: `${topBefore}/${topAfter}`,
    recognition,
    cutTop,
    cutBottom,
    type,
    overhang: computeOverhang(recognition, cutTop, cutBottom),
  }
}

function normalizeUsbStrand(value: string) {
  return value
    .replace(/[.\s']/g, '')
    .replace(/[↓↑]/g, '^')
    .replace(/\(N\)(\d+)/gi, '($1)')
}

function lettersFromUsbStrand(value: string) {
  return value.replace(/\^/g, '').replace(/\(\d+\)/g, '').replace(/[^A-Z]/g, '')
}

export function parseUsbRecognition(
  raw: string,
  fullDescription = '',
): Pick<RestrictionEnzyme, 'notation' | 'recognition' | 'cutTop' | 'cutBottom' | 'type' | 'overhang'> | null {
  const siteMatch = fullDescription.match(/recognizes\s+([A-Z^/()\dNRYKMSWBDHV.]+?)\s+site/i)
  if (siteMatch) {
    const site = siteMatch[1]!.trim().replace(/\^/g, '/')
    const parsed = parseThermoRecognition(site) ?? parseNebRecognition(site)
    if (parsed.recognition) return parsed
  }

  let text = raw.trim().toUpperCase().replace(/\s+/g, ' ')
  text = text.replace(/↓/g, '^').replace(/↑/g, '^')

  const dualStrand = text.match(/5['']-?\s*(.+?)\s*-3['']\s*\|\s*3['']-?\s*(.+?)\s*-5['']/i)
  if (dualStrand) {
    const topRaw = normalizeUsbStrand(dualStrand[1]!)
    const bottomRaw = normalizeUsbStrand(dualStrand[2]!)

    const topSpacer = topRaw.match(/^([A-Z]+)\((\d+)\)\^/)
    const bottomSpacer = bottomRaw.match(/^([A-Z]+)\((\d+)\)\^/)
    if (topSpacer && bottomSpacer) {
      return parseNebRecognition(`${topSpacer[1]}(${topSpacer[2]}/${bottomSpacer[2]})`)
    }

    const topCaret = topRaw.indexOf('^')
    const bottomCaret = bottomRaw.indexOf('^')
    if (topCaret !== -1 && bottomCaret !== -1) {
      const recognition = lettersFromUsbStrand(topRaw)
      const cutTop = lettersFromUsbStrand(topRaw.slice(0, topCaret)).length
      const cutBottom = lettersFromUsbStrand(bottomRaw.slice(0, bottomCaret)).length
      if (recognition) {
        return {
          notation: `${recognition}(${cutTop}/${cutBottom})`,
          recognition,
          cutTop,
          cutBottom,
          type:
            cutTop > recognition.length ||
            cutBottom > recognition.length ||
            cutTop < 0 ||
            cutBottom < 0
              ? 'IIS'
              : 'II',
          overhang: computeOverhang(recognition, cutTop, cutBottom),
        }
      }
    }
  }

  const slashSite = raw.match(/recognizes\s+([A-Z^/()\dNRYKMSWBDHV.]+)/i)
  if (slashSite) {
    const parsed = parseThermoRecognition(slashSite[1]!) ?? parseNebRecognition(slashSite[1]!.replace(/\^/g, '/'))
    if (parsed.recognition) return parsed
  }

  const degenerate = text.match(/^\(([A-Z/]+)\)\s*\|\s*([A-Z()N\d\s]+)\s*\|\s*\(([A-Z/]+)\)\s*\|\s*([A-Z()N\d\s]+)$/i)
  if (degenerate) {
    const recognition = lettersOnly(degenerate[2]!)
    if (recognition) {
      const cutTop = 0
      const cutBottom = recognition.length
      return {
        notation: `${recognition}(${cutTop}/${cutBottom})`,
        recognition,
        cutTop,
        cutBottom,
        type: 'II',
        overhang: computeOverhang(recognition, cutTop, cutBottom),
      }
    }
  }

  if (text.includes('^') || text.includes('/')) {
    const parsed = parseThermoRecognition(text.replace(/\^/g, '/')) ?? parseNebRecognition(text.replace(/\^/g, '/'))
    if (parsed.recognition) return parsed
  }

  return null
}

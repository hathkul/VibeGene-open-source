import {
  detectImmunoglobulinNumbering,
  type ImmunoglobulinNumbering,
  type ImmunoglobulinNumberingScheme,
} from './immunoglobulinNumbering'

export type ScfvOrientation = 'VH-VL' | 'VL-VH'

export type ScfvDetection = {
  scheme: 'scfv'
  numberingScheme: ImmunoglobulinNumberingScheme
  orientation: ScfvOrientation
  format: string
  confidence: number
  queryStart: number
  queryEnd: number
  heavy: ImmunoglobulinNumbering
  light: ImmunoglobulinNumbering
  linkerStart: number
  linkerEnd: number
  linkerSequence: string
  linkerConfidence: number
  /** Per-residue labels such as VH.105, VL.24, Lnk.3; null outside the scFv. */
  positions: Array<string | null>
}

const MIN_LINKER_LENGTH = 3
const MAX_LINKER_LENGTH = 60
const MIN_DOMAIN_CONFIDENCE = 0.5

function sanitizeProtein(sequence: string) {
  return sequence.replace(/[^A-Za-z*]/g, '').toUpperCase()
}

function rangesOverlap(leftStart: number, leftEnd: number, rightStart: number, rightEnd: number) {
  return leftStart < rightEnd && rightStart < leftEnd
}

function scoreLinker(sequence: string) {
  if (sequence.length < MIN_LINKER_LENGTH || sequence.length > MAX_LINKER_LENGTH) return 0
  const gsFraction = [...sequence].filter((residue) => residue === 'G' || residue === 'S').length
    / sequence.length
  const g4sMatches = sequence.match(/GGGGS/g)?.length ?? 0
  const g4sCoverage = Math.min(1, (g4sMatches * 5) / sequence.length)
  // Typical scFv linkers are Gly/Ser-rich and often (G₄S)ₙ.
  return Math.min(1, gsFraction * 0.65 + g4sCoverage * 0.35 + (sequence.length >= 10 && sequence.length <= 25 ? 0.1 : 0))
}

function mergePositions(
  sequenceLength: number,
  heavy: ImmunoglobulinNumbering,
  light: ImmunoglobulinNumbering,
  linkerStart: number,
  linkerEnd: number,
) {
  const positions = Array<string | null>(sequenceLength).fill(null)
  for (let index = 0; index < sequenceLength; index += 1) {
    const heavyLabel = heavy.positions[index]
    if (heavyLabel) positions[index] = `VH.${heavyLabel}`
    const lightLabel = light.positions[index]
    if (lightLabel) positions[index] = `VL.${lightLabel}`
  }
  for (let index = linkerStart, offset = 1; index < linkerEnd; index += 1, offset += 1) {
    positions[index] = `Lnk.${offset}`
  }
  return positions
}

/**
 * Detect an scFv (VH + flexible linker + VL, either orientation) and assign
 * combined VH/VL/Lnk residue numbering using the selected Ig scheme.
 */
export async function detectScfv(
  sequenceInput: string,
  numberingScheme: ImmunoglobulinNumberingScheme = 'imgt',
): Promise<ScfvDetection> {
  const sequence = sanitizeProtein(sequenceInput)
  if (!sequence) throw new Error('The protein sequence is empty.')

  let heavy: ImmunoglobulinNumbering
  let light: ImmunoglobulinNumbering
  try {
    ;[heavy, light] = await Promise.all([
      detectImmunoglobulinNumbering(sequence, numberingScheme, 'H'),
      detectImmunoglobulinNumbering(sequence, numberingScheme, 'light'),
    ])
  } catch {
    throw new Error('No scFv was detected (needs both a heavy and a light variable domain).')
  }

  if (heavy.confidence < MIN_DOMAIN_CONFIDENCE || light.confidence < MIN_DOMAIN_CONFIDENCE) {
    throw new Error('Variable domains were found, but confidence is too low for an scFv assignment.')
  }
  if (rangesOverlap(heavy.queryStart, heavy.queryEnd, light.queryStart, light.queryEnd)) {
    throw new Error('Heavy and light variable domains overlap; this does not look like an scFv.')
  }

  const orientation: ScfvOrientation = heavy.queryStart < light.queryStart ? 'VH-VL' : 'VL-VH'
  const first = orientation === 'VH-VL' ? heavy : light
  const second = orientation === 'VH-VL' ? light : heavy
  const linkerStart = first.queryEnd
  const linkerEnd = second.queryStart
  const linkerSequence = sequence.slice(linkerStart, linkerEnd)
  if (linkerSequence.length < MIN_LINKER_LENGTH) {
    throw new Error('The gap between VH and VL is too short to be an scFv linker.')
  }
  if (linkerSequence.length > MAX_LINKER_LENGTH) {
    throw new Error('The gap between VH and VL is too long for a typical scFv linker.')
  }

  const linkerConfidence = scoreLinker(linkerSequence)
  if (linkerConfidence < 0.25 && linkerSequence.length > 30) {
    throw new Error('The inter-domain sequence does not look like a Gly/Ser scFv linker.')
  }

  const domainConfidence = (heavy.confidence + light.confidence) / 2
  const confidence = Math.min(
    1,
    domainConfidence * 0.75 + Math.max(linkerConfidence, 0.35) * 0.25,
  )
  const queryStart = Math.min(heavy.queryStart, light.queryStart)
  const queryEnd = Math.max(heavy.queryEnd, light.queryEnd)
  const lightLabel = light.chain === 'L' ? 'λ' : 'κ'

  return {
    scheme: 'scfv',
    numberingScheme,
    orientation,
    format: `${orientation} (${lightLabel})`,
    confidence,
    queryStart,
    queryEnd,
    heavy,
    light,
    linkerStart,
    linkerEnd,
    linkerSequence,
    linkerConfidence,
    positions: mergePositions(sequence.length, heavy, light, linkerStart, linkerEnd),
  }
}

import type { ChromatogramData } from './traceTypes'
import { unwrapZtrChunkData } from './ztrFilters'

const ZTR_MAGIC = new Uint8Array([0xae, 0x5a, 0x54, 0x52, 0x0d, 0x0a, 0x1a, 0x0a])

export type SnapGeneZtrTrace = {
  bases: string
  positions: number[]
  confidence: number[]
  samples: { A: number[]; C: number[]; G: number[]; T: number[] }
  clip?: { left: number; right: number }
  text: Record<string, string>
  comments: string[]
}

function readAscii4(data: Uint8Array, offset: number) {
  return String.fromCharCode(data[offset]!, data[offset + 1]!, data[offset + 2]!, data[offset + 3]!).replace(/\0/g, '').trim()
}

function parseBaseChunk(chunkData: Uint8Array) {
  if (!chunkData.length) return ''
  const start = chunkData[0] === 0 ? 1 : 0
  return new TextDecoder('ascii').decode(chunkData.subarray(start)).replace(/\0/g, '')
}

function parseSmp4Chunk(chunkData: Uint8Array) {
  const samples: SnapGeneZtrTrace['samples'] = { A: [], C: [], G: [], T: [] }
  if (chunkData.length <= 2) return samples

  const sampleData = chunkData.subarray(2)
  const traceLen = Math.floor(sampleData.length / 8)
  for (const [channelIndex, base] of (['A', 'C', 'G', 'T'] as const).entries()) {
    const channel: number[] = []
    const start = channelIndex * traceLen * 2
    for (let index = 0; index < traceLen * 2; index += 2) {
      if (start + index + 2 <= sampleData.length) {
        channel.push(new DataView(sampleData.buffer, sampleData.byteOffset + start + index, 2).getUint16(0, false))
      }
    }
    samples[base] = channel
  }
  return samples
}

function parseBposChunk(chunkData: Uint8Array) {
  if (!chunkData.length || chunkData[0] !== 0) return []
  const positions: number[] = []
  for (let index = 4; index + 4 <= chunkData.length; index += 4) {
    positions.push(new DataView(chunkData.buffer, chunkData.byteOffset + index, 4).getUint32(0, false))
  }
  return positions
}

function interpolateBasePositions(baseCount: number, sampleCount: number) {
  if (baseCount <= 0) return []
  if (baseCount === 1) return [0]
  const last = Math.max(0, sampleCount - 1)
  return Array.from({ length: baseCount }, (_, index) => Math.round((index * last) / (baseCount - 1)))
}

function basePositionsLookInvalid(positions: number[], sampleCount: number) {
  if (!positions.length || sampleCount <= 0) return true
  const max = Math.max(...positions)
  return max < Math.min(sampleCount - 1, sampleCount * 0.1)
}

function peakInRange(channel: number[], start: number, end: number, fallback: number) {
  const boundedStart = Math.max(0, Math.min(channel.length - 1, start))
  const boundedEnd = Math.max(boundedStart, Math.min(channel.length - 1, end))
  let bestScan = Math.max(boundedStart, fallback)
  let bestValue = -1
  for (let scan = boundedStart; scan <= boundedEnd; scan += 1) {
    const value = channel[scan] ?? 0
    if (value > bestValue) {
      bestValue = value
      bestScan = scan
    }
  }
  return bestScan
}

function medianOf(values: number[]) {
  if (!values.length) return 0
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.floor(sorted.length / 2)]!
}

function channelsOf(chromatogram: ChromatogramData): Record<string, number[]> {
  return { A: chromatogram.aTrace, T: chromatogram.tTrace, G: chromatogram.gTrace, C: chromatogram.cTrace }
}

/**
 * Reconstruct per-base scan positions by walking peak-to-peak in the called
 * channel with a running-median spacing estimate. Accurate when signal is clean
 * but can derail through noisy/ambiguous stretches, so it is paired with an
 * independent envelope-alignment estimate and the better of the two is chosen.
 */
function greedyAdaptivePositions(chromatogram: ChromatogramData): number[] {
  const { baseCalls } = chromatogram
  const channels = channelsOf(chromatogram)
  const sampleCount = chromatogram.aTrace.length
  const baseCount = baseCalls.length
  if (!sampleCount || !baseCount) return []

  const averageStep = sampleCount / baseCount
  const positions: number[] = []
  positions.push(peakInRange(channels[baseCalls[0]!] ?? chromatogram.aTrace, 0, Math.round(averageStep * 1.5), 0))

  let estimate = averageStep
  const recentSteps: number[] = []
  for (let index = 1; index < baseCount; index += 1) {
    const channel = channels[baseCalls[index]!] ?? chromatogram.aTrace
    const previous = positions[index - 1]!
    const minStep = Math.max(1, Math.round(estimate * 0.45))
    const maxStep = Math.max(minStep + 1, Math.round(estimate * 1.5))
    const found = peakInRange(channel, previous + minStep, previous + maxStep, previous + minStep)
    positions.push(found)
    recentSteps.push(found - previous)
    if (recentSteps.length > 15) recentSteps.shift()
    estimate = Math.max(averageStep * 0.7, Math.min(averageStep * 2.2, medianOf(recentSteps)))
  }

  return positions
}

/** Local maxima of the summed (A+T+G+C) envelope, each tagged with its dominant channel. */
function envelopePeaksWithDominant(chromatogram: ChromatogramData, smoothHalf: number) {
  const { aTrace, tTrace, gTrace, cTrace } = chromatogram
  const sampleCount = aTrace.length
  const prefix = new Float64Array(sampleCount + 1)
  for (let index = 0; index < sampleCount; index += 1) {
    prefix[index + 1] =
      prefix[index]! + (aTrace[index] ?? 0) + (tTrace[index] ?? 0) + (gTrace[index] ?? 0) + (cTrace[index] ?? 0)
  }
  const smoothed = new Float64Array(sampleCount)
  for (let index = 0; index < sampleCount; index += 1) {
    const low = Math.max(0, index - smoothHalf)
    const high = Math.min(sampleCount, index + smoothHalf + 1)
    smoothed[index] = (prefix[high]! - prefix[low]!) / (high - low)
  }

  const positions: number[] = []
  const dominant: string[] = []
  const channels = channelsOf(chromatogram)
  for (let index = 1; index < sampleCount - 1; index += 1) {
    if (smoothed[index]! >= smoothed[index - 1]! && smoothed[index]! > smoothed[index + 1]!) {
      positions.push(index)
      let base = 'A'
      let bestValue = -1
      for (const candidate of ['A', 'T', 'G', 'C'] as const) {
        const value = channels[candidate]![index] ?? 0
        if (value > bestValue) {
          bestValue = value
          base = candidate
        }
      }
      dominant.push(base)
    }
  }
  return { positions, dominant }
}

/**
 * Assign each base to an envelope peak by Needleman-Wunsch alignment of the
 * called-base sequence against the sequence of peak dominant-bases. Robust
 * across long ambiguous stretches, but can slip on low-quality reads.
 */
function alignBasesToEnvelopePeaks(chromatogram: ChromatogramData, peaks: { positions: number[]; dominant: string[] }): number[] {
  const { baseCalls } = chromatogram
  const baseCount = baseCalls.length
  const peakCount = peaks.positions.length
  const sampleCount = chromatogram.aTrace.length
  const averageStep = sampleCount / baseCount
  if (!peakCount) {
    return Array.from({ length: baseCount }, (_, index) =>
      Math.round((index * (sampleCount - 1)) / Math.max(1, baseCount - 1)),
    )
  }

  const MATCH = 4
  const MISMATCH = -1
  const GAP_BASE = -3
  const GAP_PEAK = -0.3
  const width = peakCount + 1
  const score = new Float64Array((baseCount + 1) * width)
  const trace = new Int8Array((baseCount + 1) * width)
  for (let column = 1; column <= peakCount; column += 1) {
    score[column] = column * GAP_PEAK
    trace[column] = 2
  }
  for (let row = 1; row <= baseCount; row += 1) {
    score[row * width] = row * GAP_BASE
    trace[row * width] = 1
  }

  for (let row = 1; row <= baseCount; row += 1) {
    const base = baseCalls[row - 1]
    const rowOffset = row * width
    const prevOffset = (row - 1) * width
    for (let column = 1; column <= peakCount; column += 1) {
      const substitution = base === peaks.dominant[column - 1] ? MATCH : MISMATCH
      let best = score[prevOffset + column - 1]! + substitution
      let step: 0 | 1 | 2 = 0
      const baseGap = score[prevOffset + column]! + GAP_BASE
      if (baseGap > best) {
        best = baseGap
        step = 1
      }
      const peakGap = score[rowOffset + column - 1]! + GAP_PEAK
      if (peakGap > best) {
        best = peakGap
        step = 2
      }
      score[rowOffset + column] = best
      trace[rowOffset + column] = step
    }
  }

  const positionOfBase = new Array<number>(baseCount).fill(-1)
  let row = baseCount
  let column = peakCount
  while (row > 0 && column >= 0) {
    const step = trace[row * width + column]!
    if (step === 0) {
      positionOfBase[row - 1] = peaks.positions[column - 1]!
      row -= 1
      column -= 1
    } else if (step === 1) {
      row -= 1
    } else {
      column -= 1
      if (column < 0) break
    }
  }

  for (let index = 0; index < baseCount; index += 1) {
    if (positionOfBase[index]! >= 0) continue
    let before = index - 1
    while (before >= 0 && positionOfBase[before]! < 0) before -= 1
    let after = index + 1
    while (after < baseCount && positionOfBase[after]! < 0) after += 1
    if (before >= 0 && after < baseCount) {
      const ratio = (index - before) / (after - before)
      positionOfBase[index] = Math.round(positionOfBase[before]! + (positionOfBase[after]! - positionOfBase[before]!) * ratio)
    } else if (before >= 0) {
      positionOfBase[index] = Math.round(positionOfBase[before]! + (index - before) * averageStep)
    } else if (after < baseCount) {
      positionOfBase[index] = Math.round(positionOfBase[after]! - (after - index) * averageStep)
    } else {
      positionOfBase[index] = Math.round(index * averageStep)
    }
  }
  for (let index = 1; index < baseCount; index += 1) {
    if (positionOfBase[index]! <= positionOfBase[index - 1]!) positionOfBase[index] = positionOfBase[index - 1]! + 1
  }
  return positionOfBase
}

/**
 * Ground-truth-free quality of a position assignment: mean purity of the called
 * channel at each assigned scan. Correct assignments land on the called base's
 * own peak (high purity); derailed ones land in mixed/low regions.
 */
function positionQuality(chromatogram: ChromatogramData, positions: number[]): number {
  const { baseCalls, aTrace, tTrace, gTrace, cTrace } = chromatogram
  const channels = channelsOf(chromatogram)
  if (!baseCalls.length) return 0
  let sum = 0
  for (let index = 0; index < baseCalls.length; index += 1) {
    const scan = positions[index]!
    const called = channels[baseCalls[index]!]?.[scan] ?? 0
    const total = (aTrace[scan] ?? 0) + (tTrace[scan] ?? 0) + (gTrace[scan] ?? 0) + (cTrace[scan] ?? 0)
    sum += total > 0 ? called / total : 0
  }
  return sum / baseCalls.length
}

/**
 * SnapGene embeds Sanger traces but stores only uniformly-spaced base positions,
 * discarding the real peak locations. Reconstruct them from the (identical to
 * the source .ab1) sample data using two complementary estimators and keep the
 * higher-quality one, so the embedded chromatogram matches externally added
 * .ab1 traces.
 */
function reconstructBasePositions(chromatogram: ChromatogramData): number[] {
  const sampleCount = chromatogram.aTrace.length
  const baseCount = chromatogram.baseCalls.length
  if (!sampleCount || !baseCount) return []

  const averageStep = sampleCount / baseCount
  const greedy = greedyAdaptivePositions(chromatogram)
  const peaks = envelopePeaksWithDominant(chromatogram, Math.max(2, Math.round(averageStep * 0.5)))
  const aligned = alignBasesToEnvelopePeaks(chromatogram, peaks)

  return positionQuality(chromatogram, aligned) > positionQuality(chromatogram, greedy) ? aligned : greedy
}

/** Base positions with (nearly) constant spacing carry no real peak information. */
function basePositionsAreUniform(positions: number[]) {
  if (positions.length < 3) return true
  const step = (positions[positions.length - 1]! - positions[0]!) / (positions.length - 1)
  if (step <= 0) return true
  const tolerance = Math.max(2, step * 0.15)
  for (let index = 1; index < positions.length; index += 1) {
    if (Math.abs(positions[index]! - positions[index - 1]! - step) > tolerance) return false
  }
  return true
}

export function parseSnapGeneZtr(data: Uint8Array): SnapGeneZtrTrace | null {
  if (data.length < 10 || !data.subarray(0, 8).every((byte, index) => byte === ZTR_MAGIC[index])) {
    return null
  }

  const result: SnapGeneZtrTrace = {
    bases: '',
    positions: [],
    confidence: [],
    samples: { A: [], C: [], G: [], T: [] },
    text: {},
    comments: [],
  }

  let offset = 10
  while (offset + 8 <= data.length) {
    const chunkType = readAscii4(data, offset)
    const metaLen = new DataView(data.buffer, data.byteOffset + offset + 4, 4).getUint32(0, false)
    offset += 8 + metaLen
    if (offset + 4 > data.length) break

    const dataLen = new DataView(data.buffer, data.byteOffset + offset, 4).getUint32(0, false)
    offset += 4
    if (offset + dataLen > data.length) break

    const meta = metaLen > 0 ? data.subarray(offset - metaLen, offset) : null
    let chunkData: Uint8Array
    try {
      chunkData = unwrapZtrChunkData(data.subarray(offset, offset + dataLen))
    } catch {
      offset += dataLen
      continue
    }
    offset += dataLen

    if (chunkType === 'BASE') {
      result.bases = parseBaseChunk(chunkData)
    } else if (chunkType === 'BPOS') {
      result.positions = parseBposChunk(chunkData)
    } else if (chunkType === 'CNF4' && chunkData.length > 1) {
      result.confidence = Array.from(chunkData.subarray(1))
    } else if (chunkType === 'SMP4') {
      result.samples = parseSmp4Chunk(chunkData)
    } else if (chunkType === 'SAMP' && meta && chunkData.length > 2) {
      const channel = String.fromCharCode(meta[0]!).toUpperCase()
      if (channel === 'A' || channel === 'C' || channel === 'G' || channel === 'T') {
        const trace: number[] = []
        const sampleData = chunkData.subarray(2)
        for (let index = 0; index + 2 <= sampleData.length; index += 2) {
          trace.push(new DataView(sampleData.buffer, sampleData.byteOffset + index, 2).getUint16(0, false))
        }
        result.samples[channel] = trace
      }
    } else if (chunkType === 'TEXT' && chunkData.length > 2) {
      const items = new TextDecoder('ascii').decode(chunkData.subarray(2)).split('\0').filter(Boolean)
      for (let index = 0; index < items.length - 1; index += 2) {
        const key = items[index]
        const value = items[index + 1]
        if (key) result.text[key] = value ?? ''
      }
    } else if (chunkType === 'CLIP' && chunkData.length >= 9) {
      result.clip = {
        left: new DataView(chunkData.buffer, chunkData.byteOffset + 1, 4).getUint32(0, false),
        right: new DataView(chunkData.buffer, chunkData.byteOffset + 5, 4).getUint32(0, false),
      }
    } else if (chunkType === 'COMM' && chunkData.length > 1) {
      result.comments.push(new TextDecoder('ascii').decode(chunkData.subarray(1)).replace(/\0/g, ''))
    }
  }

  if (!result.bases) return null

  const hasChromatogram = result.samples.A.length > 0
  if (hasChromatogram) {
    if (!result.positions.length || result.positions.length !== result.bases.length) {
      result.positions = interpolateBasePositions(result.bases.length, result.samples.A.length)
    }
  } else {
    result.positions = []
  }

  return result
}

function concatBytes(parts: Uint8Array[]) {
  const size = parts.reduce((total, part) => total + part.length, 0)
  const output = new Uint8Array(size)
  let offset = 0
  parts.forEach((part) => {
    output.set(part, offset)
    offset += part.length
  })
  return output
}

function encodeZtrChunk(type: string, chunkData: Uint8Array, meta: Uint8Array = new Uint8Array(0)) {
  const header = new Uint8Array(8 + meta.length + 4)
  header[0] = type.charCodeAt(0)
  header[1] = type.charCodeAt(1)
  header[2] = type.charCodeAt(2)
  header[3] = type.charCodeAt(3)
  const view = new DataView(header.buffer)
  view.setUint32(4, meta.length, false)
  header.set(meta, 8)
  view.setUint32(8 + meta.length, chunkData.length, false)
  return concatBytes([header, chunkData])
}

function encodeBaseChunk(bases: string) {
  const ascii = bases.toUpperCase().replace(/[^ACGTN]/g, 'N')
  const data = new Uint8Array(1 + ascii.length)
  data[0] = 0
  for (let index = 0; index < ascii.length; index += 1) {
    data[index + 1] = ascii.charCodeAt(index)
  }
  return encodeZtrChunk('BASE', data)
}

function encodeBposChunk(positions: number[]) {
  const data = new Uint8Array(4 + positions.length * 4)
  data[0] = 0
  const view = new DataView(data.buffer)
  positions.forEach((position, index) => {
    view.setUint32(4 + index * 4, Math.max(0, Math.floor(position)), false)
  })
  return encodeZtrChunk('BPOS', data)
}

function encodeSmp4Chunk(samples: { A: number[]; C: number[]; G: number[]; T: number[] }) {
  const traceLen = Math.min(samples.A.length, samples.C.length, samples.G.length, samples.T.length)
  const data = new Uint8Array(2 + traceLen * 8)
  data[0] = 0
  data[1] = 0
  const view = new DataView(data.buffer)
  ;(['A', 'C', 'G', 'T'] as const).forEach((channel, channelIndex) => {
    const channelSamples = samples[channel]
    const start = 2 + channelIndex * traceLen * 2
    for (let index = 0; index < traceLen; index += 1) {
      view.setUint16(start + index * 2, Math.max(0, Math.min(0xffff, Math.round(channelSamples[index] ?? 0))), false)
    }
  })
  return encodeZtrChunk('SMP4', data)
}

/** Encode a SnapGene-compatible ZTR payload for an alignment sequence / chromatogram. */
export function encodeSnapGeneZtr(input: {
  bases: string
  samples?: { A: number[]; C: number[]; G: number[]; T: number[] }
  positions?: number[]
}): Uint8Array {
  const magic = new Uint8Array([0xae, 0x5a, 0x54, 0x52, 0x0d, 0x0a, 0x1a, 0x0a, 0x01, 0x02])
  const chunks: Uint8Array[] = [encodeBaseChunk(input.bases)]
  const samples = input.samples
  const hasSamples =
    Boolean(samples) &&
    Math.min(samples!.A.length, samples!.C.length, samples!.G.length, samples!.T.length) > 0
  if (hasSamples) {
    const positions =
      input.positions && input.positions.length === input.bases.length
        ? input.positions
        : interpolateBasePositions(input.bases.length, samples!.A.length)
    chunks.push(encodeBposChunk(positions))
    chunks.push(encodeSmp4Chunk(samples!))
  }
  return concatBytes([magic, ...chunks])
}

export function snapGeneZtrToChromatogram(trace: SnapGeneZtrTrace): ChromatogramData {
  const baseCalls = trace.bases.toUpperCase().split('')
  const sampleCount = trace.samples.A.length
  const chromatogramWithoutPositions: ChromatogramData = {
    aTrace: trace.samples.A,
    tTrace: trace.samples.T,
    gTrace: trace.samples.G,
    cTrace: trace.samples.C,
    baseCalls,
    basePos: [],
  }

  let basePos: number[] = []
  if (sampleCount > 0) {
    const storedAreUsable =
      trace.positions.length === baseCalls.length &&
      !basePositionsLookInvalid(trace.positions, sampleCount) &&
      !basePositionsAreUniform(trace.positions)
    // SnapGene stores uniformly-spaced positions (real peaks discarded), so
    // reconstruct from samples unless a genuine non-uniform peak track exists.
    basePos = storedAreUsable ? trace.positions : reconstructBasePositions(chromatogramWithoutPositions)
  }

  let qualNums: number[] | undefined
  if (trace.confidence.length >= baseCalls.length * 5) {
    qualNums = []
    for (let index = 0; index < baseCalls.length; index += 1) {
      qualNums.push(trace.confidence[index * 5] ?? 0)
    }
  } else if (trace.confidence.length === baseCalls.length) {
    qualNums = trace.confidence
  }

  return {
    aTrace: trace.samples.A,
    tTrace: trace.samples.T,
    gTrace: trace.samples.G,
    cTrace: trace.samples.C,
    basePos,
    baseCalls,
    qualNums,
  }
}

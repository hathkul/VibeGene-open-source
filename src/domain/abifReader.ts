import type { ChromatogramData } from './traceTypes'

type AbifTag = {
  tagName: string
  tagNum: number
  type: 'char' | 'short' | 'number'
}

const tagDict = {
  baseCalls1: { tagName: 'PBAS', tagNum: 1, type: 'char' },
  baseCalls2: { tagName: 'PBAS', tagNum: 2, type: 'char' },
  baseOrder: { tagName: 'FWO_', tagNum: 1, type: 'char' },
  qualNums: { tagName: 'PCON', tagNum: 2, type: 'number' },
  peakLocations: { tagName: 'PLOC', tagNum: 2, type: 'short' },
  rawPeakLocations: { tagName: 'PLOC', tagNum: 1, type: 'short' },
} as const satisfies Record<string, AbifTag>

function colorDataTag(tagNum: number): AbifTag {
  return { tagName: 'DATA', tagNum, type: 'short' }
}

function readChars(view: DataView, offset: number, count: number, elementSize: number) {
  const values: string[] = []
  for (let index = 0; index < count; index += 1) {
    values.push(String.fromCharCode(view.getInt8(offset + index * elementSize)))
  }
  return values
}

function readShorts(view: DataView, offset: number, count: number, elementSize: number) {
  const values: number[] = []
  // `count` is numElements; each element starts at its element-size offset.
  for (let index = 0; index < count; index += 1) {
    values.push(view.getInt16(offset + index * elementSize))
  }
  return values
}

function readNumbers(view: DataView, offset: number, count: number, elementSize: number) {
  const values: number[] = []
  for (let index = 0; index < count; index += 1) {
    values.push(view.getInt8(offset + index * elementSize))
  }
  return values
}

function readTagValue(view: DataView, tag: AbifTag, offset: number, count: number, elementSize: number) {
  if (tag.type === 'char') return readChars(view, offset, count, elementSize)
  if (tag.type === 'short') return readShorts(view, offset, count, elementSize)
  return readNumbers(view, offset, count, elementSize)
}

function getTagName(view: DataView, offset: number) {
  let name = ''
  for (let index = offset; index < offset + 4; index += 1) {
    name += String.fromCharCode(view.getInt8(index))
  }
  return name
}

function getDataTag(view: DataView, dirLocation: number, lastEntry: number, tag: AbifTag): number[] | string[] | undefined {
  for (let entry = dirLocation; entry < lastEntry; entry += 28) {
    const tagName = getTagName(view, entry)
    const tagNum = view.getInt32(entry + 4)
    if (tagName !== tag.tagName || tagNum !== tag.tagNum) continue
    const elementSize = view.getUint16(entry + 10)
    const numElements = view.getUint32(entry + 12)
    const dataSize = view.getUint32(entry + 16)
    // ABIF stores payloads up to four bytes directly in the directory entry's
    // data-offset field; FWO_ is commonly an inline four-character payload.
    const entryOffset = dataSize <= 4 ? entry + 20 : view.getUint32(entry + 20)
    const expectedElementSize = tag.type === 'short' ? 2 : 1
    const expectedDataSize = numElements * elementSize
    if (
      elementSize !== expectedElementSize
      || !Number.isSafeInteger(expectedDataSize)
      || dataSize !== expectedDataSize
      || entryOffset > view.byteLength
      || dataSize > view.byteLength - entryOffset
    ) return undefined
    return readTagValue(view, tag, entryOffset, numElements, elementSize)
  }
  return undefined
}

function hasDirectoryTag(view: DataView, dirLocation: number, lastEntry: number, tag: AbifTag) {
  for (let entry = dirLocation; entry < lastEntry; entry += 28) {
    if (getTagName(view, entry) === tag.tagName && view.getInt32(entry + 4) === tag.tagNum) return true
  }
  return false
}

function normalizeQualNums(qualNums: number[] | undefined) {
  if (!qualNums?.length) return undefined
  if (!qualNums.some((value) => value !== 0 && value !== 1)) return undefined
  return qualNums
}

/** PBAS may include a C-style terminator that has no matching PLOC entry. */
function trimBaseCallTerminator(baseCalls: string[]) {
  const terminatorIndex = baseCalls.indexOf('\0')
  return (terminatorIndex === -1 ? baseCalls : baseCalls.slice(0, terminatorIndex))
    .map((base) => base.toUpperCase())
}

function resolveBaseOrder(baseOrderRaw: string[] | undefined, hasBaseOrderTag: boolean) {
  // GATC is the documented 3500-series order and preserves compatibility with
  // legacy valid AB1 files that omit FWO_. An invalid present FWO_ is unsafe.
  if (!baseOrderRaw) return hasBaseOrderTag ? null : 'GATC'
  const order = baseOrderRaw.join('').toUpperCase()
  if (order.length !== 4 || new Set(order).size !== 4 || [...order].some((base) => !'ACGT'.includes(base))) return null
  return order
}

function hasUsableBasePositions(
  basePos: number[],
  baseCallCount: number,
  channelLengths: number[],
) {
  if (basePos.length < baseCallCount || baseCallCount === 0) return false
  const sampleCount = Math.min(...channelLengths)
  if (!Number.isFinite(sampleCount) || sampleCount <= 0) return false
  let previous = -1
  for (const position of basePos.slice(0, baseCallCount)) {
    if (!Number.isFinite(position) || !Number.isInteger(position)) return false
    if (position < 0 || position >= sampleCount || position < previous) return false
    previous = position
  }
  return true
}

export function parseAbifChromatogram(bytes: ArrayBuffer): ChromatogramData | null {
  if (bytes.byteLength < 128) return null
  const view = new DataView(bytes)
  const dirLocation = view.getInt32(26)
  const numElements = view.getInt32(18)
  // A truncated/corrupt ABIF can contain an arbitrary directory offset or
  // entry count. Validate the directory span before any DataView reads so
  // callers get a normal parse failure (`null`) instead of a RangeError (and
  // so a malformed file cannot drive an unbounded directory walk).
  if (
    dirLocation < 0 ||
    numElements < 0 ||
    dirLocation > view.byteLength ||
    numElements > Math.floor((view.byteLength - dirLocation) / 28)
  ) return null
  const lastEntry = dirLocation + numElements * 28

  const baseOrderTagPresent = hasDirectoryTag(view, dirLocation, lastEntry, tagDict.baseOrder)
  const baseOrder = resolveBaseOrder(
    getDataTag(view, dirLocation, lastEntry, tagDict.baseOrder) as string[] | undefined,
    baseOrderTagPresent,
  )
  if (!baseOrder) return null
  const dataTraces = [9, 10, 11, 12].map((tagNum) => getDataTag(view, dirLocation, lastEntry, colorDataTag(tagNum)) as number[] | undefined)
  const traceForBase = (base: string) => dataTraces[baseOrder.indexOf(base)]
  const aTrace = traceForBase('A')
  const tTrace = traceForBase('T')
  const gTrace = traceForBase('G')
  const cTrace = traceForBase('C')
  // DATA1–4 are the signed instrument-acquisition channels. Their channel
  // order follows FWO_ just like analyzed DATA9–12; do not reinterpret them
  // with the current processed PLOC coordinates when PLOC.1 is absent.
  const rawDataTraces = [1, 2, 3, 4].map((tagNum) => getDataTag(view, dirLocation, lastEntry, colorDataTag(tagNum)) as number[] | undefined)
  const rawTraceForBase = (base: string) => rawDataTraces[baseOrder.indexOf(base)]
  const rawATrace = rawTraceForBase('A')
  const rawTTrace = rawTraceForBase('T')
  const rawGTrace = rawTraceForBase('G')
  const rawCTrace = rawTraceForBase('C')
  const rawBasePos = getDataTag(view, dirLocation, lastEntry, tagDict.rawPeakLocations) as number[] | undefined
  const basePos = getDataTag(view, dirLocation, lastEntry, tagDict.peakLocations) as number[] | undefined
  const baseCallsRaw =
    (getDataTag(view, dirLocation, lastEntry, tagDict.baseCalls2) as string[] | undefined) ??
    (getDataTag(view, dirLocation, lastEntry, tagDict.baseCalls1) as string[] | undefined)
  const qualNums = normalizeQualNums(
    getDataTag(view, dirLocation, lastEntry, tagDict.qualNums) as number[] | undefined,
  )

  if (!aTrace?.length || !tTrace?.length || !gTrace?.length || !cTrace?.length || !basePos?.length || !baseCallsRaw?.length) {
    return null
  }

  const baseCalls = trimBaseCallTerminator(baseCallsRaw)
  if (!hasUsableBasePositions(basePos, baseCalls.length, [aTrace.length, tTrace.length, gTrace.length, cTrace.length])) {
    return null
  }

  const raw = rawATrace?.length && rawTTrace?.length && rawGTrace?.length && rawCTrace?.length
    ? {
      aTrace: rawATrace,
      tTrace: rawTTrace,
      gTrace: rawGTrace,
      cTrace: rawCTrace,
      ...(rawBasePos && hasUsableBasePositions(rawBasePos, baseCalls.length, [rawATrace.length, rawTTrace.length, rawGTrace.length, rawCTrace.length])
        ? { basePos: rawBasePos.slice(0, baseCalls.length) }
        : {}),
    }
    : undefined

  return {
    aTrace,
    tTrace,
    gTrace,
    cTrace,
    // There can be extra PLOC values after a PBAS terminator, but calls must
    // never be assigned an invented ordinal coordinate.
    basePos: basePos.slice(0, baseCalls.length),
    baseCalls,
    ...(qualNums?.length ? { qualNums: qualNums.slice(0, baseCalls.length) } : {}),
    ...(raw ? { raw } : {}),
  }
}

export async function readAb1ArrayBuffer(file: File) {
  return file.arrayBuffer()
}

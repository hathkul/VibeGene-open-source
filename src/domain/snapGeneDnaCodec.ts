/** SnapGene compressed-DNA codec; kept independent from XML/history parsing. */
const DNA_2BIT_ALPHABET = ['G', 'A', 'T', 'C']

const IUPAC_4BIT: Record<number, string> = {
  0x4: 'N',
  0x5: 'B',
  0x6: 'D',
  0x7: 'H',
  0x8: 'K',
  0x9: 'M',
  0xa: 'R',
  0xb: 'S',
  0xc: 'V',
  0xd: 'W',
  0xe: 'Y',
}

/** Decode a 2-bit GATC section; partial tail bytes are right-aligned (SGFFP). */
function decode2BitSection(data: Uint8Array, offset: number, count: number) {
  const fullBytes = Math.floor(count / 4)
  const partialPairs = count % 4
  let sequence = ''
  let cursor = offset
  for (let index = 0; index < fullBytes; index += 1) {
    const byte = data[cursor]!
    cursor += 1
    sequence += DNA_2BIT_ALPHABET[(byte >> 6) & 0x03]!
    sequence += DNA_2BIT_ALPHABET[(byte >> 4) & 0x03]!
    sequence += DNA_2BIT_ALPHABET[(byte >> 2) & 0x03]!
    sequence += DNA_2BIT_ALPHABET[byte & 0x03]!
  }
  if (partialPairs > 0) {
    const byte = data[cursor]!
    for (let pair = partialPairs - 1; pair >= 0; pair -= 1) {
      sequence += DNA_2BIT_ALPHABET[(byte >> (pair * 2)) & 0x03]!
    }
  }
  return sequence
}

/** Decode a 4-bit IUPAC section; an odd trailing nibble is right-aligned in the last byte. */
function decode4BitSection(data: Uint8Array, offset: number, count: number) {
  let sequence = ''
  const fullPairs = Math.floor(count / 2)
  let cursor = offset
  for (let pair = 0; pair < fullPairs; pair += 1) {
    const byte = data[cursor]!
    cursor += 1
    sequence += IUPAC_4BIT[(byte >> 4) & 0x0f] ?? 'N'
    sequence += IUPAC_4BIT[byte & 0x0f] ?? 'N'
  }
  if (count % 2 === 1) {
    const byte = data[cursor]!
    sequence += IUPAC_4BIT[byte & 0x0f] ?? 'N'
  }
  return sequence
}

function sectionDataBytes(marker: number, count: number) {
  if (marker === 0x03) return 0
  if (marker === 0x01) return Math.ceil((count * 2) / 8)
  if (marker === 0x02) return Math.ceil(count / 2)
  return -1
}

function applyLowercaseRanges(sequence: string, payload: Uint8Array, offset: number, lowercases: number) {
  if (!lowercases) return sequence
  const chars = [...sequence]
  let cursor = offset
  for (let index = 0; index < lowercases; index += 1) {
    const start = new DataView(payload.buffer, payload.byteOffset + cursor, 4).getUint32(0, false)
    const end = new DataView(payload.buffer, payload.byteOffset + cursor + 4, 4).getUint32(0, false)
    cursor += 8
    for (let position = start; position <= end && position < chars.length; position += 1) {
      chars[position] = chars[position]!.toLowerCase()
    }
  }
  return chars.join('')
}

type CompressedDnaHeader = {
  totalLen: number
  chunks: number
  lowercases: number
  firstMarker: number
  firstCount: number
  dataOffset: number
}

function decodeSectionedCompressedDna(payload: Uint8Array, header: CompressedDnaHeader) {
  let cursor = header.dataOffset
  let marker = header.firstMarker
  let count = header.firstCount
  let sequence = ''

  for (let section = 0; section < header.chunks; section += 1) {
    if (section > 0) {
      if (cursor + 5 > payload.length) return null
      marker = payload[cursor]!
      count = new DataView(payload.buffer, payload.byteOffset + cursor + 1, 4).getUint32(0, false)
      cursor += 5
    }
    const dataLen = sectionDataBytes(marker, count)
    if (dataLen < 0 || cursor + dataLen > payload.length) return null
    if (marker === 0x01) sequence += decode2BitSection(payload, cursor, count)
    else if (marker === 0x02) sequence += decode4BitSection(payload, cursor, count)
    else if (marker === 0x03) sequence += 'N'.repeat(count)
    else return null
    cursor += dataLen
  }

  if (sequence.length !== header.totalLen) return null
  return applyLowercaseRanges(sequence, payload, cursor, header.lowercases)
}

/**
 * Decode SnapGene block-1 compressed DNA (sectioned 2-bit / IUPAC / N-run + lowercase ranges).
 * History snapshots use an 18-byte descriptor; top-level block 1 may use the full 22-byte form.
 */
export function decodeSnapGeneCompressedDna(payload: Uint8Array): string | null {
  if (payload.length < 18) return null
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength)
  const totalLen = view.getUint32(0, false)
  if (totalLen <= 0) return null

  const flatRepeat = view.getUint32(14, false)
  if (totalLen === flatRepeat && totalLen <= (payload.length - 18) * 4) {
    return decode2BitSection(payload, 18, totalLen)
  }

  const chunks18 = view.getUint32(5, false)
  if (chunks18 > 0) {
    const decoded = decodeSectionedCompressedDna(payload, {
      totalLen,
      chunks: chunks18,
      lowercases: view.getUint32(9, false),
      firstMarker: payload[13]!,
      firstCount: view.getUint32(14, false),
      dataOffset: 18,
    })
    if (decoded) return decoded
  }

  if (payload.length >= 22 && view.getUint32(4, false) === totalLen) {
    const chunks22 = view.getUint32(9, false)
    if (chunks22 > 0) {
      const decoded = decodeSectionedCompressedDna(payload, {
        totalLen,
        chunks: chunks22,
        lowercases: view.getUint32(13, false),
        firstMarker: payload[17]!,
        firstCount: view.getUint32(18, false),
        dataOffset: 22,
      })
      if (decoded) return decoded
    }
  }

  return null
}

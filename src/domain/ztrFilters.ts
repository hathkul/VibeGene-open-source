import { unzlibSync } from 'fflate'

const ZTR_FORM_RAW = 0
const ZTR_FORM_RLE = 1
const ZTR_FORM_ZLIB = 2
const ZTR_FORM_DELTA1 = 0x40
const ZTR_FORM_DELTA2 = 0x41
const ZTR_FORM_DELTA4 = 0x42
const ZTR_FORM_16TO8 = 0x46
const ZTR_FORM_32TO8 = 0x47
const ZTR_FORM_FOLLOW1 = 0x48

function readInt32BE(bytes: Uint8Array, offset: number) {
  return new DataView(bytes.buffer, bytes.byteOffset + offset, 4).getInt32(0, false)
}

function writeInt32BE(target: Uint8Array, offset: number, value: number) {
  new DataView(target.buffer, target.byteOffset + offset, 4).setInt32(0, value, false)
}

function decodeZlibWrapper(data: Uint8Array) {
  return unzlibSync(data.subarray(5))
}

function unrle(data: Uint8Array) {
  const guard = data[5]!
  const outLen = data[1]! | (data[2]! << 8) | (data[3]! << 16) | (data[4]! << 24)
  const input = data.subarray(6)
  const output = new Uint8Array(outLen)
  let inIndex = 0
  let outIndex = 0

  while (outIndex < outLen && inIndex < input.length) {
    const token = input[inIndex]!
    inIndex += 1
    if (token !== guard) {
      output[outIndex] = token
      outIndex += 1
      continue
    }
    const count = input[inIndex]!
    inIndex += 1
    if (count === 0) {
      output[outIndex] = guard
      outIndex += 1
      continue
    }
    const value = input[inIndex]!
    inIndex += 1
    output.fill(value, outIndex, outIndex + count)
    outIndex += count
  }

  return output.subarray(0, outIndex)
}

function recorrelate1(data: Uint8Array) {
  const level = data[1]!
  const input = data.subarray(2)
  const output = new Uint8Array(input.length)
  let u1 = 0
  let u2 = 0
  let u3 = 0

  for (let index = 0; index < input.length; index += 1) {
    const delta = input[index]!
    let z = 0
    if (level === 2) {
      z = 2 * u1 - u2
      u2 = u1
    } else if (level === 3) {
      z = 3 * u1 - 3 * u2 + u3
      u3 = u2
      u2 = u1
    }
    u1 = (z + delta) & 0xff
    output[index] = u1
  }

  return output
}

function recorrelate2(data: Uint8Array) {
  const level = data[1]!
  const input = data.subarray(2)
  const output = new Uint8Array(input.length)
  let u1 = 0
  let u2 = 0
  let u3 = 0

  for (let index = 0; index < input.length; index += 2) {
    const delta = (input[index]! << 8) | input[index + 1]!
    let z = 0
    if (level === 2) {
      z = 2 * u1 - u2
      u2 = u1
    } else if (level === 3) {
      z = 3 * u1 - 3 * u2 + u3
      u3 = u2
      u2 = u1
    }
    u1 = (z + delta) & 0xffff
    output[index] = (u1 >> 8) & 0xff
    output[index + 1] = u1 & 0xff
  }

  return output
}

function recorrelate4(data: Uint8Array) {
  const level = data[1]!
  const input = data.subarray(2)
  const output = new Uint8Array(input.length)
  let u1 = 0
  let u2 = 0
  let u3 = 0

  for (let index = 0; index < input.length; index += 4) {
    const delta = readInt32BE(input, index)
    let z = 0
    if (level === 2) {
      z = 2 * u1 - u2
      u2 = u1
    } else if (level === 3) {
      z = 3 * u1 - 3 * u2 + u3
      u3 = u2
      u2 = u1
    }
    u1 = z + delta
    writeInt32BE(output, index, u1)
  }

  return output
}

function expand8to16(data: Uint8Array) {
  const input = data
  const output = new Uint8Array((input.length - 1) * 2)
  let outIndex = 0

  for (let index = 1; index < input.length; index += 1) {
    const signed = input[index]! > 127 ? input[index]! - 256 : input[index]!
    if (signed >= 0 && signed <= 127) {
      output[outIndex] = 0
      output[outIndex + 1] = signed
      outIndex += 2
      continue
    }
    if (signed !== -128) {
      output[outIndex + 1] = signed & 0xff
      output[outIndex] = 0xff
      outIndex += 2
      continue
    }
    output[outIndex] = input[index + 1]!
    output[outIndex + 1] = input[index + 2]!
    index += 2
    outIndex += 2
  }

  return output.subarray(0, outIndex)
}

function expand8to32(data: Uint8Array) {
  const input = data
  const output = new Uint8Array((input.length - 1) * 4)
  let outIndex = 0

  for (let index = 1; index < input.length; index += 1) {
    const signed = input[index]! > 127 ? input[index]! - 256 : input[index]!
    if (signed !== -128) {
      const sign = signed < 0 ? 0xff : 0
      output[outIndex] = sign
      output[outIndex + 1] = sign
      output[outIndex + 2] = sign
      output[outIndex + 3] = signed & 0xff
      outIndex += 4
      continue
    }
    output[outIndex] = input[index + 1]!
    output[outIndex + 1] = input[index + 2]!
    output[outIndex + 2] = input[index + 3]!
    output[outIndex + 3] = input[index + 4]!
    index += 4
    outIndex += 4
  }

  return output.subarray(0, outIndex)
}

function unfollow1(data: Uint8Array) {
  const next = Array.from(data.subarray(1, 257))
  const input = data.subarray(257)
  const output = new Uint8Array(input.length)
  output[0] = input[0]!

  for (let index = 1; index < input.length; index += 1) {
    const predicted = next[output[index - 1]!]!
    const stored = input[index]!
    const signed = stored > 127 ? stored - 256 : stored
    output[index] = (predicted - signed) & 0xff
  }

  return output
}

function decodeZtrFormat(data: Uint8Array) {
  switch (data[0]) {
    case ZTR_FORM_ZLIB:
      return decodeZlibWrapper(data)
    case ZTR_FORM_RLE:
      return unrle(data)
    case ZTR_FORM_DELTA1:
      return recorrelate1(data)
    case ZTR_FORM_DELTA2:
      return recorrelate2(data)
    case ZTR_FORM_DELTA4:
      return recorrelate4(data)
    case ZTR_FORM_16TO8:
      return expand8to16(data)
    case ZTR_FORM_32TO8:
      return expand8to32(data)
    case ZTR_FORM_FOLLOW1:
      return unfollow1(data)
    default:
      throw new Error(`Unsupported ZTR chunk format 0x${data[0]!.toString(16)}`)
  }
}

export function unwrapZtrChunkData(data: Uint8Array) {
  let current = data
  let guard = 0
  while (current.length > 0 && current[0] !== ZTR_FORM_RAW) {
    current = decodeZtrFormat(current)
    guard += 1
    if (guard > 24) {
      throw new Error('ZTR chunk filter chain exceeded safe depth')
    }
  }
  return current
}

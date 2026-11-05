import { compress, decompress, initWasm } from 'lzma-wasm'

let snapGeneLzmaReady = false
let snapGeneLzmaInit: Promise<void> | null = null

export function initSnapGeneLzma(): Promise<void> {
  if (snapGeneLzmaReady) return Promise.resolve()
  if (!snapGeneLzmaInit) {
    snapGeneLzmaInit = initWasm().then(() => {
      snapGeneLzmaReady = true
    })
  }
  return snapGeneLzmaInit
}

export function isSnapGeneXzPayload(bytes: Uint8Array) {
  return bytes.length >= 6 && bytes[0] === 0xfd && bytes[1] === 0x37 && bytes[2] === 0x7a && bytes[3] === 0x58 && bytes[4] === 0x5a
}

export function decompressSnapGeneXz(bytes: Uint8Array): Uint8Array {
  if (!snapGeneLzmaReady) {
    throw new Error('SnapGene LZMA support is not initialized yet.')
  }
  return decompress(bytes)
}

export function compressSnapGeneXmlToXz(xml: string): Uint8Array {
  if (!snapGeneLzmaReady) {
    throw new Error('SnapGene LZMA support is not initialized yet.')
  }
  const payload = `<?xml version="1.0" encoding="UTF-8"?>${xml}\n`
  return compress(new TextEncoder().encode(payload), { format: 'xz' })
}

export function compressSnapGeneBytesToXz(bytes: Uint8Array): Uint8Array {
  if (!snapGeneLzmaReady) throw new Error('SnapGene LZMA support is not initialized yet.')
  return compress(bytes, { format: 'xz' })
}

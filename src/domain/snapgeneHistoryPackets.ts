import { decompressSnapGeneXz, isSnapGeneXzPayload } from './snapgeneLzma'

export function hasCompressedSnapGeneHistoryDocument(payload: Uint8Array | undefined): boolean {
  if (!payload || payload.length < 4) return false
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength)
  for (let offset = 4; offset + 5 <= payload.length;) {
    const end = offset + 5 + view.getUint32(offset + 1, false)
    if (end > payload.length) return false
    if (payload[offset] === 0x1e && isSnapGeneXzPayload(payload.subarray(offset + 5, end))) return true
    offset = end
  }
  return false
}

/** Read a history node's direct packets and its compressed document packets. */
export function readSnapGeneHistoryNodePackets(payload: Uint8Array): Map<number, Uint8Array[]> {
  const packets = new Map<number, Uint8Array[]>()
  const read = (bytes: Uint8Array, start: number, expand: boolean) => {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    let offset = start
    while (offset + 5 <= bytes.length) {
      const type = bytes[offset]!
      const end = offset + 5 + view.getUint32(offset + 1, false)
      if (end > bytes.length) break
      const data = bytes.subarray(offset + 5, end)
      if (expand && type === 0x1e && isSnapGeneXzPayload(data)) {
        try { read(decompressSnapGeneXz(data), 0, false) } catch { /* Keep opaque packets usable if decoding is unavailable. */ }
      } else {
        const values = packets.get(type) ?? []
        values.push(data)
        packets.set(type, values)
      }
      offset = end
    }
  }
  read(payload, 4, true)
  return packets
}

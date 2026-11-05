import { zlibSync, unzlibSync } from 'fflate'

/** SnapGene block 23 — embedded file attachments. */
export const SNAPGENE_ATTACHMENT_BLOCK = 0x17

/** Current bounded, compressed DNA-comparison metadata attachment. */
export const VIBEGENE_DNA_COMPARISON_COMPRESSED_ATTACHMENT_FILE_NAME = 'vibegene.json.zlib'

/** Legacy uncompressed DNA-comparison metadata attachment name. */
export const VIBEGENE_ATTACHMENT_FILE_NAME = 'vibegene.json'

const MAX_ATTACHMENT_MANIFEST_COMPRESSED_BYTES = 1024 * 1024
const MAX_ATTACHMENT_MANIFEST_UNCOMPRESSED_BYTES = 1024 * 1024

export type SnapGeneAttachmentFile = {
  id: number
  name: string
  data: Uint8Array
  mtime?: string
  compressible?: boolean
}

function xmlEscape(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
}

function snapGenePacket(type: number, payload: Uint8Array) {
  const packet = new Uint8Array(5 + payload.length)
  packet[0] = type
  new DataView(packet.buffer).setUint32(1, payload.length, false)
  packet.set(payload, 5)
  return packet
}

function concatBytes(parts: Uint8Array[]) {
  const size = parts.reduce((total, part) => total + part.length, 0)
  const output = new Uint8Array(size)
  let offset = 0
  for (const part of parts) {
    output.set(part, offset)
    offset += part.length
  }
  return output
}

function formatAttachmentMtime(date = new Date()) {
  return date.toISOString().replace(/\.\d{3}Z$/, 'Z')
}

/** Encode one or more attachments as SnapGene block-23 packets (file data + manifest). */
export function encodeSnapGeneAttachmentPackets(
  files: Array<Omit<SnapGeneAttachmentFile, 'id'> & { id?: number }>,
): Uint8Array[] {
  if (!files.length) return []
  const normalized: SnapGeneAttachmentFile[] = files.map((file, index) => ({
    id: file.id && file.id > 0 ? file.id : index + 1,
    name: file.name,
    data: file.data,
    mtime: file.mtime ?? formatAttachmentMtime(),
    compressible: file.compressible !== false,
  }))

  const filePackets = normalized.map((file) => {
    const payload = new Uint8Array(4 + file.data.length)
    new DataView(payload.buffer).setUint32(0, file.id, false)
    payload.set(file.data, 4)
    return snapGenePacket(SNAPGENE_ATTACHMENT_BLOCK, payload)
  })

  const manifestXml = `<?xml version="1.0"?><Files>${normalized
    .map(
      (file) =>
        `<File id="${file.id}" name="${xmlEscape(file.name)}" size="${file.data.length}" mtime="${xmlEscape(file.mtime ?? '')}" compressible="${file.compressible ? '1' : '0'}"/>`,
    )
    .join('')}</Files>`
  const manifestBytes = new TextEncoder().encode(manifestXml)
  const compressed = zlibSync(manifestBytes, { level: 6 })
  const manifestPayload = new Uint8Array(8 + compressed.length)
  const view = new DataView(manifestPayload.buffer)
  view.setUint32(0, 0, false)
  view.setUint32(4, manifestBytes.length, false)
  manifestPayload.set(compressed, 8)

  return [...filePackets, snapGenePacket(SNAPGENE_ATTACHMENT_BLOCK, manifestPayload)]
}

export function encodeSnapGeneAttachmentPacketsConcat(
  files: Array<Omit<SnapGeneAttachmentFile, 'id'> & { id?: number }>,
): Uint8Array {
  return concatBytes(encodeSnapGeneAttachmentPackets(files))
}

function parseAttachmentManifest(xml: string): Array<{
  id: number
  name: string
  size: number
  mtime?: string
  compressible?: boolean
}> {
  const document = new DOMParser().parseFromString(xml, 'application/xml')
  if (document.querySelector('parsererror')) return []
  return [...document.querySelectorAll('Files > File, File')].flatMap((element) => {
    const id = Number(element.getAttribute('id'))
    const name = element.getAttribute('name')?.trim() ?? ''
    const size = Number(element.getAttribute('size'))
    if (!Number.isFinite(id) || id <= 0 || !name) return []
    return [{
      id,
      name,
      size: Number.isFinite(size) ? size : 0,
      ...(element.getAttribute('mtime') ? { mtime: element.getAttribute('mtime')! } : {}),
      compressible: element.getAttribute('compressible') !== '0',
    }]
  })
}

/** Parse SnapGene block-23 payloads into named attachment files. */
export function parseSnapGeneAttachments(blocks: readonly Uint8Array[]): SnapGeneAttachmentFile[] {
  const fileBlocks = new Map<number, Uint8Array>()
  let manifestEntries: Array<{
    id: number
    name: string
    size: number
    mtime?: string
    compressible?: boolean
  }> = []

  for (const data of blocks) {
    if (data.length < 4) continue
    const discriminator = new DataView(data.buffer, data.byteOffset, 4).getUint32(0, false)
    if (discriminator === 0) {
      if (data.length < 9 || data.length > 8 + MAX_ATTACHMENT_MANIFEST_COMPRESSED_BYTES) continue
      try {
        const expectedLength = new DataView(data.buffer, data.byteOffset + 4, 4).getUint32(0, false)
        if (expectedLength === 0 || expectedLength > MAX_ATTACHMENT_MANIFEST_UNCOMPRESSED_BYTES) continue
        const manifestBytes = unzlibSync(data.subarray(8), {
          out: new Uint8Array(expectedLength + 1),
        })
        if (manifestBytes.length !== expectedLength) continue
        const xml = new TextDecoder().decode(manifestBytes)
        manifestEntries = parseAttachmentManifest(xml)
      } catch {
        // Ignore corrupt manifests; file payloads may still be recoverable by id order.
      }
      continue
    }
    fileBlocks.set(discriminator, data.subarray(4))
  }

  if (manifestEntries.length) {
    return manifestEntries.flatMap((entry) => {
      const data = fileBlocks.get(entry.id)
      if (!data || (entry.size > 0 && data.length !== entry.size)) return []
      return [{
        id: entry.id,
        name: entry.name,
        data,
        ...(entry.mtime ? { mtime: entry.mtime } : {}),
        compressible: entry.compressible,
      }]
    })
  }

  return [...fileBlocks.entries()].map(([id, data]) => ({
    id,
    name: `attachment-${id}`,
    data,
  }))
}

export function findSnapGeneAttachment(
  blocks: readonly Uint8Array[],
  fileName: string,
): SnapGeneAttachmentFile | undefined {
  const lower = fileName.toLowerCase()
  return parseSnapGeneAttachments(blocks).find((file) => file.name.toLowerCase() === lower)
}

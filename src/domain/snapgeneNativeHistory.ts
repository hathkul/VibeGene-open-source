import type { AncestryRetention, AncestorTraceRetention } from './historyRetention'
import type { HistoryNode, SnapGeneNativeHistory } from './types'
import { compressSnapGeneBytesToXz, decompressSnapGeneXz, isSnapGeneXzPayload } from './snapgeneLzma'
import { readSnapGeneHistoryNodePackets } from './snapgeneHistoryPackets'

export type SnapGeneNativeHistoryJson = {
  treePayloadBase64?: string
  treeFingerprint?: string
  authoritativeRootPacketId?: string
  nodePackets: Array<{ nodeId: string; payloadBase64: string }>
}

const HISTORY_SEQUENCE_PACKET_TYPES = new Set([0x00, 0x01, 0x15, 0x20])
const HISTORY_TRACE_PACKET_TYPES = new Set([0x10, 0x11])

export type SnapGeneNativeHistoryTraceMetrics = {
  traceCount: number
  packetBytes: number
  nodeIds: string[]
}

function bytesToBase64(bytes: Uint8Array): string {
  const chunks: string[] = []
  const chunkSize = 0x8000
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    chunks.push(String.fromCharCode(...bytes.subarray(offset, offset + chunkSize)))
  }
  return btoa(chunks.join(''))
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  return bytes
}

function concatBytes(parts: readonly Uint8Array[]): Uint8Array {
  const byteLength = parts.reduce((total, part) => total + part.byteLength, 0)
  const result = new Uint8Array(byteLength)
  let offset = 0
  for (const part of parts) {
    result.set(part, offset)
    offset += part.byteLength
  }
  return result
}

function retainedNodeIds(root: HistoryNode | undefined): Set<string> {
  const ids = new Set<string>()
  const visit = (node: HistoryNode) => {
    ids.add(node.id)
    node.children.forEach(visit)
  }
  if (root) visit(root)
  return ids
}

function retainedNodeDepths(root: HistoryNode | undefined): Map<string, number> {
  const depths = new Map<string, number>()
  const visit = (node: HistoryNode, depth: number) => {
    depths.set(node.id, depth)
    node.children.forEach((child) => visit(child, depth + 1))
  }
  if (root) visit(root, 0)
  return depths
}

function stripSequencePackets(payload: Uint8Array): Uint8Array {
  return stripNestedPackets(payload, HISTORY_SEQUENCE_PACKET_TYPES)
}

function stripNestedPackets(payload: Uint8Array, removedTypes: ReadonlySet<number>): Uint8Array {
  if (payload.byteLength < 4) return payload.slice()
  const parts: Uint8Array[] = [payload.slice(0, 4)]
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength)
  let offset = 4
  while (offset + 5 <= payload.byteLength) {
    const type = payload[offset]!
    const length = view.getUint32(offset + 1, false)
    const end = offset + 5 + length
    if (end > payload.byteLength) {
      // Preserve malformed or future data rather than silently discarding it.
      parts.push(payload.slice(offset))
      return concatBytes(parts)
    }
    if (!removedTypes.has(type)) parts.push(payload.slice(offset, end))
    offset = end
  }
  if (offset < payload.byteLength) parts.push(payload.slice(offset))
  return concatBytes(parts)
}

function stripTracePackets(payload: Uint8Array): Uint8Array {
  if (payload.length < 4) return payload.slice()
  const parts: Uint8Array[] = [payload.slice(0, 4)]
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength)
  let offset = 4
  while (offset + 5 <= payload.length) {
    const type = payload[offset]!
    const end = offset + 5 + view.getUint32(offset + 1, false)
    if (end > payload.length) {
      parts.push(payload.slice(offset))
      return concatBytes(parts)
    }
    if (type === 0x1e && isSnapGeneXzPayload(payload.subarray(offset + 5, end))) {
      const expanded = decompressSnapGeneXz(payload.subarray(offset + 5, end))
      const stripped = stripNestedPackets(concatBytes([new Uint8Array(4), expanded]), HISTORY_TRACE_PACKET_TYPES).subarray(4)
      const compressed = compressSnapGeneBytesToXz(stripped)
      const header = new Uint8Array(5)
      header[0] = type
      new DataView(header.buffer).setUint32(1, compressed.length, false)
      parts.push(header, compressed)
    } else if (!HISTORY_TRACE_PACKET_TYPES.has(type)) {
      parts.push(payload.slice(offset, end))
    }
    offset = end
  }
  if (offset < payload.length) parts.push(payload.slice(offset))
  return concatBytes(parts)
}

function traceMetricsForNodePacket(payload: Uint8Array) {
  const packets = readSnapGeneHistoryNodePackets(payload)
  const traces = packets.get(0x10) ?? []
  const metadata = packets.get(0x11) ?? []
  return { traceCount: traces.length, packetBytes: [...traces, ...metadata].reduce((sum, packet) => sum + packet.length + 5, 0) }
}

export function snapGeneNativeHistoryTraceMetrics(
  history: SnapGeneNativeHistory | undefined,
): SnapGeneNativeHistoryTraceMetrics {
  if (!history) return { traceCount: 0, packetBytes: 0, nodeIds: [] }
  let traceCount = 0
  let packetBytes = 0
  const nodeIds: string[] = []
  for (const packet of history.nodePackets) {
    const metrics = traceMetricsForNodePacket(packet.payload)
    traceCount += metrics.traceCount
    packetBytes += metrics.packetBytes
    if (metrics.packetBytes > 0) nodeIds.push(packet.nodeId)
  }
  return { traceCount, packetBytes, nodeIds }
}

export function snapGeneNativeHistoryFromBlocks(
  treePayload: Uint8Array | undefined,
  nodePayloads: readonly Uint8Array[],
  treeFingerprint: string | undefined,
): SnapGeneNativeHistory | undefined {
  const nodePackets = nodePayloads.flatMap((payload) => {
    if (payload.byteLength < 4) return []
    const nodeId = String(new DataView(payload.buffer, payload.byteOffset, 4).getUint32(0, false))
    return [{ nodeId, payload }]
  })
  if (!treePayload && nodePackets.length === 0) return undefined
  return {
    ...(treePayload ? { treePayload } : {}),
    ...(treeFingerprint ? { treeFingerprint } : {}),
    nodePackets,
  }
}

export function serializeSnapGeneNativeHistoryForJson(
  history: SnapGeneNativeHistory | undefined,
): SnapGeneNativeHistoryJson | undefined {
  if (!history) return undefined
  return {
    ...(history.treePayload ? { treePayloadBase64: bytesToBase64(history.treePayload) } : {}),
    ...(history.treeFingerprint ? { treeFingerprint: history.treeFingerprint } : {}),
    ...(history.authoritativeRootPacketId
      ? { authoritativeRootPacketId: history.authoritativeRootPacketId }
      : {}),
    nodePackets: history.nodePackets.map((packet) => ({
      nodeId: packet.nodeId,
      payloadBase64: bytesToBase64(packet.payload),
    })),
  }
}

export function deserializeSnapGeneNativeHistoryFromJson(
  value: unknown,
): SnapGeneNativeHistory | undefined {
  if (!value || typeof value !== 'object') return undefined
  const json = value as Partial<SnapGeneNativeHistoryJson>
  const nodePackets = Array.isArray(json.nodePackets)
    ? json.nodePackets.flatMap((packet) => (
        packet && typeof packet.nodeId === 'string' && typeof packet.payloadBase64 === 'string'
          ? [{ nodeId: packet.nodeId, payload: base64ToBytes(packet.payloadBase64) }]
          : []
      ))
    : []
  const treePayload = typeof json.treePayloadBase64 === 'string'
    ? base64ToBytes(json.treePayloadBase64)
    : undefined
  if (!treePayload && nodePackets.length === 0) return undefined
  return {
    ...(treePayload ? { treePayload } : {}),
    ...(typeof json.treeFingerprint === 'string'
      ? { treeFingerprint: json.treeFingerprint }
      : {}),
    ...(typeof json.authoritativeRootPacketId === 'string'
      ? { authoritativeRootPacketId: json.authoritativeRootPacketId }
      : {}),
    nodePackets,
  }
}

/** JSON hook used by project files and protein attachments, including nested source records. */
export function snapGeneNativeHistoryJsonReplacer(key: string, value: unknown): unknown {
  return key === 'snapGeneNativeHistory'
    ? serializeSnapGeneNativeHistoryForJson(value as SnapGeneNativeHistory | undefined)
    : value
}

/** JSON hook used by project files and protein attachments, including nested source records. */
export function snapGeneNativeHistoryJsonReviver(key: string, value: unknown): unknown {
  return key === 'snapGeneNativeHistory'
    ? deserializeSnapGeneNativeHistoryFromJson(value)
    : value
}

/** Keep opaque packets aligned with the visible retained ancestry tree. */
export function trimSnapGeneNativeHistory(
  history: SnapGeneNativeHistory | undefined,
  retainedRoot: HistoryNode | undefined,
  retention: AncestryRetention,
  traceRetention: AncestorTraceRetention = { mode: 'complete' },
): SnapGeneNativeHistory | undefined {
  if (!history) return undefined
  const traceDepths = retainedNodeDepths(retainedRoot)
  const traceGenerationLimit = traceRetention.mode === 'generations'
    ? Number.isFinite(traceRetention.generations)
      ? Math.max(0, Math.floor(traceRetention.generations))
      : 0
    : 0
  const stripTracesForPacket = (packet: SnapGeneNativeHistory['nodePackets'][number]) => {
    if (traceRetention.mode === 'remove') return true
    if (traceRetention.mode !== 'generations') return false
    const depth = traceDepths.get(packet.nodeId)
    return depth !== undefined && depth > traceGenerationLimit
  }
  if (retention.mode === 'complete') {
    if (traceRetention.mode === 'complete') return history
    return {
      ...history,
      nodePackets: history.nodePackets.map((packet) => ({
        ...packet,
        payload: stripTracesForPacket(packet) ? stripTracePackets(packet.payload) : packet.payload,
      })),
    }
  }
  if (retention.mode === 'remove' || !retainedRoot) return undefined

  const ids = retainedNodeIds(retainedRoot)
  const stripSequences = retention.mode === 'tree-only' || retention.mode === 'current-only'
  const nodePackets = history.nodePackets
    .filter((packet) => ids.has(packet.nodeId))
    .map((packet) => ({
      ...packet,
      payload: stripTracesForPacket(packet)
        ? stripTracePackets(stripSequences ? stripSequencePackets(packet.payload) : packet.payload)
        : stripSequences
          ? stripSequencePackets(packet.payload)
          : packet.payload,
    }))

  const treeUnchanged = retention.mode === 'tree-only'
  if (!treeUnchanged && nodePackets.length === 0) return undefined
  return {
    ...(treeUnchanged && history.treePayload ? { treePayload: history.treePayload } : {}),
    ...(treeUnchanged && history.treeFingerprint
      ? { treeFingerprint: history.treeFingerprint }
      : {}),
    ...(history.authoritativeRootPacketId && ids.has(history.authoritativeRootPacketId)
      ? { authoritativeRootPacketId: history.authoritativeRootPacketId }
      : {}),
    nodePackets,
  }
}

/** Scope opaque native packets to an ancestor and its descendants. */
export function scopeSnapGeneNativeHistoryToSubtree(
  history: SnapGeneNativeHistory | undefined,
  root: HistoryNode,
): SnapGeneNativeHistory | undefined {
  if (!history) return undefined
  const ids = retainedNodeIds(root)
  const nodePackets = history.nodePackets.filter((packet) => ids.has(packet.nodeId))
  if (!nodePackets.length) return undefined
  return {
    authoritativeRootPacketId: root.id,
    nodePackets,
  }
}

/** Compact, allocation-light representation for dirty checks and size previews. */
export function summarizeSnapGeneNativeHistory(history: SnapGeneNativeHistory | undefined) {
  if (!history) return undefined
  return {
    treeFingerprint: history.treeFingerprint,
    authoritativeRootPacketId: history.authoritativeRootPacketId,
    treePayloadBytes: history.treePayload?.byteLength ?? 0,
    nodePackets: history.nodePackets.map((packet) => ({
      nodeId: packet.nodeId,
      payloadBytes: packet.payload.byteLength,
    })),
  }
}

export function snapGeneNativeHistoryBase64Bytes(history: SnapGeneNativeHistory | undefined): number {
  if (!history) return 0
  const encodedLength = (bytes: number) => 4 * Math.ceil(bytes / 3)
  return encodedLength(history.treePayload?.byteLength ?? 0) + history.nodePackets.reduce(
    (total, packet) => total + encodedLength(packet.payload.byteLength),
    0,
  )
}

export function snapGeneNativeNodePayloadsForExport(
  history: SnapGeneNativeHistory | undefined,
  root: HistoryNode | undefined,
  currentTreeFingerprint: string | undefined,
): Uint8Array[] {
  if (!history) return []
  if (!root) return history.nodePackets.map((packet) => packet.payload)
  const ids = retainedNodeIds(root)
  const originalTreeIsCurrent = history.treeFingerprint === currentTreeFingerprint
  return history.nodePackets
    .filter((packet) => ids.has(packet.nodeId))
    // Once the root changes, the top-level sequence/features are authoritative.
    .filter((packet) => (
      originalTreeIsCurrent ||
      packet.nodeId !== root.id ||
      history.authoritativeRootPacketId === root.id
    ))
    .map((packet) => packet.payload)
}

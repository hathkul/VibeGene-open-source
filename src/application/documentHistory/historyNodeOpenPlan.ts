import { agaroseGelRecordFromHistoryNode, recordFromHistoryNode } from '../../domain/historyRecord'
import { parseSnapGeneHistoryNodeDocumentData } from '../../domain/parsers'
import type { HistoryNode, SequenceRecord, SnapGeneNativeHistory } from '../../domain/types'

/** Resolve the construct opened from a history node (current node reuses the live record). */
export function planConstructRecordFromHistoryNode(
  currentRecord: SequenceRecord,
  node: HistoryNode,
): SequenceRecord {
  const nodePayload = currentRecord.snapGeneNativeHistory?.nodePackets
    .find((packet) => packet.nodeId === node.id)?.payload
  return node.id === currentRecord.history?.id
    ? currentRecord
    : recordFromHistoryNode(
        node,
        currentRecord.snapGeneNativeHistory,
        parseSnapGeneHistoryNodeDocumentData(nodePayload),
      )
}

export type HistoryRestrictionGelOpenPlan = {
  source: SequenceRecord
  initialSamples: Array<{ label: string; record: SequenceRecord; enzymeNames: string[] }>
}

/**
 * Restriction gel always rebuilds from the clicked parent node. Using the open document when
 * history ids match would put the product on every gel.
 */
export function planHistoryRestrictionGelOpen(
  node: HistoryNode,
  enzymeNames: string[],
  snapGeneNativeHistory: SnapGeneNativeHistory | undefined,
): HistoryRestrictionGelOpenPlan | null {
  if (enzymeNames.length === 0) return null
  const source = agaroseGelRecordFromHistoryNode(node, snapGeneNativeHistory)
  return {
    source,
    initialSamples: [{ label: source.name, record: source, enzymeNames }],
  }
}

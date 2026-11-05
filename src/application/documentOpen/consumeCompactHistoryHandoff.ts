import { normalizeSequenceRecord } from '../../domain/constructProperties'
import type { SequenceRecord } from '../../domain/types'
import { HISTORY_HANDOFF_PREFIX } from '../documentHandoff/browserHandoff'

export type CompactHistoryHandoffStoragePorts = {
  getHistoryKey: () => string | null
  getItem: (key: string) => string | null
  removeItem: (key: string) => void
}

/** Single-use localStorage read for small cross-tab construct handoffs. */
export function consumeCompactHistoryHandoff(
  ports: CompactHistoryHandoffStoragePorts,
): { historyKey: string | null; record: SequenceRecord | null } {
  const historyKey = ports.getHistoryKey()
  if (!historyKey) return { historyKey: null, record: null }
  try {
    const raw = ports.getItem(HISTORY_HANDOFF_PREFIX + historyKey)
    if (!raw) return { historyKey, record: null }
    ports.removeItem(HISTORY_HANDOFF_PREFIX + historyKey)
    return { historyKey, record: normalizeSequenceRecord(JSON.parse(raw) as SequenceRecord) }
  } catch {
    return { historyKey, record: null }
  }
}

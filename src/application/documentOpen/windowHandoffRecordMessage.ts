import { normalizeSequenceRecord } from '../../domain/constructProperties'
import type { SequenceRecord } from '../../domain/types'

export function parseWindowHandoffRecordMessage(
  payload: unknown,
  expectedKey: string,
  messageType: string,
): SequenceRecord | null {
  const data = payload as { type?: unknown; key?: unknown; record?: unknown } | null
  if (
    !data
    || data.type !== messageType
    || data.key !== expectedKey
    || !data.record
    || typeof data.record !== 'object'
  ) {
    return null
  }
  try {
    return normalizeSequenceRecord(data.record as SequenceRecord)
  } catch {
    return null
  }
}

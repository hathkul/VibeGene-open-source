import { useState } from 'react'
import { appendStatusHistory } from '../../domain/bugReportDiagnostics'
import { isSelectionBarEchoStatus } from '../sequence/sequenceShared'

type SeenStatus = {
  status: string
  history: string[]
  attentionKey: number
}

/**
 * Owns the selection-bar status attention key and the rolling status history.
 * The initial rendered status is skipped (no initial attention animation),
 * blank and echo statuses are filtered out, and each new message appends to
 * the history consumed by the bug-report snapshot. The attention key is
 * tracked independently because history is capped while the animation key
 * must keep advancing for the lifetime of the workspace. The global status
 * state itself stays with the host.
 */
export function useSelectionStatusAttention(status: string): {
  statusAttentionKey: number
  statusHistory: string[]
} {
  const [seen, setSeen] = useState<SeenStatus>(() => ({ status, history: [], attentionKey: 0 }))
  if (seen.status !== status) {
    const record = status.trim() !== '' && !isSelectionBarEchoStatus(status)
    setSeen({
      status,
      history: record ? appendStatusHistory(seen.history, status) : seen.history,
      attentionKey: record ? seen.attentionKey + 1 : seen.attentionKey,
    })
  }
  return { statusAttentionKey: seen.attentionKey, statusHistory: seen.history }
}

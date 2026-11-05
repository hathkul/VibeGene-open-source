export type PendingSharedFragmentRef = {
  id: string
  fromRecordName: string
  sequence: string
}

export const SHARED_FRAGMENT_INSERT_MISSING_SELECTION_STATUS =
  'Select a range in the Sequence tab before inserting the shared fragment.'
export const SHARED_FRAGMENT_DISMISSED_STATUS = 'Dismissed shared fragment from another tab.'

export function planSharedFragmentInsertedStatus(fragment: PendingSharedFragmentRef): string {
  return `Inserted ${fragment.sequence.length} bp from ${fragment.fromRecordName}.`
}

export type SharedFragmentInsertPorts = {
  insertSequence: (sequence: string) => boolean
  clearPending: () => void
  clearStorage: (fragmentId: string) => void
  setStatus: (status: string) => void
}

/** Preserves insert → clear pending → clear storage → final status ordering. */
export function executeSharedFragmentInsert(
  pending: PendingSharedFragmentRef | null,
  ports: SharedFragmentInsertPorts,
): void {
  if (!pending) return
  if (!ports.insertSequence(pending.sequence)) {
    ports.setStatus(SHARED_FRAGMENT_INSERT_MISSING_SELECTION_STATUS)
    return
  }
  const fragmentId = pending.id
  ports.clearPending()
  ports.clearStorage(fragmentId)
  ports.setStatus(planSharedFragmentInsertedStatus(pending))
}

export type SharedFragmentDismissPorts = {
  clearPending: () => void
  clearStorage: (fragmentId: string) => void
  setStatus: (status: string) => void
}

export function executeSharedFragmentDismiss(
  pending: PendingSharedFragmentRef | null,
  ports: SharedFragmentDismissPorts,
): void {
  if (!pending) return
  const fragmentId = pending.id
  ports.clearPending()
  ports.clearStorage(fragmentId)
  ports.setStatus(SHARED_FRAGMENT_DISMISSED_STATUS)
}

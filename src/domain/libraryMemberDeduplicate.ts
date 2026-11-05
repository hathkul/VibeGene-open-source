import { suggestGroupedMemberName } from './libraryMemberReads'
import { normalizeDna } from './sequence'
import type { TraceFileRecord } from './traceTypes'

export type LibraryDuplicateSequenceGroup = {
  /** Normalized sequence key. */
  key: string
  memberIds: string[]
  fileNames: string[]
  keepMemberId: string
  suggestedName: string
  sequenceLength: number
}

export type LibraryDeduplicatePlanGroup = {
  keepMemberId: string
  memberIds: string[]
  suggestedName: string
}

function memberAnnotationScore(member: TraceFileRecord): number {
  return (member.features?.length ?? 0)
    + (member.primers?.length ?? 0)
    + (member.reads?.length ?? 0) * 2
}

function pickKeepMemberId(
  groupMembers: readonly TraceFileRecord[],
  referenceMemberId: string | null | undefined,
): string {
  if (referenceMemberId && groupMembers.some((member) => member.id === referenceMemberId)) {
    return referenceMemberId
  }
  let best = groupMembers[0]!
  let bestScore = memberAnnotationScore(best)
  for (const member of groupMembers.slice(1)) {
    const score = memberAnnotationScore(member)
    if (score > bestScore) {
      best = member
      bestScore = score
    }
  }
  return best.id
}

/**
 * Groups library members that share an identical DNA sequence (normalized).
 * Empty sequences are ignored. Groups of size 1 are omitted.
 */
export function findLibraryDuplicateSequenceGroups(
  members: readonly TraceFileRecord[],
  options?: { referenceMemberId?: string | null },
): LibraryDuplicateSequenceGroup[] {
  const bySequence = new Map<string, TraceFileRecord[]>()
  for (const member of members) {
    const sequence = normalizeDna(member.sequence ?? '')
    if (!sequence) continue
    const bucket = bySequence.get(sequence)
    if (bucket) bucket.push(member)
    else bySequence.set(sequence, [member])
  }

  const groups: LibraryDuplicateSequenceGroup[] = []
  for (const [key, groupMembers] of bySequence) {
    if (groupMembers.length < 2) continue
    const keepMemberId = pickKeepMemberId(groupMembers, options?.referenceMemberId)
    const fileNames = groupMembers.map((member) => member.fileName)
    groups.push({
      key,
      memberIds: groupMembers.map((member) => member.id),
      fileNames,
      keepMemberId,
      suggestedName: suggestGroupedMemberName(fileNames),
      sequenceLength: key.length,
    })
  }

  groups.sort((a, b) =>
    b.memberIds.length - a.memberIds.length
    || b.sequenceLength - a.sequenceLength
    || (a.fileNames[0] ?? '').localeCompare(b.fileNames[0] ?? ''),
  )
  return groups
}

/**
 * Keep one member per plan group (renamed), remove the other ids in those groups.
 * Preserves overall member order using the keep member's original position.
 */
export function applyLibraryMemberDeduplication(
  members: readonly TraceFileRecord[],
  groups: readonly LibraryDeduplicatePlanGroup[],
): TraceFileRecord[] {
  if (!groups.length) return [...members]
  const removeIds = new Set<string>()
  const renameById = new Map<string, string>()

  for (const group of groups) {
    if (group.memberIds.length < 2) continue
    if (!group.memberIds.includes(group.keepMemberId)) continue
    const name = group.suggestedName.trim()
    if (name) renameById.set(group.keepMemberId, name)
    for (const id of group.memberIds) {
      if (id !== group.keepMemberId) removeIds.add(id)
    }
  }

  if (removeIds.size === 0 && renameById.size === 0) return [...members]

  return members
    .filter((member) => !removeIds.has(member.id))
    .map((member) => {
      const nextName = renameById.get(member.id)
      return nextName && nextName !== member.fileName
        ? { ...member, fileName: nextName }
        : member
    })
}

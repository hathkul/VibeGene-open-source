import type { TraceFileRecord } from './traceTypes'

export type LibraryMemberTabSortMode =
  | 'manual'
  | 'name'
  | 'length'
  | 'reads'
  | 'orientation'
  | 'mismatches'
  | 'status'

export type LibraryMemberTabSortDirection = 'asc' | 'desc'

export type LibraryMemberTabRow = {
  member: TraceFileRecord
  lengthBp: number
  readCount: number
  orientation: 'forward' | 'reverse' | null
  alignedSpan: string
  mismatchCount: number | null
  featureCount: number
  primerCount: number
  status: string
}

export function buildLibraryMemberTabRow(member: TraceFileRecord): LibraryMemberTabRow {
  const alignment = member.alignment
  const statusParts: string[] = []
  if (member.parseError) statusParts.push(member.parseError)
  else if (!alignment) statusParts.push('unaligned')
  else statusParts.push('aligned')
  if (member.sequenceAssembled) statusParts.push('assembled')
  if (member.sequenceEdited) statusParts.push('edited')
  if ((member.reads?.length ?? 0) > 1) statusParts.push(`${member.reads!.length} reads`)

  return {
    member,
    lengthBp: member.sequence.length,
    readCount: member.reads?.length ?? 0,
    orientation: alignment?.orientation ?? null,
    alignedSpan: alignment
      ? `${alignment.templateStart + 1}–${alignment.templateEnd}`
      : '—',
    mismatchCount: alignment ? alignment.mismatchCount : null,
    featureCount: member.features?.length ?? 0,
    primerCount: member.primers?.length ?? 0,
    status: statusParts.join(' · ') || '—',
  }
}

export function sortLibraryMemberTabRows(
  rows: LibraryMemberTabRow[],
  mode: LibraryMemberTabSortMode,
  direction: LibraryMemberTabSortDirection,
): LibraryMemberTabRow[] {
  if (mode === 'manual') return rows
  const sign = direction === 'asc' ? 1 : -1
  return [...rows].sort((a, b) => {
    let cmp: number
    switch (mode) {
      case 'length':
        cmp = a.lengthBp - b.lengthBp
        break
      case 'reads':
        cmp = a.readCount - b.readCount
        break
      case 'orientation':
        cmp = (a.orientation ?? '').localeCompare(b.orientation ?? '')
        break
      case 'mismatches':
        cmp = (a.mismatchCount ?? -1) - (b.mismatchCount ?? -1)
        break
      case 'status':
        cmp = a.status.localeCompare(b.status)
        break
      case 'name':
      default:
        cmp = a.member.fileName.localeCompare(b.member.fileName)
        break
    }
    if (cmp === 0) cmp = a.member.fileName.localeCompare(b.member.fileName)
    return cmp * sign
  })
}

/** Reorder members so `movedId` is inserted before `beforeId` (or at end when null). */
export function reorderLibraryMembersById(
  members: readonly TraceFileRecord[],
  movedId: string,
  beforeId: string | null,
): TraceFileRecord[] {
  const fromIndex = members.findIndex((member) => member.id === movedId)
  if (fromIndex < 0) return [...members]
  const next = [...members]
  const [moved] = next.splice(fromIndex, 1)
  if (!moved) return [...members]
  let toIndex = beforeId == null ? next.length : next.findIndex((member) => member.id === beforeId)
  if (toIndex < 0) toIndex = next.length
  next.splice(toIndex, 0, moved)
  return next
}

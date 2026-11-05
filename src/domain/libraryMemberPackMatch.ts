import type { TraceFileRecord } from './traceTypes'

type PackedMemberRef = { memberId: string; fileName?: string }

/**
 * Match packed library-member rows to freshly parsed traces.
 * SnapGene reloads regenerate `trace_*` ids, so fall back to fileName, then pack order.
 */
export function matchPackedLibraryMemberIndexes(
  traces: readonly Pick<TraceFileRecord, 'id' | 'fileName'>[],
  packs: readonly PackedMemberRef[],
): Array<number | null> {
  if (!packs.length || !traces.length) return traces.map(() => null)
  const remaining = new Set(packs.map((_, index) => index))
  const take = (pred: (pack: PackedMemberRef, index: number) => boolean): number | null => {
    for (const index of remaining) {
      const pack = packs[index]
      if (!pack || !pred(pack, index)) continue
      remaining.delete(index)
      return index
    }
    return null
  }

  const assigned: Array<number | null> = traces.map((trace) => {
    const byId = take((pack) => pack.memberId === trace.id)
    if (byId !== null) return byId
    if (!trace.fileName) return null
    return take((pack) => Boolean(pack.fileName) && pack.fileName === trace.fileName)
  })

  if (packs.length === traces.length) {
    for (let traceIndex = 0; traceIndex < assigned.length; traceIndex += 1) {
      if (assigned[traceIndex] !== null) continue
      if (!remaining.has(traceIndex)) continue
      remaining.delete(traceIndex)
      assigned[traceIndex] = traceIndex
    }
  }

  return assigned
}

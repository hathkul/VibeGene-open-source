import { matchPackedLibraryMemberIndexes } from './libraryMemberPackMatch'
import { remapPrimersToTrace } from './traceAnnotationView'
import {
  defaultPrimerHybridizationParams,
  type PrimerHybridizationParams,
} from './primerHybridization'
import { resolveDisplayableLayoutsForPrimer } from './primerSequenceLayout'
import type { TraceFileRecord } from './traceTypes'
import type { Primer, SequenceRecord } from './types'
import type { LibraryMemberPrimerPack } from './dnaComparisonTypes'

function clonePrimer(primer: Primer): Primer {
  return {
    ...primer,
    bindings: primer.bindings?.map((binding) => ({
      ...binding,
      components: binding.components.map((component) => ({ ...component })),
    })),
  }
}

export function packLibraryMemberPrimers(traces: readonly TraceFileRecord[]): LibraryMemberPrimerPack[] {
  return traces
    .filter((trace) => (trace.primers?.length ?? 0) > 0)
    .map((trace) => ({
      memberId: trace.id,
      fileName: trace.fileName,
      primers: (trace.primers ?? []).map(clonePrimer),
    }))
}

export function hydrateLibraryMemberPrimersOntoTraces(
  record: Pick<SequenceRecord, 'dna'>,
  traces: TraceFileRecord[],
): TraceFileRecord[] {
  const packed = record.dna?.libraryMemberPrimers
  if (!packed?.length) return traces
  const matched = matchPackedLibraryMemberIndexes(traces, packed)
  return traces.map((trace, index) => {
    const packIndex = matched[index]
    if (packIndex === null || packIndex === undefined) return trace
    const primers = packed[packIndex]?.primers
    if (!primers?.length) return trace
    return { ...trace, primers }
  })
}

function withMemberPrimers(trace: TraceFileRecord, primers: Primer[]): TraceFileRecord {
  return {
    ...trace,
    primers: primers.length ? primers : undefined,
  }
}

/**
 * Project a consensus primer onto library members.
 * When hybridization params are provided, anneal against each member's DNA and only keep
 * copies that hybridize (needed for degenerate oligos vs synthetic consensus).
 * Without hybridization, fall back to alignment remap of stored bindings / oligo copy.
 */
export function projectPrimerOntoLibraryMembers(
  primer: Primer,
  members: readonly TraceFileRecord[],
  options?: { hybridization?: PrimerHybridizationParams },
): TraceFileRecord[] {
  const hybridization = options?.hybridization
  return members.map((member) => {
    const existing = (member.primers ?? []).filter((entry) => entry.id !== primer.id)
    if (member.parseError || !member.sequence) {
      return withMemberPrimers(member, existing)
    }

    if (hybridization) {
      const layouts = resolveDisplayableLayoutsForPrimer(member.sequence, primer, hybridization)
      if (!layouts.length) {
        return withMemberPrimers(member, existing)
      }
      return withMemberPrimers(member, [...existing, { ...clonePrimer(primer), bindings: layouts }])
    }

    if (!member.alignment) {
      return withMemberPrimers(member, existing)
    }
    const remapped = primer.bindings?.length
      ? remapPrimersToTrace([primer], member.alignment)
      : []
    // Primers often lack stored bindings (UI resolves them). Still copy the oligo onto members.
    const next = remapped[0] ?? { ...clonePrimer(primer), bindings: undefined }
    return withMemberPrimers(member, [...existing, next])
  })
}

/** Re-anneal every consensus primer onto members under the given hybridization rules. */
export function redistributeConsensusPrimersOntoLibraryMembers(
  consensusPrimers: readonly Primer[],
  members: readonly TraceFileRecord[],
  hybridization: PrimerHybridizationParams = defaultPrimerHybridizationParams,
): TraceFileRecord[] {
  const cleared = members.map((member) => {
    if (!member.primers?.length) return member
    const consensusIds = new Set(consensusPrimers.map((primer) => primer.id))
    return withMemberPrimers(
      member,
      member.primers.filter((primer) => !consensusIds.has(primer.id)),
    )
  })
  return consensusPrimers.reduce(
    (current, primer) => projectPrimerOntoLibraryMembers(primer, current, { hybridization }),
    cleared,
  )
}

/**
 * Spread primers from the library annotation reference.
 * Member reference → redistribute that member's primers onto peers (and return clones
 * suitable for consensus). Consensus reference → existing redistribute behavior.
 *
 * Pass `hybridization: null` to remap via alignments only (much faster on large libraries).
 */
export function syncLibraryPrimersFromReference(
  consensusPrimers: readonly Primer[],
  members: readonly TraceFileRecord[],
  options: {
    referenceMemberId?: string | null
    /** `null` skips re-anneal and remaps via alignments when present. */
    hybridization?: PrimerHybridizationParams | null
  } = {},
): { primers: Primer[]; members: TraceFileRecord[] } {
  const hybridization =
    options.hybridization === null
      ? undefined
      : (options.hybridization ?? defaultPrimerHybridizationParams)
  const referenceMemberId = options.referenceMemberId ?? null
  const reference = referenceMemberId
    ? members.find((member) => member.id === referenceMemberId)
    : null

  if (!reference) {
    if (!hybridization) {
      return {
        primers: consensusPrimers.map(clonePrimer),
        members: consensusPrimers.reduce(
          (current, primer) => projectPrimerOntoLibraryMembers(primer, current),
          members.map((member) => {
            if (!member.primers?.length) return member
            const consensusIds = new Set(consensusPrimers.map((primer) => primer.id))
            return withMemberPrimers(
              member,
              member.primers.filter((primer) => !consensusIds.has(primer.id)),
            )
          }),
        ),
      }
    }
    return {
      primers: consensusPrimers.map(clonePrimer),
      members: redistributeConsensusPrimersOntoLibraryMembers(
        consensusPrimers,
        members,
        hybridization,
      ),
    }
  }

  const sourcePrimers = (reference.primers ?? []).map(clonePrimer)
  const projected = hybridization
    ? redistributeConsensusPrimersOntoLibraryMembers(sourcePrimers, members, hybridization)
    : sourcePrimers.reduce(
        (current, primer) => projectPrimerOntoLibraryMembers(primer, current),
        members.map((member) => {
          if (!member.primers?.length) return member
          const sourceIds = new Set(sourcePrimers.map((primer) => primer.id))
          return withMemberPrimers(
            member,
            member.primers.filter((primer) => !sourceIds.has(primer.id)),
          )
        }),
      )
  const membersWithExactReference = projected.map((member) => (
    member.id === reference.id
      ? { ...member, primers: reference.primers }
      : member
  ))
  return { primers: sourcePrimers, members: membersWithExactReference }
}

export function removePrimerFromLibraryMembers(
  primerId: string,
  members: readonly TraceFileRecord[],
): TraceFileRecord[] {
  return members.map((member) => {
    if (!member.primers?.some((primer) => primer.id === primerId)) return member
    return withMemberPrimers(
      member,
      member.primers.filter((primer) => primer.id !== primerId),
    )
  })
}

export function upsertMemberPrimer(
  member: TraceFileRecord,
  primer: Primer,
): TraceFileRecord {
  const existing = member.primers ?? []
  const index = existing.findIndex((entry) => entry.id === primer.id)
  const primers =
    index >= 0
      ? existing.map((entry, entryIndex) => (entryIndex === index ? primer : entry))
      : [...existing, primer]
  return withMemberPrimers(member, primers)
}

export function deleteMemberPrimers(
  member: TraceFileRecord,
  primerIds: ReadonlySet<string>,
): TraceFileRecord {
  if (!member.primers?.length) return member
  return withMemberPrimers(
    member,
    member.primers.filter((primer) => !primerIds.has(primer.id)),
  )
}

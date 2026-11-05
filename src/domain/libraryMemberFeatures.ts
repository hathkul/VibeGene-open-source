import { normalizeDnaDocumentData } from './constructProperties'
import { hydrateLibraryMemberHistoryOntoTraces, packLibraryMemberHistory } from './libraryMemberHistory'
import { packLibraryMemberReads, hydrateLibraryMemberReadsOntoTraces } from './libraryMemberReads'
import {
  hydrateLibraryMemberPrimersOntoTraces,
  packLibraryMemberPrimers,
} from './libraryMemberPrimers'
import { matchPackedLibraryMemberIndexes } from './libraryMemberPackMatch'
import {
  cdsPeptideBeforeStop,
  consensusPeptideForCds,
  isProteinImportedFeature,
  tryProjectProteinImportedFeatureOntoMembers,
  type MemberProteinProjectionContext,
} from './libraryMemberProteinFeatures'
import { adjustFeaturesForDelete, adjustFeaturesForInsert } from './sequence'
import { remapFeaturesToTemplate, remapFeaturesToTrace } from './traceAnnotationView'
import type { TraceFileRecord } from './traceTypes'
import type { SequenceFeature, SequenceRecord } from './types'
import type { LibraryMemberFeaturePack } from './dnaComparisonTypes'

function isLibraryDocument(record: Pick<SequenceRecord, 'molecule' | 'dna'>) {
  return record.molecule === 'dna' && record.dna?.documentRole === 'library'
}

/** `null` = consensus is the annotation reference. */
export function getLibraryReferenceMemberId(
  record: Pick<SequenceRecord, 'dna'>,
): string | null {
  const id = record.dna?.libraryReferenceMemberId?.trim()
  return id || null
}

/** Consensus browse visibility; omitted means enabled. */
export function isLibraryConsensusEnabled(record: Pick<SequenceRecord, 'dna'>): boolean {
  return record.dna?.libraryConsensusEnabled !== false
}

export function withLibraryConsensusEnabled(
  record: SequenceRecord,
  enabled: boolean,
): SequenceRecord {
  const dna = normalizeDnaDocumentData(record.dna)
  const nextDna = { ...dna }
  if (enabled) delete nextDna.libraryConsensusEnabled
  else nextDna.libraryConsensusEnabled = false
  if (nextDna.libraryConsensusEnabled === dna.libraryConsensusEnabled) return record
  return { ...record, dna: nextDna }
}

export function withLibraryReferenceMemberId(
  record: SequenceRecord,
  memberId: string | null,
): SequenceRecord {
  const dna = normalizeDnaDocumentData(record.dna)
  const nextDna = { ...dna }
  if (memberId?.trim()) nextDna.libraryReferenceMemberId = memberId.trim()
  else delete nextDna.libraryReferenceMemberId
  if (nextDna.libraryReferenceMemberId === dna.libraryReferenceMemberId) return record
  return { ...record, dna: nextDna }
}

/**
 * Merge lifted reference features into consensus: same ids replaced, others kept,
 * new reference-only features appended.
 *
 * Also matches by type+name when ids differ (common after cloning products into a
 * library, where each plasmid got its own feature ids). Without that, switching
 * Ref to a member duplicates every annotation and can freeze the map.
 */
export function mergeLiftedFeaturesIntoConsensus(
  consensusFeatures: readonly SequenceFeature[],
  lifted: readonly SequenceFeature[],
): SequenceFeature[] {
  if (!lifted.length) return [...consensusFeatures]
  const liftedById = new Map(lifted.map((feature) => [feature.id, feature]))
  const liftedByKey = new Map<string, SequenceFeature>()
  for (const feature of lifted) {
    const key = libraryFeatureIdentityKey(feature)
    if (!liftedByKey.has(key)) liftedByKey.set(key, feature)
  }
  const consumedLiftedIds = new Set<string>()
  const consumedKeys = new Set<string>()

  const merged = consensusFeatures.map((feature) => {
    const featureKey = libraryFeatureIdentityKey(feature)
    const byId = liftedById.get(feature.id)
    if (byId) {
      consumedLiftedIds.add(byId.id)
      consumedKeys.add(libraryFeatureIdentityKey(byId))
      return byId
    }
    const byKey = liftedByKey.get(featureKey)
    if (byKey && !consumedLiftedIds.has(byKey.id)) {
      consumedLiftedIds.add(byKey.id)
      consumedKeys.add(featureKey)
      return byKey.id === feature.id ? byKey : { ...byKey, id: feature.id }
    }
    consumedKeys.add(featureKey)
    return feature
  })

  for (const feature of lifted) {
    if (consumedLiftedIds.has(feature.id)) continue
    const key = libraryFeatureIdentityKey(feature)
    if (consumedKeys.has(key)) continue
    merged.push(feature)
    consumedLiftedIds.add(feature.id)
    consumedKeys.add(key)
  }
  return merged
}

function libraryFeatureIdentityKey(feature: Pick<SequenceFeature, 'name' | 'type'>): string {
  return `${feature.type.trim().toLowerCase()}\0${feature.name.trim().toLowerCase()}`
}

export type LibraryFeatureSyncResult = {
  features: SequenceFeature[]
  members: TraceFileRecord[]
}

/**
 * Spread features from the library annotation reference onto consensus + members.
 * Used when annotations change on the current reference — not when merely switching Ref.
 * Consensus reference → project consensus features down.
 * Member reference → lift member features to consensus, project to peers, keep
 * the reference member's native coordinates exact.
 */
export function syncLibraryFeaturesFromReference(
  consensusFeatures: readonly SequenceFeature[],
  members: readonly TraceFileRecord[],
  options: {
    referenceMemberId?: string | null
    consensusSequence: string
    topology?: SequenceRecord['topology']
    consensusCds?: SequenceFeature
  },
): LibraryFeatureSyncResult {
  const referenceMemberId = options.referenceMemberId ?? null
  const topology = options.topology ?? 'linear'
  const reference = referenceMemberId
    ? members.find((member) => member.id === referenceMemberId)
    : null

  if (!reference) {
    return {
      features: [...consensusFeatures],
      members: projectFeaturesOntoLibraryMembers(consensusFeatures, members, {
        consensusSequence: options.consensusSequence,
        topology,
        consensusCds: options.consensusCds,
      }),
    }
  }

  if (!reference.alignment || reference.parseError) {
    return {
      features: [...consensusFeatures],
      members: [...members],
    }
  }

  const lifted = remapFeaturesToTemplate(reference.features ?? [], reference.alignment)
  const merged = mergeLiftedFeaturesIntoConsensus(consensusFeatures, lifted)
  const projected = projectFeaturesOntoLibraryMembers(merged, members, {
    consensusSequence: options.consensusSequence,
    topology,
    consensusCds: options.consensusCds,
  })
  const membersWithExactReference = projected.map((member) => (
    member.id === reference.id
      ? { ...member, features: reference.features }
      : member
  ))
  return { features: merged, members: membersWithExactReference }
}

/**
 * Spread one feature from the annotation reference. When the reference is a member,
 * `nativeFeature` is the member-native copy (kept exact on that member).
 */
export function projectReferenceFeatureOntoLibrary(
  feature: SequenceFeature,
  members: readonly TraceFileRecord[],
  options: {
    referenceMemberId?: string | null
    /** Member-native feature when reference is that member (avoids round-trip drift). */
    nativeFeature?: SequenceFeature
    consensusSequence: string
    topology?: SequenceRecord['topology']
    consensusCds?: SequenceFeature
  },
): TraceFileRecord[] {
  const referenceMemberId = options.referenceMemberId ?? null
  const projected = projectFeatureOntoLibraryMembers(feature, members, {
    consensusSequence: options.consensusSequence,
    topology: options.topology,
    consensusCds: options.consensusCds,
  })
  if (!referenceMemberId || !options.nativeFeature) return projected
  return projected.map((member) => (
    member.id === referenceMemberId
      ? upsertMemberFeature(member, options.nativeFeature!)
      : member
  ))
}

export function packLibraryMemberFeatures(traces: readonly TraceFileRecord[]): LibraryMemberFeaturePack[] {
  return traces
    .filter((trace) => (trace.features?.length ?? 0) > 0)
    .map((trace) => ({
      memberId: trace.id,
      fileName: trace.fileName,
      features: (trace.features ?? []).map((feature) => ({
        ...feature,
        locations: feature.locations.map((location) => ({ ...location })),
      })),
    }))
}

/** Embed per-member features + primers + nested reads into dna attachment fields for persistence. */
export function withPackedLibraryMemberFeatures(
  record: SequenceRecord,
  traces: readonly TraceFileRecord[],
): SequenceRecord {
  const hasFeatures = traces.some((trace) => (trace.features?.length ?? 0) > 0)
  const hasPrimers = traces.some((trace) => (trace.primers?.length ?? 0) > 0)
  const hasReads = traces.some((trace) => (trace.reads?.length ?? 0) > 0)
  const hasHistory = traces.some((trace) => Boolean(trace.history))
  if (!isLibraryDocument(record) && !hasFeatures && !hasPrimers && !hasReads && !hasHistory) {
    return record
  }
  const packedFeatures = packLibraryMemberFeatures(traces)
  const packedPrimers = packLibraryMemberPrimers(traces)
  const packedReads = packLibraryMemberReads(traces)
  const packedHistory = packLibraryMemberHistory(traces)
  const dna = normalizeDnaDocumentData(record.dna)
  const nextDna = {
    ...dna,
    ...(isLibraryDocument(record) || dna.documentRole === 'library' || hasReads
      ? { documentRole: 'library' as const }
      : {}),
  } as typeof dna

  if (packedFeatures.length) nextDna.libraryMemberFeatures = packedFeatures
  else delete nextDna.libraryMemberFeatures

  if (packedPrimers.length) nextDna.libraryMemberPrimers = packedPrimers
  else delete nextDna.libraryMemberPrimers

  if (packedReads.length) nextDna.libraryMemberReads = packedReads
  else delete nextDna.libraryMemberReads

  if (packedHistory.entries.length) {
    nextDna.libraryMemberHistory = packedHistory.entries
    nextDna.libraryMemberHistoryPool = packedHistory.pool
  } else {
    delete nextDna.libraryMemberHistory
    delete nextDna.libraryMemberHistoryPool
  }

  if (
    nextDna.libraryMemberFeatures === dna.libraryMemberFeatures
    && nextDna.libraryMemberPrimers === dna.libraryMemberPrimers
    && nextDna.libraryMemberReads === dna.libraryMemberReads
    && nextDna.libraryMemberHistory === dna.libraryMemberHistory
    && nextDna.libraryMemberHistoryPool === dna.libraryMemberHistoryPool
    && nextDna.documentRole === dna.documentRole
  ) {
    return record
  }
  return { ...record, dna: nextDna }
}

/** Restore packed features onto matching trace members after load. */
export function hydrateLibraryMemberFeaturesOntoTraces(
  record: Pick<SequenceRecord, 'dna'>,
  traces: TraceFileRecord[],
): TraceFileRecord[] {
  const packed = record.dna?.libraryMemberFeatures
  if (!packed?.length) return traces
  const matched = matchPackedLibraryMemberIndexes(traces, packed)
  return traces.map((trace, index) => {
    const packIndex = matched[index]
    if (packIndex === null || packIndex === undefined) return trace
    const features = packed[packIndex]?.features
    if (!features?.length) return trace
    return { ...trace, features }
  })
}

/** Features + primers + nested reads from dna attachment. */
export function hydrateLibraryTracesFromDocument(
  record: Pick<SequenceRecord, 'dna'>,
  traces: TraceFileRecord[],
): TraceFileRecord[] {
  const withFeatures = hydrateLibraryMemberFeaturesOntoTraces(record, traces)
  const withPrimers = hydrateLibraryMemberPrimersOntoTraces(record, withFeatures)
  const withHistory = hydrateLibraryMemberHistoryOntoTraces(record, withPrimers)
  return hydrateLibraryMemberReadsOntoTraces(record.dna?.libraryMemberReads, withHistory)
}

function withMemberFeatures(trace: TraceFileRecord, features: SequenceFeature[]): TraceFileRecord {
  return {
    ...trace,
    features: features.length ? features : undefined,
  }
}

/** Expand `<member>` in a consensus feature name to the target library member’s display name. */
export function resolveLibraryMemberFeatureName(name: string, memberName: string): string {
  if (!name.includes('<') || !/<member>/i.test(name)) return name
  return name.replace(/<member>/gi, memberName)
}

function withResolvedMemberFeatureName(
  feature: SequenceFeature,
  memberName: string,
): SequenceFeature {
  const nextName = resolveLibraryMemberFeatureName(feature.name, memberName)
  return nextName === feature.name ? feature : { ...feature, name: nextName }
}

/** After projecting a feature onto members, expand any `<member>` tokens in its name. */
function applyMemberNameTokenToProjectedFeature(
  members: TraceFileRecord[],
  featureId: string,
): TraceFileRecord[] {
  return members.map((member) => {
    const features = member.features
    if (!features?.some((entry) => entry.id === featureId)) return member
    return withMemberFeatures(
      member,
      features.map((entry) => (
        entry.id === featureId ? withResolvedMemberFeatureName(entry, member.fileName) : entry
      )),
    )
  })
}

/** Project a consensus feature onto each aligned member (same feature id, native coords). */
export function projectFeatureOntoLibraryMembers(
  feature: SequenceFeature,
  members: readonly TraceFileRecord[],
  options?: {
    consensusSequence?: string
    consensusCds?: SequenceFeature
    topology?: SequenceRecord['topology']
    consensusPeptide?: string
    proteinProjectionCache?: Map<string, MemberProteinProjectionContext | null>
  },
): TraceFileRecord[] {
  if (
    options?.consensusCds
    && options.consensusSequence
    && options.topology
    && isProteinImportedFeature(feature)
  ) {
    const viaProtein = tryProjectProteinImportedFeatureOntoMembers(
      feature,
      members,
      {
        cds: options.consensusCds,
        consensusPeptide: options.consensusPeptide
          ?? consensusPeptideForCds(options.consensusCds, options.consensusSequence, options.topology),
        consensusSequence: options.consensusSequence,
        topology: options.topology,
      },
      options.proteinProjectionCache,
    )
    if (viaProtein) return applyMemberNameTokenToProjectedFeature(viaProtein, feature.id)
  }

  // Non-protein features: one contiguous DNA span (min/max through the alignment).
  // Codon-gapped remap is reserved for protein-imported annotations above.
  return applyMemberNameTokenToProjectedFeature(
    members.map((member) => {
      if (!member.alignment || member.parseError) {
        const features = (member.features ?? []).filter((entry) => entry.id !== feature.id)
        return withMemberFeatures(member, features)
      }
      const projected = remapFeaturesToTrace([feature], member.alignment, { preserveCodons: false })
      const existing = (member.features ?? []).filter((entry) => entry.id !== feature.id)
      if (!projected.length) {
        return withMemberFeatures(member, existing)
      }
      return withMemberFeatures(member, [...existing, projected[0]!])
    }),
    feature.id,
  )
}

/**
 * Re-project consensus features onto aligned members.
 * Protein-imported annotations transfer through guided DNA→protein alignment;
 * other features use a contiguous DNA span remap. Replaces prior projected copies.
 */
export function projectFeaturesOntoLibraryMembers(
  features: readonly SequenceFeature[],
  members: readonly TraceFileRecord[],
  options?: {
    consensusSequence?: string
    topology?: SequenceRecord['topology']
    consensusCds?: SequenceFeature
  },
): TraceFileRecord[] {
  const projectedIds = new Set(features.map((feature) => feature.id))
  const projectedNames = new Set(
    features.map((feature) => feature.name.trim().toLowerCase()).filter(Boolean),
  )
  const cds = options?.consensusCds ?? features.find((feature) => {
    const type = feature.type.trim().toUpperCase()
    return type === 'CDS' || Boolean(feature.translateInSequenceView)
  })
  const consensusSequence = options?.consensusSequence
  const topology = options?.topology ?? 'linear'
  const consensusPeptide = cds && consensusSequence
    ? (cdsPeptideBeforeStop(cds, consensusSequence, topology)
      || consensusPeptideForCds(cds, consensusSequence, topology))
    : undefined

  const cleared = members.map((member) => {
    if (!member.features?.length) return member
    return withMemberFeatures(
      member,
      member.features.filter((entry) => {
        if (projectedIds.has(entry.id)) return false
        if (projectedNames.has(entry.name.trim().toLowerCase())) return false
        return true
      }),
    )
  })

  const proteinCache = consensusPeptide && cds
    ? new Map<string, MemberProteinProjectionContext | null>()
    : undefined

  return features.reduce(
    (current, feature) => projectFeatureOntoLibraryMembers(feature, current, {
      consensusSequence,
      consensusCds: cds,
      topology,
      consensusPeptide,
      proteinProjectionCache: proteinCache,
    }),
    cleared,
  )
}

export function removeFeatureFromLibraryMembers(
  featureId: string,
  members: readonly TraceFileRecord[],
): TraceFileRecord[] {
  return members.map((member) => {
    if (!member.features?.some((feature) => feature.id === featureId)) return member
    return withMemberFeatures(
      member,
      member.features.filter((feature) => feature.id !== featureId),
    )
  })
}

/** Shift/trim member features after a native-coordinate sequence replacement. */
export function adjustMemberFeaturesForReplacement(
  features: SequenceFeature[] | undefined,
  replaceStart: number,
  replaceEnd: number,
  insertedLength: number,
): SequenceFeature[] | undefined {
  if (!features?.length) return features
  const deleteLength = replaceEnd - replaceStart
  let next = features
  if (deleteLength > 0) next = adjustFeaturesForDelete(next, replaceStart, replaceEnd)
  if (insertedLength > 0) next = adjustFeaturesForInsert(next, replaceStart, insertedLength)
  return next.length ? next : undefined
}

export function upsertMemberFeature(
  member: TraceFileRecord,
  feature: SequenceFeature,
): TraceFileRecord {
  const existing = member.features ?? []
  const index = existing.findIndex((entry) => entry.id === feature.id)
  const features =
    index >= 0
      ? existing.map((entry, entryIndex) => (entryIndex === index ? feature : entry))
      : [...existing, feature]
  return withMemberFeatures(member, features)
}

export function deleteMemberFeatures(
  member: TraceFileRecord,
  featureIds: ReadonlySet<string>,
): TraceFileRecord {
  if (!member.features?.length) return member
  return withMemberFeatures(
    member,
    member.features.filter((feature) => !featureIds.has(feature.id)),
  )
}

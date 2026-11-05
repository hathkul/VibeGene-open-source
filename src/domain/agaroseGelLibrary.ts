import { defaultConstructProperties } from './constructProperties'
import { isDnaLibraryRecord } from './dnaLibrary'
import {
  getLibraryReferenceMemberId,
  hydrateLibraryTracesFromDocument,
  isLibraryConsensusEnabled,
} from './libraryMemberFeatures'
import { sequenceRecordFromLibraryMember } from './libraryMemberRecord'
import { createId, nowIso } from './sequence'
import type { TraceFileRecord } from './traceTypes'
import type { SequenceRecord } from './types'

/** Auto-filled member sample lanes (plus one MW lane) stay within the gel lane-count UI max. */
export const AGAROSE_GEL_MAX_AUTO_MEMBER_SAMPLES = 23
export const AGAROSE_GEL_MAX_LANE_COUNT = 24
export const AGAROSE_GEL_MAX_CUT_SLOTS = 4

export type AgaroseGelDnaSource = {
  label: string
  record: SequenceRecord
  /** Prefill cut-mode enzyme slots (history digest, etc.). */
  enzymeNames?: string[]
}

export function padAgaroseGelEnzymeSlots(names: string[] | undefined): string[] {
  const padded = [...(names ?? []).map((name) => name.trim()).filter(Boolean)].slice(
    0,
    AGAROSE_GEL_MAX_CUT_SLOTS,
  )
  while (padded.length < AGAROSE_GEL_MAX_CUT_SLOTS) padded.push('')
  return padded
}

export type AgaroseGelLibraryPlan = {
  /** Consensus (or plain construct) shown as “this window” / consensus in the picker. */
  currentSource: AgaroseGelDnaSource
  /** Library members available as lane DNA sources. */
  memberSources: AgaroseGelDnaSource[]
  /** Sample lanes to prefill when the gel opens. */
  initialSamples: AgaroseGelDnaSource[]
}

function uniqueSourceLabels(items: Array<{ baseLabel: string; record: SequenceRecord }>): AgaroseGelDnaSource[] {
  const counts = new Map<string, number>()
  for (const item of items) {
    counts.set(item.baseLabel, (counts.get(item.baseLabel) ?? 0) + 1)
  }
  const seen = new Map<string, number>()
  return items.map((item) => {
    const total = counts.get(item.baseLabel) ?? 1
    if (total <= 1) return { label: item.baseLabel, record: item.record }
    const index = (seen.get(item.baseLabel) ?? 0) + 1
    seen.set(item.baseLabel, index)
    return { label: `${item.baseLabel} (${index})`, record: item.record }
  })
}

/**
 * DNA-only snapshot for the gel simulator: sequence, topology, and annotations.
 * History trees and SnapGene native packets are omitted so hybrid-window
 * localStorage can serialize the payload (Uint8Array packets explode JSON size
 * and a failed write leaves the previous construct on screen).
 */
export function sequenceRecordForAgaroseGel(record: SequenceRecord): SequenceRecord {
  return {
    id: record.id,
    name: record.name,
    description: record.description ?? '',
    molecule: record.molecule,
    topology: record.topology,
    sequence: record.sequence,
    features: record.features,
    primers: record.primers,
    operations: [],
    construct: record.construct,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    ...(record.mapLabel ? { mapLabel: record.mapLabel } : {}),
    ...(record.dnaEnds ? { dnaEnds: record.dnaEnds } : {}),
    ...(record.dnaEndsProvenance ? { dnaEndsProvenance: record.dnaEndsProvenance } : {}),
  }
}

/** Blank DNA seed when the gel opens with no construct snapshot (Tools menu, startup). */
export function emptyAgaroseGelSeedRecord(): SequenceRecord {
  const timestamp = nowIso()
  return {
    id: createId('seq'),
    name: 'Gel',
    description: '',
    molecule: 'dna',
    topology: 'linear',
    sequence: '',
    features: [],
    primers: [],
    operations: [],
    construct: { ...defaultConstructProperties, syntheticDna: true },
    createdAt: timestamp,
    updatedAt: timestamp,
  }
}

export function slimAgaroseGelDnaSource(source: AgaroseGelDnaSource): AgaroseGelDnaSource {
  return {
    label: source.label,
    record: sequenceRecordForAgaroseGel(source.record),
    ...(source.enzymeNames ? { enzymeNames: [...source.enzymeNames] } : {}),
  }
}

/** Plain DNA snapshot of a library consensus for digests (no member payload). */
export function consensusRecordForAgaroseGel(record: SequenceRecord): SequenceRecord {
  return sequenceRecordForAgaroseGel(record)
}

export function memberSourceForAgaroseGel(
  member: TraceFileRecord,
  library: Pick<SequenceRecord, 'name' | 'topology'>,
): AgaroseGelDnaSource {
  const name = member.fileName.trim() || 'Library member'
  return {
    label: `${name} (member)`,
    record: sequenceRecordFromLibraryMember(member, { topology: library.topology }),
  }
}

/** Resolve library members on a DNA library record into gel DNA sources. */
export function listAgaroseGelMemberSources(library: SequenceRecord): AgaroseGelDnaSource[] {
  if (!isDnaLibraryRecord(library)) return []
  const hydrated = hydrateLibraryTracesFromDocument(library, library.traceFiles ?? [])
  const valid = hydrated.filter((member) => !member.parseError && member.sequence.length > 0)
  return uniqueSourceLabels(
    valid.map((member) => {
      const source = memberSourceForAgaroseGel(member, library)
      return { baseLabel: source.label, record: source.record }
    }),
  )
}

/** Index of the last sample lane that already has a construct (0 if none / only MW). */
export function lastOccupiedGelSampleLaneIndex(
  lanes: ReadonlyArray<{ kind: string; record?: unknown }>,
): number {
  let last = 0
  for (let index = 1; index < lanes.length; index += 1) {
    const lane = lanes[index]
    if (lane?.kind === 'sample' && lane.record) last = index
  }
  return last
}

/**
 * Build gel DNA sources and initial sample lanes for the construct that opened the gel.
 * Non-libraries behave as today: one “this window” sample.
 * Libraries prefill selected members, otherwise every valid member (not consensus alone).
 */
export function buildAgaroseGelLibraryPlan(options: {
  record: SequenceRecord
  members?: TraceFileRecord[]
  selectedMemberIds?: string[]
  maxAutoMemberSamples?: number
}): AgaroseGelLibraryPlan {
  const record = options.record
  const maxSamples = options.maxAutoMemberSamples ?? AGAROSE_GEL_MAX_AUTO_MEMBER_SAMPLES

  if (!isDnaLibraryRecord(record)) {
    const currentSource: AgaroseGelDnaSource = {
      label: `${record.name} (this window)`,
      record: sequenceRecordForAgaroseGel(record),
    }
    return {
      currentSource,
      memberSources: [],
      initialSamples: [currentSource],
    }
  }

  const members = options.members ?? record.traceFiles ?? []
  const consensusEnabled = isLibraryConsensusEnabled(record)
  const consensusRecord = consensusRecordForAgaroseGel(record)
  const currentSource: AgaroseGelDnaSource = {
    label: consensusEnabled
      ? `${record.name} (consensus)`
      : `${record.name} (library)`,
    record: consensusRecord,
  }

  const memberSources = uniqueSourceLabels(
    members.map((member) => {
      const source = memberSourceForAgaroseGel(member, record)
      return { baseLabel: source.label, record: source.record }
    }),
  )

  const byId = new Map(members.map((member) => [member.id, member]))
  const selectedIds = (options.selectedMemberIds ?? []).filter((id) => byId.has(id))
  const validMembers = members.filter((member) => !member.parseError && member.sequence.length > 0)

  let initialMembers: TraceFileRecord[] = []
  if (selectedIds.length > 0) {
    initialMembers = selectedIds
      .map((id) => byId.get(id)!)
      .filter((member) => !member.parseError && member.sequence.length > 0)
      .slice(0, maxSamples)
  } else if (validMembers.length > 0) {
    // Simulate DNA gel from a library → one lane per member (selection overrides this).
    initialMembers = validMembers.slice(0, maxSamples)
  } else if (!consensusEnabled) {
    const refId = getLibraryReferenceMemberId(record)
    const ref = (refId && byId.get(refId)) || members[0]
    if (ref) initialMembers = [ref]
  }

  if (initialMembers.length > 0) {
    const labelByMemberId = new Map(
      members.map((member, index) => [member.id, memberSources[index]?.label ?? member.fileName]),
    )
    const initialSamples = initialMembers.map((member) => ({
      label: labelByMemberId.get(member.id) ?? `${member.fileName} (member)`,
      record: sequenceRecordFromLibraryMember(member, { topology: record.topology }),
    }))
    return { currentSource, memberSources, initialSamples }
  }

  return {
    currentSource,
    memberSources,
    initialSamples: [currentSource],
  }
}

export function agaroseGelLaneCountForSamples(sampleCount: number, defaultLaneCount: number): number {
  const needed = Math.max(2, sampleCount + 1) // MW + samples
  return Math.min(AGAROSE_GEL_MAX_LANE_COUNT, Math.max(defaultLaneCount, needed))
}

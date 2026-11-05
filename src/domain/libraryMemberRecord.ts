import { defaultConstructProperties } from './constructProperties'
import { defaultDnaEnds } from './dnaEnds'
import { isDnaLibraryRecord } from './dnaLibrary'
import { createId, nowIso } from './sequence'
import type { TraceFileRecord } from './traceTypes'
import type { Primer, SequenceFeature, SequenceRecord, Topology } from './types'

export type LibraryMemberSequenceEntry = {
  name: string
  sequence: string
  features?: SequenceFeature[]
  primers?: Primer[]
}

/** Copy a Database DNA construct into a library-member sequence payload. */
export function libraryMemberSequenceEntryFromRecord(
  record: Pick<SequenceRecord, 'id' | 'name' | 'sequence' | 'molecule' | 'dna' | 'features' | 'primers'>,
  options?: { skipRecordId?: string },
): LibraryMemberSequenceEntry | null {
  if (options?.skipRecordId && record.id === options.skipRecordId) return null
  if (record.molecule === 'protein') return null
  if (isDnaLibraryRecord(record)) return null
  const sequence = record.sequence?.trim()
  if (!sequence) return null
  const features = record.features?.length
    ? record.features.map((feature) => ({
        ...feature,
        id: createId('feat'),
        locations: feature.locations.map((location) => ({ ...location })),
      }))
    : undefined
  const primers = record.primers?.length
    ? record.primers.map((primer) => ({
        ...primer,
        id: createId('primer'),
        bindings: primer.bindings?.map((binding) => ({
          ...binding,
          components: binding.components.map((component) => ({ ...component })),
        })),
      }))
    : undefined
  return {
    name: record.name.trim() || 'Untitled',
    sequence,
    features,
    primers,
  }
}

/** Build a linear DNA SequenceRecord for browsing a library member in Sequence pane. */
export function sequenceRecordFromLibraryMember(
  member: TraceFileRecord,
  options?: { topology?: Topology },
): SequenceRecord {
  const timestamp = nowIso()
  const topology = options?.topology ?? 'linear'
  return {
    id: member.id || createId('seq'),
    name: member.fileName || 'Library member',
    description: '',
    molecule: 'dna',
    topology,
    sequence: member.sequence,
    features: (member.features ?? []).map((feature) => ({
      ...feature,
      locations: feature.locations.map((location) => ({ ...location })),
    })),
    primers: (member.primers ?? []).map((primer) => ({
      ...primer,
      bindings: primer.bindings?.map((binding) => ({
        ...binding,
        components: binding.components.map((component) => ({ ...component })),
      })),
    })),
    history: member.history,
    operations: [],
    dnaEnds: topology === 'linear' ? defaultDnaEnds() : undefined,
    construct: { ...defaultConstructProperties, syntheticDna: true },
    createdAt: timestamp,
    updatedAt: timestamp,
  }
}

/**
 * Standalone DNA construct from a library member (new id, not a library document).
 * Used when opening a member in its own tab/window.
 */
export function constructRecordFromLibraryMember(
  member: TraceFileRecord,
  options?: { topology?: Topology; libraryName?: string },
): SequenceRecord {
  const browse = sequenceRecordFromLibraryMember(member, { topology: options?.topology })
  const timestamp = nowIso()
  const fileName = member.fileName || 'Library member'
  const libraryName = options?.libraryName?.trim()
  return {
    ...browse,
    id: createId('seq'),
    operations: [{
      id: createId('op'),
      type: 'openLibraryMember',
      summary: libraryName
        ? `Opened ${fileName} as a construct from ${libraryName}`
        : `Opened ${fileName} as a construct`,
      createdAt: timestamp,
    }],
    createdAt: timestamp,
    updatedAt: timestamp,
  }
}

export function libraryMemberHeaderMeta(member: TraceFileRecord) {
  const parts = [`${member.sequence.length.toLocaleString()} bp`]
  const readCount = member.reads?.length ?? 0
  if (readCount > 1) parts.push(`${readCount} reads`)
  if (member.sequenceAssembled) parts.push('assembled')
  if (member.sequenceEdited) parts.push('edited')
  if (member.parseError) parts.push(member.parseError)
  return parts.join(' · ')
}

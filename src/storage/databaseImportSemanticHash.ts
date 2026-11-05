import type { SequenceRecord } from '../domain/types'
import { hashSyncSourceBytes } from './syncSourceHash'

function stableSyncJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null'
  if (Array.isArray(value)) return `[${value.map(stableSyncJson).join(',')}]`
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([key, item]) => key !== 'editSession' && item !== undefined)
    .sort(([left], [right]) => left.localeCompare(right))
  return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${stableSyncJson(item)}`).join(',')}}`
}

/** Stable content key so Sync can skip no-op replaces (SnapGene re-parse ≠ byte-identical). */
export function constructSyncContentKey(record: SequenceRecord): string {
  const features = (record.features ?? [])
    .map((feature) =>
      [
        feature.name,
        feature.type,
        feature.notes ?? '',
        feature.locations.map((location) => `${location.strand}:${location.start}:${location.end}`).join(','),
      ].join('\t'),
    )
    .sort()
  const primers = (record.primers ?? [])
    .map((primer) => {
      const bindings = (primer.bindings ?? [])
        .map((binding) => `${binding.strand}:${binding.templateStart}:${binding.templateEnd}`)
        .sort()
        .join(',')
      return [primer.name, primer.sequence, primer.description ?? '', bindings].join('\t')
    })
    .sort()
  return [
    record.sequence ?? '',
    record.topology,
    record.molecule,
    record.description ?? '',
    features.join('\n'),
    primers.join('\n'),
    record.history ? stableSyncJson(record.history) : '',
  ].join('\0')
}

/** Previous semantic key, retained to safely migrate pre-history baselines. */
export function constructSyncContentKeyWithoutHistory(record: SequenceRecord): string {
  const current = constructSyncContentKey(record)
  const historySeparator = current.lastIndexOf('\0')
  return historySeparator < 0 ? current : current.slice(0, historySeparator)
}

export async function hashUnversionedConstructSemanticRecord(record: SequenceRecord): Promise<string> {
  return hashSyncSourceBytes(new TextEncoder().encode(constructSyncContentKey(record)))
}

/** Stable SHA-256 used by folder-sync three-way baselines. */
export async function hashConstructSemanticRecord(record: SequenceRecord): Promise<string> {
  return `sync-v2:${await hashUnversionedConstructSemanticRecord(record)}`
}

export async function hashConstructSemanticRecordWithoutHistory(record: SequenceRecord): Promise<string> {
  return hashSyncSourceBytes(new TextEncoder().encode(constructSyncContentKeyWithoutHistory(record)))
}

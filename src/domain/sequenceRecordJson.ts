import {
  deserializeSnapGeneEnzymeCacheFromJson,
  serializeSnapGeneEnzymeCacheForJson,
  type SnapGeneEnzymeCache,
  type SnapGeneEnzymeCacheJson,
} from './snapgeneEnzymeData'
import {
  deserializeSnapGeneNativeHistoryFromJson,
  serializeSnapGeneNativeHistoryForJson,
} from './snapgeneNativeHistory'
import type { SnapGeneNativeHistory } from './types'

function bytesFromLegacyJson(value: unknown): Uint8Array | undefined {
  if (value instanceof Uint8Array) return value
  if (
    Array.isArray(value)
    && value.every((entry) => Number.isInteger(entry) && Number(entry) >= 0 && Number(entry) <= 255)
  ) {
    return new Uint8Array(value)
  }
  if (!value || typeof value !== 'object') return undefined
  const entries = Object.entries(value)
    .filter((entry): entry is [string, number] => (
      /^\d+$/.test(entry[0])
      && Number.isInteger(entry[1])
      && Number(entry[1]) >= 0
      && Number(entry[1]) <= 255
    ))
    .sort(([left], [right]) => Number(left) - Number(right))
  if (!entries.length) return undefined
  return new Uint8Array(entries.map(([, entry]) => Number(entry)))
}

function deserializeEnzymeCache(value: unknown): SnapGeneEnzymeCache | undefined {
  if (!value || typeof value !== 'object') return undefined
  const candidate = value as Partial<SnapGeneEnzymeCache & SnapGeneEnzymeCacheJson>
  if (
    typeof candidate.block2Base64 === 'string'
    || typeof candidate.block3Base64 === 'string'
    || typeof candidate.block13Base64 === 'string'
  ) {
    return deserializeSnapGeneEnzymeCacheFromJson(candidate as SnapGeneEnzymeCacheJson)
  }
  const block2 = bytesFromLegacyJson(candidate.block2)
  const block3 = bytesFromLegacyJson(candidate.block3)
  const block13 = bytesFromLegacyJson(candidate.block13)
  return {
    ...(typeof candidate.documentUuid === 'string' ? { documentUuid: candidate.documentUuid } : {}),
    ...(typeof candidate.enzymeSetName === 'string' ? { enzymeSetName: candidate.enzymeSetName } : {}),
    ...(typeof candidate.cachedSequenceLength === 'number'
      ? { cachedSequenceLength: candidate.cachedSequenceLength }
      : {}),
    ...(block2 ? { block2 } : {}),
    ...(block3 ? { block3 } : {}),
    ...(block13 ? { block13 } : {}),
  }
}

/** JSON codec for every SequenceRecord depth, including protein source-DNA snapshots. */
export function sequenceRecordJsonReplacer(key: string, value: unknown): unknown {
  if (key === 'snapGeneNativeHistory') {
    return serializeSnapGeneNativeHistoryForJson(value as SnapGeneNativeHistory | undefined)
  }
  if (key === 'snapGeneEnzymes') {
    return serializeSnapGeneEnzymeCacheForJson(value as SnapGeneEnzymeCache | undefined)
  }
  return value
}

/** Tolerant reader: malformed optional binary metadata never hides the main construct. */
export function sequenceRecordJsonReviver(key: string, value: unknown): unknown {
  try {
    if (key === 'snapGeneNativeHistory') return deserializeSnapGeneNativeHistoryFromJson(value)
    if (key === 'snapGeneEnzymes') return deserializeEnzymeCache(value)
  } catch {
    if (key === 'snapGeneNativeHistory' || key === 'snapGeneEnzymes') return undefined
  }
  return value
}
